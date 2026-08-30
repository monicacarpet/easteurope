from __future__ import annotations

from typing import Any

# Manual/automatic cross-agent reservation.
# A reserved claim protects a lead while an agent is preparing/sending.
# A successful send is promoted to a 14-day sent claim by the database trigger.
RESERVED_TTL_MINUTES = 120
MANUAL_QUEUE_TTL_MINUTES = 1440


def _clean(value: Any) -> str:
    return str(value or "").strip()


def acquire_lead_send_lock(
    db: Any,
    lead_id: str,
    agent_key: str,
    ttl_minutes: int = RESERVED_TTL_MINUTES,
) -> bool:
    """Fail closed and reserve a lead for exactly one outbound agent."""
    lead_id = _clean(lead_id)
    agent_key = _clean(agent_key)
    if not lead_id or agent_key not in {"lead_outreach", "stock_promotion"}:
        return False
    try:
        result = db.rpc(
            "claim_lead_send_claim",
            {
                "p_lead_id": lead_id,
                "p_agent_key": agent_key,
                "p_ttl_minutes": max(5, int(ttl_minutes)),
            },
        ).execute()
        value = result.data
        if isinstance(value, bool):
            return value
        if isinstance(value, dict):
            return bool(value.get("acquired"))
        return bool(value)
    except Exception as exc:
        print("SEND CLAIM unavailable; refusing to send:", str(exc)[:300])
        return False


def release_lead_send_lock(db: Any, lead_id: str, agent_key: str) -> None:
    """
    Release only an unsent/reserved claim.

    The SQL function deliberately keeps a 'sent' claim for the cross-agent
    cooldown period, so the existing agent finally-blocks cannot accidentally
    reopen a lead after a successful send.
    """
    lead_id = _clean(lead_id)
    agent_key = _clean(agent_key)
    if not lead_id or agent_key not in {"lead_outreach", "stock_promotion"}:
        return
    try:
        db.rpc(
            "release_lead_send_claim",
            {"p_lead_id": lead_id, "p_agent_key": agent_key},
        ).execute()
    except Exception as exc:
        print("WARNING: could not release lead send claim:", str(exc)[:300])


def manual_lock_owner(db: Any, lead_id: str) -> str:
    """Return the active claim owner, if any."""
    lead_id = _clean(lead_id)
    if not lead_id:
        return ""
    try:
        result = db.rpc(
            "get_lead_send_claim_owner",
            {"p_lead_id": lead_id},
        ).execute()
        value = result.data
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, dict):
            return _clean(value.get("agent_key"))
        return ""
    except Exception:
        return ""
