/* ============================================================
   READER.JS — Lettore PDF unico
   D&D Stranger Things – Hellfire Club Edition

   Richiede: common.js caricato prima.
   Apre il libro indicato dai query param:
     reader.html?cat=<categoria>&book=<id>
   Senza ?cat cerca il libro in tutte le categorie (deep link
   dal pannello segnalibri della home).
   ============================================================ */

const MIN_QUERY_LENGTH = 2;
/* Margine di pre-render della virtualizzazione (in % dell'altezza viewport) */
const RENDER_ROOT_MARGIN = "220% 0px";
/* Tetto ai pixel fisici per canvas: limita memoria su schermi retina/zoom alto */
const MAX_RENDER_PIXELS = 12_000_000;

/* ── Element references ── */
const elements = {
  addPageBookmarkButton:  document.getElementById("addPageBookmarkButton"),
  bookmarkCancelButton:   document.getElementById("bookmarkCancelButton"),
  bookmarkContext:        document.getElementById("bookmarkContext"),
  bookmarkCount:          document.getElementById("bookmarkCount"),
  bookmarkDialog:         document.getElementById("bookmarkDialog"),
  bookmarkDialogTitle:    document.getElementById("bookmarkDialogTitle"),
  bookmarkDismissButton:  document.getElementById("bookmarkDismissButton"),
  bookmarkForm:           document.getElementById("bookmarkForm"),
  bookmarkList:           document.getElementById("bookmarkList"),
  bookmarksPanel:         document.getElementById("bookmarksPanel"),
  bookmarkTitleInput:     document.getElementById("bookmarkTitleInput"),
  bookmarkToggleButton:   document.getElementById("bookmarkToggleButton"),
  bookStage:              document.getElementById("bookStage"),
  emptyState:             document.getElementById("emptyState"),
  emptyStateTitle:        document.getElementById("emptyStateTitle"),
  homeButton:             document.getElementById("homeButton"),
  nextButton:             document.getElementById("nextButton"),
  nextResultButton:       document.getElementById("nextResultButton"),
  pageInput:              document.getElementById("pageInput"),
  pageIndicator:          document.getElementById("pageIndicator"),
  pageSpread:             document.getElementById("pageSpread"),
  prevButton:             document.getElementById("prevButton"),
  prevResultButton:       document.getElementById("prevResultButton"),
  progressBar:            document.getElementById("progressBar"),
  readerBookTitle:        document.getElementById("readerBookTitle"),
  readerLayout:           document.getElementById("readerLayout"),
  resultList:             document.getElementById("resultList"),
  searchCount:            document.getElementById("searchCount"),
  searchInput:            document.getElementById("searchInput"),
  searchToggleButton:     document.getElementById("searchToggleButton"),
  selectionBookmarkButton:document.getElementById("selectionBookmarkButton"),
  selectionMenu:          document.getElementById("selectionMenu"),
  sidePanel:              document.getElementById("sidePanel"),
  spreadButton:           document.getElementById("spreadButton"),
  statusText:             document.getElementById("statusText"),
  toolRail:               document.getElementById("toolRail"),
  toolsToggleButton:      document.getElementById("toolsToggleButton"),
  toolsWrap:              document.getElementById("toolsWrap"),
  totalPages:             document.getElementById("totalPages"),
  zoomInButton:           document.getElementById("zoomInButton"),
  zoomOutButton:          document.getElementById("zoomOutButton"),
  zoomRange:              document.getElementById("zoomRange"),
  zoomValue:              document.getElementById("zoomValue"),
};

/* ── Application state ── */
const state = {
  activeBookmarkId:        null,
  activePanel:             null,
  bookmarks:               [],
  currentBook:             null,
  currentCategory:         null,
  currentPage:             1,
  direction:               "forward",
  continuousScale:         null,
  continuousScaleWidth:    null,
  continuousScaleZoom:     null,
  baseViewport:            null,
  isContinuous:            true,
  isSpread:                false,
  isToolsVisible:          true,
  pageRenderPromises:      new Map(),
  pageRenderTasks:         new Map(),
  pageTextCache:           new Map(),
  visiblePages:            new Set(),
  pdf:                     null,
  pendingBookmarkDraft:    null,
  pendingBookmarkScrollId: null,
  pendingScrollAnchor:     null,
  pendingScrollPage:       null,
  isZooming:               false,
  renderId:                0,
  searchMatches:           [],
  searchPosition:          -1,
  totalPages:              0,
  zoomPercent:             100,
};

const media = window.matchMedia("(max-width: 760px)");
let lastStageWidth = 0;
const resizeObserver = new ResizeObserver(() => {
  const stage = elements.bookStage;
  if (!stage) return;
  const width = stage.clientWidth;

  /* In continuous mode, only render if width changed by >20px to avoid jitter */
  if (state.pdf && isContinuousMode()) {
    if (Math.abs(width - lastStageWidth) <= 20) return;
  }

  lastStageWidth = width;
  scheduleRender();
});

let renderTimer = 0;
let searchTimer = 0;
let searchToken = 0;
let progressTimer = 0;
let scrollSyncRaf = 0;
let isScrollTrackingBound = false;
let pageObserver = null;

/* ============================================================
   BOOT
   ============================================================ */
boot();

function boot() {
  if (!setupPdfWorker()) {
    setStatus("PDF.js non disponibile");
    return;
  }

  bindEvents();
  applyReaderLayoutClasses();
  syncSearchPanelVisibility();
  syncToolsVisibility();
  renderBookmarkList();
  syncControls();
  resizeObserver.observe(elements.bookStage);
  loadReaderBook();
}

/* ============================================================
   APERTURA LIBRO DA QUERY PARAM
   ============================================================ */
async function loadReaderBook() {
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get("book");
  const catParam = params.get("cat");

  /* Senza parametri non c'è nulla da leggere: torna alla prima categoria */
  if (!bookId && !catParam) {
    window.location.replace(`${CATEGORIES[0].slug}.html`);
    return;
  }

  setStatus("Caricamento in corso...");
  const slugs = catParam ? [catParam] : CATEGORIES.map((c) => c.slug);

  for (const slug of slugs) {
    const books = await loadCategoryBooks(slug);
    const book = bookId ? books.find((b) => b.id === bookId) : books[0];
    if (book) {
      state.currentBook = book;
      state.currentCategory = slug;
      setBackLink(slug);
      document.title = `${book.title} – Hellfire Club`;
      if (elements.readerBookTitle) elements.readerBookTitle.textContent = book.title;
      await loadPdf(book.pdf, book.title);
      return;
    }
  }

  /* Libro non trovato: stato vuoto con via d'uscita chiara */
  setBackLink(catParam || CATEGORIES[0].slug);
  if (elements.emptyStateTitle) {
    elements.emptyStateTitle.textContent = "Libretto non trovato";
  }
  elements.emptyState.hidden = false;
  setStatus("Il contenuto richiesto non esiste o è stato spostato");
  syncControls();
}

function setBackLink(slug) {
  if (!elements.homeButton) return;
  const meta = CATEGORIES.find((c) => c.slug === slug);
  const label = meta ? meta.label : slug;
  elements.homeButton.href = `${slug}.html`;
  elements.homeButton.title = `Torna a ${label}`;
  elements.homeButton.setAttribute("aria-label", `Torna a ${label}`);
}

/* ============================================================
   EVENTS
   ============================================================ */
