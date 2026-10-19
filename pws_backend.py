"""Shared helpers for the PetersWeb Vercel Python functions.

Secrets are read only from Vercel environment variables. Never import this
module from browser JavaScript or put service-role keys in public files.
"""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

MAX_JSON_BYTES = 24 * 1024
COOKIE_ACCESS = "pws_admin_access"
COOKIE_REFRESH = "pws_admin_refresh"


class PayloadError(Exception):
    pass


def config() -> dict[str, str]:
    return {
        "url": os.environ.get("SUPABASE_URL", "").strip().rstrip("/"),
        "anon": (os.environ.get("SUPABASE_PUBLISHABLE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")).strip(),
        "service": (os.environ.get("SUPABASE_SECRET_KEY", "") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")).strip(),
        "admin_email": os.environ.get("ADMIN_EMAIL", "").strip().lower(),
    }


def configured(*keys: str) -> bool:
    values = config()
    return all(values.get(key) for key in keys)


def read_json_body(handler, max_bytes: int = MAX_JSON_BYTES) -> dict[str, Any]:
    raw_length = handler.headers.get("Content-Length", "0")
    try:
        length = int(raw_length)
    except (TypeError, ValueError):
        raise PayloadError("Invalid request length.")
    if length <= 0 or length > max_bytes:
        raise PayloadError("The request is empty or too large.")
    raw = handler.rfile.read(length)
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise PayloadError("Invalid JSON request.")
    if not isinstance(value, dict):
        raise PayloadError("Invalid request format.")
    return value


def send_json(handler, status: int, payload: dict[str, Any], headers=None) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store, max-age=0")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
    if headers:
        # A sequence permits multiple Set-Cookie headers.
        items = headers.items() if isinstance(headers, dict) else headers
        for key, value in items:
            handler.send_header(key, value)
    handler.end_headers()
    if getattr(handler, "command", "GET") != "HEAD":
        handler.wfile.write(body)


def same_origin(handler) -> bool:
    origin = handler.headers.get("Origin", "").strip()
    host = handler.headers.get("Host", "").strip().lower()
    if not origin or not host:
        return False
    try:
        parts = urlsplit(origin)
        return parts.scheme in {"http", "https"} and parts.netloc.lower() == host
    except ValueError:
        return False


def _http_json(url: str, method: str = "GET", headers=None, payload=None, timeout: int = 18):
    body = None
    request_headers = {"Accept": "application/json"}
    if headers:
        request_headers.update(headers)
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    request = Request(url, data=body, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read(1024 * 1024)
            status = response.getcode()
    except HTTPError as exc:
        raw = exc.read(64 * 1024)
        status = exc.code
    except (URLError, TimeoutError, OSError):
        return 502, {"error": "upstream_unavailable"}
    try:
        parsed = json.loads(raw.decode("utf-8")) if raw else {}
    except (UnicodeDecodeError, json.JSONDecodeError):
        parsed = {}
    return status, parsed


def auth_request(path: str, method: str = "GET", payload=None, access_token: str = ""):
    values = config()
    if not values["url"] or not values["anon"]:
        return 503, {"error": "not_configured"}
    headers = {"apikey": values["anon"]}
    if access_token:
        headers["Authorization"] = "Bearer " + access_token
    return _http_json(values["url"] + "/auth/v1/" + path.lstrip("/"), method, headers, payload)


def database_request(path: str, method: str = "GET", payload=None, prefer: str = ""):
    values = config()
    if not values["url"] or not values["service"]:
        return 503, {"error": "not_configured"}
    # New Supabase secret keys are opaque sb_secret_... values and belong only
    # in the apikey header. Legacy service_role JWTs are still accepted in both
    # apikey and Authorization headers.
    headers = {"apikey": values["service"]}
    if not values["service"].startswith("sb_secret_"):
        headers["Authorization"] = "Bearer " + values["service"]
    if prefer:
        headers["Prefer"] = prefer
    return _http_json(values["url"] + "/rest/v1/" + path.lstrip("/"), method, headers, payload)


def cookie_values(handler) -> dict[str, str]:
    cookie = SimpleCookie()
    try:
        cookie.load(handler.headers.get("Cookie", ""))
    except Exception:
        return {}
    return {key: morsel.value for key, morsel in cookie.items()}


def _secure_cookie_suffix(handler) -> str:
    forwarded = handler.headers.get("X-Forwarded-Proto", "").lower()
    scheme = urlsplit(handler.headers.get("Origin", "")).scheme.lower()
    secure = forwarded == "https" or scheme == "https"
    return "; Path=/; HttpOnly; SameSite=Lax" + ("; Secure" if secure else "")


def session_cookie_headers(handler, access_token: str, refresh_token: str, expires_in: int = 3600):
    suffix = _secure_cookie_suffix(handler)
    access_age = max(60, min(int(expires_in or 3600), 86400))
    refresh_age = 30 * 24 * 60 * 60
    return [
        ("Set-Cookie", f"{COOKIE_ACCESS}={access_token}; Max-Age={access_age}{suffix}"),
        ("Set-Cookie", f"{COOKIE_REFRESH}={refresh_token}; Max-Age={refresh_age}{suffix}"),
    ]


def clear_session_cookie_headers(handler):
    suffix = _secure_cookie_suffix(handler)
    return [
        ("Set-Cookie", f"{COOKIE_ACCESS}=; Max-Age=0{suffix}"),
        ("Set-Cookie", f"{COOKIE_REFRESH}=; Max-Age=0{suffix}"),
    ]


def authenticate_admin(handler):
    """Return (user, refreshed-cookie-headers, error-code)."""
    values = config()
    if not all(values[key] for key in ("url", "anon", "service", "admin_email")):
        return None, [], "not_configured"

    cookies = cookie_values(handler)
    access = cookies.get(COOKIE_ACCESS, "")
    refresh = cookies.get(COOKIE_REFRESH, "")
    if not access and not refresh:
        return None, [], "unauthorized"

    status, user = auth_request("user", access_token=access) if access else (401, {})
    refreshed_headers = []
    if status != 200 and refresh:
        refresh_status, tokens = auth_request(
            "token?grant_type=refresh_token",
            method="POST",
            payload={"refresh_token": refresh},
        )
        if refresh_status == 200 and isinstance(tokens, dict):
            access = str(tokens.get("access_token", ""))
            refresh = str(tokens.get("refresh_token", refresh))
            expires = int(tokens.get("expires_in", 3600) or 3600)
            if access:
                status, user = auth_request("user", access_token=access)
                refreshed_headers = session_cookie_headers(handler, access, refresh, expires)

    if status != 200 or not isinstance(user, dict):
        return None, clear_session_cookie_headers(handler), "unauthorized"
    email = str(user.get("email", "")).strip().lower()
    if not email or email != values["admin_email"]:
        return None, clear_session_cookie_headers(handler), "unauthorized"
    return user, refreshed_headers, ""


def inquiry_reference() -> str:
    return "PWS-{}-{}".format(
        datetime.now(timezone.utc).strftime("%Y%m%d"),
        secrets.token_hex(3).upper(),
    )
