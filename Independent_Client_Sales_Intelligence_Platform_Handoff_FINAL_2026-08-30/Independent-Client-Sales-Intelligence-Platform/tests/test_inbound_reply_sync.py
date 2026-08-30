from email.message import EmailMessage
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from sync_inbound_replies import (
    body_text,
    build_inbound_row,
    classify_reply,
    is_automatic_reply,
    is_delivery_failure,
    is_unique_violation,
    strip_quoted_history,
)


def test_inbound_row_always_sets_generated_at():
    received = "2026-07-23T08:45:37+00:00"
    row = build_inbound_row(
        campaign_id="campaign", lead_id="lead", outbound={"sequence_number": 0, "provider_message_id": "<out>"},
        from_email="buyer@example.com", mailbox="export@example.com", subject="Re: SPC sourcing",
        text="Please send details", received_at=received, provider_message_id="<in>", category="positive_reply",
    )
    assert row["generated_at"] == received
    assert row["received_at"] == received
    assert row["generated_at"] is not None
    assert row["message_type"] == "reply"


def test_french_out_of_office_is_detected_as_auto_reply():
    msg = EmailMessage()
    msg["Subject"] = "Réponse automatique : Approvisionnement direct en sols LVT"
    assert is_automatic_reply(msg, msg["Subject"], "Bonjour, je suis absent jusqu'au 3 août.")


def test_auto_submitted_header_is_detected():
    msg = EmailMessage()
    msg["Auto-Submitted"] = "auto-replied"
    assert is_automatic_reply(msg, "Re: LVT sourcing", "Thank you for your message")


def test_undeliverable_is_bounce_not_autoreply():
    msg = EmailMessage()
    msg["Subject"] = "Undeliverable: Portfólio de pisos SPC e LVT"
    assert is_delivery_failure(msg, msg["Subject"], "Delivery has failed to these recipients")


def test_bounce_row_uses_bounced_status():
    received = "2026-07-24T07:30:14+00:00"
    row = build_inbound_row(
        campaign_id="campaign", lead_id="lead", outbound={"sequence_number": 0, "provider_message_id": "<out>"},
        from_email="postmaster@example.com", mailbox="export@example.com", subject="Undeliverable: SPC sourcing",
        text="Delivery failed", received_at=received, provider_message_id="<dsn>", category="bounce",
    )
    assert row["message_type"] == "bounce"
    assert row["status"] == "bounced"


def test_unique_violation_detection_is_narrow():
    exc = Exception("{'code': '23505', 'message': 'duplicate key value violates unique constraint uq_email_inbound_provider_message'}")
    assert is_unique_violation(exc)
    assert not is_unique_violation(Exception("connection timeout"))


def test_preview_workflows_skip_imap_sync():
    root = Path(__file__).resolve().parents[1]
    for name in ("automated_email_agent.yml", "stock_promotional_agent_v15.yml"):
        text = (root / ".github" / "workflows" / name).read_text(encoding="utf-8")
        assert "if: env.PREVIEW_ONLY != 'true'" in text


def test_german_outlook_quote_does_not_turn_positive_reply_into_opt_out():
    thread = """Dear Adam,

overall Rigid-Core is interesting for us. Right now, we only selling SPC for click and LVT for glue down.
Do you have a license for your click-system? What is your pattern repeat for your wood designs?

Thank you.
Kind regards
Simon

________________________________
Von: Adam | Client Company <outreach@example.com>
Gesendet: Sunday, 16 August 2026 12:12:00
Betreff: LVT-Liefervergleich

Sie können antworten, wenn Sie keine weiteren Nachrichten wünschen.
"""
    human = strip_quoted_history(thread)
    assert "Von: Adam" not in human
    assert "keine weiteren Nachrichten" not in human
    assert classify_reply(thread, "AW: LVT-Liefervergleich") == "positive_reply"


def test_direct_german_opt_out_still_classifies_as_opt_out():
    assert classify_reply(
        "Bitte keine weiteren Nachrichten. Nicht mehr kontaktieren.",
        "AW: LVT-Liefervergleich",
    ) == "opt_out"


def test_body_text_strips_outlook_quoted_footer_before_storage():
    msg = EmailMessage()
    msg.set_content(
        "Dear Adam,\n\nPlease send details.\n\n"
        "________________________________\n"
        "Von: Adam | Client Company <outreach@example.com>\n"
        "Gesendet: Sunday, 16 August 2026 12:12:00\n"
        "Sie können antworten, wenn Sie keine weiteren Nachrichten wünschen.\n"
    )
    stored = body_text(msg)
    assert stored == "Dear Adam,\n\nPlease send details."
    assert "keine weiteren Nachrichten" not in stored


def test_inbound_row_uses_classifier_v3_audit_model():
    received = "2026-08-17T09:15:10+00:00"
    row = build_inbound_row(
        campaign_id="campaign", lead_id="lead", outbound={"sequence_number": 0, "provider_message_id": "<out>"},
        from_email="buyer@example.com", mailbox="export@example.com", subject="Re: LVT sourcing",
        text="Please send details", received_at=received, provider_message_id="<in>", category="positive_reply",
    )
    assert row["ai_model"] == "deterministic_reply_sync_v3"
