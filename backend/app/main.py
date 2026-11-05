"""Local TAXFLOW server: static frontend and small read-only demo API."""

import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .db import connect, initialize
from .db.demo_notes import list_demo_notes
from .chapters.ch02_intake import api as intake_api

FRONTEND_ROOT = Path(__file__).resolve().parents[2] / "frontend" / "public"
OLD_CHAPTER_PATHS = {
    "01_consultation": "ch01_consultation",
    "02_intake": "ch02_intake",
    "03_evidence": "ch03_evidence",
    "04_review": "ch04_review",
    "05_report": "ch05_report",
}


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def write_consultation(self, record_id=None):
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        if host not in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}") or (origin and origin not in (f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}")) or self.headers.get_content_type() != "application/json":
            self.send_error(403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 65536:
                raise ValueError()
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or not isinstance(data.get("taxpayerName"), str) or not data["taxpayerName"].strip() or not isinstance(data.get("consultedAt"), str) or not data["consultedAt"]:
                raise ValueError()
            if any(not isinstance(k, str) or not isinstance(v, str) for k, v in data.items()):
                raise ValueError()
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(400, "Invalid consultation")
            return
        with connect() as connection:
            if record_id is None:
                cursor = connection.execute("INSERT INTO consultations (taxpayer_name, consulted_at, data) VALUES (?, ?, ?)", (data["taxpayerName"].strip(), data["consultedAt"], json.dumps(data, ensure_ascii=False)))
                record_id = cursor.lastrowid
            else:
                cursor = connection.execute("UPDATE consultations SET taxpayer_name=?, consulted_at=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (data["taxpayerName"].strip(), data["consultedAt"], json.dumps(data, ensure_ascii=False), record_id))
                if not cursor.rowcount:
                    self.send_error(404)
                    return
        self.send_json({"id": record_id})

    def do_POST(self):
        if self.path in ("/api/intake/render", "/api/intake/parse"):
            self.intake_request()
        elif self.path == "/api/consultations":
            self.write_consultation()
        else:
            self.send_error(404)

    def intake_request(self):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        allowed = (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}")
        if host not in allowed or (origin and origin not in tuple(f"http://{h}" for h in allowed)):
            self.send_error(403)
            return
        render = self.path.endswith("/render")
        expected = "application/pdf" if render else "application/json"
        if self.headers.get_content_type() != expected:
            self.send_error(415)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            limit = intake_api.MAX_PDF if render else intake_api.MAX_IMAGE * 4 // 3 + 1024
            if length <= 0 or length > limit:
                raise ValueError("요청 크기가 허용 범위를 벗어났습니다.")
            data = self.rfile.read(length)
            if render:
                result = intake_api.render_pdf(data)
            else:
                payload = json.loads(data)
                if not isinstance(payload, dict):
                    raise ValueError("요청 형식이 올바르지 않습니다.")
                result = intake_api.parse_image(payload.get("image"), payload.get("model", "8b"))
            self.send_json(result)
        except (ValueError, UnicodeDecodeError) as exc:
            self.send_json_error(str(exc), 400)
        except RuntimeError as exc:
            self.send_json_error(str(exc), 502)

    def send_json_error(self, message, status):
        body = json.dumps({"error": message}, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_PUT(self):
        path = urlsplit(self.path).path
        parts = path.strip("/").split("/")
        if len(parts) == 3 and parts[:2] == ["api", "consultations"] and parts[2].isdigit():
            self.write_consultation(int(parts[2]))
        else:
            self.send_error(404)

    def do_DELETE(self):
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        allowed_hosts = (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}")
        if host not in allowed_hosts or (origin and origin not in tuple(f"http://{value}" for value in allowed_hosts)) or self.headers.get_content_type() != "application/json":
            self.send_error(403)
            return
        parts = urlsplit(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "consultations"] or not parts[2].isdigit():
            self.send_error(404)
            return
        with connect() as connection:
            cursor = connection.execute("DELETE FROM consultations WHERE id=?", (int(parts[2]),))
            if not cursor.rowcount:
                self.send_error(404)
                return
        self.send_json({"deleted": True})

    def do_GET(self) -> None:
        requested = urlsplit(self.path)
        path = requested.path
        for old_name, new_name in OLD_CHAPTER_PATHS.items():
            old_prefix = f"/chapters/{old_name}"
            if path == old_prefix or path.startswith(old_prefix + "/"):
                location = f"/chapters/{new_name}{path[len(old_prefix):]}"
                if requested.query:
                    location += f"?{requested.query}"
                self.send_response(302)
                self.send_header("Location", location)
                self.send_header("Content-Length", "0")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                return
        if path.startswith("/api/") and self.headers.get("Host", "") not in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"):
            self.send_error(403)
            return
        if path == "/api/health":
            with connect() as connection:
                connection.execute("SELECT 1").fetchone()
            self.send_json({"status": "ok", "database": "ready"})
        elif path == "/api/consultations":
            with connect() as connection:
                rows = connection.execute("SELECT id, taxpayer_name, consulted_at, updated_at, data FROM consultations ORDER BY updated_at DESC, id DESC").fetchall()
            items = []
            for row in rows:
                item = dict(row)
                item["birth_date"] = json.loads(item.pop("data")).get("birthDate", "")
                items.append(item)
            self.send_json({"items": items})
        elif path.startswith("/api/consultations/") and path.rsplit("/", 1)[-1].isdigit():
            with connect() as connection:
                row = connection.execute("SELECT id, data FROM consultations WHERE id=?", (int(path.rsplit("/", 1)[-1]),)).fetchone()
            if row is None:
                self.send_error(404)
            else:
                self.send_json({"id": row["id"], "data": json.loads(row["data"])})
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
