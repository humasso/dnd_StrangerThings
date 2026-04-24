const BOOKS_MANIFEST_URL = "books.json";
const DEFAULT_BOOK = {
  category: "Play Guide",
  id: "diavolo-metal-muori",
  pdf: "assets/contenuti/book.pdf",
  title: "Diavolo, Metal, Muori",
};
const PDFJS_CDN_VERSION = "3.11.174";
const MIN_QUERY_LENGTH = 2;

const elements = {
  bookStage: document.getElementById("bookStage"),
  addPageBookmarkButton: document.getElementById("addPageBookmarkButton"),
  bookCarousel: document.getElementById("bookCarousel"),
  carouselDots: document.getElementById("carouselDots"),
  carouselNextButton: document.getElementById("carouselNextButton"),
  carouselPrevButton: document.getElementById("carouselPrevButton"),
  bookmarkCancelButton: document.getElementById("bookmarkCancelButton"),
  bookmarkContext: document.getElementById("bookmarkContext"),
  bookmarkCount: document.getElementById("bookmarkCount"),
  bookmarkDialog: document.getElementById("bookmarkDialog"),
  bookmarkDialogTitle: document.getElementById("bookmarkDialogTitle"),
  bookmarkDismissButton: document.getElementById("bookmarkDismissButton"),
  bookmarkForm: document.getElementById("bookmarkForm"),
  bookmarkList: document.getElementById("bookmarkList"),
  bookmarksPanel: document.getElementById("bookmarksPanel"),
  bookmarkTitleInput: document.getElementById("bookmarkTitleInput"),
  bookmarkToggleButton: document.getElementById("bookmarkToggleButton"),
  emptyState: document.getElementById("emptyState"),
  homeButton: document.getElementById("homeButton"),
  homeScreen: document.getElementById("homeScreen"),
  nextButton: document.getElementById("nextButton"),
  nextResultButton: document.getElementById("nextResultButton"),
  pageInput: document.getElementById("pageInput"),
  pageSpread: document.getElementById("pageSpread"),
  prevButton: document.getElementById("prevButton"),
  prevResultButton: document.getElementById("prevResultButton"),
  readerLayout: document.getElementById("readerLayout"),
  resultList: document.getElementById("resultList"),
  searchCount: document.getElementById("searchCount"),
  searchInput: document.getElementById("searchInput"),
  searchPanel: document.getElementById("searchPanel"),
  searchToggleButton: document.getElementById("searchToggleButton"),
  selectionBookmarkButton: document.getElementById("selectionBookmarkButton"),
  selectionMenu: document.getElementById("selectionMenu"),
  sidePanel: document.getElementById("sidePanel"),
  spreadButton: document.getElementById("spreadButton"),
  statusText: document.getElementById("statusText"),
  toolRail: document.getElementById("toolRail"),
  toolsToggleButton: document.getElementById("toolsToggleButton"),
  toolsWrap: document.getElementById("toolsWrap"),
  totalPages: document.getElementById("totalPages"),
  zoomInButton: document.getElementById("zoomInButton"),
  zoomOutButton: document.getElementById("zoomOutButton"),
  zoomRange: document.getElementById("zoomRange"),
  zoomValue: document.getElementById("zoomValue"),
};

const state = {
  activeBookmarkId: null,
  activePanel: null,
  bookmarks: [],
  books: [],
  currentBook: null,
  currentPage: 1,
  direction: "forward",
  isToolsVisible: true,
  isSpread: false,
  selectedBookIndex: 0,
  pageTextCache: new Map(),
  pendingBookmarkDraft: null,
  pendingBookmarkScrollId: null,
  pdf: null,
  renderId: 0,
  searchMatches: [],
  searchPosition: -1,
  totalPages: 0,
  zoomPercent: 100,
};

const media = window.matchMedia("(max-width: 760px)");
const resizeObserver = new ResizeObserver(() => scheduleRender());
let renderTimer = 0;
let searchTimer = 0;

boot();

