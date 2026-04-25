#!/usr/bin/env python3
"""
Server locale – Hellfire Club
Serve i file statici del sito e genera books.json automaticamente
scansionando la cartella contenuti/libretti/. Ogni PDF nella cartella appare
nel carosello senza toccare nessun file di configurazione.

Uso:  python3 server.py
"""
import json
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = 8765
LIBRETTI_DIR = Path("contenuti/libretti")


def filename_to_title(stem: str) -> str:
    """es. 'la-mia-avventura' → 'La Mia Avventura'"""
    return re.sub(r"[-_]+", " ", stem).title()


def scan_libretti() -> list:
    """
    Scansiona contenuti/libretti/ e restituisce la lista di libri per books.json.
    Per ogni file .pdf può esistere un .json con lo stesso nome base
    che sovrascrive titolo e categoria:
        { "title": "Titolo personalizzato", "category": "Play Guide" }
    """
    books = []
    if not LIBRETTI_DIR.exists():
        return books

    for pdf in sorted(LIBRETTI_DIR.glob("*.pdf")):
        stem = pdf.stem
        book_id = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")

        meta_file = LIBRETTI_DIR / f"{stem}.json"
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8")) if meta_file.exists() else {}
        except Exception:
            meta = {}

        books.append({
            "id":       meta.get("id", book_id),
            "title":    meta.get("title", filename_to_title(stem)),
            "category": meta.get("category", "Libretto"),
            "pdf":      f"contenuti/libretti/{pdf.name}",
        })

    return books


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Intercetta /books.json e lo genera dinamicamente
        if self.path.split("?")[0] == "/books.json":
            self._serve_books_json()
        else:
            super().do_GET()

    def _serve_books_json(self):
        payload = json.dumps(scan_libretti(), ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        # Stampa solo richieste non-asset (filtra font, icone, ecc.)
        path = args[0].split()[1] if args else ""
        if not any(path.endswith(ext) for ext in (".png", ".jpg", ".webp", ".woff2", ".ico")):
            print(f"  {args[1]}  {path}")


if __name__ == "__main__":
    import os
    os.chdir(Path(__file__).parent)
    print(f"Hellfire Club — server su http://localhost:{PORT}")
    print(f"Cartella libretti: {LIBRETTI_DIR.resolve()}")
    print(f"PDF trovati: {len(list(LIBRETTI_DIR.glob('*.pdf')) if LIBRETTI_DIR.exists() else [])}")
    print("Premi Ctrl+C per fermare.\n")
    HTTPServer(("", PORT), Handler).serve_forever()
