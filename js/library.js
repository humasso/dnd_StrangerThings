/* ============================================================
   LIBRARY.JS — Pagina categoria (lista dei PDF di una categoria)
   D&D Stranger Things – Hellfire Club Edition

   Richiede: common.js caricato prima.
   La pagina dichiara la categoria sul body:
     <body class="page-app page-category" data-category="libretti">
   Aprire un libro naviga verso: reader.html?cat=<slug>&book=<id>
   ============================================================ */

(function () {
  "use strict";

  const categorySlug = document.body.dataset.category || "libretti";
  const categoryMeta = CATEGORIES.find((c) => c.slug === categorySlug)
    || { slug: categorySlug, label: categorySlug };

  const elements = {
    bookCarousel:       document.getElementById("bookCarousel"),
    carouselDots:       document.getElementById("carouselDots"),
    carouselNextButton: document.getElementById("carouselNextButton"),
    carouselPrevButton: document.getElementById("carouselPrevButton"),
    carouselShell:      document.querySelector(".carousel-shell"),
    categoryEmpty:      document.getElementById("categoryEmpty"),
    categoryTitle:      document.getElementById("categoryTitle"),
    statusText:         document.getElementById("statusText"),
  };

  const state = {
    books: [],
    selectedBookIndex: 0,
  };

  let carouselAnimationTimer = 0;

  /* ============================================================
     BOOT
     ============================================================ */
  boot();

  async function boot() {
    document.title = `${categoryMeta.label} – Hellfire Club`;
    if (elements.categoryTitle) elements.categoryTitle.textContent = categoryMeta.label;

    if (!setupPdfWorker()) {
      setStatus("PDF.js non disponibile");
    }

    bindEvents();
    setStatus("Caricamento in corso...");
    elements.bookCarousel.setAttribute("aria-busy", "true");

    state.books = await loadCategoryBooks(categorySlug);
    elements.bookCarousel.setAttribute("aria-busy", "false");
    setStatus("");

    if (!state.books.length) {
      showEmptyCategory();
      return;
    }

    renderLibrary();
    void preloadBookCovers();
  }

  function showEmptyCategory() {
    if (elements.carouselShell) elements.carouselShell.hidden = true;
    if (elements.carouselDots) elements.carouselDots.hidden = true;
    if (elements.categoryEmpty) elements.categoryEmpty.hidden = false;
  }

  function setStatus(message) {
    if (elements.statusText) elements.statusText.textContent = message;
  }

  /* ============================================================
     EVENTS
     ============================================================ */
  function bindEvents() {
    elements.carouselPrevButton.addEventListener("click", () => moveCarousel(-1, "prev"));
    elements.carouselNextButton.addEventListener("click", () => moveCarousel(1, "next"));
    bindCarouselSwipe();

    /* Tastiera: frecce per scorrere, Invio/Spazio aprono (gestito dal button) */
    document.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft")  { e.preventDefault(); moveCarousel(-1, "prev"); }
      if (e.key === "ArrowRight") { e.preventDefault(); moveCarousel(1, "next"); }
      if (e.key === "Enter" && !state.books.length) return;
    });
  }

  function bindCarouselSwipe() {
    let startX = 0, startY = 0;
    elements.bookCarousel.addEventListener("pointerdown", (e) => { startX = e.clientX; startY = e.clientY; });
    elements.bookCarousel.addEventListener("pointerup", (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
        moveCarousel(dx < 0 ? 1 : -1, dx < 0 ? "next" : "prev");
      }
    });
  }

  /* ============================================================
     NAVIGAZIONE VERSO IL READER
     ============================================================ */
  function openBook(index) {
    const book = state.books[index];
    if (!book) return;
    const params = new URLSearchParams({ cat: categorySlug, book: book.id });
    window.location.href = `reader.html?${params.toString()}`;
  }

  /* ============================================================
     CAROUSEL RENDER
     ============================================================ */
  function renderLibrary() {
    const fragment = document.createDocumentFragment();
    const dots     = document.createDocumentFragment();
    const total    = state.books.length;

    state.books.forEach((book, index) => {
      const offset    = getCarouselOffset(index, state.selectedBookIndex, total);
      const absOffset = Math.abs(offset);

      const card = document.createElement("button");
      card.type = "button";
      card.className = "book-card";
      card.style.setProperty("--offset",     String(offset));
      card.style.setProperty("--abs-offset", String(absOffset));
      card.style.zIndex = String(30 - absOffset);
      card.dataset.index = String(index);
      card.setAttribute("aria-label", `Apri ${book.title}`);

      if (index === state.selectedBookIndex) {
        card.setAttribute("aria-current", "true");
      } else {
        card.removeAttribute("aria-current");
      }

      card.addEventListener("click", () => {
        if (index !== state.selectedBookIndex) {
          selectBook(index);
        } else {
          openBook(index);
        }
      });

      /* Cover */
      const cover = document.createElement("div");
      cover.className = "book-cover";

      if (book.cover) {
        const img = document.createElement("img");
        img.alt = "";
        img.src = book.cover;
        img.loading = "lazy";
        cover.append(img);
      } else if (hasGeneratedCover(book)) {
        cover.append(createCoverImage(getGeneratedCover(book)));
      } else if (hasGeneratedCoverFailure(book)) {
        cover.append(createCoverFallback(book));
      } else {
        const skeleton = document.createElement("span");
        skeleton.className = "cover-skeleton";
        cover.append(skeleton);
        void renderBookCover(book, cover);
      }

      const category = document.createElement("span");
      category.className = "book-category";
      category.textContent = book.category;

      const title = document.createElement("span");
      title.className = "book-title";
      title.textContent = book.title;

      /* CTA sulla card selezionata — span decorativo: la card è già un <button>
         (un button annidato sarebbe HTML invalido) e gestisce il click */
      const cta = document.createElement("span");
      cta.className = "open-book-cta";
      cta.textContent = "Apri";
      cta.setAttribute("aria-hidden", "true");

      card.append(cover, category, title, cta);
      fragment.append(card);

      /* Dot */
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
    if (total <= 1) return 0;
    const raw = index - selectedIndex;
    const wrapped = raw > total / 2 ? raw - total : raw < -total / 2 ? raw + total : raw;
    return clamp(wrapped, -2, 2);
  }

  function selectBook(index, preferredDirection = null) {
    if (!state.books.length) return;
    const total = state.books.length;
    const prev  = state.selectedBookIndex;
    const next  = (index + total) % total;
    if (next === prev) return;
    const direction = preferredDirection || inferCarouselDirection(prev, next, total);
    state.selectedBookIndex = next;
    renderLibrary();
    animateCarouselTransition(direction);
  }

  function moveCarousel(delta, preferredDirection = null) {
    selectBook(state.selectedBookIndex + delta, preferredDirection || (delta < 0 ? "prev" : "next"));
  }

  function inferCarouselDirection(prev, next, total) {
    if (total <= 1) return "next";
    const fwd = (next - prev + total) % total;
    const bwd = (prev - next + total) % total;
    return fwd <= bwd ? "next" : "prev";
  }

  function animateCarouselTransition(direction) {
    clearTimeout(carouselAnimationTimer);
    const cls = direction === "prev" ? "is-switch-prev" : "is-switch-next";
    elements.bookCarousel.classList.remove("is-switch-next", "is-switch-prev");
    void elements.bookCarousel.offsetWidth; // force reflow
    elements.bookCarousel.classList.add(cls);
    carouselAnimationTimer = window.setTimeout(() => {
      elements.bookCarousel.classList.remove("is-switch-next", "is-switch-prev");
    }, 400);
  }

  /* ============================================================
     COPERTINE
     ============================================================ */
  async function preloadBookCovers() {
    const todo = state.books.filter(
      (b) => !b.cover && !hasGeneratedCover(b) && !hasGeneratedCoverFailure(b)
    );
    if (!todo.length) return;
    /* Max 2 PDF alla volta: evita di scaricare tutta la libreria in parallelo */
    const queue = [...todo];
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length) {
        const book = queue.shift();
        await ensureGeneratedCover(book);
      }
    });
    await Promise.all(workers);
    renderLibrary();
  }
})();