function boot() {
  if (!window.pdfjsLib) {
    setStatus("PDF.js non disponibile");
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_CDN_VERSION}/pdf.worker.min.js`;

  bindEvents();
  showHome();
  syncSearchPanelVisibility();
  syncToolsVisibility();
  renderBookmarkList();
  syncControls();
  resizeObserver.observe(elements.bookStage);
  loadLibrary();
}

function bindEvents() {
  elements.homeButton.addEventListener("click", showHome);
  elements.carouselPrevButton.addEventListener("click", () => moveCarousel(-1));
  elements.carouselNextButton.addEventListener("click", () => moveCarousel(1));
  bindCarouselSwipe();

  elements.prevButton.addEventListener("click", () => turnPage(-1));
  elements.nextButton.addEventListener("click", () => turnPage(1));

  elements.pageInput.addEventListener("change", () => {
    const requestedPage = Number.parseInt(elements.pageInput.value, 10);
    goToPage(requestedPage);
  });

  elements.zoomRange.addEventListener("input", () => {
    state.zoomPercent = Number.parseInt(elements.zoomRange.value, 10);
    elements.zoomValue.textContent = `${state.zoomPercent}%`;
    scheduleRender();
  });

  elements.zoomOutButton.addEventListener("click", () => changeZoom(-10));
  elements.zoomInButton.addEventListener("click", () => changeZoom(10));

  elements.spreadButton.addEventListener("click", () => {
    state.isSpread = !state.isSpread;
    elements.spreadButton.classList.toggle("is-active", state.isSpread);
    scheduleRender();
  });

  elements.searchToggleButton.addEventListener("click", () => {
    togglePanel("search");
  });

  elements.bookmarkToggleButton.addEventListener("click", () => {
    togglePanel("bookmarks");
  });

  elements.addPageBookmarkButton.addEventListener("click", () => {
    openBookmarkDialog(createPageBookmarkDraft());
  });

  elements.toolsToggleButton.addEventListener("click", () => {
    toggleToolsVisibility();
  });

  elements.bookmarkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    savePendingBookmark();
  });

  elements.bookmarkCancelButton.addEventListener("click", closeBookmarkDialog);
  elements.bookmarkDismissButton.addEventListener("click", closeBookmarkDialog);
  elements.bookmarkDialog.addEventListener("close", () => {
    state.pendingBookmarkDraft = null;
  });

  elements.selectionBookmarkButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  elements.selectionBookmarkButton.addEventListener("click", () => {
    const draft = createTextBookmarkDraft();
    if (draft) {
      openBookmarkDialog(draft);
    }
  });

  elements.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 220);
  });

  elements.prevResultButton.addEventListener("click", () => moveSearchResult(-1));
  elements.nextResultButton.addEventListener("click", () => moveSearchResult(1));

  elements.bookStage.addEventListener("mouseup", () => {
    window.setTimeout(updateSelectionMenu, 0);
  });

  elements.bookStage.addEventListener("keyup", () => {
    window.setTimeout(updateSelectionMenu, 0);
  });

  document.addEventListener("mousedown", (event) => {
    if (!elements.selectionMenu.contains(event.target)) {
      hideSelectionMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (elements.bookmarkDialog.open) {
      return;
    }

    if (event.target instanceof HTMLInputElement) {
      return;
    }

    if (event.key === "ArrowLeft") {
      turnPage(-1);
    }

    if (event.key === "ArrowRight") {
      turnPage(1);
    }
  });

  media.addEventListener("change", () => scheduleRender());

  // ====================================================================
  // ZOOM GESTURES - Wheel + Trackpad + Touch
  // ====================================================================

  // Wheel event: Ctrl/Cmd + scroll = zoom
  elements.bookStage.addEventListener(
    "wheel",
    (event) => {
      // Only zoom if Ctrl (Windows) or Cmd (Mac) is pressed
      if (!event.ctrlKey && !event.metaKey) return;

      event.preventDefault();

      // deltaY < 0 = scroll up = zoom in
      // deltaY > 0 = scroll down = zoom out
      const zoomDelta = event.deltaY < 0 ? 10 : -10;
      changeZoom(zoomDelta);
    },
    { passive: false }
  );

  // Touch pinch zoom (trackpad or touch device)
  let lastTouchDistance = 0;

  elements.bookStage.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();

        const touch1 = event.touches[0];
        const touch2 = event.touches[1];

        // Calculate distance between two fingers
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        if (lastTouchDistance === 0) {
          lastTouchDistance = currentDistance;
          return;
        }

        // Zoom based on distance change
        const distanceDelta = currentDistance - lastTouchDistance;
        if (Math.abs(distanceDelta) > 3) {
          // Minimum movement threshold to avoid jitter
          const zoomDelta = distanceDelta > 0 ? 5 : -5;
          changeZoom(zoomDelta);
          lastTouchDistance = currentDistance;
        }
      }
    },
    { passive: false }
  );

  // Reset touch tracking on touch end
  elements.bookStage.addEventListener("touchend", () => {
    lastTouchDistance = 0;
  });

  // macOS trackpad pinch (via GestureEvent)
  if (typeof GestureEvent !== "undefined") {
    elements.bookStage.addEventListener(
      "gesturechange",
      (event) => {
        event.preventDefault();
        // scale > 1 = pinch out (zoom in)
        // scale < 1 = pinch in (zoom out)
        const zoomDelta = event.scale > 1 ? 5 : -5;
        changeZoom(zoomDelta);
      },
      { passive: false }
    );
  }
}

async function loadLibrary() {
  setStatus("Caricamento libretti...");

  try {
    const response = await fetch(BOOKS_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Manifest non disponibile: ${response.status}`);
    }

    const books = await response.json();
    state.books = normalizeBooks(books);
  } catch (error) {
    console.warn("Uso libreria predefinita", error);
    state.books = [DEFAULT_BOOK];
  }

  state.selectedBookIndex = clamp(state.selectedBookIndex, 0, Math.max(0, state.books.length - 1));
  renderLibrary();
  setStatus("");
}