function bindEvents() {
  elements.prevButton.addEventListener("click", () => turnPage(-1));
  elements.nextButton.addEventListener("click", () => turnPage(1));

  elements.pageInput.addEventListener("change", () => {
    const p = Number.parseInt(elements.pageInput.value, 10);
    goToPage(p);
  });

  elements.zoomRange.addEventListener("input", () => {
    const next = Number.parseInt(elements.zoomRange.value, 10);
    if (!Number.isFinite(next)) return;
    setZoomPercent(next);
  });

  elements.zoomOutButton.addEventListener("click", () => changeZoom(-10));
  elements.zoomInButton.addEventListener("click", () => changeZoom(10));

  /* Toggle vista: scorrimento continuo <-> vista libro (spread, solo desktop) */
  elements.spreadButton.addEventListener("click", () => {
    if (isContinuousMode()) {
      state.isContinuous = false;
      state.isSpread = !media.matches;
      if (isSpreadActive() && state.currentPage > 1 && state.currentPage % 2 !== 0) {
        state.currentPage -= 1;
      }
    } else {
      state.isContinuous = true;
      state.isSpread = false;
      state.pendingScrollPage = state.currentPage;
    }
    teardownContinuousRendering();
    applyReaderLayoutClasses();
    scheduleRender();
    syncControls();
  });

  elements.searchToggleButton.addEventListener("click", () => togglePanel("search"));
  if (elements.bookmarkToggleButton) {
    elements.bookmarkToggleButton.addEventListener("click", () => togglePanel("bookmarks"));
  }

  elements.addPageBookmarkButton.addEventListener("click", () => {
    openBookmarkDialog(createPageBookmarkDraft());
  });

  elements.toolsToggleButton.addEventListener("click", toggleToolsVisibility);

  elements.bookmarkForm.addEventListener("submit", (e) => {
    e.preventDefault();
    savePendingBookmark();
  });

  elements.bookmarkCancelButton.addEventListener("click", closeBookmarkDialog);
  elements.bookmarkDismissButton.addEventListener("click", closeBookmarkDialog);
  elements.bookmarkDialog.addEventListener("close", () => {
    state.pendingBookmarkDraft = null;
  });

  /* Prevent mousedown from deselecting text before click fires */
  elements.selectionBookmarkButton.addEventListener("mousedown", (e) => e.preventDefault());
  elements.selectionBookmarkButton.addEventListener("click", () => {
    const draft = createTextBookmarkDraft();
    if (draft) openBookmarkDialog(draft);
  });

  function updateSearchInputState() {
    const hasText = elements.searchInput.value.trim().length > 0;
    document.body.classList.toggle("search-has-text", hasText);
    // La visibilità di result-list / bookmarks-section è gestita
    // interamente dal CSS tramite body.search-has-text
  }

  elements.searchInput.addEventListener("input", () => {
    updateSearchInputState();
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 240);
  });
  elements.searchInput.addEventListener("change", updateSearchInputState);

  elements.prevResultButton.addEventListener("click", () => moveSearchResult(-1));
  elements.nextResultButton.addEventListener("click", () => moveSearchResult(1));

  elements.bookStage.addEventListener("mouseup", () =>
    window.setTimeout(updateSelectionMenu, 0));
  elements.bookStage.addEventListener("keyup", () =>
    window.setTimeout(updateSelectionMenu, 0));

  document.addEventListener("mousedown", (e) => {
    if (!elements.selectionMenu.contains(e.target)) hideSelectionMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (elements.bookmarkDialog.open) return;
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowLeft")  turnPage(-1);
    if (e.key === "ArrowRight") turnPage(1);
    if (e.key === "+" || e.key === "=") changeZoom(10);
    if (e.key === "-") changeZoom(-10);
  });

  media.addEventListener("change", () => scheduleRender());
  bindZoomGestures();
}

/* ── Zoom gestures (wheel + pinch + trackpad) ── */
function bindZoomGestures() {
  const SWIPE_ZOOM_MAX = 120;

  elements.bookStage.addEventListener("wheel", (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    /* Zoom ancorato al puntatore: il punto sotto il cursore resta fermo */
    changeZoom(e.deltaY < 0 ? 10 : -10, { x: e.clientX, y: e.clientY });
  }, { passive: false });

  let lastTouchDistance = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchLastX  = 0;
  let touchLastY  = 0;
  let swipeTracking = false;

  elements.bookStage.addEventListener("touchstart", (e) => {
    if (!media.matches || e.touches.length !== 1) { swipeTracking = false; return; }
    const t = e.touches[0];
    touchStartX = touchLastX = t.clientX;
    touchStartY = touchLastY = t.clientY;
    swipeTracking = true;
  }, { passive: true });

  elements.bookStage.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1 && swipeTracking) {
      touchLastX = e.touches[0].clientX;
      touchLastY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      swipeTracking = false;
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastTouchDistance === 0) { lastTouchDistance = dist; return; }
      if (Math.abs(dist - lastTouchDistance) > 3) {
        /* Ancora lo zoom al punto medio tra le due dita */
        const midpoint = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
        changeZoom(dist > lastTouchDistance ? 5 : -5, midpoint);
        lastTouchDistance = dist;
      }
    }
  }, { passive: false });

  elements.bookStage.addEventListener("touchend", () => {
    if (swipeTracking && media.matches) {
      const dx = touchLastX - touchStartX;
      const dy = touchLastY - touchStartY;
      if (state.zoomPercent > SWIPE_ZOOM_MAX) {
        lastTouchDistance = 0;
        swipeTracking = false;
        return;
      }
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        turnPage(dx > 0 ? -1 : 1);
      }
    }
    lastTouchDistance = 0;
    swipeTracking = false;
  });

  /* Safari/WebKit: il pinch sul trackpad arriva GIÀ come evento wheel con
     ctrlKey=true (gestito sopra). I GestureEvent qui vanno solo bloccati
     per impedire lo zoom nativo della pagina — se zoomassero anche loro,
     ogni pinch verrebbe applicato due volte e la vista andrebbe alla deriva. */
  if (typeof GestureEvent !== "undefined") {
    ["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
      elements.bookStage.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    });
  }
}

/* ============================================================
   PROGRESS BAR
   ============================================================ */
function showProgress() {
  if (!elements.progressBar) return;
  clearTimeout(progressTimer);
  /* Rimuovi eventuali override inline lasciati da updateReadingProgress */
  elements.progressBar.style.opacity = "";
  elements.progressBar.style.transition = "";
  elements.progressBar.style.width = "0%";
  elements.progressBar.classList.add("is-visible");
  // Animate to ~85% while loading
  requestAnimationFrame(() => {
    elements.progressBar.style.width = "85%";
  });
}

function finishProgress() {
  if (!elements.progressBar) return;
  elements.progressBar.style.width = "100%";
  progressTimer = window.setTimeout(() => {
    elements.progressBar.classList.remove("is-visible");
    elements.progressBar.style.width = "0%";
  }, 420);
}

/* ============================================================
   PANNELLI (ricerca / segnalibri)
   ============================================================ */
function togglePanel(panelName) {
  if (panelName === "search" && state.activePanel === "bookmarks" && !elements.bookmarkToggleButton) {
    state.activePanel = null;
  } else {
    state.activePanel = state.activePanel === panelName ? null : panelName;
  }
  syncSearchPanelVisibility();
  scheduleRender();
}

function syncSearchPanelVisibility() {
  const isSearch   = state.activePanel === "search";
  const isBookmark = state.activePanel === "bookmarks";
  const visible    = isSearch || isBookmark;

  const hasSearchText = elements.searchInput
    ? elements.searchInput.value.trim().length > 0
    : false;

  // Classe sul body: controlla via CSS result-list vs bookmarks-section
  document.body.classList.toggle("search-has-text", hasSearchText);

  // Reader layout: toglie la colonna del pannello quando chiuso
  elements.readerLayout.classList.toggle("search-hidden", !visible);

  // Side panel unificato: visibile se qualunque pannello è attivo
  if (elements.sidePanel) {
    elements.sidePanel.hidden = !visible;
    elements.sidePanel.setAttribute("aria-hidden", String(!visible));
  }

  // Bottone ricerca
  const hasBookmarkToggle = Boolean(elements.bookmarkToggleButton);
  const searchToggleActive = isSearch || (isBookmark && !hasBookmarkToggle);
  elements.searchToggleButton.classList.toggle("is-active", searchToggleActive);
  elements.searchToggleButton.setAttribute("aria-expanded", String(searchToggleActive));
  const searchLabel = isSearch
    ? "Nascondi ricerca"
    : (isBookmark && !hasBookmarkToggle)
      ? "Nascondi segnalibri"
      : "Mostra ricerca";
  elements.searchToggleButton.title = searchLabel;
  elements.searchToggleButton.setAttribute("aria-label", searchLabel);

  // Bottone segnalibri
  if (elements.bookmarkToggleButton) {
    elements.bookmarkToggleButton.classList.toggle("is-active", isBookmark);
    elements.bookmarkToggleButton.setAttribute("aria-expanded", String(isBookmark));
    const bmLabel = isBookmark ? "Nascondi segnalibri" : "Mostra segnalibri";
    elements.bookmarkToggleButton.title = bmLabel;
    elements.bookmarkToggleButton.setAttribute("aria-label", bmLabel);
  }

  // Quando si apre il pannello segnalibri, rimuovi il testo di ricerca
  // così il CSS mostra bookmarks-section invece di result-list
  if (isBookmark) {
    document.body.classList.remove("search-has-text");
  }

  // Quando chiudi il pannello, rimuovi l'evidenziazione attiva del segnalibro
  if (!visible && state.activeBookmarkId) {
    state.activeBookmarkId = null;
    elements.pageSpread.querySelectorAll(".saved-highlight.is-active")
      .forEach((hi) => hi.classList.remove("is-active"));
    renderBookmarkList();
  }
}

