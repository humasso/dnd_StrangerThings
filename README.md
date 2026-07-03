# PDF Book Viewer - D&D Stranger Things Edition

Un lettore PDF moderno, reattivo e feature-rich per leggere i libri di D&D in stile Stranger Things.

## Funzionalità

Inserisci il pdf da leggere in `contenuti`.

### Tools

- Ricerca full-text nel PDF (con avanzamento e annullamento automatico se cambi query)
- Zoom fluido con feedback istantaneo (slider, `Ctrl`+rotella, pinch, tasti `+`/`-`)
- Due modalità di visualizzazione su PC: **scorrimento continuo** e **vista libro** (spread a due pagine affiancate) — si passa dall'una all'altra col pulsante nella barra strumenti
- Segnalibri personalizzati su pagina o testo evidenziato
- Export/import segnalibri in JSON dalla home
- Indicatore di pagina e barra di avanzamento lettura
- Responsivo su tutti i dispositivi

### Mobile

- **Swipe navigation**: Scorri per cambiare pagina
- Bottom bar con pagina precedente/successiva e salto diretto a una pagina
- Touch-friendly controls
- Toolbar sempre accessibile

### Prestazioni

- **Rendering virtualizzato**: vengono renderizzate solo le pagine vicine al viewport (IntersectionObserver); le pagine lontane vengono rilasciate. Memoria e tempi di zoom restano costanti anche con PDF di centinaia di pagine.
- **Zoom istantaneo**: durante lo zoom il bitmap esistente viene stirato via CSS e il re-render nitido riguarda solo le pagine visibili.
- **Cap alla risoluzione dei canvas** (DPR max 2 + tetto pixel) per non esaurire la memoria su schermi retina.
- **Copertine in cache** (localStorage): generate una sola volta dalla prima pagina del PDF, poi riusate senza riscaricare nulla.

## Libreria PDF

La home legge i libretti da `books.json`. Per aggiungere un PDF:

1. Metti il file in `assets/contenuti/`.
2. Aggiungi una voce a `books.json` con `id`, `title`, `category` e `pdf`.
3. Se vuoi usare una cover personalizzata, aggiungi anche `cover`; altrimenti il sito genera la copertina dalla prima pagina del PDF.

Esempio:

```json

{

"id": "nome-libretto",

"title": "Nome Libretto",

"category": "Play Guide",

"pdf": "assets/contenuti/nome-libretto.pdf"

}
```

## 📋 TODO

- [x] Modo per effettuare export e import di segnalibri
