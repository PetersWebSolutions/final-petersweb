"""Private admin API for the PetersWeb dashboard.

All database access is server-side. Requests require a Supabase-authenticated
session for the single ADMIN_EMAIL configured in Vercel.
"""
from __future__ import annotations

import calendar
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

STAGES = {"inbox", "standby", "ongoing", "finished", "finished_monthly"}
NEXT_STAGES = {
    "inbox": {"standby", "ongoing"},
    "standby": {"ongoing"},
    "ongoing": {"finished", "finished_monthly"},
    "finished_monthly": {"finished"},
    "finished": set(),
}
PACKAGES = {"unsure", "basic", "pro", "business", "custom"}
PAYMENT_TYPES = {"down_payment", "installment", "final_payment", "monthly"}
PAYMENT_SCOPES = {"project", "recurring"}
PAYMENT_STATUSES = {"due", "paid"}
LEGACY_PAYMENT_TYPES = {
    "down payment": "down_payment",
    "installment": "installment",
    "final payment": "final_payment",
    "other": "installment",
}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


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


def _valid_date(value, label, required=False):
    text = _text(value, 10)
    if not text:
        if required:
            raise ValueError(f"{label} is required.")
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        raise ValueError(f"Enter a valid {label.lower()}.")
    try:
        date.fromisoformat(text)
    except ValueError:
        raise ValueError(f"Enter a valid {label.lower()}.")
    return text


def _payment_type(value):
    raw = _text(value, 40).lower().replace("-", "_").replace(" ", "_")
    if raw in PAYMENT_TYPES:
        return raw
    legacy = LEGACY_PAYMENT_TYPES.get(_text(value, 40).lower())
    return legacy or "installment"


def _payment_id(value):
    candidate = _text(value, 64)
    if candidate and ID_RE.fullmatch(candidate):
        return candidate
    return uuid.uuid4().hex


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
    """Validate the new due/received schedule while accepting old UI payloads."""
    if not isinstance(value, list) or len(value) > 100:
        raise ValueError("Payments must be a list of up to 100 entries.")
    result = []
    for row in value:
        if not isinstance(row, dict):
            raise ValueError("Each payment must be a valid payment row.")
        raw_type = row.get("type", row.get("label", "installment"))
        payment_type = _payment_type(raw_type)
        payment_id = _payment_id(row.get("id"))
        raw_scope = _text(row.get("scope", ""), 20).lower()
        scope = raw_scope if raw_scope in PAYMENT_SCOPES else ("recurring" if payment_type == "monthly" else "project")
        raw_status = _text(row.get("status", ""), 16).lower()
        if not raw_status:
            raw_status = "paid" if row.get("date") and not row.get("due_date") else "due"
        if raw_status not in PAYMENT_STATUSES:
            raise ValueError("Choose Due or Paid for each payment.")
        amount = _amount(row.get("amount"))
        due_date = _valid_date(row.get("due_date", row.get("date", "")), "Next payment date", required=True)
        received_date = _valid_date(
            row.get("received_date", row.get("date", "") if raw_status == "paid" else ""),
            "Received date",
            required=(raw_status == "paid"),
        )
        if raw_status != "paid":
            received_date = None
        series_id = _text(row.get("series_id", ""), 64)
        if series_id and not ID_RE.fullmatch(series_id):
            series_id = ""
        if payment_type == "monthly" and not series_id:
            series_id = payment_id
        generated_from = _text(row.get("generated_from", ""), 64)
        if generated_from and not ID_RE.fullmatch(generated_from):
            generated_from = ""
        result.append({
            "id": payment_id,
            "type": payment_type,
            "scope": scope,
            "amount": amount,
            "due_date": due_date,
            "status": raw_status,
            "received_date": received_date,
            "series_id": series_id,
            "generated_from": generated_from,
        })
    return result