function toggleToolsVisibility() {
  state.isToolsVisible = !state.isToolsVisible;
  syncToolsVisibility();
  scheduleRender();
}

function syncToolsVisibility() {
  elements.toolsWrap.classList.toggle("is-collapsed", !state.isToolsVisible);
  elements.toolRail.hidden = !state.isToolsVisible;
  elements.toolsToggleButton.classList.toggle("is-active", state.isToolsVisible);
  elements.toolsToggleButton.setAttribute("aria-expanded", String(state.isToolsVisible));
  const label = state.isToolsVisible ? "Nascondi strumenti" : "Mostra strumenti";
  elements.toolsToggleButton.title = label;
  elements.toolsToggleButton.setAttribute("aria-label", label);
}

/* ============================================================
   PDF LOADING & RENDERING
   ============================================================ */
async function loadPdf(source, title) {
  showProgress();
  setStatus("Caricamento PDF...");
  teardownContinuousRendering();
  state.pdf = null;
  state.totalPages = 0;
  state.baseViewport = null;
  state.continuousScale = null;
  state.continuousScaleWidth = null;
  state.continuousScaleZoom = null;
  elements.pageSpread.replaceChildren();

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument(source).promise;
  } catch (err) {
    console.error(err);
    elements.emptyState.hidden = false;
    setStatus(`PDF non trovato: ${source}`);
    syncControls();
    finishProgress();
    return;
  }

  state.pdf          = pdf;
  state.totalPages   = pdf.numPages;
  state.currentPage  = 1;
  state.pendingScrollPage = 1;
  state.activeBookmarkId = null;
  state.pendingBookmarkScrollId = null;
  state.pageTextCache.clear();
  state.searchMatches  = [];
  state.searchPosition = -1;
  state.bookmarks      = loadBookmarks().filter((b) => b.page <= state.totalPages);

  /* Dimensioni base (pagina 1 a scala 1): servono per calcolare la scala
     in modo sincrono e dimensionare tutte le shell senza toccare il PDF */
  try {
    const firstPage = await pdf.getPage(1);
    const vp = firstPage.getViewport({ scale: 1 });
    state.baseViewport = { width: vp.width, height: vp.height };
  } catch { /* fallback gestito in getContinuousScale */ }

  elements.totalPages.textContent    = `/ ${state.totalPages}`;
  elements.pageInput.max             = String(state.totalPages);
  elements.searchInput.value         = "";
  elements.resultList.replaceChildren();
  elements.searchCount.textContent   = "0 risultati";
  elements.bookStage.scrollTop       = 0;

  renderBookmarkList();
  setStatus(`${state.totalPages} pagine`);
  syncControls();
  if (isContinuousMode()) {
    await renderAllPages();
  } else {
    await renderSpread();
  }
  finishProgress();
}

function turnPage(delta) {
  if (!state.pdf) return;
  if (isContinuousMode()) {
    const next = clamp(state.currentPage + (delta > 0 ? 1 : -1), 1, state.totalPages);
    goToPage(next);
    return;
  }
  const visible  = getVisiblePages();
  const first    = visible[0]                       || state.currentPage;
  const last     = visible[visible.length - 1]      || state.currentPage;

  if ((delta < 0 && first <= 1) || (delta > 0 && last >= state.totalPages)) return;

  const step = isSpreadActive() && first !== 1 ? 2 : 1;
  const next = delta > 0
    ? first + step
    : first <= 2 ? 1 : first - 2;

  state.direction = delta > 0 ? "forward" : "back";
  goToPage(next);
}

function goToPage(pageNumber) {
  if (!state.pdf) return;
  const clamped = clamp(Number.isFinite(pageNumber) ? pageNumber : 1, 1, state.totalPages);
  state.direction = clamped >= state.currentPage ? "forward" : "back";

  if (isContinuousMode()) {
    state.currentPage = clamped;
    syncControls();
    const shell = elements.pageSpread.querySelector(`.page-shell[data-page="${clamped}"]`);
    if (shell) {
      /* Le shell esistono già: scrolla subito (il render arriva via observer) */
      if (state.pendingBookmarkScrollId) {
        scrollToPendingBookmark();
      } else {
        scrollToPage(clamped, true);
      }
      state.pendingScrollPage = null;
      updateReadingProgress();
    } else {
      state.pendingScrollPage = clamped;
    }
    return;
  }

  // In spread mode, align to even page start (except page 1)
  if (isSpreadActive() && clamped > 1 && clamped % 2 !== 0) {
    state.currentPage = clamped - 1;
  } else {
    state.currentPage = clamped;
  }

  syncControls();
  renderSpread();
}

function getVisiblePages() {
  if (!state.pdf) return [];
  if (isContinuousMode()) return [state.currentPage];
  if (!isSpreadActive()) return [state.currentPage];
  if (state.currentPage === 1) return [1];
  const left = state.currentPage % 2 === 0 ? state.currentPage : state.currentPage - 1;
  return [left, left + 1].filter((p) => p <= state.totalPages);
}

function isSpreadActive() {
  return !isContinuousMode() && state.isSpread && !media.matches;
}

function isContinuousMode() {
  return Boolean(state.isContinuous);
}

function applyReaderLayoutClasses() {
  elements.readerLayout.classList.toggle("is-continuous", state.isContinuous);
  /* Mark as zoomed if zoom > 100% for CSS alignment logic */
  elements.readerLayout.classList.toggle("is-zoomed", state.zoomPercent > 100);
}

function setZoomPercent(next, { skipRender = false, anchorPoint = null } = {}) {
  const min = Number(elements.zoomRange.min) || 75;
  const max = Number(elements.zoomRange.max) || 220;
  next = clamp(next, min, max);
  const changed = next !== state.zoomPercent;

  if (state.pdf && isContinuousMode() && changed) {
    state.pendingScrollAnchor = captureScrollAnchor(anchorPoint);
    state.isZooming = true;
  }
  state.zoomPercent = next;
  elements.zoomRange.value = String(next);
  elements.zoomValue.textContent = `${next}%`;
  applyReaderLayoutClasses();

  /* Feedback istantaneo: ridimensiona subito le shell — i canvas esistenti
     (width:100%) vengono stirati dal browser, il re-render nitido arriva
     poco dopo via scheduleRender solo per le pagine visibili */
  if (state.pdf && isContinuousMode() && changed && state.baseViewport) {
    const scale = getContinuousScale(elements.bookStage.clientWidth);
    const shells = Array.from(elements.pageSpread.children);
    if (shells.length) {
      sizeContinuousShells(scale, shells);
      if (state.pendingScrollAnchor) {
        scrollToAnchor(state.pendingScrollAnchor);
        state.pendingScrollAnchor = null;
      }
    }
  }

  if (!skipRender) scheduleRender();
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    if (!state.pdf) return;
    if (isContinuousMode()) {
      renderAllPages();
    } else {
      renderSpread();
    }
  }, 120);
}

