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

  function isDrawerOpen() {
    return isMobile() && (
      master.searchToggle?.classList.contains("is-active") ||
      master.bookmarkToggle?.classList.contains("is-active")
    );
  }

  document.addEventListener("pointerdown", (e) => {
    if (!isDrawerOpen()) return;
    if (master.sidePanel?.contains(e.target)) return;
    if (mob.topBar?.contains(e.target) || mob.bottomBar?.contains(e.target)) return;
    closeDrawer();
  }, { passive: true });

  /* Osserva cambiamenti di classe sui toggle master per sincronizzare */
  if (master.searchToggle) {
    new MutationObserver(syncDrawerState)
      .observe(master.searchToggle, { attributes: true, attributeFilter: ["class"] });
  }
  if (master.bookmarkToggle) {
    new MutationObserver(syncDrawerState)
      .observe(master.bookmarkToggle, { attributes: true, attributeFilter: ["class"] });
  }

  /* Osserva quando sidePanel.hidden cambia (es. dopo salvataggio segnalibro
     da app.js che chiama syncSearchPanelVisibility direttamente).
     In quel caso sincronizziamo lo stato dei bottoni mobile e, se il pannello
     si è appena aperto in modalità "bookmarks", evidenziamo il bottone ricerca
     mobile (che su mobile gestisce l'unico drawer unificato). */
  if (master.sidePanel) {
    new MutationObserver(() => {
      if (!isMobile()) return;
      const panelOpen = !master.sidePanel.hidden;

      /* Stato attivo dei bottoni master */
      const masterSearchActive   = master.searchToggle?.classList.contains("is-active")   ?? false;
      const masterBookmarkActive = master.bookmarkToggle?.classList.contains("is-active") ?? false;

      /* Su mobile il drawer è uno solo: è "aperto" se uno dei due è attivo */
      const anyActive = masterSearchActive || masterBookmarkActive;

      /* Sincronizza bottoni mobile */
      if (mob.searchToggle) {
        mob.searchToggle.classList.toggle("is-active", anyActive && panelOpen);
      }
      if (mob.bookmarkToggle) {
        mob.bookmarkToggle.classList.toggle("is-active", masterBookmarkActive && panelOpen);
      }

      mob.backdrop?.classList.toggle("is-visible", false); /* backdrop sempre off */
      document.body.classList.toggle("mob-drawer-open", panelOpen);
      syncSearchInputState();
    }).observe(master.sidePanel, { attributes: true, attributeFilter: ["hidden"] });
  }

  /* ════════════════════════════════════════════════════════
     SELEZIONE TESTO SU MOBILE (Android + iOS)
     ════════════════════════════════════════════════════════

     PROBLEMA ANDROID:
     - touchend scatta PRIMA che la selezione sia completata
     - L'utente trascina le maniglie dopo: la selezione cambia dopo
     - Soluzione: ascoltare selectionchange (si attiva ad ogni modifica
       della selezione, incluso drag maniglie) con debounce 350ms

     POSIZIONAMENTO:
     - Usiamo getBoundingClientRect() del Range (preciso anche dopo
       il drag maniglie), non le coordinate del tocco

     BOTTONE:
     - pointerdown + preventDefault blocca la perdita della selezione
       su Android (mousedown deseleziona)
  ════════════════════════════════════════════════════════ */

  const selectionMenu = document.getElementById("selectionMenu");
  const selectionBtn  = document.getElementById("selectionBookmarkButton");
  const bookStage     = master.bookStage;

  if (!bookStage || !selectionMenu) return;

  /* ── Stato swipe ── */
  const SWIPE_THRESHOLD = 14;
  let touchStartX = 0, touchStartY = 0;
  let touchMoved  = false;
  let isSelecting = false;

  bookStage.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchMoved  = false;
  }, { passive: true });

  bookStage.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - touchStartX);
    const dy = Math.abs(t.clientY - touchStartY);
    if (dx > SWIPE_THRESHOLD || dy > SWIPE_THRESHOLD) {
      touchMoved = true;
      bookStage.classList.add("is-swiping");
    }
  }, { passive: true });

  bookStage.addEventListener("touchend", () => {
    setTimeout(() => bookStage.classList.remove("is-swiping"), 300);
  }, { passive: true });

  /* ── selectionchange: cuore della soluzione Android ──
     Si attiva quando:
     - Long-press iniziale crea la selezione
     - L'utente sposta le maniglie (drag handle)
     - La selezione viene rimossa (collapse)
     Debounce 350ms: aspetta che l'utente smetta di trascinare */
  let selectionDebounce = 0;

  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(onSelectionSettled, 350);
  });

  function onSelectionSettled() {
    if (touchMoved) return;

    const sel = window.getSelection();

    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      if (isSelecting) hideSelectionMenu();
      return;
    }

    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!text) { hideSelectionMenu(); return; }

    /* Solo se la selezione e' dentro il book-stage */
    const anchorShell = sel.anchorNode?.parentElement?.closest(".page-shell");
    const focusShell  = sel.focusNode?.parentElement?.closest(".page-shell");
    if (!anchorShell && !focusShell) { hideSelectionMenu(); return; }

    isSelecting = true;
    positionMenuAboveSelection(sel);
  }

  function positionMenuAboveSelection(sel) {
    const range = sel.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    if (!rects.length) return;

    const minX = Math.min(...rects.map(r => r.left));
    const maxX = Math.max(...rects.map(r => r.right));
    const minY = Math.min(...rects.map(r => r.top));
    const maxY = Math.max(...rects.map(r => r.bottom));

    selectionMenu.hidden = false;
    selectionMenu.style.left = "-9999px";
    selectionMenu.style.top  = "-9999px";

    requestAnimationFrame(() => {
      const menuW  = selectionMenu.offsetWidth  || 160;
      const menuH  = selectionMenu.offsetHeight || 56;
      const margin = 10;
      const vw     = window.innerWidth;
      const vh     = window.innerHeight;
      const bottomBarH = 64;

      let left = (minX + maxX) / 2 - menuW / 2;
      let top  = minY - menuH - 4;   /* appena sopra il testo selezionato */

      if (top < margin) top = maxY + 6;

      left = Math.max(margin, Math.min(left, vw - menuW - margin));
      top  = Math.max(margin, Math.min(top, vh - menuH - bottomBarH - margin));

      selectionMenu.style.left = `${Math.round(left)}px`;
      selectionMenu.style.top  = `${Math.round(top)}px`;
    });
  }

  function hideSelectionMenu() {
    isSelecting = false;
    selectionMenu.hidden = true;
  }

  /* ── Bottone "Segnalibro": pointerdown preventDefault
     blocca la perdita della selezione su Android ── */
  if (selectionBtn) {
    selectionBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
    });
    selectionBtn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      selectionBtn.click();
      hideSelectionMenu();
    });
  }

  /* ── Nascondi menu se si tocca fuori ── */
  document.addEventListener("pointerdown", (e) => {
    if (selectionMenu.hidden || selectionMenu.contains(e.target)) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) hideSelectionMenu();
    }, 100);
  }, { passive: true });

  /* ════════════════════════════════════════════════════════
     SWIPE FEEDBACK sul book-stage (bottoni prev/next)
     ════════════════════════════════════════════════════════ */

  function triggerSwipeFeedback(direction) {
    if (!bookStage) return;
    bookStage.classList.add("is-swiping");
    setTimeout(() => bookStage.classList.remove("is-swiping"), 280);
  }
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