"""Public inquiry intake for Vercel. Stores validated inquiries in Supabase."""
from __future__ import annotations

import re
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit

from pws_backend import (
    PayloadError,
    config,
    database_request,
    inquiry_reference,
    read_json_body,
    same_origin,
    send_json,
)

BUSINESS_TYPES = {
    "medical", "resort", "spa", "dental", "restaurant",
    "events", "services", "retail", "other",
}
PACKAGES = {"unsure", "basic", "business", "pro", "custom"}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean(value, limit):
    if not isinstance(value, str):
        return ""
    return CONTROL_RE.sub("", value).strip()[:limit]


def validate(payload):
    fields = {
        "name": clean(payload.get("name"), 80),
        "business": clean(payload.get("business"), 120),
        "business_type": clean(payload.get("businessType"), 40),
        "package_interest": clean(payload.get("package"), 40),
        "current_website": clean(payload.get("currentWebsite"), 250),
        "email": clean(payload.get("email"), 254),
        "phone": clean(payload.get("phone"), 40),
        "message": clean(payload.get("message"), 500),
        "source": clean(payload.get("source"), 500),
    }
    errors = {}
    if len(fields["name"]) < 2:
        errors["name"] = "Please enter your full name."
    if len(fields["business"]) < 2:
        errors["business"] = "Please enter your business name."
    if fields["business_type"] not in BUSINESS_TYPES:
        errors["businessType"] = "Please choose a business category."
    if fields["package_interest"] not in PACKAGES:
        errors["package"] = "Please select a package or “Not sure yet”."
    if not fields["email"] or not EMAIL_RE.fullmatch(fields["email"]):
        errors["email"] = "Please enter a valid email address."
    digits = re.sub(r"\D", "", fields["phone"])
    if not re.fullmatch(r"[+()\d.\-\s]+", fields["phone"]) or not 7 <= len(digits) <= 15:
        errors["phone"] = "Please enter a valid mobile number, including area or country code."
    if len(fields["message"]) < 10:
        errors["message"] = "Please add a short description (at least 10 characters)."
    if payload.get("consent") is not True:
        errors["consent"] = "Please agree to be contacted about your inquiry."
    if fields["current_website"]:
        try:
            parsed = urlsplit(fields["current_website"])
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise ValueError
        except ValueError:
            errors["currentWebsite"] = "Enter a full website address starting with https://, or leave this blank."
    return fields, errors


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not same_origin(self):
            send_json(self, 403, {"ok": False, "error": "This request could not be verified. Please reload the page and try again."})
            return
        values = config()
        if not values["url"] or not values["service"]:
            send_json(self, 503, {"ok": False, "error": "Online inquiries are being set up. Please try again later or contact us through the options on this page."})
            return
        try:
            payload = read_json_body(self)
        except PayloadError as exc:
            send_json(self, 400, {"ok": False, "error": str(exc)})
            return

        # Honeypot and minimum-fill-time checks are repeated on the server.
        if clean(payload.get("company_website"), 200):
            send_json(self, 400, {"ok": False, "error": "We couldn't verify this submission. Please refresh and try again."})
            return
        try:
            started = int(payload.get("formStartedAt", 0))
        except (TypeError, ValueError):
            started = 0
        elapsed = int(time.time() * 1000) - started
        if started <= 0 or elapsed < 2000 or elapsed > 24 * 60 * 60 * 1000:
            send_json(self, 400, {"ok": False, "error": "We couldn't verify this submission. Please refresh and try again."})
            return

        fields, errors = validate(payload)
        if errors:
            send_json(self, 422, {"ok": False, "error": "Please check the highlighted fields and try again.", "errors": errors})
            return

        reference = inquiry_reference()
        record = {
            "reference": reference,
            "stage": "inbox",
            "is_read": False,
            "name": fields["name"],
            "business": fields["business"],
            "business_type": fields["business_type"],
            "package_interest": fields["package_interest"],
            "current_website": fields["current_website"],
            "email": fields["email"],
            "phone": fields["phone"],
            "message": fields["message"],
            "consent": True,
            "source": fields["source"],
        }
        status, result = database_request(
            "inquiries",
            method="POST",
            payload=record,
            prefer="return=representation",
        )
        if status not in {200, 201}:
            # Do not return database details or secrets to the public form.
            print("Inquiry save failed; Supabase returned status", status, flush=True)
            send_json(self, 500, {"ok": False, "error": "We couldn't save your inquiry right now. Please try again shortly."})
            return

        send_json(self, 201, {
            "ok": True,
            "reference": reference,
            "message": "Inquiry received.",
        })

    def do_GET(self):
        send_json(self, 405, {"ok": False, "error": "Method not allowed."}, [("Allow", "POST")])

    def log_message(self, fmt, *args):
        print("Inquiry API:", fmt % args, flush=True)
