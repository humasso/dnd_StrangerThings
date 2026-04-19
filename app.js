const DEFAULT_PDF_URL = "assets/book.pdf";
const PDFJS_CDN_VERSION = "3.11.174";
const MIN_QUERY_LENGTH = 2;

const elements = {
  bookStage: document.getElementById("bookStage"),
  documentTitle: document.getElementById("documentTitle"),
  emptyState: document.getElementById("emptyState"),
  nextButton: document.getElementById("nextButton"),
  nextResultButton: document.getElementById("nextResultButton"),
  pageInput: document.getElementById("pageInput"),
  pageSpread: document.getElementById("pageSpread"),
  prevButton: document.getElementById("prevButton"),
  prevResultButton: document.getElementById("prevResultButton"),
  readerLayout: document.querySelector(".reader-layout"),
  resultList: document.getElementById("resultList"),
  searchCount: document.getElementById("searchCount"),
  searchInput: document.getElementById("searchInput"),
  searchPanel: document.getElementById("searchPanel"),
  searchToggleButton: document.getElementById("searchToggleButton"),
  spreadButton: document.getElementById("spreadButton"),
  statusText: document.getElementById("statusText"),
  totalPages: document.getElementById("totalPages"),
  zoomInButton: document.getElementById("zoomInButton"),
  zoomOutButton: document.getElementById("zoomOutButton"),
  zoomRange: document.getElementById("zoomRange"),
  zoomValue: document.getElementById("zoomValue"),
};

const state = {
  currentPage: 1,
  direction: "forward",
  isSearchPanelVisible: false,
  isSpread: false,
  pageTextCache: new Map(),
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
  syncSearchPanelVisibility();
  syncControls();
  resizeObserver.observe(elements.bookStage);
  loadInitialDocument();
}

function bindEvents() {
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
    toggleSearchPanel();
  });

  elements.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 220);
  });

  elements.prevResultButton.addEventListener("click", () => moveSearchResult(-1));
  elements.nextResultButton.addEventListener("click", () => moveSearchResult(1));

  document.addEventListener("keydown", (event) => {
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
}

function toggleSearchPanel() {
  state.isSearchPanelVisible = !state.isSearchPanelVisible;
  syncSearchPanelVisibility();
  scheduleRender();
}

function syncSearchPanelVisibility() {
  elements.readerLayout.classList.toggle("search-hidden", !state.isSearchPanelVisible);
  elements.searchPanel.hidden = !state.isSearchPanelVisible;
  elements.searchToggleButton.classList.toggle("is-active", state.isSearchPanelVisible);
  elements.searchToggleButton.setAttribute("aria-expanded", String(state.isSearchPanelVisible));

  const actionLabel = state.isSearchPanelVisible ? "Nascondi ricerca" : "Mostra ricerca";
  elements.searchToggleButton.title = actionLabel;
  elements.searchToggleButton.setAttribute("aria-label", actionLabel);
}

async function loadInitialDocument() {
  try {
    await loadPdf(DEFAULT_PDF_URL, DEFAULT_PDF_URL);
  } catch (error) {
    console.error(error);
    elements.documentTitle.textContent = DEFAULT_PDF_URL;
    setStatus("PDF non trovato in assets/book.pdf");
    syncControls();
  }
}

async function loadPdf(source, title) {
  setStatus("Caricamento PDF...");
  const loadingTask = pdfjsLib.getDocument(source);
  const pdf = await loadingTask.promise;

  state.pdf = pdf;
  state.totalPages = pdf.numPages;
  state.currentPage = 1;
  state.pageTextCache.clear();
  state.searchMatches = [];
  state.searchPosition = -1;

  elements.documentTitle.textContent = title || "Documento PDF";
  elements.totalPages.textContent = `/ ${state.totalPages}`;
  elements.pageInput.max = String(state.totalPages);
  elements.searchInput.value = "";
  elements.resultList.replaceChildren();
  elements.searchCount.textContent = "0 risultati";

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
      setStatus(`${pages.length > 1 ? "Pagine" : "Pagina"} ${pages.join(" - ")} di ${state.totalPages}`);
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

  const linkLayer = document.createElement("div");
  linkLayer.className = "linkLayer";
  linkLayer.style.width = `${viewport.width}px`;
  linkLayer.style.height = `${viewport.height}px`;

  shell.append(canvas, textLayer, linkLayer);

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
  elements.searchInput.disabled = !hasDocument;
  elements.prevResultButton.disabled = !state.searchMatches.length;
  elements.nextResultButton.disabled = !state.searchMatches.length;
  elements.totalPages.textContent = `/ ${state.totalPages || 0}`;
  elements.zoomRange.value = String(state.zoomPercent);
  elements.zoomValue.textContent = `${state.zoomPercent}%`;
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
