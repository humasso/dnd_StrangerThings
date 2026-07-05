# PDF Book Viewer - D&D Stranger Things Edition

Un lettore PDF moderno, reattivo e feature-rich per leggere i libri di D&D in stile Stranger Things.

## Struttura

- **Home** (`index.html`): card delle categorie + gestione segnalibri (export/import JSON).
- **Pagine categoria** (`pages/libretti.html`, `carte.html`, `schede.html`, `schermo.html`):
  contengono solo la lista dei PDF della propria categoria. Una categoria senza contenuti
  mostra lo stato "Attualmente non disponibile".
- **Lettore unico** (`pages/reader.html`): un solo file per la lettura di qualsiasi PDF,
  aperto con `reader.html?cat=<categoria>&book=<id>`.
- **Moduli JS** (`js/`): `common.js` (manifest, percorsi, copertine), `library.js`
  (pagine categoria), `reader.js` (lettore), `mobile.js` (UI mobile del lettore).

## Funzionalità

### Tools

- Ricerca full-text nel PDF (con avanzamento e annullamento automatico se cambi query)
- Zoom **fluido** ancorato al puntatore (50–200%): il documento scala senza scatti
  e il render nitido arriva a fine gesto (slider, `Ctrl`+rotella, pinch, `+`/`-`)
- Due modalità di visualizzazione su PC: **scorrimento continuo** e **vista libro**
  (tomo aperto con dorso, bordi pagina e zone "sfoglia" ai margini)
- **Barra strumenti trascinabile**: spostala ovunque dalla maniglia; rilasciata
  vicino alla posizione originale si riaggancia da sola
- Segnalibri personalizzati su pagina o testo evidenziato
- Export/import segnalibri in JSON dalla home
- Indicatore di pagina e barra di avanzamento lettura
- Responsivo su tutti i dispositivi

### Mobile

- **Swipe navigation**: scorri per cambiare pagina
- Bottom bar con pagina precedente/successiva e salto diretto a una pagina
- Touch-friendly controls, toolbar sempre accessibile

### Prestazioni

- **Rendering virtualizzato**: solo le pagine vicine al viewport vengono renderizzate;
  memoria e tempi di zoom costanti anche con PDF di centinaia di pagine.
- **Zoom istantaneo** con re-render nitido delle sole pagine visibili.
- **Copertine in cache** (localStorage), generate una sola volta dalla prima pagina del PDF.

## Aggiungere PDF

1. Copia il PDF in `assets/contenuti/<categoria>/` (es. `libretti`, `carte`, `schede`, `schermo`).
2. (Opzionale) crea `<nome-file>.json` accanto al PDF per personalizzare i metadati:

```json
{
  "id": "nome-libretto",
  "title": "Nome Libretto",
  "category": "Play Guide"
}
```

3. Rigenera il manifest statico per GitHub Pages e committa:

```bash
python3 server.py --export-static
```

In locale non serve: `python3 server.py` genera i manifest al volo.

## Sviluppo locale

```bash
python3 server.py            # http://127.0.0.1:8765
```

## 📋 TODO

- [x] Modo per effettuare export e import di segnalibri