/* ── Rendering virtualizzato ──
   Le shell di tutte le pagine esistono sempre (div leggeri, dimensionati),
   ma canvas + textLayer vengono creati solo per le pagine vicine al viewport
   (IntersectionObserver) e rilasciati quando escono dalla zona di pre-render.
   Memoria e tempi di zoom restano costanti anche su PDF di centinaia di pagine. */
async function renderAllPages() {
  if (!state.pdf) { syncControls(); return; }

  const renderId = ++state.renderId;
  elements.emptyState.hidden = true;
  elements.bookStage.classList.remove("is-turning-forward", "is-turning-back");
  updateReadingProgress();

  try {
    if (!state.baseViewport) {
      const page = await state.pdf.getPage(1);
      if (renderId !== state.renderId) return;
      const vp = page.getViewport({ scale: 1 });
      state.baseViewport = { width: vp.width, height: vp.height };
    }

    /* Resize esterno (finestra, pannello laterale, rotazione): la scala sta
       per cambiare senza un'ancora già catturata dallo zoom — catturala ORA,
       con le shell ancora alle dimensioni vecchie, o il punto di lettura
       si perde (lo scrollTop resterebbe uguale su un contenuto più grande) */
    const stageWidth = elements.bookStage.clientWidth;
    if (
      Number.isFinite(state.continuousScale)
      && state.continuousScaleWidth !== null
      && state.continuousScaleWidth !== stageWidth
      && !state.pendingScrollAnchor
      && !Number.isFinite(state.pendingScrollPage)
    ) {
      state.pendingScrollAnchor = captureScrollAnchor();
    }

    const scale  = getContinuousScale(stageWidth);
    const pages  = Array.from({ length: state.totalPages }, (_, i) => i + 1);
    const shells = ensureAllPageShells(pages);
    sizeContinuousShells(scale, shells);
    observeContinuousShells(shells);

    if (state.pendingScrollAnchor) {
      scrollToAnchor(state.pendingScrollAnchor);
      state.pendingScrollAnchor = null;
    }
    if (Number.isFinite(state.pendingScrollPage)) {
      scrollToPage(state.pendingScrollPage, false);
      state.pendingScrollPage = null;
    }

    await renderNearbyPages(scale, renderId);

    if (renderId === state.renderId) {
      refreshHighlightLayers();
      applySearchHighlights();
      scrollToPendingBookmark();
      state.isZooming = false;
      updateCurrentPageFromScroll();
      setStatus("Pronto");
    }
  } catch (err) {
    console.error(err);
    setStatus("Errore durante il rendering del PDF");
  } finally {
    state.isZooming = false;
    syncControls();
    bindScrollTracking();
  }
}

function ensureAllPageShells(pageNumbers) {
  const existing = Array.from(elements.pageSpread.children);
  if (existing.length === pageNumbers.length) {
    pageNumbers.forEach((pn, i) => {
      const shell = existing[i];
      if (!shell) return;
      shell.dataset.page = String(pn);
      shell.setAttribute("aria-label", `Pagina ${pn}`);
    });
    return existing;
  }

  const shells = pageNumbers.map((pn) => createPageShell(pn, 1, 0));
  elements.pageSpread.replaceChildren(...shells);
  return shells;
}

function getContinuousScale(stageWidth) {
  const width = Number.isFinite(stageWidth) && stageWidth > 0
    ? stageWidth
    : elements.bookStage.clientWidth;
  if (
    Number.isFinite(state.continuousScale)
    && state.continuousScaleWidth === width
    && state.continuousScaleZoom === state.zoomPercent
  ) {
    return state.continuousScale;
  }
  const base = state.baseViewport;
  if (!base) return state.continuousScale || 1;
  const availW   = Math.max(width - getStagePaddingX() - 6, 280);
  const fitScale = availW / base.width;
  const nextScale = clamp(fitScale * (state.zoomPercent / 100), 0.24, 4);
  state.continuousScale = nextScale;
  state.continuousScaleWidth = width;
  state.continuousScaleZoom = state.zoomPercent;
  return nextScale;
}

function sizeContinuousShells(scale, shells) {
  const base = state.baseViewport;
  if (!base) return;
  shells.forEach((shell) => {
    /* Usa le dimensioni reali della pagina se già renderizzata almeno una volta */
    const baseW = Number.parseFloat(shell.dataset.baseW) || base.width;
    const baseH = Number.parseFloat(shell.dataset.baseH) || base.height;
    const width  = `${Math.round(baseW * scale * 100) / 100}px`;
    const height = `${Math.round(baseH * scale * 100) / 100}px`;
    if (shell.style.width !== width) shell.style.width = width;
    if (shell.style.height !== height) shell.style.height = height;
  });
}

function observeContinuousShells(shells) {
  if (pageObserver) pageObserver.disconnect();
  state.visiblePages.clear();
  pageObserver = new IntersectionObserver(handleShellIntersection, {
    root: elements.bookStage,
    rootMargin: RENDER_ROOT_MARGIN,
    threshold: 0,
  });
  shells.forEach((shell) => pageObserver.observe(shell));
}

function handleShellIntersection(entries) {
  if (!state.pdf || !isContinuousMode()) return;
  /* Usa la scala in cache (quella con cui sono dimensionate le shell):
     ricalcolarla qui con la larghezza "live" renderizzerebbe pagine di
     dimensione diversa dalle shell durante un resize della finestra */
  const scale = Number.isFinite(state.continuousScale)
    ? state.continuousScale
    : getContinuousScale(elements.bookStage.clientWidth);
  entries.forEach((entry) => {
    const shell = entry.target;
    const pn = Number.parseInt(shell.dataset.page, 10);
    if (!Number.isFinite(pn)) return;
    if (entry.isIntersecting) {
      state.visiblePages.add(pn);
      void ensurePageRendered(pn, shell, scale, state.renderId);
    } else {
      state.visiblePages.delete(pn);
      releasePage(pn, shell);
    }
  });
}

/* Renderizza subito le pagine dentro la finestra viewport ± 1.5 schermate
   (l'observer copre gli scroll successivi) */
async function renderNearbyPages(scale, renderId) {
  const stage  = elements.bookStage;
  const margin = stage.clientHeight * 1.5;
  const top    = stage.scrollTop - margin;
  const bottom = stage.scrollTop + stage.clientHeight + margin;
  const jobs   = [];

  for (const shell of elements.pageSpread.children) {
    const pn = Number.parseInt(shell.dataset.page, 10);
    if (!Number.isFinite(pn)) continue;
    const shellTop = shell.offsetTop;
    const shellBottom = shellTop + shell.offsetHeight;
    if (shellBottom >= top && shellTop <= bottom) {
      jobs.push(ensurePageRendered(pn, shell, scale, renderId));
    }
  }

  await Promise.all(jobs);
}

function ensurePageRendered(pn, shell, scale, renderId) {
  if (shell.dataset.renderedScale === String(scale)) return Promise.resolve();
  /* Il renderId fa parte della chiave: un batch nuovo non deve riusare
     le promise di un batch superato (che si scarterebbero da sole) */
  const key = `${pn}@${scale}#${renderId}`;
  const pending = state.pageRenderPromises.get(pn);
  if (pending?.key === key) return pending.promise;

  cancelPageRender(pn);
  const promise = renderPage(pn, shell, scale, renderId)
    .catch((err) => {
      if (err?.name !== "RenderingCancelledException") {
        console.warn(`Rendering pagina ${pn} non riuscito`, err);
      }
    })
    .finally(() => {
      if (state.pageRenderPromises.get(pn)?.promise === promise) {
        state.pageRenderPromises.delete(pn);
      }
    });
  state.pageRenderPromises.set(pn, { key, promise });
  return promise;
}

function cancelPageRender(pn) {
  const task = state.pageRenderTasks.get(pn);
  if (task) {
    try { task.cancel(); } catch { /* già completato */ }
    state.pageRenderTasks.delete(pn);
  }
  state.pageRenderPromises.delete(pn);
}

