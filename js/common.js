/* ============================================================
   COMMON.JS — Utility condivise
   D&D Stranger Things – Hellfire Club Edition

   Caricato PRIMA di library.js / reader.js. Espone (global scope):
   - Registro categorie (CATEGORIES) e risoluzione percorsi
   - Caricamento manifest per categoria (books.json → static → discovery)
   - Generazione e cache delle copertine (localStorage)
   - Utility generiche (clamp, truncateText, createId, ...)
   ============================================================ */

const PDFJS_CDN_VERSION = "3.11.174";
const COVER_CACHE_PREFIX = "pdf-book-viewer:cover:";
const BOOKMARK_STORAGE_PREFIX = "pdf-book-viewer:bookmarks:";
const MAX_DEVICE_PIXEL_RATIO = 2;

/* ── Registro categorie ──
   Per aggiungere una categoria: crea assets/contenuti/<slug>/ con i PDF,
   aggiungi la voce qui e crea pages/<slug>.html dal template categoria. */
const CATEGORIES = [
  { slug: "libretti", label: "Libretti" },
  { slug: "carte", label: "Carte" },
  { slug: "schede", label: "Schede Giocatori" },
  { slug: "schermo", label: "Schermo Master" },
];

/* Radice del sito calcolata dalla posizione di questo script (js/common.js):
   funziona da qualsiasi profondità di pagina, in locale e su GitHub Pages */
const SITE_ROOT_URL = new URL("..", document.currentScript.src);

function resolveAssetPath(path) {
  const value = typeof path === "string" ? path.trim() : "";
  if (!value) return "";
  /* URL assoluti passano invariati */
  if (/^https?:\/\//i.test(value)) return value;
  /* I manifest storici usano "../assets/...": i "../" iniziali vanno tolti,
     altrimenti su GitHub Pages risalirebbero SOPRA la cartella del repo */
  const cleaned = value.replace(/^(\.\.?\/)+/, "");
  try { return new URL(cleaned, SITE_ROOT_URL).href; }
  catch { return value; }
}

function categoryFolderUrl(slug) {
  return new URL(`assets/contenuti/${slug}`, SITE_ROOT_URL).href;
}

/* ============================================================
   MANIFEST DI CATEGORIA
   Ordine dei tentativi:
   1. books.json         (generato da server.py in locale)
   2. books.static.json  (esportato per hosting statico / GitHub Pages)
   3. listing HTML della cartella (fallback per server con autoindex)
   ============================================================ */
async function loadCategoryBooks(slug) {
  const folder = categoryFolderUrl(slug);

  for (const name of ["books.json", "books.static.json"]) {
    try {
      const response = await fetch(`${folder}/${name}`, { cache: "no-store" });
      if (!response.ok) continue;
      const books = normalizeBooksOrEmpty(await response.json());
      if (books.length) return books;
    } catch { /* prova il prossimo */ }
  }

  const discovered = normalizeBooksOrEmpty(await discoverBooksInFolder(folder));
  return discovered;
}

/* Ritorna { slug → numero di libri } per le categorie richieste */
async function loadCategoryAvailability(slugs = CATEGORIES.map((c) => c.slug)) {
  const result = {};
  await Promise.all(slugs.map(async (slug) => {
    try {
      const books = await loadCategoryBooks(slug);
      result[slug] = books.length;
    } catch {
      result[slug] = 0;
    }
  }));
  return result;
}

function normalizeBooksOrEmpty(books) {
  const list = Array.isArray(books) ? books : [];
  return list
    .map((book, i) => ({
      category: book.category || "Libretto",
      cover:    resolveAssetPath(book.cover),
      id:       book.id || createBookId(book.pdf, i),
      pdf:      resolveAssetPath(book.pdf),
      title:    book.title || `Libretto ${i + 1}`,
    }))
    .filter((b) => typeof b.pdf === "string" && b.pdf.trim());
}

async function discoverBooksInFolder(folderUrl) {
  let response;
  try {
    response = await fetch(`${folderUrl}/`, { cache: "no-store" });
  } catch { return []; }
  if (!response.ok) return [];

  const html = await response.text();
  const doc  = new DOMParser().parseFromString(html, "text/html");
  const base = new URL(`${folderUrl}/`);
  const names = new Set();

  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    try {
      const url = new URL(href, base);
      const name = decodeURIComponent(url.pathname.split("/").pop() || "");
      if (/\.pdf$/i.test(name)) names.add(name);
    } catch { /* skip */ }
  });

  const sorted = [...names].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  return Promise.all(sorted.map(async (fileName, i) => {
    const stem = fileName.replace(/\.pdf$/i, "");
    const meta = await loadBookMetadata(folderUrl, stem);
    const pdf  = `${folderUrl}/${fileName}`;
    return {
      category: getStringOrFallback(meta.category, "Libretto"),
      cover:    getStringOrFallback(meta.cover, ""),
      id:       getStringOrFallback(meta.id, createBookId(pdf, i)),
      pdf,
      title:    getStringOrFallback(meta.title, filenameToTitle(stem)),
    };
  }));
}