def _display_payments(value):
    """Return canonical rows for the UI, preserving historic legacy payments."""
    if not isinstance(value, list):
        return []
    result = []
    for row in value[:100]:
        if not isinstance(row, dict):
            continue
        try:
            amount = _amount(row.get("amount"))
        except ValueError:
            continue
        legacy = not any(key in row for key in ("due_date", "status", "scope", "type", "received_date"))
        if legacy:
            paid_date = _valid_date(row.get("date", ""), "Payment date", required=False)
            if not paid_date:
                continue
            old_label = _text(row.get("label", "Installment"), 40).lower()
            result.append({
                "id": _payment_id(row.get("id")),
                "type": LEGACY_PAYMENT_TYPES.get(old_label, "installment"),
                "scope": "project",
                "amount": amount,
                "due_date": paid_date,
                "status": "paid",
                "received_date": paid_date,
                "series_id": "",
                "generated_from": "",
            })
            continue
        try:
            due_date = _valid_date(row.get("due_date", row.get("date", "")), "Next payment date", required=True)
            payment_status = _text(row.get("status", "due"), 16).lower()
            if payment_status not in PAYMENT_STATUSES:
                payment_status = "due"
            received_date = _valid_date(row.get("received_date", row.get("date", "") if payment_status == "paid" else ""), "Received date", required=False)
            if payment_status == "paid" and not received_date:
                received_date = due_date
            if payment_status != "paid":
                received_date = None
        except ValueError:
            continue
        payment_type = _payment_type(row.get("type", row.get("label", "installment")))
        scope = _text(row.get("scope", "project"), 20).lower()
        if scope not in PAYMENT_SCOPES:
            scope = "project"
        series_id = _text(row.get("series_id", ""), 64)
        if payment_type == "monthly" and not series_id:
            series_id = _payment_id(row.get("id"))
        generated_from = _text(row.get("generated_from", ""), 64)
        result.append({
            "id": _payment_id(row.get("id")),
            "type": payment_type,
            "scope": scope,
            "amount": amount,
            "due_date": due_date,
            "status": payment_status,
            "received_date": received_date,
            "series_id": series_id,
            "generated_from": generated_from if ID_RE.fullmatch(generated_from) else "",
        })
    return result


def _paid_total(payments, scope=None):
    total = Decimal("0")
    for row in payments:
        if row.get("status") != "paid" or (scope and row.get("scope") != scope):
            continue
        try:
            total += Decimal(str(row.get("amount", 0)))
        except (InvalidOperation, ValueError, TypeError):
            continue
    return total


def _add_one_month(value):
    due = date.fromisoformat(value)
    target_month = due.month % 12 + 1
    target_year = due.year + (1 if due.month == 12 else 0)
    last_day = calendar.monthrange(target_year, target_month)[1]
    return date(target_year, target_month, min(due.day, last_day)).isoformat()


