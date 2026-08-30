#!/usr/bin/env python3
"""Synchronize IMAP replies into existing Supabase email_messages/leads.

No new tables. Designed to run immediately before outbound workers so a real
reply suppresses automated follow-ups and becomes visible in campaign analytics.
"""
from __future__ import annotations

import email
import imaplib
import os
import re
from datetime import datetime, timedelta, timezone
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from html import unescape
from typing import Any

IMAP_HOST = os.environ.get("MAIL_IMAP_HOST", "")
IMAP_PORT = int(os.environ.get("MAIL_IMAP_PORT", "993"))


def clean(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def lower(value: Any) -> str:
    return clean(value).lower()


def decode_value(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def strip_quoted_history(text: str) -> str:
    """Return only the newly written human reply, excluding quoted message history.

    Outlook/Gmail and localized mail clients often quote our previous message with
    headers such as ``Von: Adam ...`` or ``From: Adam ...``.  Classifying the
    entire thread can therefore mistake *our own* opt-out footer for a buyer
    opt-out.  This routine cuts the thread at the first strong quote boundary.
    """
    raw = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    lines = raw.split("\n")

    original_message_re = re.compile(
        r"^\s*-{2,}\s*(?:original message|urspr(?:ü|u)ngliche nachricht|"
        r"message d['’]origine|mensaje original|mensagem original|"
        r"oorspronkelijk bericht|messaggio originale)\s*-{2,}\s*$",
        re.IGNORECASE,
    )
    reply_header_re = re.compile(
        r"^\s*(?:from|von|de|da|van|fra|från|od|exp(?:é|e)diteur)\s*:\s*.+$",
        re.IGNORECASE,
    )
    wrote_re = re.compile(
        r"^\s*(?:on .+wrote:|le .+a écrit\s*:|am .+schrieb .+:|"
        r"el .+escribi[oó]\s*:|em .+escreveu\s*:|op .+schreef .+:)\s*$",
        re.IGNORECASE,
    )
    divider_re = re.compile(r"^\s*_{8,}\s*$")

    cut_at = len(lines)
    for idx, line in enumerate(lines):
        if original_message_re.match(line) or wrote_re.match(line):
            cut_at = idx
            break
        if reply_header_re.match(line):
            # Header lines are a strong quote boundary when they occur after
            # actual reply content (the normal Outlook/Gmail layout).
            if any(previous.strip() for previous in lines[:idx]):
                cut_at = idx
                break
        if divider_re.match(line):
            # Outlook commonly places a long underscore divider immediately
            # before the quoted From/Von/De header.  Only cut when that header
            # is visible in the next few lines so a decorative divider in the
            # sender's own signature cannot truncate a legitimate reply.
            lookahead = lines[idx + 1 : idx + 5]
            if any(reply_header_re.match(candidate) for candidate in lookahead):
                cut_at = idx
                break

    return "\n".join(lines[:cut_at]).strip()


def body_text(msg: email.message.Message) -> str:
    parts: list[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = lower(part.get("Content-Disposition"))
            if "attachment" in disp or ctype not in {"text/plain", "text/html"}:
                continue
            try:
                payload = part.get_payload(decode=True) or b""
                charset = part.get_content_charset() or "utf-8"
                text = payload.decode(charset, errors="replace")
            except Exception:
                continue
            if ctype == "text/plain":
                parts.insert(0, text)
            elif not parts:
                parts.append(re.sub(r"<[^>]+>", " ", unescape(text)))
    else:
        payload = msg.get_payload(decode=True) or b""
        charset = msg.get_content_charset() or "utf-8"
        text = payload.decode(charset, errors="replace")
        if msg.get_content_type() == "text/html":
            text = re.sub(r"<[^>]+>", " ", unescape(text))
        parts.append(text)
    text = strip_quoted_history("\n".join(parts))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()[:12000]



def is_delivery_failure(msg: email.message.Message, subject: str, text: str) -> bool:
    """Detect delivery-status notifications/bounces before generic auto-replies."""
    ctype = lower(msg.get("Content-Type"))
    if "report-type=delivery-status" in ctype or msg.get_content_type() == "message/delivery-status":
        return True
    n = lower(f"{subject} {text[:2400]}")
    markers = (
        "undeliverable", "delivery status notification", "delivery failure", "mail delivery failed",
        "message not delivered", "returned mail", "failure notice", "recipient address rejected",
        "user unknown", "mailbox unavailable", "adresse introuvable", "non remis", "unzustellbar",
        "zustellung nicht möglich", "zustellung nicht moeglich", "no se pudo entregar",
        "correo no entregado", "não entregue", "nao entregue", "niet bezorgd", "mancata consegna",
    )
    return any(marker in n for marker in markers)


def is_unique_violation(exc: Exception) -> bool:
    """Return True only for Postgres unique-constraint races (SQLSTATE 23505)."""
    code = getattr(exc, "code", None)
    if code == "23505":
        return True
    args = getattr(exc, "args", ())
    text = " ".join(str(x) for x in args) + " " + str(exc)
    return "23505" in text and "duplicate key value violates unique constraint" in text.lower()


def is_automatic_reply(msg: email.message.Message, subject: str, text: str) -> bool:
    """Detect common out-of-office / autoresponder messages across target markets."""
    auto_submitted = lower(msg.get("Auto-Submitted"))
    if auto_submitted and auto_submitted != "no":
        return True
    if msg.get("X-Autoreply") is not None or msg.get("X-Autorespond") is not None:
        return True
    n = lower(f"{subject} {text[:1800]}")
    markers = (
        "automatic reply", "auto reply", "out of office", "out-of-office", "away from the office",
        "réponse automatique", "reponse automatique", "absence du bureau", "je suis absent", "je suis absente",
        "automatische antwort", "abwesenheitsnotiz", "nicht im büro", "nicht im buero",
        "respuesta automática", "respuesta automatica", "fuera de la oficina", "estoy ausente",
        "resposta automática", "resposta automatica", "fora do escritório", "fora do escritorio",
        "automatisch antwoord", "afwezigheidsbericht", "ik ben afwezig",
        "risposta automatica", "fuori sede", "sono assente",
        "automatyczna odpowiedź", "automatyczna odpowiedz", "poza biurem",
    )
    return any(marker in n for marker in markers)


def build_inbound_row(
    *,
    campaign_id: str,
    lead_id: str,
    outbound: dict[str, Any],
    from_email: str,
    mailbox: str,
    subject: str,
    text: str,
    received_at: str,
    provider_message_id: str,
    category: str,
) -> dict[str, Any]:
    """Build a schema-valid email_messages row for an inbound IMAP message."""
    return {
        "campaign_id": campaign_id,
        "lead_id": lead_id,
        "direction": "inbound",
        "sequence_number": int(outbound.get("sequence_number") or 0),
        "message_type": "bounce" if category == "bounce" else ("auto_reply" if category == "auto_reply" else "reply"),
        "sender_email": from_email,
        "recipient_email": mailbox,
        "subject": subject,
        "body_text": text,
        "status": "bounced" if category == "bounce" else "received",
        "provider": "imap",
        "provider_message_id": provider_message_id,
        "provider_thread_id": clean(outbound.get("provider_message_id")),
        "ai_model": "deterministic_reply_sync_v3",
        # email_messages.generated_at is NOT NULL in production.  For inbound
        # mail the message's received timestamp is the correct generation time.
        "generated_at": received_at,
        "sent_at": None,
        "received_at": received_at,
        "error_message": None,
    }

def classify_reply(text: str, subject: str) -> str:
    # Defense in depth: classify only newly written content even if a caller
    # passes an untrimmed raw thread instead of body_text().
    human_text = strip_quoted_history(text)
    n = lower(f"{subject} {human_text}")
    optout = ("unsubscribe", "remove me", "do not contact", "stop emailing", "no more emails", "ne me contactez plus",
              "nicht mehr kontaktieren", "keine weiteren nachrichten", "no volver a contactar", "não volte a contactar",
              "geen contact meer", "nie kontaktować")
    negative = ("not interested", "no interest", "not relevant", "kein interesse", "nicht relevant", "pas intéressé",
                "pas interesse", "no nos interesa", "no me interesa", "não temos interesse", "nao temos interesse")
    positive = ("interested", "interesting for us", "interesting to us", "send details", "send me", "please send",
                "quote", "quotation", "price list", "samples", "intéress", "envoyez", "offre",
                "interessiert", "interessant für uns", "interessant fuer uns", "angebot", "muster",
                "interesado", "muestras", "interessado", "amostras", "interesse", "interested in")
    if any(x in n for x in optout):
        return "opt_out"
    if any(x in n for x in negative):
        return "negative_reply"
    if any(x in n for x in positive):
        return "positive_reply"
    return "reply_received"


def iso_message_date(msg: email.message.Message) -> str:
    try:
        dt = parsedate_to_datetime(msg.get("Date"))
        if dt is None:
            raise ValueError
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def find_outbound(db: Any, campaign_id: str, from_email: str, refs: list[str]) -> dict[str, Any] | None:
    for ref in refs:
        ref = clean(ref)
        if not ref:
            continue
        rows = (db.table("email_messages").select("*")
                .eq("campaign_id", campaign_id).eq("direction", "outbound")
                .eq("provider_message_id", ref).order("sent_at", desc=True).limit(1).execute()).data or []
        if rows:
            return rows[0]
    if from_email:
        rows = (db.table("email_messages").select("*")
                .eq("campaign_id", campaign_id).eq("direction", "outbound")
                .eq("recipient_email", from_email).eq("status", "sent")
                .order("sent_at", desc=True).limit(1).execute()).data or []
        if rows:
            return rows[0]
    return None


def main() -> None:
    # Import the database client only for the production path so pure parsing/
    # regression tests can run without network SDK initialization.
    from supabase import create_client

    mailbox = lower(os.environ.get("MAIL_SYNC_EMAIL"))
    password = clean(os.environ.get("MAIL_SYNC_SECURITY_PASSWORD"))
    if not mailbox or not password or not IMAP_HOST:
        raise RuntimeError(
            "MAIL_SYNC_EMAIL, MAIL_SYNC_SECURITY_PASSWORD, and MAIL_IMAP_HOST are required"
        )
    db = create_client(clean(os.environ["SUPABASE_URL"]), clean(os.environ["SUPABASE_SERVICE_ROLE_KEY"]))

    controls = (
        db.table("campaign_controls")
        .select("control_key,campaign_name,sender_email,runtime_settings")
        .eq("sender_email", mailbox)
        .limit(1)
        .execute()
    ).data or []
    if not controls:
        raise RuntimeError(f"No campaign_controls row is configured for mailbox {mailbox}")
    control = controls[0]
    campaign_name = clean(control.get("campaign_name"))
    settings = control.get("runtime_settings") if isinstance(control.get("runtime_settings"), dict) else {}
    if not campaign_name:
        raise RuntimeError(f"Campaign control for {mailbox} has no campaign_name")
    try:
        lookback_days = int(settings["reply_sync_lookback_days"])
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError("campaign_controls.runtime_settings.reply_sync_lookback_days is required") from exc
    if not 1 <= lookback_days <= 90:
        raise RuntimeError("reply_sync_lookback_days must be between 1 and 90")

    campaigns = (db.table("email_campaigns").select("id,name").eq("name", campaign_name).limit(1).execute()).data or []
    if not campaigns:
        raise RuntimeError(f"Campaign not found: {campaign_name}")
    campaign_id = clean(campaigns[0]["id"])

    since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%d-%b-%Y")
    inserted = matched = duplicates = bounces = 0
    with imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT) as imap:
        imap.login(mailbox, password)
        typ, _ = imap.select("INBOX", readonly=True)
        if typ != "OK":
            raise RuntimeError("Could not select configured mail provider INBOX")
        typ, data = imap.search(None, "SINCE", since)
        if typ != "OK":
            raise RuntimeError("IMAP search failed")
        ids = (data[0] or b"").split()
        for num in ids[-1000:]:
            typ, payload = imap.fetch(num, "(RFC822)")
            if typ != "OK" or not payload or not isinstance(payload[0], tuple):
                continue
            msg = email.message_from_bytes(payload[0][1])
            from_email = lower(parseaddr(decode_value(msg.get("From")))[1])
            if not from_email or from_email == mailbox:
                continue
            inbound_mid = clean(msg.get("Message-ID"))
            if inbound_mid:
                existing = (db.table("email_messages").select("id").eq("direction", "inbound")
                            .eq("provider_message_id", inbound_mid).limit(1).execute()).data or []
                if existing:
                    continue
            refs = [clean(msg.get("In-Reply-To"))]
            refs.extend(re.findall(r"<[^>]+>", clean(msg.get("References"))))
            outbound = find_outbound(db, campaign_id, from_email, refs)
            if not outbound:
                continue
            lead_id = clean(outbound.get("lead_id"))
            if not lead_id:
                continue
            subject = decode_value(msg.get("Subject"))[:500]
            text = body_text(msg)
            received_at = iso_message_date(msg)
            if is_delivery_failure(msg, subject, text):
                category = "bounce"
            elif is_automatic_reply(msg, subject, text):
                category = "auto_reply"
            else:
                category = classify_reply(text, subject)
            provider_message_id = inbound_mid or f"imap:{mailbox}:{num.decode()}"
            row = build_inbound_row(
                campaign_id=campaign_id,
                lead_id=lead_id,
                outbound=outbound,
                from_email=from_email,
                mailbox=mailbox,
                subject=subject,
                text=text,
                received_at=received_at,
                provider_message_id=provider_message_id,
                category=category,
            )
            try:
                db.table("email_messages").insert(row).execute()
            except Exception as exc:
                # A second runner can see the same IMAP message between our
                # existence check and INSERT.  The inbound Message-ID unique
                # index is the final idempotency guard; duplicate races are safe
                # to skip, while every other database error remains fail-closed.
                if is_unique_violation(exc):
                    duplicates += 1
                    continue
                raise

            # Delivery failures are not buyer replies, but they must stop further
            # automated sending to the bad address until it is corrected.
            if category == "bounce":
                db.table("leads").update({
                    "email_status": "bounced",
                    "email_verified": False,
                    "email_verification_status": "bounced",
                    "reply_category": "bounce",
                    "next_followup_at": None,
                    "ai_outreach_enabled": False,
                }).eq("lead_id", lead_id).execute()
                bounces += 1
            # Auto-replies are recorded for audit but must not permanently stop a
            # sequence or masquerade as a human sales response. Human replies do.
            elif category != "auto_reply":
                lead_update: dict[str, Any] = {
                    "last_reply_at": received_at,
                    "reply_category": category,
                    "next_followup_at": None,
                    "ai_outreach_enabled": False,
                }
                if category == "opt_out":
                    lead_update["do_not_contact"] = True
                db.table("leads").update(lead_update).eq("lead_id", lead_id).execute()
            inserted += 1
            matched += 1
    print(
        f"Inbound sync complete: matched={matched}, inserted={inserted}, duplicates={duplicates}, "
        f"bounces={bounces}, mailbox={mailbox}, campaign={campaign_name}"
    )


if __name__ == "__main__":
    main()