/* Libera canvas e layer di una pagina uscita dalla zona di pre-render */
function releasePage(pn, shell) {
  cancelPageRender(pn);
  if (!shell.dataset.renderedScale) return;
  delete shell.dataset.renderedScale;
  const loading = document.createElement("div");
  loading.className = "loading-page";
  loading.textContent = `Pagina ${pn}`;
  shell.replaceChildren(loading);
}

function teardownContinuousRendering() {
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }
  state.visiblePages.clear();
  state.pageRenderTasks.forEach((task) => {
    try { task.cancel(); } catch { /* già completato */ }
  });
  state.pageRenderTasks.clear();
  state.pageRenderPromises.clear();
}

/* Riapplica i layer segnalibri sulle pagine già renderizzate
   (dopo aggiunta/rimozione di un segnalibro non serve un re-render completo) */
function refreshHighlightLayers() {
  elements.pageSpread.querySelectorAll(".page-shell").forEach((shell) => {
    const layer = shell.querySelector(".highlightLayer");
    if (!layer) return;
    const pn = Number.parseInt(shell.dataset.page, 10);
    if (Number.isFinite(pn)) renderBookmarkHighlights(pn, layer);
  });
}

function bindScrollTracking() {
  if (isScrollTrackingBound) return;
  elements.bookStage.addEventListener("scroll", () => {
    if (state.pendingScrollPage && !state.isZooming) {
      state.pendingScrollPage = null;
    }
    if (scrollSyncRaf) return;
    scrollSyncRaf = window.requestAnimationFrame(() => {
      scrollSyncRaf = 0;
      updateCurrentPageFromScroll();
    });
  }, { passive: true });
  isScrollTrackingBound = true;
}

function updateCurrentPageFromScroll() {
  if (!state.pdf || !isContinuousMode() || state.isZooming) return;
  const shells = elements.pageSpread.querySelectorAll(".page-shell");
  const stageRect = elements.bookStage.getBoundingClientRect();
  const current = getMostVisiblePage(shells, stageRect, state.currentPage);
  if (current !== state.currentPage) {
    state.currentPage = current;
    if (state.pendingScrollPage) {
      state.pendingScrollPage = null;
    }
    syncControls();
    updateReadingProgress();
  }
}

function getMostVisiblePage(shells, stageRect, fallbackPage) {
  let current = fallbackPage;
  let bestVisible = -1;

  shells.forEach((shell) => {
    const page = Number.parseInt(shell.dataset.page, 10);
    if (!Number.isFinite(page)) return;
    const rect = shell.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, stageRect.top);
    const visibleBottom = Math.min(rect.bottom, stageRect.bottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    if (visibleHeight > bestVisible) {
      bestVisible = visibleHeight;
      current = page;
    }
  });

  return current;
}

/* Scroll programmato dello stage.
   ATTENZIONE: .book-stage ha scroll-behavior:smooth nel CSS, quindi
   behavior:"auto" verrebbe comunque animato. Durante lo zoom serve uno
   scroll DAVVERO istantaneo, altrimenti ogni step cattura l'ancora a metà
   animazione e la posizione deriva ("lo zoom va da un'altra parte"). */
function stageScrollTo(left, top, smooth) {
  const stage = elements.bookStage;
  if (smooth) {
    stage.scrollTo({ left, top, behavior: "smooth" });
    return;
  }
  /* Assegnazione diretta: sincrona in tutti gli engine. scrollTo(options)
     in WebKit può applicarsi al frame dopo — durante gli step rapidi di
     zoom la cattura successiva leggerebbe uno scroll vecchio con le
     dimensioni nuove e l'errore si accumulerebbe in modo esponenziale */
  stage.scrollLeft = left;
  stage.scrollTop = top;
}

function scrollToPage(pageNumber, smooth) {
  const shell = elements.pageSpread.querySelector(`.page-shell[data-page="${pageNumber}"]`);
  if (!shell) return;
  stageScrollTo(elements.bookStage.scrollLeft, Math.max(0, shell.offsetTop - 12), smooth);
}

/* Cattura il punto da mantenere fermo durante lo zoom.
   point (clientX/clientY) = cursore o centro del pinch; senza punto usa il
   centro dello stage. Salva pagina + posizione relativa nella pagina +
   posizione nel viewport, così il ripristino rimette lo stesso punto del
   documento sotto lo stesso punto dello schermo. */
function captureScrollAnchor(point = null) {
  const stage = elements.bookStage;
  const stageRect = stage.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) return null;

  const viewX = point ? clamp(point.x - stageRect.left, 0, stageRect.width) : stageRect.width / 2;
  const viewY = point ? clamp(point.y - stageRect.top, 0, stageRect.height) : stageRect.height / 2;

  /* Lavora in coordinate CONTENUTO (offsetTop/scrollTop): sono sincrone con
     i nostri resize e scroll, mentre getBoundingClientRect può riflettere un
     repaint in ritardo durante gli step rapidi di zoom */
  const contentY = stage.scrollTop + viewY;
  const contentX = stage.scrollLeft + viewX;

  const shells = elements.pageSpread.querySelectorAll(".page-shell");
  let shell = null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const candidate of shells) {
    const top = candidate.offsetTop;
    const height = candidate.offsetHeight;
    if (!height) continue;
    if (contentY >= top && contentY <= top + height) { shell = candidate; break; }
    const dist = contentY < top ? top - contentY : contentY - (top + height);
    if (dist < nearestDist) { nearestDist = dist; nearest = candidate; }
  }
  if (!shell) shell = nearest;
  if (!shell || !shell.offsetWidth || !shell.offsetHeight) return null;

  return {
    page:   Number.parseInt(shell.dataset.page, 10),
    xRatio: clamp((contentX - shell.offsetLeft) / shell.offsetWidth, 0, 1),
    yRatio: clamp((contentY - shell.offsetTop) / shell.offsetHeight, 0, 1),
    viewX,
    viewY,
  };
}

function scrollToAnchor(anchor, smooth = false) {
  const shell = elements.pageSpread.querySelector(`.page-shell[data-page="${anchor.page}"]`);
  if (!shell) return;
  const stage = elements.bookStage;
  const viewX = Number.isFinite(anchor.viewX) ? anchor.viewX : stage.clientWidth / 2;
  const viewY = Number.isFinite(anchor.viewY) ? anchor.viewY : stage.clientHeight / 2;
  const targetLeft = shell.offsetLeft + anchor.xRatio * shell.clientWidth - viewX;
  const targetTop  = shell.offsetTop  + anchor.yRatio * shell.clientHeight - viewY;
  stageScrollTo(Math.max(0, targetLeft), Math.max(0, targetTop), smooth);
}

async function renderSpread() {
  if (!state.pdf) { syncControls(); return; }

  teardownContinuousRendering();
  const renderId = ++state.renderId;
  const pages    = getVisiblePages();
  const shells   = pages.map((pn, i) => createPageShell(pn, pages.length, i));

  elements.emptyState.hidden = true;
  elements.pageSpread.replaceChildren(...shells);
  elements.bookStage.classList.remove("is-turning-forward", "is-turning-back");
  elements.bookStage.classList.add(state.direction === "forward" ? "is-turning-forward" : "is-turning-back");

  /* Update reading progress bar */
  updateReadingProgress();

  try {
    const scale = await getEffectiveScale(pages);
    if (renderId !== state.renderId) return;
    await Promise.all(pages.map((pn, i) => renderPage(pn, shells[i], scale, renderId)));
    if (renderId === state.renderId) {
      applySearchHighlights();
      scrollToPendingBookmark();
      setStatus("Pronto");
    }
  } catch (err) {
    console.error(err);
    setStatus("Errore durante il rendering del PDF");
  } finally {
    window.setTimeout(() => {
      elements.bookStage.classList.remove("is-turning-forward", "is-turning-back");
    }, 250);
    syncControls();
  }
}