function normalizeBooks(books) {
  const normalized = Array.isArray(books) ? books : [];
  const validBooks = normalized
    .map((book, index) => ({
      category: book.category || "Libretto",
      cover: book.cover || "",
      id: book.id || createBookId(book.pdf, index),
      pdf: book.pdf,
      title: book.title || `Libretto ${index + 1}`,
    }))
    .filter((book) => typeof book.pdf === "string" && book.pdf.trim());

  return validBooks.length ? validBooks : [DEFAULT_BOOK];
}

function renderLibrary() {
  const fragment = document.createDocumentFragment();
  const dots = document.createDocumentFragment();
  const total = state.books.length;

  state.books.forEach((book, index) => {
    const offset = getCarouselOffset(index, state.selectedBookIndex, total);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "book-card";
    card.style.setProperty("--offset", String(offset));
    card.style.setProperty("--abs-offset", String(Math.abs(offset)));
    card.style.zIndex = String(30 - Math.abs(offset));
    card.dataset.index = String(index);
    card.setAttribute("aria-label", `Apri ${book.title}`);
    if (index === state.selectedBookIndex) {
      card.setAttribute("aria-current", "true");
    } else {
      card.removeAttribute("aria-current");
    }
    card.addEventListener("click", () => openBook(index));

    const cover = document.createElement("div");
    cover.className = "book-cover";

    if (book.cover) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = book.cover;
      cover.append(image);
    } else {
      const canvas = document.createElement("canvas");
      canvas.className = "cover-canvas";
      cover.append(canvas);
      renderBookCover(book, canvas);
    }

    const category = document.createElement("span");
    category.className = "book-category";
    category.textContent = book.category;

    const title = document.createElement("span");
    title.className = "book-title";
    title.textContent = book.title;

    card.append(cover, category, title);
    fragment.append(card);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "carousel-dot";
    dot.classList.toggle("is-active", index === state.selectedBookIndex);
    dot.title = book.title;
    dot.setAttribute("aria-label", book.title);
    dot.addEventListener("click", () => selectBook(index));
    dots.append(dot);
  });

  elements.bookCarousel.replaceChildren(fragment);
  elements.carouselDots.replaceChildren(dots);
  elements.carouselPrevButton.disabled = total <= 1;
  elements.carouselNextButton.disabled = total <= 1;
}

function getCarouselOffset(index, selectedIndex, total) {
  if (total <= 1) {
    return 0;
  }

  const rawOffset = index - selectedIndex;
  const wrappedOffset = rawOffset > total / 2
    ? rawOffset - total
    : rawOffset < -total / 2
      ? rawOffset + total
      : rawOffset;

  return clamp(wrappedOffset, -2, 2);
}

function selectBook(index) {
  if (!state.books.length) {
    return;
  }

  state.selectedBookIndex = (index + state.books.length) % state.books.length;
  renderLibrary();
}

function moveCarousel(delta) {
  selectBook(state.selectedBookIndex + delta);
}

function bindCarouselSwipe() {
  let startX = 0;
  let startY = 0;

  elements.bookCarousel.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
  });

  elements.bookCarousel.addEventListener("pointerup", (event) => {
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY)) {
      moveCarousel(deltaX < 0 ? 1 : -1);
    }
  });
}

async function renderBookCover(book, canvas) {
  try {
    const pdf = await pdfjsLib.getDocument(book.pdf).promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const coverWidth = 260;
    const scale = coverWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    await page.render({
      canvasContext: canvas.getContext("2d", { alpha: false }),
      transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null,
      viewport,
    }).promise;
  } catch (error) {
    console.warn(`Copertina non disponibile per ${book.title}`, error);
    canvas.replaceWith(createCoverFallback(book));
  }
}

function createCoverFallback(book) {
  const fallback = document.createElement("div");
  fallback.className = "cover-fallback";
  fallback.textContent = book.title;
  return fallback;
}

async function openBook(index) {
  const book = state.books[index];
  if (!book) {
    return;
  }

  state.selectedBookIndex = index;
  state.currentBook = book;
  showReader();
  await loadPdf(book.pdf, book.title);
}

function showHome() {
  hideSelectionMenu();
  state.activePanel = null;
  state.activeBookmarkId = null;
  document.body.classList.add("is-home-view");
  elements.homeScreen.hidden = false;
  elements.readerLayout.hidden = true;
  elements.homeButton.hidden = true;
  syncSearchPanelVisibility();
}

function showReader() {
  document.body.classList.remove("is-home-view");
  elements.homeScreen.hidden = true;
  elements.readerLayout.hidden = false;
  elements.homeButton.hidden = false;
  syncSearchPanelVisibility();
}

function togglePanel(panelName) {
  state.activePanel = state.activePanel === panelName ? null : panelName;
  syncSearchPanelVisibility();
  scheduleRender();
}

