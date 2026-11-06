"""Public inquiry intake for Vercel. Stores validated inquiries in Supabase and, when configured, sends transactional email via Resend."""
from __future__ import annotations

import html
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

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
RESEND_EMAILS_URL = "https://api.resend.com/emails"
CUSTOMER_ACKNOWLEDGMENT = (
    "Thank you for reaching out to PetersWeb Solutions! We’ve received your inquiry. "
    "We’ll be in touch by email or phone so we can discuss how we can help."
)


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


def _from_address_is_valid(value):
    """Accept either a bare address or a display-name form supported by Resend."""
    if not value or "\r" in value or "\n" in value:
        return False
    match = re.search(r"<\s*([^<>]+)\s*>\s*$", value)
    address = match.group(1).strip() if match else value.strip()
    return bool(EMAIL_RE.fullmatch(address))


def _send_resend_email(api_key, email_payload):
    request = Request(
        RESEND_EMAILS_URL,
        data=json.dumps(email_payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=5) as response:
            response.read(8192)
            return 200 <= response.getcode() < 300
    except HTTPError as exc:
        # Do not log the response body, which can contain provider diagnostics.
        print("Inquiry email provider returned HTTP status", exc.code, flush=True)
    except (URLError, TimeoutError, OSError) as exc:
        print("Inquiry email provider request failed:", type(exc).__name__, flush=True)
    return False


def send_inquiry_emails(fields, reference):
    """Send the business notification and visitor acknowledgment independently."""
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    notify_email = os.environ.get("INQUIRY_NOTIFY_EMAIL", "").strip()
    from_email = os.environ.get("INQUIRY_FROM_EMAIL", "").strip()
    if not api_key or not notify_email or not from_email:
        print("Inquiry email delivery skipped: Resend environment variables are not fully configured.", flush=True)
        return {"notification_sent": False, "confirmation_sent": False}
    if not EMAIL_RE.fullmatch(notify_email) or not _from_address_is_valid(from_email):
        print("Inquiry email delivery skipped: sender or notification address is invalid.", flush=True)
        return {"notification_sent": False, "confirmation_sent": False}

    def escaped(value):
        return html.escape(str(value or "—"), quote=True)

    message_html = escaped(fields["message"]).replace("\r\n", "\n").replace("\n", "<br>")
    admin_html = """<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#182235">
<div style="max-width:640px;margin:24px auto;padding:28px;background:#fff;border:1px solid #e4e8ed;border-radius:14px">
<p style="margin:0 0 8px;color:#9a6b1e;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase">PetersWeb Solutions · New inquiry</p>
<h1 style="margin:0 0 18px;font-size:24px">A new website inquiry was submitted</h1>
<p style="margin:0 0 8px"><strong>Reference:</strong> {reference}</p>
<p style="margin:0 0 8px"><strong>Name:</strong> {name}</p>
<p style="margin:0 0 8px"><strong>Business:</strong> {business}</p>
<p style="margin:0 0 8px"><strong>Business type:</strong> {business_type}</p>
<p style="margin:0 0 8px"><strong>Package interest:</strong> {package_interest}</p>
<p style="margin:0 0 8px"><strong>Current website:</strong> {current_website}</p>
<p style="margin:0 0 8px"><strong>Email:</strong> {visitor_email}</p>
<p style="margin:0 0 8px"><strong>Mobile:</strong> {phone}</p>
<p style="margin:18px 0 6px"><strong>Project details</strong></p>
<p style="margin:0;line-height:1.6">{message}</p>
<p style="margin:22px 0 0"><a href="https://peterswebsolutions.com/admin/" style="display:inline-block;padding:11px 16px;border-radius:8px;background:#101827;color:#fff;text-decoration:none;font-weight:bold">Open admin inbox</a></p>
</div></body></html>""".format(
        reference=escaped(reference),
        name=escaped(fields["name"]),
        business=escaped(fields["business"]),
        business_type=escaped(fields["business_type"]),
        package_interest=escaped(fields["package_interest"]),
        current_website=escaped(fields["current_website"] or "Not provided"),
        visitor_email=escaped(fields["email"]),
        phone=escaped(fields["phone"]),
        message=message_html,
    )
    admin_text = "\n".join([
        "PetersWeb Solutions — New website inquiry",
        "Reference: " + reference,
        "Name: " + fields["name"],
        "Business: " + fields["business"],
        "Business type: " + fields["business_type"],
        "Package interest: " + fields["package_interest"],
        "Current website: " + (fields["current_website"] or "Not provided"),
        "Email: " + fields["email"],
        "Mobile: " + fields["phone"],
        "",
        "Project details:",
        fields["message"],
        "",
        "Open admin inbox: https://peterswebsolutions.com/admin/",
    ])

    first_name = fields["name"].split()[0]
    visitor_html = """<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#182235">
<div style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border:1px solid #e4e8ed;border-radius:14px">
<p style="margin:0 0 8px;color:#9a6b1e;font-size:12px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase">PetersWeb Solutions</p>
<h1 style="margin:0 0 16px;font-size:23px">Thanks for reaching out, {name}!</h1>
<p style="margin:0;line-height:1.7">{acknowledgment}</p>
<p style="margin:18px 0 0;color:#667085;font-size:13px">Your inquiry reference: <strong>{reference}</strong></p>
</div></body></html>""".format(
        name=escaped(first_name),
        acknowledgment=escaped(CUSTOMER_ACKNOWLEDGMENT),
        reference=escaped(reference),
    )
    visitor_text = "\n\n".join([
        "Thanks for reaching out, " + first_name + "!",
        CUSTOMER_ACKNOWLEDGMENT,
        "Your inquiry reference: " + reference,
    ])

    admin_payload = {
        "from": from_email,
        "to": [notify_email],
        "reply_to": fields["email"],
        "subject": "New website inquiry · " + reference,
        "html": admin_html,
        "text": admin_text,
    }
    visitor_payload = {
        "from": from_email,
        "to": [fields["email"]],
        "reply_to": notify_email,
        "subject": "We received your inquiry — PetersWeb Solutions",
        "html": visitor_html,
        "text": visitor_text,
    }

    try:
        # Send concurrently so a valid inquiry is not held up by two sequential API calls.
        with ThreadPoolExecutor(max_workers=2) as pool:
            notification = pool.submit(_send_resend_email, api_key, admin_payload)
            confirmation = pool.submit(_send_resend_email, api_key, visitor_payload)
            result = {
                "notification_sent": notification.result(),
                "confirmation_sent": confirmation.result(),
            }
    except Exception as exc:
        print("Inquiry email delivery failed:", type(exc).__name__, flush=True)
        return {"notification_sent": False, "confirmation_sent": False}

    print(
        "Inquiry email outcomes: notification={}, confirmation={}".format(
            "accepted" if result["notification_sent"] else "failed",
            "accepted" if result["confirmation_sent"] else "failed",
        ),
        flush=True,
    )
    return result


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

        # Keep the database record even if the email provider is missing or unavailable.
        # The public form reports whether the visitor acknowledgment was accepted by Resend.
        email_results = send_inquiry_emails(fields, reference)
        send_json(self, 201, {
            "ok": True,
            "reference": reference,
            "message": "Inquiry received.",
            "confirmation_sent": email_results["confirmation_sent"],
        })

    def do_GET(self):
        send_json(self, 405, {"ok": False, "error": "Method not allowed."}, [("Allow", "POST")])

    def log_message(self, fmt, *args):
        print("Inquiry API:", fmt % args, flush=True)