def _auto_advance_monthly(previous, submitted, total_price):
    """Create a next-month due row only when a scheduled Monthly row is newly paid."""
    old_by_id = {row.get("id"): row for row in previous if row.get("id")}
    result = list(submitted)
    newly_paid_by_series = {}
    for row in submitted:
        old = old_by_id.get(row.get("id"))
        if (row.get("type") == "monthly" and row.get("status") == "paid"
                and old and old.get("status") != "paid"):
            series = row.get("series_id") or row.get("id")
            current = newly_paid_by_series.get(series)
            if current is None or row.get("due_date", "") > current.get("due_date", ""):
                newly_paid_by_series[series] = row
    for paid_row in newly_paid_by_series.values():
        series = paid_row.get("series_id") or paid_row.get("id")
        due_date = paid_row.get("due_date") or ""
        if any(row.get("series_id") == series and row.get("status") == "due"
               and row.get("due_date", "") >= due_date for row in result):
            continue
        if len(result) >= 100:
            continue
        next_type = "monthly"
        next_amount = Decimal(str(paid_row.get("amount", 0)))
        if paid_row.get("scope") == "project" and total_price is not None:
            try:
                total = Decimal(str(total_price))
                remaining = total - _paid_total(result, "project")
            except (InvalidOperation, ValueError, TypeError):
                remaining = Decimal("0")
            if remaining <= Decimal("0.005"):
                continue
            if next_amount > remaining:
                next_amount = remaining
            if remaining <= Decimal(str(paid_row.get("amount", 0))) + Decimal("0.005"):
                next_type = "final_payment"
        try:
            next_due = _add_one_month(due_date)
        except (ValueError, TypeError):
            continue
        result.append({
            "id": uuid.uuid4().hex,
            "type": next_type,
            "scope": paid_row.get("scope", "project"),
            "amount": float(next_amount.quantize(Decimal("0.01"))),
            "due_date": next_due,
            "status": "due",
            "received_date": None,
            "series_id": series,
            "generated_from": paid_row.get("id", ""),
        })
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
    if "domain_provider" in payload:
        changes["domain_provider"] = _text(payload.get("domain_provider"), 100)
    if "domain_renewal_date" in payload:
        changes["domain_renewal_date"] = _valid_date(payload.get("domain_renewal_date"), "Domain renewal date", required=False)
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
    payments = _display_payments(row.get("payments"))
    row["payments"] = payments
    paid_project = _paid_total(payments, "project")
    paid_all = _paid_total(payments)
    row["total_paid"] = float(paid_project)
    row["total_received"] = float(paid_all)
    total = row.get("total_price")
    if total is None:
        row["balance"] = None
        row["payment_status"] = "Set total price"
    else:
        try:
            total_decimal = Decimal(str(total))
        except (InvalidOperation, TypeError, ValueError):
            total_decimal = Decimal("0")
        balance = total_decimal - paid_project
        row["balance"] = float(balance)
        if paid_project <= 0:
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
            payload = read_json_body(self, max_bytes=40 * 1024)
            inquiry_id = str(uuid.UUID(str(payload.get("id", ""))))
            raw_changes = payload.get("changes")
            if not isinstance(raw_changes, dict):
                raise ValueError("Invalid update data.")
            changes = _normalize_changes(raw_changes)
        except (PayloadError, ValueError, TypeError) as exc:
            message = str(exc) or "Invalid update."
            send_json(self, 400, {"ok": False, "error": message}, cookie_headers)
            return

        existing = None
        needs_existing = "stage" in changes or "payments" in changes
        if needs_existing:
            id_filter = quote(inquiry_id, safe="")
            status, existing_rows = database_request(
                f"inquiries?select=id,stage,total_price,payments,ongoing_at,completed_at&id=eq.{id_filter}", method="GET"
            )
            if status != 200 or not isinstance(existing_rows, list) or not existing_rows:
                send_json(self, 404, {"ok": False, "error": "Inquiry not found."}, cookie_headers)
                return
            existing = existing_rows[0]

        if existing and "payments" in changes:
            old_payments = _display_payments(existing.get("payments"))
            effective_total = changes.get("total_price", existing.get("total_price"))
            changes["payments"] = _auto_advance_monthly(old_payments, changes["payments"], effective_total)

        if existing and "stage" in changes:
            current_stage = existing.get("stage")
            requested_stage = changes["stage"]
            if requested_stage != current_stage and requested_stage not in NEXT_STAGES.get(current_stage, set()):
                send_json(self, 409, {"ok": False, "error": "That project stage change is not available."}, cookie_headers)
                return
            if requested_stage != current_stage:
                effective_payments = changes.get("payments", _display_payments(existing.get("payments")))
                effective_total = changes.get("total_price", existing.get("total_price"))
                project_paid = _paid_total(effective_payments, "project")
                due_rows = [row for row in effective_payments if row.get("status") == "due"]
                monthly_due = [row for row in due_rows if row.get("type") == "monthly"]
                now_text = datetime.now(timezone.utc).isoformat(timespec="seconds")
                if requested_stage == "finished":
                    if effective_total is None or project_paid + Decimal("0.005") < Decimal(str(effective_total)):
                        send_json(self, 409, {"ok": False, "error": "Finished Projects are for projects paid in full. Record the project payments and clear the balance first."}, cookie_headers)
                        return
                    if due_rows:
                        send_json(self, 409, {"ok": False, "error": "There are still scheduled payments due. Clear or remove them before moving this project to Finished."}, cookie_headers)
                        return
                if requested_stage == "finished_monthly" and not monthly_due:
                    send_json(self, 409, {"ok": False, "error": "Add at least one unpaid Monthly payment row before moving this project to Finished Projects with monthly payments."}, cookie_headers)
                    return
                if requested_stage == "ongoing" and not existing.get("ongoing_at"):
                    changes["ongoing_at"] = now_text
                if requested_stage in {"finished", "finished_monthly"} and not existing.get("completed_at"):
                    changes["completed_at"] = now_text

        inquiry_id_filter = quote(inquiry_id, safe="")
        status, updated = database_request(
            f"inquiries?id=eq.{inquiry_id_filter}",
            method="PATCH",
            payload=changes,
            prefer="return=representation",
        )
        if status not in {200, 204}:
            send_json(self, 503, {"ok": False, "error": "We couldn't save those changes. Please try again."}, cookie_headers)
            return
        row = _decorate(updated[0]) if isinstance(updated, list) and updated else None
        send_json(self, 200, {"ok": True, "inquiry": row}, cookie_headers)

    def do_OPTIONS(self):
        send_json(self, 200, {"ok": True}, [("Allow", "GET, POST, PATCH, OPTIONS")])

    def log_message(self, fmt, *args):
        print("Admin API:", fmt % args, flush=True)