function syncSearchPanelVisibility() {
  const isPanelVisible = Boolean(state.activePanel);
  const isSearchVisible = state.activePanel === "search";
  const isBookmarksVisible = state.activePanel === "bookmarks";

  elements.readerLayout.classList.toggle("search-hidden", !isPanelVisible);
  elements.sidePanel.hidden = !isPanelVisible;
  elements.searchPanel.hidden = !isSearchVisible;
  elements.bookmarksPanel.hidden = !isBookmarksVisible;

  elements.searchToggleButton.classList.toggle("is-active", isSearchVisible);
  elements.searchToggleButton.setAttribute("aria-expanded", String(isSearchVisible));

  elements.bookmarkToggleButton.classList.toggle("is-active", isBookmarksVisible);
  elements.bookmarkToggleButton.setAttribute("aria-expanded", String(isBookmarksVisible));

  const actionLabel = isSearchVisible ? "Nascondi ricerca" : "Mostra ricerca";
  elements.searchToggleButton.title = actionLabel;
  elements.searchToggleButton.setAttribute("aria-label", actionLabel);

  const bookmarkActionLabel = isBookmarksVisible ? "Nascondi segnalibri" : "Mostra segnalibri";
  elements.bookmarkToggleButton.title = bookmarkActionLabel;
  elements.bookmarkToggleButton.setAttribute("aria-label", bookmarkActionLabel);
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

  const actionLabel = state.isToolsVisible ? "Nascondi strumenti" : "Mostra strumenti";
  elements.toolsToggleButton.title = actionLabel;
  elements.toolsToggleButton.setAttribute("aria-label", actionLabel);
}

async function loadPdf(source, title) {
  setStatus("Caricamento PDF...");
  state.pdf = null;
  state.totalPages = 0;
  elements.pageSpread.replaceChildren();

  let pdf;

  try {
    const loadingTask = pdfjsLib.getDocument(source);
    pdf = await loadingTask.promise;
  } catch (error) {
    console.error(error);
    elements.emptyState.hidden = false;
    setStatus(`PDF non trovato: ${source}`);
    syncControls();
    return;
  }

  state.pdf = pdf;
  state.totalPages = pdf.numPages;
  state.currentPage = 1;
  state.pageTextCache.clear();
  state.searchMatches = [];
  state.searchPosition = -1;
  state.bookmarks = loadBookmarks().filter((bookmark) => bookmark.page <= state.totalPages);

  elements.totalPages.textContent = `/ ${state.totalPages}`;
  elements.pageInput.max = String(state.totalPages);
  elements.searchInput.value = "";
  elements.resultList.replaceChildren();
  elements.searchCount.textContent = "0 risultati";

  renderBookmarkList();
  setStatus(`${state.totalPages} pagine`);
  syncControls();
  await renderSpread();
}

function turnPage(delta) {
  if (!state.pdf) {
    return;
  }

  const visiblePages = getVisiblePages();
  const firstVisible = visiblePages[0] || state.currentPage;
  const lastVisible = visiblePages[visiblePages.length - 1] || state.currentPage;

  if ((delta < 0 && firstVisible <= 1) || (delta > 0 && lastVisible >= state.totalPages)) {
    return;
  }

  const spreadStep = isSpreadActive() && firstVisible !== 1 ? 2 : 1;
  const nextPage = delta > 0
    ? firstVisible + spreadStep
    : firstVisible <= 2
      ? 1
      : firstVisible - 2;

  state.direction = delta > 0 ? "forward" : "back";
  goToPage(nextPage);
}

function goToPage(pageNumber) {
  if (!state.pdf) {
    return;
  }

  const normalizedPage = clamp(Number.isFinite(pageNumber) ? pageNumber : 1, 1, state.totalPages);
  state.direction = normalizedPage >= state.currentPage ? "forward" : "back";
  state.currentPage = isSpreadActive() && normalizedPage > 1 && normalizedPage % 2 !== 0
    ? normalizedPage - 1
    : normalizedPage;

  syncControls();
  renderSpread();
}

function getVisiblePages() {
  if (!state.pdf) {
    return [];
  }

  if (!isSpreadActive()) {
    return [state.currentPage];
  }

  if (state.currentPage === 1) {
    return [1];
  }

  const leftPage = state.currentPage % 2 === 0 ? state.currentPage : state.currentPage - 1;
  return [leftPage, leftPage + 1].filter((pageNumber) => pageNumber <= state.totalPages);
}

function isSpreadActive() {
  return state.isSpread && !media.matches;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    if (state.pdf) {
      renderSpread();
    }
  }, 90);
}

