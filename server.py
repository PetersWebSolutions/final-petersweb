#!/usr/bin/env python3
"""
PetersWeb Solutions — static site + inquiry endpoint.

Serves the funnel on http://0.0.0.0:8000 and accepts POST /api/inquiries.
Inquiries are validated and appended to data/inquiries.jsonl (not web-accessible).
No secrets or API keys are required. Standard library only.

Run:
    python3 server.py
Environment:
    PORT (default 8000), HOST (default 0.0.0.0)
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
INQUIRIES_FILE = DATA_DIR / "inquiries.jsonl"
MAX_BODY_BYTES = 24 * 1024
RATE_LIMIT_MAX = 8          # submissions per IP per window
RATE_LIMIT_WINDOW = 60 * 60  # seconds

BUSINESS_TYPES = {
    "medical", "resort", "spa", "dental", "restaurant",
    "events", "services", "retail", "other",
}
PACKAGES = {"unsure", "basic", "business", "pro", "custom"}

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

RATE_LIMIT: dict[str, deque[float]] = defaultdict(deque)
RATE_LOCK = threading.Lock()
WRITE_LOCK = threading.Lock()


def _clean(value: object, max_length: int) -> str:
    if not isinstance(value, str):
        return ""
    value = CONTROL_RE.sub("", value).strip()
    return value[:max_length]


def _validate(payload: dict) -> dict[str, str]:
    errors: dict[str, str] = {}

    name = _clean(payload.get("name"), 80)
    business = _clean(payload.get("business"), 120)
    business_type = _clean(payload.get("businessType"), 40)
    package = _clean(payload.get("package"), 40)
    current_website = _clean(payload.get("currentWebsite"), 250)
    email = _clean(payload.get("email"), 254)
    phone = _clean(payload.get("phone"), 40)
    message = _clean(payload.get("message"), 500)
    consent = payload.get("consent") is True

    if len(name) < 2:
        errors["name"] = "Please enter your full name."
    if len(business) < 2:
        errors["business"] = "Please enter your business name."
    if business_type not in BUSINESS_TYPES:
        errors["businessType"] = "Please choose a business category."
    if package not in PACKAGES:
        errors["package"] = "Please select a package or “Not sure yet”."
    if not email:
        errors["email"] = "Please enter your email address."
    elif not EMAIL_RE.fullmatch(email):
        errors["email"] = "Please enter a valid email address."
    if not phone:
        errors["phone"] = "Please enter your mobile number."
    else:
        digits = re.sub(r"\D", "", phone)
        if not re.fullmatch(r"[+()\d.\-\s]+", phone) or not 7 <= len(digits) <= 15:
            errors["phone"] = "Please enter a valid mobile number, including area or country code."

    if current_website:
        try:
            parsed = urlsplit(current_website)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                errors["currentWebsite"] = "Enter a full website address starting with https://, or leave this blank."
        except ValueError:
            errors["currentWebsite"] = "Enter a valid website address, or leave this blank."
    if len(message) < 10:
        errors["message"] = "Please add a short description (at least 10 characters)."
    if not consent:
        errors["consent"] = "Please agree to be contacted about your inquiry."

    return errors


def _rate_limited(ip: str) -> bool:
    now = time.time()
    with RATE_LOCK:
        bucket = RATE_LIMIT[ip]
        while bucket and now - bucket[0] > RATE_LIMIT_WINDOW:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_MAX:
            return True
        bucket.append(now)
        return False


def _reference() -> str:
    return "PWS-{}-{}".format(
        datetime.now(timezone.utc).strftime("%Y%m%d"),
        secrets.token_hex(3).upper(),
    )


class Handler(SimpleHTTPRequestHandler):
    server_version = "PetersWeb/1.0"
    protocol_version = "HTTP/1.1"
    directory = str(ROOT)

    # ---------- security / caching ----------
    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("X-XSS-Protection", "0")
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        elif path.endswith((".html", "/")) or path == "":
            self.send_header("Cache-Control", "no-cache")
        elif path in {
            "/assets/js/config.js",
            "/assets/js/main.js",
            "/assets/css/styles.css",
        }:
            # Keep portfolio destinations and frontend behavior from going stale.
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()

    # ---------- helpers ----------
    def _json(self, status: int, payload: dict, extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _blocked(self, path: str) -> bool:
        lowered = path.lower()
        if lowered in {"/server.py", "/readme.md", "/requirements.txt", "/.gitignore"}:
            return True
        if lowered.startswith(("/data/", "/qa/", "/.git/", "/__pycache__/", "/api/")):
            return True
        if any(part.startswith(".") for part in Path(lowered).parts if part not in {"/"}):
            return True
        return lowered.endswith((".jsonl", ".pyc", ".py", ".db", ".sqlite"))

    def _resolve(self):
        """Return a safe Path inside ROOT for the current request path."""
        path = Path(self.translate_path(self.path))
        try:
            resolved = path.resolve()
        except OSError:
            return None
        if resolved != ROOT and ROOT not in resolved.parents:
            return None
        return resolved

    def _not_found(self) -> None:
        not_found = ROOT / "404.html"
        body = not_found.read_bytes() if not_found.is_file() else b"404 - Not found"
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _serve_file(self, file_path: Path) -> None:
        try:
            stat = file_path.stat()
            if not file_path.is_file():
                raise FileNotFoundError
            content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in {
                "application/javascript", "application/json", "image/svg+xml",
                "application/manifest+json",
            }:
                content_type += "; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(stat.st_size))
            self.send_header("Last-Modified", self.date_time_string(stat.st_mtime))
            self.end_headers()
            if self.command != "HEAD":
                with file_path.open("rb") as handle:
                    while True:
                        chunk = handle.read(64 * 1024)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            self._not_found()

    # ---------- GET / HEAD ----------
    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path.startswith("/api/"):
            self._json(405, {"ok": False, "error": "Method not allowed."}, {"Allow": "POST"})
            return
        if self._blocked(path):
            self._not_found()
            return
        file_path = self._resolve()
        if file_path is None:
            self._not_found()
            return
        if file_path.is_dir():
            if not path.endswith("/"):
                self.send_response(301)
                self.send_header("Location", path + "/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            file_path = file_path / "index.html"
        if not file_path.is_file():
            self._not_found()
            return
        self._serve_file(file_path)

    def do_HEAD(self) -> None:
        self.do_GET()

    # ---------- POST /api/inquiries ----------
    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if path != "/api/inquiries":
            self._json(404, {"ok": False, "error": "Endpoint not found."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(413, {"ok": False, "error": "Submission is empty or too large."})
            return

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self._json(400, {"ok": False, "error": "Invalid submission format."})
            return

        ip = self.client_address[0]
        if _rate_limited(ip):
            self._json(
                429,
                {"ok": False, "error": "Too many inquiries from this connection. Please try again later."},
                {"Retry-After": str(RATE_LIMIT_WINDOW)},
            )
            return

        # Spam protection: silent honeypot + minimum filling time.
        if _clean(payload.get("company_website"), 200):
            self._json(400, {"ok": False, "error": "We couldn't verify this submission. Please refresh and try again."})
            return
        try:
            started = int(payload.get("formStartedAt", 0))
        except (TypeError, ValueError):
            started = 0
        elapsed_ms = int(time.time() * 1000) - started
        if started <= 0 or elapsed_ms < 2000 or elapsed_ms > 24 * 60 * 60 * 1000:
            self._json(400, {"ok": False, "error": "We couldn't verify this submission. Please refresh and try again."})
            return

        errors = _validate(payload)
        if errors:
            self._json(422, {"ok": False, "error": "Please check the highlighted fields and try again.", "errors": errors})
            return

        record = {
            "reference": _reference(),
            "receivedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "name": _clean(payload.get("name"), 80),
            "business": _clean(payload.get("business"), 120),
            "businessType": _clean(payload.get("businessType"), 40),
            "package": _clean(payload.get("package"), 40),
            "currentWebsite": _clean(payload.get("currentWebsite"), 250),
            "email": _clean(payload.get("email"), 254),
            "phone": _clean(payload.get("phone"), 40),
            "message": _clean(payload.get("message"), 500),
            "consent": True,
            "source": _clean(payload.get("source"), 500),
            "userAgent": _clean(self.headers.get("User-Agent", ""), 300),
        }

        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            with WRITE_LOCK:
                with INQUIRIES_FILE.open("a", encoding="utf-8") as handle:
                    handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                try:
                    os.chmod(INQUIRIES_FILE, 0o600)
                except OSError:
                    pass
        except OSError:
            self._json(500, {"ok": False, "error": "The inquiry could not be saved right now. Please try again shortly."})
            return

        self._json(201, {
            "ok": True,
            "reference": record["reference"],
            "receivedAt": record["receivedAt"],
            "message": "Inquiry received.",
        })

    # ---------- logging ----------
    def log_message(self, fmt: str, *args) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {self.command} {self.path} → {fmt % args}", flush=True)


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    mimetypes.add_type("image/svg+xml", ".svg")
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("application/manifest+json", ".webmanifest")
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    print(f"PetersWeb Solutions running on http://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
