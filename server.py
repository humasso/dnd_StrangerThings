#!/usr/bin/env python3
"""
Server locale – Hellfire Club

Serve i file statici del sito e genera books.json automaticamente
scansionando OGNI sottocartella di assets/contenuti/ (libretti, carte,
schede, schermo, ...). Ogni PDF appare nella rispettiva categoria senza
toccare nessun file di configurazione.

Uso:
  python3 server.py                     # porta default 8765, localhost
  python3 server.py --port 9000         # porta custom
  python3 server.py --export-static     # genera books.static.json per ogni categoria e termina
"""

import argparse           
import json
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DEFAULT_PORT = 8765
DEFAULT_HOST = "127.0.0.1"   

CONTENUTI_DIR = Path("assets/contenuti")

# Nome cartella → etichetta di default per la voce "category" dei libri
CATEGORY_LABELS = {
    "libretti": "Libretto",
    "carte":    "Carte",
    "schede":   "Scheda",
    "schermo":  "Schermo Master",
}


# ── Helpers ────────────────────────────────────────────────────────────────

def filename_to_title(stem: str) -> str:
    """es. 'la-mia-avventura' → 'La Mia Avventura'"""
    return re.sub(r"[-_]+", " ", stem).title()


def _validated_str(value: object, fallback: str) -> str:
    """fix #10 — accetta solo stringhe non vuote, altrimenti usa il fallback."""
    return value if isinstance(value, str) and value.strip() else fallback


def category_dirs() -> list:
    """Sottocartelle di assets/contenuti/ (una per categoria)."""
    if not CONTENUTI_DIR.exists():
        return []
    return sorted(d for d in CONTENUTI_DIR.iterdir() if d.is_dir())


def scan_category(cat_dir: Path) -> list:
    """
    Scansiona una cartella categoria e restituisce la lista per books.json.
    Per ogni PDF può esistere un .json con lo stesso nome base che sovrascrive
    titolo e categoria:
        { "title": "Titolo personalizzato", "category": "Play Guide" }
    """
    books = []
    if not cat_dir.exists():
        return books

    default_label = CATEGORY_LABELS.get(cat_dir.name, filename_to_title(cat_dir.name))

    for pdf in sorted(cat_dir.glob("*.pdf")):
        stem      = pdf.stem
        book_id   = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
        meta_file = cat_dir / f"{stem}.json"

        meta: dict = {}
        if meta_file.exists():
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                print(f"[WARN] {meta_file.name}: JSON non valido ({exc})", file=sys.stderr)
            except OSError as exc:
                print(f"[WARN] {meta_file.name}: impossibile leggere ({exc})", file=sys.stderr)

        books.append({
            "id":       _validated_str(meta.get("id"),       book_id),
            "title":    _validated_str(meta.get("title"),    filename_to_title(stem)),
            "category": _validated_str(meta.get("category"), default_label),
            "pdf":      f"assets/contenuti/{cat_dir.name}/{pdf.name}",
        })

    return books


def export_static() -> None:
    """Scrive books.static.json in ogni categoria per hosting statico (GitHub Pages)."""
    CONTENUTI_DIR.mkdir(parents=True, exist_ok=True)
    for cat_dir in category_dirs():
        books = scan_category(cat_dir)
        if not books:
            continue
        target = cat_dir / "books.static.json"
        target.write_text(
            json.dumps(books, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"Scritto {target} ({len(books)} libri).")


# ── HTTP Handler ────────────────────────────────────────────────────────────

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options":        "SAMEORIGIN",
    "Referrer-Policy":        "strict-origin-when-cross-origin",
}


BOOKS_JSON_RE = re.compile(r"^/assets/contenuti/([\w-]+)/books\.json$")


class Handler(SimpleHTTPRequestHandler):

    def do_GET(self):
        match = BOOKS_JSON_RE.match(self.path.split("?")[0])
        if match:
            self._serve_books_json(match.group(1))
        else:
            super().do_GET()

    def send_response(self, code, message=None):
        super().send_response(code, message)
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)

    def _serve_books_json(self, category: str):
        books = scan_category(CONTENUTI_DIR / category)
        payload = json.dumps(books, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type",   "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control",  "no-cache")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
    
        if args:
            parts = args[0].split()
            path  = parts[1] if len(parts) > 1 else args[0]
        else:
            path = ""

        if not any(path.endswith(ext) for ext in (".png", ".jpg", ".webp", ".woff2", ".ico")):
            status = args[1] if len(args) > 1 else "-"
            print(f"  {status} {path}")


# ── Entry point ─────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
  
    p = argparse.ArgumentParser(
        description="Server locale Hellfire Club",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--port",          type=int, default=DEFAULT_PORT,
                   help="Porta su cui ascoltare")
    p.add_argument("--host",          default=DEFAULT_HOST,
                   help="Indirizzo di binding (usare 0.0.0.0 solo in reti fidate)")
    p.add_argument("--export-static", action="store_true",
                   help="Genera books.static.json e termina senza avviare il server")
    return p.parse_args()


if __name__ == "__main__":
    import os
    os.chdir(Path(__file__).parent)

    args = _parse_args()

    if args.export_static:
        export_static()
        sys.exit(0)

    print(f"Hellfire Club — server su http://{args.host}:{args.port}")
    print(f"Cartella contenuti : {CONTENUTI_DIR.resolve()}")
    for cat_dir in category_dirs():
        pdf_count = len(list(cat_dir.glob("*.pdf")))
        print(f"  - {cat_dir.name}: {pdf_count} PDF")
    print(f"Header sicurezza   : {', '.join(SECURITY_HEADERS)}")
    print("Premi Ctrl+C per fermare.\n")

    # ThreadingHTTPServer: i download dei PDF non bloccano le altre richieste
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()