async function renderSpread() {
  if (!state.pdf) {
    syncControls();
    return;
  }

  const renderId = ++state.renderId;
  const pages = getVisiblePages();
  const shells = pages.map((pageNumber, index) => createPageShell(pageNumber, pages.length, index));

  elements.emptyState.hidden = true;
  elements.pageSpread.replaceChildren(...shells);
  elements.bookStage.classList.remove("is-turning-forward", "is-turning-back");
  elements.bookStage.classList.add(state.direction === "forward" ? "is-turning-forward" : "is-turning-back");

  try {
    const scale = await getEffectiveScale(pages);
    if (renderId !== state.renderId) {
      return;
    }

    await Promise.all(
      pages.map((pageNumber, index) => renderPage(pageNumber, shells[index], scale, renderId)),
    );

    if (renderId === state.renderId) {
      applySearchHighlights();
      scrollToPendingBookmark();
      setStatus("Pronto");
    }
  } catch (error) {
    console.error(error);
    setStatus("Errore durante il rendering del PDF");
  } finally {
    window.setTimeout(() => {
      elements.bookStage.classList.remove("is-turning-forward", "is-turning-back");
    }, 240);
    syncControls();
  }
}

function createPageShell(pageNumber, pageCount, index) {
  const shell = document.createElement("article");
  shell.className = "page-shell";
  shell.dataset.page = String(pageNumber);
  shell.setAttribute("aria-label", `Pagina ${pageNumber}`);

  if (pageCount > 1) {
    shell.classList.add(index === 0 ? "is-left" : "is-right");
  }

  const loading = document.createElement("div");
  loading.className = "loading-page";
  loading.textContent = `Pagina ${pageNumber}`;
  shell.append(loading);

  return shell;
}

async function getEffectiveScale(pageNumbers) {
  const pages = await Promise.all(pageNumbers.map((pageNumber) => state.pdf.getPage(pageNumber)));
  const gap = pageNumbers.length > 1 ? getSpreadGap() : 0;
  const baseSizes = pages.map((page) => page.getViewport({ scale: 1 }));
  const totalWidth = baseSizes.reduce((sum, viewport) => sum + viewport.width, 0) + gap;
  const tallestPage = Math.max(...baseSizes.map((viewport) => viewport.height));
  const availableWidth = Math.max(elements.bookStage.clientWidth - getStagePaddingX() - 6, 280);
  const availableHeight = Math.max(elements.bookStage.clientHeight - getStagePaddingY() - 6, 360);
  const fitScale = Math.min(availableWidth / totalWidth, availableHeight / tallestPage, 1.32);
  return clamp(fitScale * (state.zoomPercent / 100), 0.24, 4);
}

function getSpreadGap() {
  const styles = window.getComputedStyle(elements.pageSpread);
  return Number.parseFloat(styles.columnGap || styles.gap || "24") || 24;
}

function getStagePaddingX() {
  const styles = window.getComputedStyle(elements.bookStage);
  return Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
}

function getStagePaddingY() {
  const styles = window.getComputedStyle(elements.bookStage);
  return Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
}

async function renderPage(pageNumber, shell, scale, renderId) {
  const page = await state.pdf.getPage(pageNumber);
  if (renderId !== state.renderId) {
    return;
  }

  const viewport = page.getViewport({ scale });
  const pixelRatio = window.devicePixelRatio || 1;

  shell.replaceChildren();
  shell.style.width = `${viewport.width}px`;
  shell.style.height = `${viewport.height}px`;

  const canvas = document.createElement("canvas");
  canvas.className = "pdf-canvas";
  canvas.width = Math.floor(viewport.width * pixelRatio);
  canvas.height = Math.floor(viewport.height * pixelRatio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const textLayer = document.createElement("div");
  textLayer.className = "textLayer";
  textLayer.style.width = `${viewport.width}px`;
  textLayer.style.height = `${viewport.height}px`;
  textLayer.style.setProperty("--scale-factor", String(scale));

  const highlightLayer = document.createElement("div");
  highlightLayer.className = "highlightLayer";
  highlightLayer.style.width = `${viewport.width}px`;
  highlightLayer.style.height = `${viewport.height}px`;

  const linkLayer = document.createElement("div");
  linkLayer.className = "linkLayer";
  linkLayer.style.width = `${viewport.width}px`;
  linkLayer.style.height = `${viewport.height}px`;

  shell.append(canvas, highlightLayer, textLayer, linkLayer);

  const context = canvas.getContext("2d", { alpha: false });
  await page.render({
    canvasContext: context,
    transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : null,
    viewport,
  }).promise;

  const textContent = await page.getTextContent();
  state.pageTextCache.set(pageNumber, mergeTextContent(textContent));

  const textTask = pdfjsLib.renderTextLayer({
    container: textLayer,
    textContentSource: textContent,
    viewport,
  });
  await textTask.promise;

  const annotations = await page.getAnnotations({ intent: "display" });
  renderLinkLayer(annotations, linkLayer, viewport);
  renderBookmarkHighlights(pageNumber, highlightLayer);
}

function renderBookmarkHighlights(pageNumber, container) {
  const fragment = document.createDocumentFragment();
  const pageBookmarks = state.bookmarks.filter(
    (bookmark) => bookmark.type === "text" && bookmark.page === pageNumber && Array.isArray(bookmark.rects),
  );

  pageBookmarks.forEach((bookmark) => {
    bookmark.rects.forEach((rect) => {
      const highlight = document.createElement("button");
      highlight.type = "button";
      highlight.className = "saved-highlight";
      highlight.dataset.bookmarkId = bookmark.id;
      highlight.title = bookmark.title;
      highlight.setAttribute("aria-label", bookmark.title);
      highlight.style.left = `${rect.left * 100}%`;
      highlight.style.top = `${rect.top * 100}%`;
      highlight.style.width = `${rect.width * 100}%`;
      highlight.style.height = `${rect.height * 100}%`;
      highlight.classList.toggle("is-active", state.activeBookmarkId === bookmark.id);
      highlight.addEventListener("click", () => activateBookmark(bookmark.id));
      fragment.append(highlight);
    });
  });

  container.replaceChildren(fragment);
}

function renderLinkLayer(annotations, container, viewport) {
  const links = annotations.filter((annotation) => annotation.subtype === "Link" && annotation.rect);
  const fragment = document.createDocumentFragment();

  links.forEach((annotation) => {
    const area = document.createElement("a");
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(annotation.rect);
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x1 - x2);
    const height = Math.abs(y1 - y2);

    area.className = "pdf-link";
    area.style.left = `${left}px`;
    area.style.top = `${top}px`;
    area.style.width = `${width}px`;
    area.style.height = `${height}px`;

    if (annotation.url || annotation.unsafeUrl) {
      area.href = annotation.url || annotation.unsafeUrl;
      area.target = "_blank";
      area.rel = "noreferrer";
    } else if (annotation.dest) {
      area.href = "#";
      area.addEventListener("click", (event) => {
        event.preventDefault();
        goToDestination(annotation.dest);
      });
    }

    fragment.append(area);
  });

  container.replaceChildren(fragment);
}

