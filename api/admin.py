"""Private admin API for the PetersWeb dashboard.

All database access is server-side. Requests require a Supabase-authenticated
session for the single ADMIN_EMAIL configured in Vercel.
"""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler
from urllib.parse import quote

from pws_backend import (
    PayloadError,
    auth_request,
    authenticate_admin,
    clear_session_cookie_headers,
    config,
    configured,
    database_request,
    read_json_body,
    same_origin,
    send_json,
    session_cookie_headers,
)

STAGES = {"inbox", "standby", "ongoing", "finished"}
NEXT_STAGES = {
    "inbox": {"standby", "ongoing"},
    "standby": {"ongoing"},
    "ongoing": {"finished"},
    "finished": set(),
}
PACKAGES = {"unsure", "basic", "pro", "business", "custom"}
PAYMENT_LABELS = {"Down payment", "Installment", "Final payment", "Other"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def _amount(value, allow_empty=False):
    if value is None or value == "":
        if allow_empty:
            return None
        raise ValueError("Enter a payment amount.")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Enter a valid amount in PHP.")
    if not amount.is_finite() or amount < 0 or amount > Decimal("100000000"):
        raise ValueError("Enter a valid non-negative amount.")
    return float(amount.quantize(Decimal("0.01")))


def _text(value, limit):
    if not isinstance(value, str):
        return ""
    return "".join(ch for ch in value if ch >= " " or ch in "\t\n\r").strip()[:limit]


def _normalize_addons(value):
    if not isinstance(value, list) or len(value) > 30:
        raise ValueError("Add-ons must be a list of up to 30 items.")
    result = []
    for row in value:
        if not isinstance(row, dict):
            continue
        name = _text(row.get("name"), 100)
        if not name:
            continue
        result.append({"name": name, "amount": _amount(row.get("amount", 0))})
    return result


def _normalize_payments(value):
    if not isinstance(value, list) or len(value) > 100:
        raise ValueError("Payments must be a list of up to 100 entries.")
    result = []
    for row in value:
        if not isinstance(row, dict):
            continue
        amount = _amount(row.get("amount"))
        label = _text(row.get("label", "Other"), 40)
        if label not in PAYMENT_LABELS:
            label = "Other"
        paid_on = _text(row.get("date", ""), 10)
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", paid_on):
            raise ValueError("Each payment needs a valid date.")
        try:
            date.fromisoformat(paid_on)
        except ValueError:
            raise ValueError("Each payment needs a valid date.")
        note = _text(row.get("note", ""), 160)
        payment_id = _text(row.get("id", ""), 64) or uuid.uuid4().hex
        result.append({"id": payment_id, "label": label, "amount": amount, "date": paid_on, "note": note})
    return result


def _normalize_changes(payload):
    changes = {}
    if "stage" in payload:
        stage = payload.get("stage")
        if stage not in STAGES:
            raise ValueError("Choose a valid project stage.")
        changes["stage"] = stage
    if "is_read" in payload:
        if not isinstance(payload.get("is_read"), bool):
            raise ValueError("Invalid read status.")
        changes["is_read"] = payload["is_read"]
    if "agreed_package" in payload:
        package = _text(payload.get("agreed_package"), 30).lower()
        if package and package not in PACKAGES:
            raise ValueError("Choose a valid package.")
        changes["agreed_package"] = package or None
    if "total_price" in payload:
        changes["total_price"] = _amount(payload.get("total_price"), allow_empty=True)
    if "addons" in payload:
        changes["addons"] = _normalize_addons(payload.get("addons"))
    if "payments" in payload:
        changes["payments"] = _normalize_payments(payload.get("payments"))
    if "domain_name" in payload:
        changes["domain_name"] = _text(payload.get("domain_name"), 253)
    if "domain_email" in payload:
        domain_email = _text(payload.get("domain_email"), 254)
        if domain_email and not EMAIL_RE.fullmatch(domain_email):
            raise ValueError("Enter a valid domain email address, or leave it blank.")
        changes["domain_email"] = domain_email
    if "admin_notes" in payload:
        changes["admin_notes"] = _text(payload.get("admin_notes"), 3000)
    if not changes:
        raise ValueError("There are no changes to save.")
    changes["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return changes


def _decorate(row):
    row = dict(row)
    try:
        paid = sum(Decimal(str(item.get("amount", 0))) for item in (row.get("payments") or []) if isinstance(item, dict))
    except (InvalidOperation, TypeError, ValueError):
        paid = Decimal("0")
    row["total_paid"] = float(paid)
    total = row.get("total_price")
    if total is None:
        row["balance"] = None
        row["payment_status"] = "Set total price"
    else:
        try:
            total_decimal = Decimal(str(total))
        except (InvalidOperation, TypeError, ValueError):
            total_decimal = Decimal("0")
        balance = total_decimal - paid
        row["balance"] = float(balance)
        if paid <= 0:
            row["payment_status"] = "Unpaid"
        elif balance > Decimal("0.005"):
            row["payment_status"] = "Partially paid"
        else:
            row["payment_status"] = "Paid"
    return row


def _login(handler, payload):
    values = config()
    if not configured("url", "anon", "service", "admin_email"):
        send_json(handler, 503, {"ok": False, "error": "Admin login is not configured yet. Complete the Supabase and Vercel setup first."})
        return
    email = _text(payload.get("email"), 254).lower()
    password = payload.get("password", "")
    if not isinstance(password, str) or len(password) > 1024:
        send_json(handler, 400, {"ok": False, "error": "Enter your admin email and password."})
        return
    if not email or email != values["admin_email"]:
        send_json(handler, 401, {"ok": False, "error": "Sign-in failed. Check the admin email and password."})
        return

    status, result = auth_request(
        "token?grant_type=password",
        method="POST",
        payload={"email": email, "password": password},
    )
    if status != 200 or not isinstance(result, dict):
        send_json(handler, 401, {"ok": False, "error": "Sign-in failed. Check the admin email and password."})
        return
    user = result.get("user") or {}
    if str(user.get("email", "")).strip().lower() != values["admin_email"]:
        send_json(handler, 401, {"ok": False, "error": "Sign-in failed. Check the admin email and password."})
        return
    access = str(result.get("access_token", ""))
    refresh = str(result.get("refresh_token", ""))
    if not access or not refresh:
        send_json(handler, 401, {"ok": False, "error": "Sign-in failed. Check the admin email and password."})
        return
    cookies = session_cookie_headers(handler, access, refresh, int(result.get("expires_in", 3600) or 3600))
    send_json(handler, 200, {"ok": True, "email": values["admin_email"]}, cookies)


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        user, cookie_headers, auth_error = authenticate_admin(self)
        if auth_error == "not_configured":
            send_json(self, 503, {"ok": False, "error": "Admin login is not configured yet. Complete the Supabase and Vercel setup first."})
            return
        if not user:
            send_json(self, 401, {"ok": False, "error": "Please sign in to view the admin dashboard."}, cookie_headers)
            return

        status, rows = database_request(
            "inquiries?select=*&order=created_at.desc&limit=1000",
            method="GET",
        )
        if status != 200 or not isinstance(rows, list):
            send_json(self, 503, {"ok": False, "error": "We couldn't load the inquiry list. Please try again."}, cookie_headers)
            return
        inquiries = [_decorate(row) for row in rows if isinstance(row, dict)]
        counts = {stage: sum(1 for row in inquiries if row.get("stage") == stage) for stage in STAGES}
        unread_count = sum(1 for row in inquiries if row.get("stage") == "inbox" and not row.get("is_read"))
        send_json(self, 200, {
            "ok": True,
            "email": str(user.get("email", "")),
            "inquiries": inquiries,
            "counts": counts,
            "unread_count": unread_count,
        }, cookie_headers)

    def do_POST(self):
        if not same_origin(self):
            send_json(self, 403, {"ok": False, "error": "This request could not be verified. Please reload the page and try again."})
            return
        try:
            payload = read_json_body(self, max_bytes=8 * 1024)
        except PayloadError as exc:
            send_json(self, 400, {"ok": False, "error": str(exc)})
            return
        action = payload.get("action")
        if action == "login":
            _login(self, payload)
            return
        if action == "logout":
            send_json(self, 200, {"ok": True}, clear_session_cookie_headers(self))
            return
        send_json(self, 400, {"ok": False, "error": "Unknown action."})

    def do_PATCH(self):
        if not same_origin(self):
            send_json(self, 403, {"ok": False, "error": "This request could not be verified. Please reload the page and try again."})
            return
        user, cookie_headers, auth_error = authenticate_admin(self)
        if auth_error == "not_configured":
            send_json(self, 503, {"ok": False, "error": "Admin login is not configured yet. Complete the Supabase and Vercel setup first."})
            return
        if not user:
            send_json(self, 401, {"ok": False, "error": "Your session has expired. Please sign in again."}, cookie_headers)
            return
        try:
            payload = read_json_body(self, max_bytes=24 * 1024)
            inquiry_id = str(uuid.UUID(str(payload.get("id", ""))))
            raw_changes = payload.get("changes")
            if not isinstance(raw_changes, dict):
                raise ValueError("Invalid update data.")
            changes = _normalize_changes(raw_changes)
        except (PayloadError, ValueError, TypeError) as exc:
            message = str(exc) or "Invalid update."
            send_json(self, 400, {"ok": False, "error": message}, cookie_headers)
            return

        # Enforce the requested forward-only workflow in the API, not just the UI.
        if "stage" in changes:
            id_filter = quote(inquiry_id, safe="")
            status, existing = database_request(
                f"inquiries?select=id,stage&id=eq.{id_filter}", method="GET"
            )
            if status != 200 or not isinstance(existing, list) or not existing:
                send_json(self, 404, {"ok": False, "error": "Inquiry not found."}, cookie_headers)
                return
            current_stage = existing[0].get("stage")
            requested_stage = changes["stage"]
            if requested_stage != current_stage and requested_stage not in NEXT_STAGES.get(current_stage, set()):
                send_json(self, 409, {"ok": False, "error": "That project stage change is not available."}, cookie_headers)
                return

        id_filter = quote(inquiry_id, safe="")
        status, updated = database_request(
            f"inquiries?id=eq.{id_filter}",
            method="PATCH",
            payload=changes,
            prefer="return=representation",
        )
        if status not in {200, 204}:
            send_json(self, 503, {"ok": False, "error": "We couldn't save those changes. Please try again."}, cookie_headers)
            return
        if isinstance(updated, list) and updated:
            row = _decorate(updated[0])
        else:
            row = None
        send_json(self, 200, {"ok": True, "inquiry": row}, cookie_headers)

    def do_OPTIONS(self):
        send_json(self, 200, {"ok": True}, [("Allow", "GET, POST, PATCH, OPTIONS")])

    def log_message(self, fmt, *args):
        print("Admin API:", fmt % args, flush=True)