/** Update the thin progress bar at the top of the header to show reading % */
function updateReadingProgress() {
  if (!elements.progressBar || !state.totalPages) return;
  const pct = Math.round((state.currentPage / state.totalPages) * 100);
  // Only use the reading-progress role if no PDF is loading
  // We repurpose the bar width here without triggering the hide timer
  if (!elements.progressBar.classList.contains("is-visible")) {
    elements.progressBar.style.width = `${pct}%`;
    elements.progressBar.style.opacity = "0.45";
    elements.progressBar.style.transition = "width 400ms ease";
  }
}

function createPageShell(pageNumber, pageCount, index) {
  const shell = document.createElement("article");
  shell.className = "page-shell";
  shell.dataset.page = String(pageNumber);
  shell.setAttribute("aria-label", `Pagina ${pageNumber}`);
  if (!isContinuousMode() && pageCount > 1) shell.classList.add(index === 0 ? "is-left" : "is-right");

  const loading = document.createElement("div");
  loading.className = "loading-page";
  loading.textContent = `Pagina ${pageNumber}`;
  shell.append(loading);
  return shell;
}

async function getEffectiveScale(pageNumbers) {
  const pages     = await Promise.all(pageNumbers.map((pn) => state.pdf.getPage(pn)));
  const gap       = pageNumbers.length > 1 ? getSpreadGap() : 0;
  const bases     = pages.map((p) => p.getViewport({ scale: 1 }));
  const totalW    = bases.reduce((s, vp) => s + vp.width, 0) + gap;
  const tallest   = Math.max(...bases.map((vp) => vp.height));
  const availW    = Math.max(elements.bookStage.clientWidth  - getStagePaddingX() - 6, 280);
  const availH    = Math.max(elements.bookStage.clientHeight - getStagePaddingY() - 6, 360);
  const fitScale  = Math.min(availW / totalW, availH / tallest, 1.32);
  return clamp(fitScale * (state.zoomPercent / 100), 0.24, 4);
}

function getSpreadGap() {
  const s = window.getComputedStyle(elements.pageSpread);
  return Number.parseFloat(s.columnGap || s.gap || "24") || 24;
}

function getStagePaddingX() {
  const s = window.getComputedStyle(elements.bookStage);
  return Number.parseFloat(s.paddingLeft) + Number.parseFloat(s.paddingRight);
}

function getStagePaddingY() {
  const s = window.getComputedStyle(elements.bookStage);
  return Number.parseFloat(s.paddingTop) + Number.parseFloat(s.paddingBottom);
}

/* Scala di output del canvas: DPR limitato + tetto ai pixel totali,
   così zoom alti su schermi retina non esauriscono la memoria */
function getOutputScale(viewport) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
  const pixels = viewport.width * viewport.height * dpr * dpr;
  if (pixels <= MAX_RENDER_PIXELS) return dpr;
  return dpr * Math.sqrt(MAX_RENDER_PIXELS / pixels);
}

async function renderPage(pageNumber, shell, scale, renderId) {
  const page = await state.pdf.getPage(pageNumber);
  if (renderId !== state.renderId || !shell.isConnected) return;

  const viewport = page.getViewport({ scale });

  /* Memorizza le dimensioni reali della pagina a scala 1 per il resize sync */
  shell.dataset.baseW = String(viewport.width / scale);
  shell.dataset.baseH = String(viewport.height / scale);
  shell.style.width  = `${viewport.width}px`;
  shell.style.height = `${viewport.height}px`;

  const outputScale = getOutputScale(viewport);
  const canvas = document.createElement("canvas");
  canvas.className = "pdf-canvas";
  canvas.width     = Math.floor(viewport.width  * outputScale);
  canvas.height    = Math.floor(viewport.height * outputScale);
  /* 100%: il canvas segue la shell, così lo zoom stira il bitmap esistente
     in attesa del re-render nitido */
  canvas.style.width  = "100%";
  canvas.style.height = "100%";

  const textLayer = document.createElement("div");
  textLayer.className = "textLayer";
  textLayer.style.width  = `${viewport.width}px`;
  textLayer.style.height = `${viewport.height}px`;
  textLayer.style.setProperty("--scale-factor", String(scale));

  const highlightLayer = document.createElement("div");
  highlightLayer.className = "highlightLayer";
  highlightLayer.style.width  = "100%";
  highlightLayer.style.height = "100%";

  const linkLayer = document.createElement("div");
  linkLayer.className = "linkLayer";
  linkLayer.style.width  = `${viewport.width}px`;
  linkLayer.style.height = `${viewport.height}px`;

  const renderTask = page.render({
    canvasContext: canvas.getContext("2d", { alpha: false }),
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
    viewport,
  });
  state.pageRenderTasks.set(pageNumber, renderTask);
  try {
    await renderTask.promise;
  } finally {
    if (state.pageRenderTasks.get(pageNumber) === renderTask) {
      state.pageRenderTasks.delete(pageNumber);
    }
  }
  if (renderId !== state.renderId || !shell.isConnected) return;

  const textContent = await page.getTextContent();
  if (renderId !== state.renderId || !shell.isConnected) return;
  state.pageTextCache.set(pageNumber, mergeTextContent(textContent));

  await pdfjsLib.renderTextLayer({
    container: textLayer,
    textContentSource: textContent,
    viewport,
  }).promise;

  const annotations = await page.getAnnotations({ intent: "display" });
  if (renderId !== state.renderId || !shell.isConnected) return;
  /* Lo zoom è cambiato mentre renderizzavamo: scarta il risultato obsoleto */
  if (isContinuousMode() && Number.isFinite(state.continuousScale) && state.continuousScale !== scale) return;
  renderLinkLayer(annotations, linkLayer, viewport);
  renderBookmarkHighlights(pageNumber, highlightLayer);

  shell.replaceChildren(canvas, highlightLayer, textLayer, linkLayer);
  shell.dataset.renderedScale = String(scale);
  applySearchHighlights(shell);
}

/* ── Bookmark highlights on page ── */
function renderBookmarkHighlights(pageNumber, container) {
  const fragment = document.createDocumentFragment();
  state.bookmarks
    .filter((b) => b.type === "text" && b.page === pageNumber && Array.isArray(b.rects))
    .forEach((bookmark) => {
      bookmark.rects.forEach((rect) => {
        const hi = document.createElement("button");
        hi.type = "button";
        hi.className = "saved-highlight";
        hi.dataset.bookmarkId = bookmark.id;
        hi.title = bookmark.title;
        hi.setAttribute("aria-label", bookmark.title);
        hi.style.left   = `${rect.left   * 100}%`;
        hi.style.top    = `${rect.top    * 100}%`;
        hi.style.width  = `${rect.width  * 100}%`;
        hi.style.height = `${rect.height * 100}%`;
        hi.classList.toggle("is-active", state.activeBookmarkId === bookmark.id);
        hi.addEventListener("click", () => activateBookmark(bookmark.id));
        fragment.append(hi);
      });
    });
  container.replaceChildren(fragment);
}

/* ── Link layer ── */
function renderLinkLayer(annotations, container, viewport) {
  const links = annotations.filter((a) => a.subtype === "Link" && a.rect);
  const fragment = document.createDocumentFragment();
  links.forEach((annotation) => {
    const area = document.createElement("a");
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);
    const left = Math.min(x1, x2), top = Math.min(y1, y2);
    const width = Math.abs(x1 - x2), height = Math.abs(y1 - y2);
    area.className = "pdf-link";
    area.style.left   = `${left}px`;
    area.style.top    = `${top}px`;
    area.style.width  = `${width}px`;
    area.style.height = `${height}px`;
    if (annotation.url || annotation.unsafeUrl) {
      area.href   = annotation.url || annotation.unsafeUrl;
      area.target = "_blank";
      area.rel    = "noreferrer";
    } else if (annotation.dest) {
      area.href = "#";
      area.addEventListener("click", (e) => { e.preventDefault(); goToDestination(annotation.dest); });
    }
    fragment.append(area);
  });
  container.replaceChildren(fragment);
}