async function goToDestination(destination) {
  if (!state.pdf) {
    return;
  }

  try {
    const explicitDestination = Array.isArray(destination)
      ? destination
      : await state.pdf.getDestination(destination);

    if (!explicitDestination) {
      return;
    }

    const [pageRef] = explicitDestination;
    const pageIndex = typeof pageRef === "object"
      ? await state.pdf.getPageIndex(pageRef)
      : Number(pageRef) - 1;

    goToPage(pageIndex + 1);
  } catch (error) {
    console.warn("Destinazione PDF non raggiungibile", error);
  }
}

function changeZoom(delta) {
  const nextZoom = clamp(state.zoomPercent + delta, Number(elements.zoomRange.min), Number(elements.zoomRange.max));
  state.zoomPercent = nextZoom;
  elements.zoomRange.value = String(nextZoom);
  elements.zoomValue.textContent = `${nextZoom}%`;
  scheduleRender();
}

function createPageBookmarkDraft() {
  const visiblePages = getVisiblePages();
  const page = visiblePages[0] || state.currentPage;
  return {
    page,
    rects: [],
    snippet: "",
    title: `Pagina ${page}`,
    type: "page",
  };
}

function createTextBookmarkDraft() {
  const selectionData = getCurrentTextSelection();
  if (!selectionData) {
    hideSelectionMenu();
    return null;
  }

  return {
    page: selectionData.page,
    rects: selectionData.rects,
    snippet: selectionData.text,
    title: truncateText(selectionData.text, 58) || `Pagina ${selectionData.page}`,
    type: "text",
  };
}

function openBookmarkDialog(draft) {
  if (!draft || !state.pdf) {
    return;
  }

  state.pendingBookmarkDraft = draft;
  elements.bookmarkDialogTitle.textContent = draft.type === "text" ? "Segnalibro su testo" : "Segnalibro pagina";
  elements.bookmarkTitleInput.value = draft.title;
  elements.bookmarkContext.textContent = draft.type === "text"
    ? `Pagina ${draft.page}: ${draft.snippet}`
    : `Pagina ${draft.page}`;

  elements.bookmarkDialog.showModal();
  elements.bookmarkTitleInput.focus();
  elements.bookmarkTitleInput.select();
}

function closeBookmarkDialog() {
  state.pendingBookmarkDraft = null;
  if (elements.bookmarkDialog.open) {
    elements.bookmarkDialog.close();
  }
}

function savePendingBookmark() {
  const draft = state.pendingBookmarkDraft;
  if (!draft) {
    return;
  }

  const title = elements.bookmarkTitleInput.value.trim() || draft.title || `Pagina ${draft.page}`;
  const bookmark = {
    createdAt: Date.now(),
    id: createId(),
    page: draft.page,
    rects: draft.rects || [],
    snippet: draft.snippet || "",
    title,
    type: draft.type,
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
    const raw = localStorage.getItem(getBookmarkStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isValidBookmark) : [];
  } catch (error) {
    console.warn("Segnalibri non leggibili", error);
    return [];
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(getBookmarkStorageKey(), JSON.stringify(state.bookmarks));
  } catch (error) {
    console.warn("Segnalibri non salvati", error);
    setStatus("Impossibile salvare il segnalibro");
  }
}