async function loadBookMetadata(folderUrl, stem) {
  try {
    const r = await fetch(`${folderUrl}/${stem}.json`, { cache: "no-store" });
    if (!r.ok) return {};
    const data = await r.json();
    return data && typeof data === "object" ? data : {};
  } catch { return {}; }
}

/* ============================================================
   COPERTINE — generate dalla pagina 1 del PDF e cachate
   ============================================================ */
const coverMemoryCache = new Map();
const coverFailures    = new Set();
const coverTasks       = new Map();

function getCoverCacheKey(book) { return book.id || book.pdf; }
function getGeneratedCover(book) { return coverMemoryCache.get(getCoverCacheKey(book)) || ""; }
function hasGeneratedCover(book) { return Boolean(getGeneratedCover(book)); }
function hasGeneratedCoverFailure(book) { return coverFailures.has(getCoverCacheKey(book)); }

function loadStoredCover(key) {
  try { return localStorage.getItem(COVER_CACHE_PREFIX + key) || ""; }
  catch { return ""; }
}

function storeCover(key, url) {
  try { localStorage.setItem(COVER_CACHE_PREFIX + key, url); }
  catch { /* quota piena: la copertina resta solo in memoria */ }
}

function createCoverImage(src) {
  const img = document.createElement("img");
  img.alt = "";
  img.src = src;
  return img;
}

function createCoverFallback(book) {
  const div = document.createElement("div");
  div.className = "cover-fallback";
  div.textContent = book.title;
  return div;
}

async function ensureGeneratedCover(book) {
  if (book.cover) return "";
  const key = getCoverCacheKey(book);
  const cached = coverMemoryCache.get(key);
  if (cached) return cached;
  const stored = loadStoredCover(key);
  if (stored) {
    coverMemoryCache.set(key, stored);
    return stored;
  }
  if (coverFailures.has(key)) return "";
  const pending = coverTasks.get(key);
  if (pending) return pending;

  const task = createGeneratedCover(book)
    .then((url) => {
      if (url) {
        coverMemoryCache.set(key, url);
        storeCover(key, url);
        return url;
      }
      coverFailures.add(key);
      return "";
    })
    .catch((err) => {
      console.warn(`Copertina non disponibile per ${book.title}`, err);
      coverFailures.add(key);
      return "";
    })
    .finally(() => coverTasks.delete(key));

  coverTasks.set(key, task);
  return task;
}

async function createGeneratedCover(book) {
  /* disableAutoFetch: con i range request scarica solo i byte della pagina 1 */
  const pdf = await pdfjsLib.getDocument({ url: book.pdf, disableAutoFetch: true }).promise;
  try {
    const page     = await pdf.getPage(1);
    const baseVp   = page.getViewport({ scale: 1 });
    const scale    = 260 / baseVp.width;
    const viewport = page.getViewport({ scale });
    const dpr      = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const canvas   = document.createElement("canvas");
    canvas.width   = Math.floor(viewport.width  * dpr);
    canvas.height  = Math.floor(viewport.height * dpr);
    await page.render({
      canvasContext: canvas.getContext("2d", { alpha: false }),
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      viewport,
    }).promise;
    /* JPEG: 5-10x più leggero del PNG, entra nella quota localStorage */
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    void pdf.destroy();
  }
}

async function renderBookCover(book, coverEl) {
  try {
    const url = await ensureGeneratedCover(book);
    if (!coverEl.isConnected) return;
    coverEl.replaceChildren(url ? createCoverImage(url) : createCoverFallback(book));
  } catch {
    if (coverEl.isConnected) coverEl.replaceChildren(createCoverFallback(book));
  }
}

/* ============================================================
   PDF.JS BOOTSTRAP
   ============================================================ */
function setupPdfWorker() {
  if (!window.pdfjsLib) return false;
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_CDN_VERSION}/pdf.worker.min.js`;
  return true;
}

/* ============================================================
   UTILITIES
   ============================================================ */
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function roundRatio(v)       { return Math.round(v * 10000) / 10000; }

function truncateText(v, max) {
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
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

function getStringOrFallback(v, fallback) {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function filenameToTitle(stem) {
  const s = (stem || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "Libretto";
  return s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
