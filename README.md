# PDF Book Viewer - D&D Stranger Things Edition

Un lettore PDF moderno, reattivo e feature-rich per leggere i libri di D&D in stile Stranger Things.

## 🎮 Funzionalità

### Navigazione

-**Navigazione fluida tra pagine** con animazioni smooth

-**Scorciatoie tastiera**:

-`←` - Pagina precedente

-`→` - Pagina successiva

### Tools

- Ricerca full-text nel PDF
- Zoom e Visualizzazione
- Segnalibri personalizzati su pagina o testo evidenziato

- **Modalità spread (libro)** per visualizzare due pagine affiancate

- Responsivo su tutti i dispositivi

### Mobile

-**Swipe navigation** - Scorri per cambiare pagina

- Layout responsive
- Touch-friendly controls
- Toolbar sempre accessibile

## 📋 TODO

- [X] Aggiungere bookmarks (segnalibri personalizzati)
- [ ] Risolvere Bug aggiuntga bookmark con visualizzazione a 2 pagine
- [X] Supporto per annotazioni/highlights
- [ ] Animazioni (aggiungere barra del progresso + )
- [X] Tematizzato "Stranger Things: Welcome to the Hellfire Club"
- [ ] Dark mode

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