function getBookmarkStorageKey() {
  const bookKey = state.currentBook?.id || state.currentBook?.pdf || DEFAULT_BOOK.id;
  return `pdf-book-viewer:bookmarks:${bookKey}`;
}

function isValidBookmark(bookmark) {
  return bookmark
    && typeof bookmark.id === "string"
    && Number.isFinite(bookmark.page)
    && bookmark.page >= 1
    && typeof bookmark.title === "string";
}

function sortBookmarks() {
  state.bookmarks.sort((first, second) => first.page - second.page || (first.createdAt || 0) - (second.createdAt || 0));
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

    const title = document.createElement("span");
    title.className = "bookmark-title";
    title.textContent = bookmark.title;

    const meta = document.createElement("span");
    meta.className = "bookmark-meta";
    meta.textContent = bookmark.type === "text" ? `Pagina ${bookmark.page} - testo` : `Pagina ${bookmark.page}`;

    main.append(title, meta);

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

function activateBookmark(bookmarkId) {
  const bookmark = state.bookmarks.find((item) => item.id === bookmarkId);
  if (!bookmark) {
    return;
  }

  state.activeBookmarkId = bookmark.id;
  state.pendingBookmarkScrollId = bookmark.id;
  state.activePanel = "bookmarks";
  syncSearchPanelVisibility();
  renderBookmarkList();
  goToPage(bookmark.page);
}

function deleteBookmark(bookmarkId) {
  state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
  if (state.activeBookmarkId === bookmarkId) {
    state.activeBookmarkId = null;
  }
  saveBookmarks();
  renderBookmarkList();
  scheduleRender();
}

function scrollToPendingBookmark() {
  if (!state.pendingBookmarkScrollId) {
    return;
  }

  const bookmark = state.bookmarks.find((item) => item.id === state.pendingBookmarkScrollId);
  const shell = elements.pageSpread.querySelector(`.page-shell[data-page="${bookmark?.page}"]`);
  if (!bookmark || !shell) {
    return;
  }

  const firstRect = bookmark.rects?.[0];
  const top = shell.offsetTop + (firstRect ? firstRect.top * shell.clientHeight : 0) - 72;
  const left = shell.offsetLeft + (firstRect ? firstRect.left * shell.clientWidth : 0) - 72;
  elements.bookStage.scrollTo({
    left: Math.max(0, left),
    top: Math.max(0, top),
    behavior: "smooth",
  });

  elements.pageSpread.querySelectorAll(".saved-highlight").forEach((highlight) => {
    highlight.classList.toggle("is-active", highlight.dataset.bookmarkId === bookmark.id);
  });

  state.pendingBookmarkScrollId = null;
}

function getCurrentTextSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    return null;
  }

  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (!text) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const shell = getSelectionPageShell(selection);
  if (!shell) {
    return null;
  }

  const page = Number.parseInt(shell.dataset.page, 10);
  const rects = getSelectionRects(range, shell);
  if (!Number.isFinite(page) || !rects.length) {
    return null;
  }

  return { page, rects, text };
}

function getSelectionPageShell(selection) {
  const anchorShell = getClosestPageShell(selection.anchorNode);
  const focusShell = getClosestPageShell(selection.focusNode);
  return anchorShell || focusShell;
}

function getClosestPageShell(node) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  return element?.closest(".page-shell") || null;
}

function getSelectionRects(range, shell) {
  const shellRect = shell.getBoundingClientRect();
  return Array.from(range.getClientRects())
    .map((rect) => {
      const left = Math.max(rect.left, shellRect.left);
      const top = Math.max(rect.top, shellRect.top);
      const right = Math.min(rect.right, shellRect.right);
      const bottom = Math.min(rect.bottom, shellRect.bottom);
      return {
        height: bottom - top,
        left: left - shellRect.left,
        top: top - shellRect.top,
        width: right - left,
      };
    })
    .filter((rect) => rect.width > 2 && rect.height > 2)
    .map((rect) => ({
      height: clamp(roundRatio(rect.height / shellRect.height), 0, 1),
      left: clamp(roundRatio(rect.left / shellRect.width), 0, 1),
      top: clamp(roundRatio(rect.top / shellRect.height), 0, 1),
      width: clamp(roundRatio(rect.width / shellRect.width), 0, 1),
    }));
}

function updateSelectionMenu() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    hideSelectionMenu();
    return;
  }

  const shell = getSelectionPageShell(selection);
  if (!shell || !elements.bookStage.contains(shell)) {
    hideSelectionMenu();
    return;
  }

  const rangeRect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rangeRect.width && !rangeRect.height) {
    hideSelectionMenu();
    return;
  }

  elements.selectionMenu.hidden = false;
  const menuRect = elements.selectionMenu.getBoundingClientRect();
  const left = clamp(rangeRect.left + rangeRect.width / 2 - menuRect.width / 2, 8, window.innerWidth - menuRect.width - 8);
  const top = clamp(rangeRect.top - menuRect.height - 8, 8, window.innerHeight - menuRect.height - 8);
  elements.selectionMenu.style.left = `${left}px`;
  elements.selectionMenu.style.top = `${top}px`;
}