async function goToDestination(destination) {
  if (!state.pdf) return;
  try {
    const explicit = Array.isArray(destination)
      ? destination
      : await state.pdf.getDestination(destination);
    if (!explicit) return;
    const [pageRef] = explicit;
    const pageIndex = typeof pageRef === "object"
      ? await state.pdf.getPageIndex(pageRef)
      : Number(pageRef) - 1;
    goToPage(pageIndex + 1);
  } catch (err) {
    console.warn("Destinazione PDF non raggiungibile", err);
  }
}

/* ============================================================
   ZOOM
   ============================================================ */
function changeZoom(delta, anchorPoint = null) {
  const next = clamp(
    state.zoomPercent + delta,
    Number(elements.zoomRange.min),
    Number(elements.zoomRange.max)
  );
  setZoomPercent(next, { anchorPoint });
}

/* ============================================================
   BOOKMARKS
   ============================================================ */
function createPageBookmarkDraft() {
  const visible = getVisiblePages();
  const page    = visible[0] || state.currentPage;
  return { page, rects: [], snippet: "", title: `Pagina ${page}`, type: "page" };
}

function createTextBookmarkDraft() {
  const sel = getCurrentTextSelection();
  if (!sel) { hideSelectionMenu(); return null; }
  return {
    page:    sel.page,
    rects:   sel.rects,
    snippet: sel.text,
    title:   truncateText(sel.text, 58) || `Pagina ${sel.page}`,
    type:    "text",
  };
}

function openBookmarkDialog(draft) {
  if (!draft || !state.pdf) return;
  state.pendingBookmarkDraft = draft;
  elements.bookmarkDialogTitle.textContent =
    draft.type === "text" ? "Segnalibro su testo" : "Segnalibro pagina";
  elements.bookmarkTitleInput.value = draft.title;
  elements.bookmarkContext.textContent =
    draft.type === "text" ? `Pagina ${draft.page}: ${draft.snippet}` : `Pagina ${draft.page}`;
  elements.bookmarkDialog.showModal();
  elements.bookmarkTitleInput.focus();
  elements.bookmarkTitleInput.select();
}

function closeBookmarkDialog() {
  state.pendingBookmarkDraft = null;
  if (elements.bookmarkDialog.open) elements.bookmarkDialog.close();
}

function savePendingBookmark() {
  const draft = state.pendingBookmarkDraft;
  if (!draft) return;

  /* BUG FIX: In spread mode, bookmark page might be off-by-one for right page.
     We always store the exact page from the draft, which comes from the text
     selection or page input — no adjustment needed. */
  const title = elements.bookmarkTitleInput.value.trim() || draft.title || `Pagina ${draft.page}`;
  const bookmark = {
    createdAt: Date.now(),
    id:        createId(),
    page:      draft.page,
    rects:     draft.rects  || [],
    snippet:   draft.snippet || "",
    title,
    type:      draft.type,
  };

  state.bookmarks.push(bookmark);
  state.activeBookmarkId = bookmark.id;
  sortBookmarks();
  saveBookmarks();
  renderBookmarkList();
  state.activePanel = "bookmarks";
  syncSearchPanelVisibility();
  closeBookmarkDialog();
  hideSelectionMenu();
  window.getSelection()?.removeAllRanges();
  scheduleRender();
  setStatus("Segnalibro salvato");
}

function loadBookmarks() {
  try {
    const raw    = localStorage.getItem(getBookmarkStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isValidBookmark) : [];
  } catch (err) {
    console.warn("Segnalibri non leggibili", err);
    return [];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(getBookmarkStorageKey(), JSON.stringify(state.bookmarks));
  } catch (err) {
    console.warn("Segnalibri non salvati", err);
    setStatus("Impossibile salvare il segnalibro");
  }
}

function getBookmarkStorageKey() {
  const key = state.currentBook?.id || state.currentBook?.pdf || "libro";
  return `${BOOKMARK_STORAGE_PREFIX}${key}`;
}

function isValidBookmark(b) {
  return b
    && typeof b.id === "string"
    && Number.isFinite(b.page)
    && b.page >= 1
    && typeof b.title === "string";
}

function sortBookmarks() {
  state.bookmarks.sort((a, b) => a.page - b.page || (a.createdAt || 0) - (b.createdAt || 0));
}

function renderBookmarkList() {
  sortBookmarks();
  elements.bookmarkCount.textContent = String(state.bookmarks.length);

  if (!state.bookmarks.length) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = "Nessun segnalibro";
    elements.bookmarkList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.bookmarks.forEach((bookmark) => {
    const item = document.createElement("div");
    item.className = "bookmark-item";
    item.classList.toggle("is-active", state.activeBookmarkId === bookmark.id);
    item.dataset.bookmarkId = bookmark.id;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "bookmark-main";
    main.addEventListener("click", () => activateBookmark(bookmark.id));

    const titleEl = document.createElement("span");
    titleEl.className = "bookmark-title";
    titleEl.textContent = bookmark.title;

    const meta = document.createElement("span");
    meta.className = "bookmark-meta";
    meta.textContent = bookmark.type === "text"
      ? `Pag. ${bookmark.page} · testo`
      : `Pag. ${bookmark.page}`;

    main.append(titleEl, meta);

    if (bookmark.snippet) {
      const snippet = document.createElement("span");
      snippet.className = "bookmark-snippet";
      snippet.textContent = bookmark.snippet;
      main.append(snippet);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button bookmark-delete";
    remove.title = "Elimina segnalibro";
    remove.setAttribute("aria-label", "Elimina segnalibro");
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>';
    remove.addEventListener("click", () => deleteBookmark(bookmark.id));

    item.append(main, remove);
    fragment.append(item);
  });

  elements.bookmarkList.replaceChildren(fragment);
}

function activateBookmark(id) {
  const bookmark = state.bookmarks.find((b) => b.id === id);
  if (!bookmark) return;
  state.activeBookmarkId        = bookmark.id;
  state.pendingBookmarkScrollId = bookmark.id;
  state.activePanel             = "bookmarks";
  syncSearchPanelVisibility();
  renderBookmarkList();
  goToPage(bookmark.page);
}

function deleteBookmark(id) {
  state.bookmarks = state.bookmarks.filter((b) => b.id !== id);
  if (state.activeBookmarkId === id) state.activeBookmarkId = null;
  saveBookmarks();
  renderBookmarkList();
  scheduleRender();
}

function scrollToPendingBookmark() {
  if (!state.pendingBookmarkScrollId) return;
  const bookmark = state.bookmarks.find((b) => b.id === state.pendingBookmarkScrollId);
  const shell    = elements.pageSpread.querySelector(`.page-shell[data-page="${bookmark?.page}"]`);
  if (!bookmark || !shell) return;

  const rect = bookmark.rects?.[0];
  const top  = shell.offsetTop  + (rect ? rect.top  * shell.clientHeight : 0) - 72;
  const left = shell.offsetLeft + (rect ? rect.left * shell.clientWidth  : 0) - 72;
  elements.bookStage.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: "smooth" });

  elements.pageSpread.querySelectorAll(".saved-highlight").forEach((hi) => {
    hi.classList.toggle("is-active", hi.dataset.bookmarkId === bookmark.id);
  });

  state.pendingBookmarkScrollId = null;
}

/* ============================================================
   SEARCH
   ============================================================ */
async function runSearch() {
  const query = normalizeText(elements.searchInput.value.trim());
  const myToken = ++searchToken;
  state.searchMatches  = [];
  state.searchPosition = -1;
  elements.resultList.replaceChildren();

  if (!state.pdf || query.length < MIN_QUERY_LENGTH) {
    elements.searchCount.textContent = "0 risultati";
    applySearchHighlights();
    syncControls();
    return;
  }

  setStatus("Ricerca in corso...");
  elements.searchCount.textContent = "Cerco...";
  const pdf = state.pdf;

  for (let pn = 1; pn <= state.totalPages; pn++) {
    /* Query cambiata o PDF chiuso nel frattempo: abbandona questa ricerca */
    if (myToken !== searchToken || state.pdf !== pdf) return;
    const text      = await getPageText(pn);
    const normed    = normalizeText(text);
    const count     = countMatches(normed, query);
    if (count > 0) {
      state.searchMatches.push({ count, page: pn, snippet: createSnippet(text, query) });
    }
    if (pn % 12 === 0) {
      elements.searchCount.textContent =
        `Cerco... ${Math.round((pn / state.totalPages) * 100)}%`;
    }
  }

  if (myToken !== searchToken || state.pdf !== pdf) return;
  renderSearchResults();
  applySearchHighlights();
  syncControls();

  if (state.searchMatches.length > 0) {
    moveSearchResult(1);
  } else {
    elements.searchCount.textContent = "0 risultati";
    setStatus("Nessun risultato");
  }
}

