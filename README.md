# PDF Book Viewer - D&D Stranger Things Edition

Un lettore PDF moderno, reattivo e feature-rich per leggere i libri di D&D in stile Stranger Things.

## 🎮 Funzionalità

### Navigazione
- **Navigazione fluida tra pagine** con animazioni smooth
- **Scorciatoie tastiera**:
  - `← / J` - Pagina precedente
  - `→ / K` - Pagina successiva
  - `+` / `-` - Zoom in/out
  - `S` - Visualizzazione libro (spread mode)
  - `Ctrl+F` - Ricerca nel PDF
  - `Ctrl+D` - Attiva/disattiva tema scuro
  - `?` - Mostra aiuto

### Ricerca Avanzata
- Ricerca full-text nel PDF
- Evidenziazione risultati
- Navigazione tra risultati
- Snippet di contesto

### Zoom e Visualizzazione
- Zoom variabile (75% - 220%)
- **Modalità spread (libro)** per visualizzare due pagine affiancate
- Responsivo su tutti i dispositivi

### Tema e Accessibilità
- **Dark mode** con Ctrl+D
- Tema salvato in localStorage
- Contrasto elevato e leggibilità ottimizzata
- Design accessibility-first

### Persistenza
- Salvataggio automatico della pagina corrente
- Salvataggio livello zoom
- Ripresa automatica da dove hai smesso di leggere

### Mobile
- **Swipe navigation** - Scorri per cambiare pagina
- Layout responsive
- Touch-friendly controls
- Toolbar sempre accessibile

## 🎨 Design

- **Animazioni fluide** - Transizioni smooth e 3D
- **Barra di progresso** - Visualizza avanzamento lettura
- **Feedback visivo** - Hover states e active states chiari
- **Tema moderno** - Colori coordinati e tipografia elegante

## 📦 Tech Stack

- **PDF.js 3.11.174** - Rendering PDF
- **HTML5 semantic** - Struttura accessibile
- **CSS3 Grid/Flexbox** - Layout moderno
- **Vanilla JavaScript** - No dependencies
- **localStorage API** - Persistenza dati

## 🚀 Uso

1. Metti il tuo PDF in `assets/book.pdf`
2. Apri `index.html` nel browser
3. Goditi la lettura!

## ⌨️ Scorciatoie

| Azione | Tasti |
|--------|-------|
| Pagina precedente | ← oppure J |
| Pagina successiva | → oppure K |
| Zoom in | + |
| Zoom out | - |
| Spread mode | S |
| Ricerca | Ctrl+F |
| Dark mode | Ctrl+D |
| Aiuto | ? |

## 🎭 Miglioramenti UI/UX (v2.0)

✨ **Tema visual moderno** con palette di colori coordinata
✨ **Dark mode** automatico con Ctrl+D
✨ **Animazioni fluide** su transizioni pagine (320ms bounce)
✨ **Barra di progresso** lettura in tempo reale
✨ **Scorciatoie tastiera avanzate** (J/K navigation, zoom, dark mode)
✨ **Salvataggio progresso** - Riprendi da dove hai smesso
✨ **Swipe navigation** su dispositivi mobile (50px threshold)
✨ **Feedback visivo potenziato** - Hover effects e scale animations
✨ **Ricerca migliorata** con animazioni staggered
✨ **Tooltips informativi** su tutti i pulsanti

## 📋 TODO

- [ ] Aggiungere bookmarks (segnalibri personalizzati)
- [ ] Supporto per annotazioni/highlights
- [ ] Esportazione note
- [ ] Font size customization
- [ ] Modalità distrazione-free
- [ ] Sincronizzazione cloud

