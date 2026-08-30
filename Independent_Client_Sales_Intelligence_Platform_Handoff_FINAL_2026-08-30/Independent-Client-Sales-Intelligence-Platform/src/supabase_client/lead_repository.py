from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pandas as pd
import streamlit as st
from postgrest.exceptions import APIError
from supabase import create_client


PAGE_SIZE = 1000


@st.cache_resource
def get_supabase_client():
    """Create cached Supabase client from Streamlit secrets."""
    url = st.secrets["supabase"]["url"]
    key = st.secrets["supabase"]["service_role_key"]
    return create_client(url, key)


def _to_dataframe(data: list[dict[str, Any]] | None) -> pd.DataFrame:
    return pd.DataFrame(data or [])


def _fetch_paginated(
    query_factory: Callable[[], Any],
    *,
    page_size: int = PAGE_SIZE,
) -> pd.DataFrame:
    """Execute a Supabase/PostgREST query in pages and return every row.

    Supabase/PostgREST commonly limits one response to 1,000 rows. Without
    explicit pagination, reports and filters silently omit later markets.
    ``query_factory`` must build a fresh query for each page so that ``range``
    is applied safely and consistently.
    """
    rows: list[dict[str, Any]] = []
    start = 0

    while True:
        response = (
            query_factory()
            .range(start, start + page_size - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)

        if len(page) < page_size:
            break

        start += page_size

    return _to_dataframe(rows)


def fetch_available_leads() -> pd.DataFrame:
    """Return all leads that are not claimed yet."""
    supabase = get_supabase_client()

    return _fetch_paginated(
        lambda: (
            supabase.table("leads")
            .select("*")
            .eq("lead_status", "available")
            .order("market")
            .order("b2b_score", desc=True)
            .order("state")
            .order("lead_id")
        )
    )


def fetch_my_leads(user_email: str) -> pd.DataFrame:
    """Return all leads assigned to one user."""
    supabase = get_supabase_client()
    normalized_email = str(user_email).strip().lower()

    return _fetch_paginated(
        lambda: (
            supabase.table("leads")
            .select("*")
            .eq("assigned_to_email", normalized_email)
            .order("assigned_at", desc=True)
            .order("lead_id")
        )
    )


def fetch_all_leads() -> pd.DataFrame:
    """Return every lead for admin reporting."""
    supabase = get_supabase_client()

    return _fetch_paginated(
        lambda: (
            supabase.table("leads")
            .select("*")
            .order("market")
            .order("created_at", desc=True)
            .order("lead_id")
        )
    )


def fetch_claim_log() -> pd.DataFrame:
    """Return the complete claim event log."""
    supabase = get_supabase_client()

    return _fetch_paginated(
        lambda: (
            supabase.table("lead_claims")
            .select("*")
            .order("claimed_at", desc=True)
        )
    )


def fetch_claim_summary() -> pd.DataFrame:
    """Return claim counts by user using the complete claim log."""
    claims = fetch_claim_log()

    if claims.empty:
        return pd.DataFrame(columns=["user_name", "user_email", "leads_claimed"])

    return (
        claims.groupby(["user_name", "user_email"], dropna=False)
        .size()
        .reset_index(name="leads_claimed")
        .sort_values("leads_claimed", ascending=False)
    )


def claim_one_lead(lead_id: str, user_email: str, user_name: str) -> dict[str, Any]:
    """Claim one lead using the atomic Supabase RPC function."""
    if not lead_id:
        return {"success": False, "message": "Missing lead_id"}

    supabase = get_supabase_client()

    try:
        response = (
            supabase.rpc(
                "claim_lead",
                {
                    "p_lead_id": lead_id,
                    "p_user_email": str(user_email).strip().lower(),
                    "p_user_name": user_name,
                },
            ).execute()
        )
    except APIError as exc:
        return {"success": False, "message": str(exc)}
    except Exception as exc:
        return {"success": False, "message": f"Unexpected claim error: {exc}"}

    if response.data is None:
        return {"success": False, "message": "No response from Supabase"}

    return response.data


def claim_many_leads(lead_ids: list[str], user_email: str, user_name: str) -> dict[str, Any]:
    """Claim multiple leads and return a safe summary."""
    claimed = 0
    failed = 0
    messages: list[str] = []

    unique_lead_ids = []
    for lead_id in lead_ids:
        lead_id = str(lead_id).strip()
        if lead_id and lead_id not in unique_lead_ids:
            unique_lead_ids.append(lead_id)

    for lead_id in unique_lead_ids:
        result = claim_one_lead(
            lead_id=lead_id,
            user_email=user_email,
            user_name=user_name,
        )
        if result.get("success"):
            claimed += 1
        else:
            failed += 1
            messages.append(f"{lead_id}: {result.get('message', 'Unknown error')}")

    return {"claimed": claimed, "failed": failed, "messages": messages}
