/* ============================================================
   MOBILE.JS — Controller per interfaccia mobile
   D&D Stranger Things – Hellfire Club Edition

   Questo file gestisce:
   - Bottom bar fissa (navigazione, strumenti)
   - Drawer dal basso (ricerca / segnalibri)
   - Backdrop del drawer
   - Zoom ciclico touch
   - Feedback visivo swipe sul book-stage
   - Sincronizzazione con lo stato di app.js tramite
     MutationObserver e re-wiring degli elementi duplicati
   ============================================================ */

(function () {
  "use strict";

  /* ── Breakpoint oltre il quale non facciamo nulla ── */
  const MOBILE_BP = 768;
  const isMobile = () => window.innerWidth <= MOBILE_BP;

  /* ── Livelli zoom ciclici per mobile ── */
  const ZOOM_STEPS = [80, 100, 130, 160];
  let zoomStepIndex = 1; // 100% di default

  /* ── Riferimenti elementi ── */
  const mob = {
    bottomBar:        document.getElementById("mobBottomBar"),
    topBar:           document.getElementById("mobTopBar"),
    backdrop:         document.getElementById("mobDrawerBackdrop"),
    prevBtn:          document.getElementById("mobPrevButton"),
    nextBtn:          document.getElementById("mobNextButton"),
    pageInput:        document.getElementById("mobPageInput"),
    totalPages:       document.getElementById("mobTotalPages"),
    searchToggle:     document.getElementById("mobSearchToggle"),
    bookmarkToggle:   document.getElementById("mobBookmarkToggle"),
    addBookmark:      document.getElementById("mobAddBookmark"),
    zoomCycle:        document.getElementById("mobZoomCycle"),
  };

  /* Elementi "master" definiti in app.js / libretti.html */
  const master = {
    prevBtn:              document.getElementById("prevButton"),
    nextBtn:              document.getElementById("nextButton"),
    pageInput:            document.getElementById("pageInput"),
    totalPages:           document.getElementById("totalPages"),
    searchToggle:         document.getElementById("searchToggleButton"),
    searchInput:          document.getElementById("searchInput"),
    bookmarkToggle:       document.getElementById("bookmarkToggleButton"),
    addBookmark:          document.getElementById("addPageBookmarkButton"),
    zoomRange:            document.getElementById("zoomRange"),
    readerLayout:         document.getElementById("readerLayout"),
    homeScreen:           document.getElementById("homeScreen"),
    bookStage:            document.getElementById("bookStage"),
    sidePanel:            document.getElementById("sidePanel"),
  };

  /* ── Verifica elementi obbligatori ── */
  if (!mob.bottomBar || !mob.backdrop || !master.readerLayout) return;

  /* ════════════════════════════════════════════════════════
     BOTTOM BAR — mostra/nascondi in base alla schermata
     ════════════════════════════════════════════════════════ */

  function syncBottomBarVisibility() {
    if (!isMobile()) {
      mob.bottomBar.hidden = true;
      if (mob.topBar) mob.topBar.hidden = true;
      return;
    }
    /* Mostra bottom bar solo quando il reader è visibile */
    const readerVisible = !master.readerLayout.hidden;
    mob.bottomBar.hidden = !readerVisible;
    if (mob.topBar) mob.topBar.hidden = !readerVisible;
  }

  /* Osserva quando il readerLayout viene mostrato/nascosto */
  const layoutObserver = new MutationObserver(syncBottomBarVisibility);
  layoutObserver.observe(master.readerLayout, { attributes: true, attributeFilter: ["hidden"] });
  syncBottomBarVisibility();
  window.addEventListener("resize", syncBottomBarVisibility);

  /* ════════════════════════════════════════════════════════
     NAVIGAZIONE — wiring su master buttons
     ════════════════════════════════════════════════════════ */

  if (mob.prevBtn && master.prevBtn) {
    mob.prevBtn.addEventListener("click", () => {
      master.prevBtn.click();
      triggerSwipeFeedback("left");
    });
  }

  if (mob.nextBtn && master.nextBtn) {
    mob.nextBtn.addEventListener("click", () => {
      master.nextBtn.click();
      triggerSwipeFeedback("right");
    });
  }

  /* Input pagina mobile: sincronizzato con master */
  if (mob.pageInput && master.pageInput) {
    mob.pageInput.addEventListener("change", () => {
      master.pageInput.value = mob.pageInput.value;
      master.pageInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    /* Aggiornamento in tempo reale quando cambia il master */
    const pageInputObserver = new MutationObserver(() => {
      if (document.activeElement !== mob.pageInput) {
        mob.pageInput.value = master.pageInput.value;
      }
    });
    pageInputObserver.observe(master.pageInput, { attributes: true, attributeFilter: ["value"] });

    /* Sincronizza anche su input diretto del master */
    master.pageInput.addEventListener("change", () => {
      if (document.activeElement !== mob.pageInput) {
        mob.pageInput.value = master.pageInput.value;
      }
    });
  }

  /* Sincronizzazione totalPages */
  function syncTotalPages() {
    if (mob.totalPages && master.totalPages) {
      mob.totalPages.textContent = master.totalPages.textContent;
    }
    if (mob.pageInput && master.pageInput) {
      if (document.activeElement !== mob.pageInput) {
        mob.pageInput.value = master.pageInput.value;
      }
      mob.pageInput.max = master.pageInput.max || "";
    }
    /* Sync stato disabilitato dei bottoni nav */
    if (mob.prevBtn) mob.prevBtn.disabled = master.prevBtn?.disabled ?? false;
    if (mob.nextBtn) mob.nextBtn.disabled = master.nextBtn?.disabled ?? false;
  }

  /* Polling leggero per sincronizzare i valori di pagina
     (alternativa semplice a intercettare tutte le chiamate di app.js) */
  let syncTimer = 0;

  function startSyncPolling() {
    clearInterval(syncTimer);
    syncTimer = setInterval(syncTotalPages, 350);
  }

  function stopSyncPolling() {
    clearInterval(syncTimer);
  }

  /* Avvia polling quando reader è visibile */
  new MutationObserver(() => {
    if (!master.readerLayout.hidden && isMobile()) {
      startSyncPolling();
    } else {
      stopSyncPolling();
    }
  }).observe(master.readerLayout, { attributes: true, attributeFilter: ["hidden"] });

  /* ════════════════════════════════════════════════════════
     ZOOM CICLICO
     ════════════════════════════════════════════════════════ */

  if (mob.zoomCycle && master.zoomRange) {
    /* Inizializza indice in base al valore corrente dello slider */
    function findClosestZoomStep(val) {
      let closest = 0;
      let minDiff = Infinity;
      ZOOM_STEPS.forEach((step, i) => {
        const diff = Math.abs(step - val);
        if (diff < minDiff) { minDiff = diff; closest = i; }
      });
      return closest;
    }

    zoomStepIndex = findClosestZoomStep(Number(master.zoomRange.value));

    mob.zoomCycle.addEventListener("click", () => {
      zoomStepIndex = (zoomStepIndex + 1) % ZOOM_STEPS.length;
      const newZoom = ZOOM_STEPS[zoomStepIndex];

      /* Aggiorna lo slider master — app.js ascolta l'evento "input" */
      master.zoomRange.value = String(newZoom);
      master.zoomRange.dispatchEvent(new Event("input", { bubbles: true }));

      /* Feedback visivo sul bottone */
      mob.zoomCycle.setAttribute("aria-label", `Zoom ${newZoom}%`);
      animateZoomButton(newZoom);
    });
  }

  function animateZoomButton(zoom) {
    if (!mob.zoomCycle) return;
    mob.zoomCycle.classList.add("is-active");
    /* Tooltip temporaneo */
    const tip = document.createElement("span");
    tip.textContent = `${zoom}%`;
    tip.style.cssText = `
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: rgba(8,4,4,0.96);
      color: #fff4e6;
      font-weight: 800;
      font-size: 0.75rem;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid rgba(215,25,32,0.3);
      white-space: nowrap;
      pointer-events: none;
      animation: pop-in 120ms ease both;
      z-index: 999;
    `;
    mob.zoomCycle.style.position = "relative";
    mob.zoomCycle.appendChild(tip);
    setTimeout(() => {
      tip.remove();
      mob.zoomCycle.classList.remove("is-active");
    }, 900);
  }

  /* ════════════════════════════════════════════════════════
     DRAWER — ricerca e segnalibri
     ════════════════════════════════════════════════════════ */

  function syncSearchInputState() {
    if (!master.searchInput) return;
    const hasText = master.searchInput.value.trim().length > 0;
    document.body.classList.toggle("mob-search-has-text", hasText);
  }

  if (master.searchInput) {
    master.searchInput.addEventListener("input", syncSearchInputState);
    master.searchInput.addEventListener("change", syncSearchInputState);
  }

  /* Toggle ricerca (mobile) → delega al bottone master di app.js */
  if (mob.searchToggle && master.searchToggle) {
    mob.searchToggle.addEventListener("click", () => {
      master.searchToggle.click();
      syncDrawerState();
    });
  }

  /* Toggle segnalibri (mobile) → delega al bottone master */
  if (mob.bookmarkToggle && master.bookmarkToggle) {
    mob.bookmarkToggle.addEventListener("click", () => {
      master.bookmarkToggle.click();
      syncDrawerState();
    });
  }

  /* Aggiungi segnalibro pagina (mobile) → delega al master */
  if (mob.addBookmark && master.addBookmark) {
    mob.addBookmark.addEventListener("click", () => {
      master.addBookmark.click();
    });
  }

  /* Chiudi drawer toccando il backdrop */
  mob.backdrop.addEventListener("click", closeDrawer);

  /* Swipe-down per chiudere il drawer */
  let drawerTouchStartY = 0;
  let drawerTouchStartX = 0;
  let drawerTouchFromHandle = false;
  if (master.sidePanel) {
    master.sidePanel.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      const rect = master.sidePanel.getBoundingClientRect();
      drawerTouchStartY = t.clientY;
      drawerTouchStartX = t.clientX;
      drawerTouchFromHandle = (t.clientY - rect.top) <= 48;
    }, { passive: true });

    master.sidePanel.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      const dy = t.clientY - drawerTouchStartY;
      const dx = t.clientX - drawerTouchStartX;
      if (drawerTouchFromHandle && dy > 60 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        closeDrawer();
      }
    }, { passive: true });
  }

  function closeDrawer() {
    /* Simula click sul toggle attivo per chiuderlo via app.js */
    if (master.searchToggle?.classList.contains("is-active")) {
      master.searchToggle.click();
    } else if (master.bookmarkToggle?.classList.contains("is-active")) {
      master.bookmarkToggle.click();
    }
    syncDrawerState();
  }

  function syncDrawerState() {
    if (!isMobile()) return;
    const isOpen =
      master.searchToggle?.classList.contains("is-active") ||
      master.bookmarkToggle?.classList.contains("is-active");

    mob.backdrop.classList.toggle("is-visible", Boolean(isOpen));
    document.body.classList.toggle("mob-drawer-open", Boolean(isOpen));

    /* Sincronizza stato attivo dei bottoni mobile */
    if (mob.searchToggle) {
      mob.searchToggle.classList.toggle("is-active",
        Boolean(master.searchToggle?.classList.contains("is-active")));
    }
    if (mob.bookmarkToggle) {
      mob.bookmarkToggle.classList.toggle("is-active",
        Boolean(master.bookmarkToggle?.classList.contains("is-active")));
    }

    syncSearchInputState();
  }

  /* Osserva cambiamenti di classe sui toggle master per sincronizzare */
  if (master.searchToggle) {
    new MutationObserver(syncDrawerState)
      .observe(master.searchToggle, { attributes: true, attributeFilter: ["class"] });
  }
  if (master.bookmarkToggle) {
    new MutationObserver(syncDrawerState)
      .observe(master.bookmarkToggle, { attributes: true, attributeFilter: ["class"] });
  }

  /* ════════════════════════════════════════════════════════
     SWIPE FEEDBACK sul book-stage
     ════════════════════════════════════════════════════════ */

  function triggerSwipeFeedback(direction) {
    if (!master.bookStage) return;
    master.bookStage.classList.add("is-swiping");
    setTimeout(() => master.bookStage.classList.remove("is-swiping"), 280);
  }

  /* ════════════════════════════════════════════════════════
     ESCAPE KEY — chiude il drawer su mobile
     ════════════════════════════════════════════════════════ */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isMobile()) closeDrawer();
  });

  /* ════════════════════════════════════════════════════════
     RESIZE — cleanup se si torna a desktop
     ════════════════════════════════════════════════════════ */
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      mob.backdrop.classList.remove("is-visible");
      stopSyncPolling();
    } else {
      if (!master.readerLayout.hidden) startSyncPolling();
    }
  });

})();