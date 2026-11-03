"""Local TAXFLOW server: static frontend and small read-only demo API."""

import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .chapters.chapter_02.consultation import list_demo_notes
from .db import connect, initialize

FRONTEND_ROOT = Path(__file__).resolve().parents[2] / "frontend" / "public"


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/api/health":
            with connect() as connection:
                connection.execute("SELECT 1").fetchone()
            self.send_json({"status": "ok", "database": "ready"})
        elif path == "/api/demo-notes":
            self.send_json({"items": list_demo_notes()})
        elif path.startswith("/api/"):
            self.send_error(404, "Unknown API endpoint")
        else:
            super().do_GET()


def main() -> None:
    initialize()
    port = int(os.environ.get("PORT", "8765"))
    handler = partial(Handler, directory=str(FRONTEND_ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"TAXFLOW http://127.0.0.1:{port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