function hideSelectionMenu() {
  elements.selectionMenu.hidden = true;
}

async function runSearch() {
  const query = normalizeText(elements.searchInput.value.trim());

  state.searchMatches = [];
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

  for (let pageNumber = 1; pageNumber <= state.totalPages; pageNumber += 1) {
    const text = await getPageText(pageNumber);
    const normalizedText = normalizeText(text);
    const count = countMatches(normalizedText, query);

    if (count > 0) {
      state.searchMatches.push({
        count,
        page: pageNumber,
        snippet: createSnippet(text, query),
      });
    }
  }

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
  if (state.pageTextCache.has(pageNumber)) {
    return state.pageTextCache.get(pageNumber);
  }

  const page = await state.pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const text = mergeTextContent(textContent);
  state.pageTextCache.set(pageNumber, text);
  return text;
}

function mergeTextContent(textContent) {
  return textContent.items
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text, query) {
  let count = 0;
  let index = text.indexOf(query);

  while (index !== -1) {
    count += 1;
    index = text.indexOf(query, index + query.length);
  }

  return count;
}

function createSnippet(text, normalizedQuery) {
  const normalizedText = normalizeText(text);
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex === -1) {
    return text.slice(0, 140);
  }

  const start = Math.max(0, matchIndex - 55);
  const end = Math.min(text.length, matchIndex + normalizedQuery.length + 85);
  return `${start > 0 ? "... " : ""}${text.slice(start, end)}${end < text.length ? " ..." : ""}`;
}

function renderSearchResults() {
  const totalMatches = state.searchMatches.reduce((sum, match) => sum + match.count, 0);
  elements.searchCount.textContent = `${totalMatches} ${totalMatches === 1 ? "risultato" : "risultati"}`;

  const fragment = document.createDocumentFragment();
  state.searchMatches.forEach((match, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "result-item";
    item.dataset.index = String(index);
    item.innerHTML = `
      <span class="result-page">Pagina ${match.page} - ${match.count}</span>
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
  if (!state.searchMatches.length) {
    return;
  }

  state.searchPosition = (state.searchPosition + delta + state.searchMatches.length) % state.searchMatches.length;
  activateSearchResult();
}

function activateSearchResult() {
  const match = state.searchMatches[state.searchPosition];
  if (!match) {
    return;
  }

  elements.resultList.querySelectorAll(".result-item").forEach((item, index) => {
    item.classList.toggle("is-active", index === state.searchPosition);
  });

  const activeItem = elements.resultList.querySelector(`[data-index="${state.searchPosition}"]`);
  activeItem?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  goToPage(match.page);
}

function applySearchHighlights() {
  const query = normalizeText(elements.searchInput.value.trim());
  const spans = elements.pageSpread.querySelectorAll(".textLayer span");

  spans.forEach((span) => {
    const hasHit = query.length >= MIN_QUERY_LENGTH && normalizeText(span.textContent).includes(query);
    span.classList.toggle("search-hit", hasHit);
  });
}

function normalizeText(value) {
  return value
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function syncControls() {
  const hasDocument = Boolean(state.pdf);
  const visiblePages = getVisiblePages();
  const firstVisiblePage = visiblePages[0] || state.currentPage;
  const lastVisiblePage = visiblePages[visiblePages.length - 1] || state.currentPage;
  elements.emptyState.hidden = hasDocument;
  elements.pageInput.disabled = !hasDocument;
  elements.pageInput.value = String(firstVisiblePage);
  elements.prevButton.disabled = !hasDocument || firstVisiblePage <= 1;
  elements.nextButton.disabled = !hasDocument || lastVisiblePage >= state.totalPages;
  elements.zoomInButton.disabled = !hasDocument;
  elements.zoomOutButton.disabled = !hasDocument;
  elements.zoomRange.disabled = !hasDocument;
  elements.spreadButton.disabled = !hasDocument;
  elements.addPageBookmarkButton.disabled = !hasDocument;
  elements.bookmarkToggleButton.disabled = !hasDocument;
  elements.searchInput.disabled = !hasDocument;
  elements.prevResultButton.disabled = !state.searchMatches.length;
  elements.nextResultButton.disabled = !state.searchMatches.length;
  elements.totalPages.textContent = `/ ${state.totalPages || 0}`;
  elements.zoomRange.value = String(state.zoomPercent);
  elements.zoomValue.textContent = `${state.zoomPercent}%`;
}

function setStatus(message) {
  elements.statusText.textContent = message === "Pronto" ? "" : message;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundRatio(value) {
  return Math.round(value * 10000) / 10000;
}

function truncateText(value, maxLength) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createBookId(pdfPath, index) {
  return (pdfPath || `book-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || `book-${index + 1}`;
}