async function getPageText(pageNumber) {
  if (state.pageTextCache.has(pageNumber)) return state.pageTextCache.get(pageNumber);
  const page        = await state.pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const text        = mergeTextContent(textContent);
  state.pageTextCache.set(pageNumber, text);
  return text;
}

function mergeTextContent(tc) {
  return tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
}

function countMatches(text, query) {
  let count = 0, i = text.indexOf(query);
  while (i !== -1) { count++; i = text.indexOf(query, i + query.length); }
  return count;
}

function createSnippet(text, query) {
  const normed = normalizeText(text);
  const idx    = normed.indexOf(query);
  if (idx === -1) return text.slice(0, 140);
  const start  = Math.max(0, idx - 55);
  const end    = Math.min(text.length, idx + query.length + 85);
  return `${start > 0 ? "... " : ""}${text.slice(start, end)}${end < text.length ? " ..." : ""}`;
}

function renderSearchResults() {
  const total = state.searchMatches.reduce((s, m) => s + m.count, 0);
  elements.searchCount.textContent = `${total} ${total === 1 ? "risultato" : "risultati"}`;

  const fragment = document.createDocumentFragment();
  state.searchMatches.forEach((match, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "result-item";
    item.dataset.index = String(index);
    item.innerHTML = `
      <span class="result-page">Pagina ${match.page} · ${match.count} ${match.count === 1 ? "trovato" : "trovati"}</span>
      <span class="result-snippet"></span>
    `;
    item.querySelector(".result-snippet").textContent = match.snippet;
    item.addEventListener("click", () => {
      state.searchPosition = index;
      activateSearchResult();
    });
    fragment.append(item);
  });

  elements.resultList.replaceChildren(fragment);
}

function moveSearchResult(delta) {
  if (!state.searchMatches.length) return;
  state.searchPosition = (state.searchPosition + delta + state.searchMatches.length) % state.searchMatches.length;
  activateSearchResult();
}

function activateSearchResult() {
  const match = state.searchMatches[state.searchPosition];
  if (!match) return;
  elements.resultList.querySelectorAll(".result-item").forEach((el, i) => {
    el.classList.toggle("is-active", i === state.searchPosition);
  });
  elements.resultList
    .querySelector(`[data-index="${state.searchPosition}"]`)
    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  goToPage(match.page);
}

function applySearchHighlights(root = elements.pageSpread) {
  const query = normalizeText(elements.searchInput.value.trim());
  root.querySelectorAll(".textLayer span").forEach((span) => {
    const hit = query.length >= MIN_QUERY_LENGTH && normalizeText(span.textContent).includes(query);
    span.classList.toggle("search-hit", hit);
  });
}

function normalizeText(v) {
  return v.toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/* ============================================================
   SELECTION MENU
   ============================================================ */
function updateSelectionMenu() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) { hideSelectionMenu(); return; }
  const shell = getSelectionPageShell(sel);
  if (!shell || !elements.bookStage.contains(shell)) { hideSelectionMenu(); return; }
  const range = sel.getRangeAt(0);
  const rects = Array.from(range.getClientRects());
  if (!rects.length) { hideSelectionMenu(); return; }

  const minX = Math.min(...rects.map((r) => r.left));
  const maxX = Math.max(...rects.map((r) => r.right));
  const minY = Math.min(...rects.map((r) => r.top));

  elements.selectionMenu.hidden = false;
  const menuRect = elements.selectionMenu.getBoundingClientRect();
  const left = clamp((minX + maxX) / 2 - menuRect.width / 2, 8, window.innerWidth - menuRect.width - 8);
  const desiredTop = minY - menuRect.height - 10;
  const top  = clamp(desiredTop, 8, window.innerHeight - menuRect.height - 8);
  elements.selectionMenu.style.left = `${left}px`;
  elements.selectionMenu.style.top  = `${top}px`;
}

function hideSelectionMenu() {
  elements.selectionMenu.hidden = true;
}

function getCurrentTextSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const range = sel.getRangeAt(0);
  const shell = getSelectionPageShell(sel);
  if (!shell) return null;
  const page  = Number.parseInt(shell.dataset.page, 10);
  const rects = getSelectionRects(range, shell);
  if (!Number.isFinite(page) || !rects.length) return null;
  return { page, rects, text };
}

function getSelectionPageShell(sel) {
  return getClosestPageShell(sel.anchorNode) || getClosestPageShell(sel.focusNode);
}

function getClosestPageShell(node) {
  const el = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return el?.closest(".page-shell") || null;
}

function getSelectionRects(range, shell) {
  const sr = shell.getBoundingClientRect();
  return Array.from(range.getClientRects())
    .map((r) => {
      const left  = Math.max(r.left,   sr.left);
      const top   = Math.max(r.top,    sr.top);
      const right = Math.min(r.right,  sr.right);
      const bot   = Math.min(r.bottom, sr.bottom);
      return { height: bot - top, left: left - sr.left, top: top - sr.top, width: right - left };
    })
    .filter((r) => r.width > 2 && r.height > 2)
    .map((r) => ({
      height: clamp(roundRatio(r.height / sr.height), 0, 1),
      left:   clamp(roundRatio(r.left   / sr.width),  0, 1),
      top:    clamp(roundRatio(r.top    / sr.height), 0, 1),
      width:  clamp(roundRatio(r.width  / sr.width),  0, 1),
    }));
}

/* ============================================================
   UI SYNC
   ============================================================ */
function syncControls() {
  const has     = Boolean(state.pdf);
  const visible = getVisiblePages();
  const first   = visible[0]                    || state.currentPage;
  const last    = visible[visible.length - 1]   || state.currentPage;
  const continuous = isContinuousMode();

  document.body.classList.toggle("has-pdf", has);

  elements.emptyState.hidden              = has;
  elements.pageInput.disabled             = !has;
  elements.pageInput.value                = String(first);
  /* Attivi anche in modalità continua: servono a bottom bar mobile e tastiera */
  elements.prevButton.disabled            = !has || first <= 1;
  elements.nextButton.disabled            = !has || last >= state.totalPages;
  elements.zoomInButton.disabled          = !has;
  elements.zoomOutButton.disabled         = !has;
  elements.zoomRange.disabled             = !has;
  elements.spreadButton.disabled          = !has;
  elements.spreadButton.classList.toggle("is-active", !continuous);
  const spreadLabel = continuous ? "Vista libro" : "Vista scorrimento";
  elements.spreadButton.title = spreadLabel;
  elements.spreadButton.setAttribute("aria-label", spreadLabel);
  elements.addPageBookmarkButton.disabled = !has;
  // elements.bookmarkToggleButton.disabled  = !has;
  elements.searchInput.disabled           = !has;
  elements.prevResultButton.disabled      = !state.searchMatches.length;
  elements.nextResultButton.disabled      = !state.searchMatches.length;
  elements.totalPages.textContent         = `/ ${state.totalPages || 0}`;
  elements.zoomRange.value                = String(state.zoomPercent);
  elements.zoomValue.textContent          = `${state.zoomPercent}%`;
  applyReaderLayoutClasses();

  if (elements.pageIndicator) {
    elements.pageIndicator.hidden = !has || !continuous;
    elements.pageIndicator.textContent = `Pagina ${first} / ${state.totalPages || 0}`;
  }
}

function setStatus(message) {
  elements.statusText.textContent = message === "Pronto" ? "" : message;
}

/* Le utility generiche (clamp, truncateText, createId, ...) vivono in common.js */