#!/usr/bin/env python3
"""Fail CI when mutable outbound business policy leaks back into runtime code/YAML.

This is intentionally scoped to production outbound configuration. Protocol constants
(SMTP/IMAP hosts, status enums, language/currency standards) are not business state
and are not prohibited here.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CHECKS: list[tuple[str, str, str]] = [
    ("scripts/automated_email_agent.py", r"\b(?:FRANCE_TOP_PRIORITY_COUNTRIES|FAIR_PRIORITY_END_DATE|DEFAULT_DAILY_EMAIL_LIMIT|DEFAULT_CAMPAIGN_TIMEZONE|COMPANY_CONTACT_COOLDOWN_DAYS|FOLLOWUP_1_DAYS|FOLLOWUP_2_DAYS|RECENT_SUBJECT_LOOKBACK_DAYS|MAX_LOW_VALUE_TARGETS_PER_RUN|MAX_SAME_SALES_ANGLE_PER_RUN|MAX_DRAFT_SIMILARITY|DEFAULT_CONTACT_NAME|DEFAULT_CONTACT_EMAIL|DEFAULT_CONTACT_PHONE|DEFAULT_CONTACT_TITLE|MANUAL_QUEUE_SCAN_LIMIT)\b|preferred_send_window|09:30-11:30", "export mutable business constant"),
    ("scripts/stock_promotional_agent_v15.py", r"\b(?:NORMAL_PRODUCTION_MOQ_M2|DEFAULT_DAILY_LIMIT|DEFAULT_CAMPAIGN_TIMEZONE|DEFAULT_CROSS_CAMPAIGN_COOLDOWN_DAYS|DEFAULT_SAME_STOCK_ITEM_COOLDOWN_DAYS|DEFAULT_MAX_PER_COUNTRY|DEFAULT_MAX_PER_ITEM|DEFAULT_MATCH_SCORE|DEFAULT_CATEGORY_FIT_SCORE|RECENT_SUBJECT_LOOKBACK_DAYS|MAX_BODY_SIMILARITY|DEFAULT_SENDER_NAME|DEFAULT_REPLY_TO|DEFAULT_PHONE|DEFAULT_JOB_TITLE|DEFAULT_FX_MAX_AGE_DAYS|MANUAL_QUEUE_SCAN_LIMIT)\b", "stock mutable business constant"),
    ("scripts/build_stock_inventory_snapshot.py", r"SOURCE_EFFECTIVE_DATE\s*=\s*date\(|inventory_20260803|daily_limit\s*=\s*5|v_sender_email\s+text\s*:=", "inventory builder hardcoded runtime state"),
    ("web/src/services/api.js", r"\bCLIENT_PRICE_CNY\b|\bCLIENT_PRICE_LIST_RULES\b", "frontend hardcoded price table"),
    ("web/src/services/clientPriceList.js", r"\bAPPROVED_CLIENT_PRICE_RULES_CNY\b|effective 2024-08-01", "frontend hardcoded approved price table/date"),
    ("web/src/layouts/stock/index.js", r"\bCLIENT_PRICE_FX_DATE\b|\bCLIENT_PRICE_FX\b", "frontend stale FX table"),
    (".github/workflows/automated_email_agent.yml", r"DAILY_EMAIL_LIMIT(?:=|:)|LOCAL_SEND_(?:START_HOUR|END_HOUR|WEEKDAYS)|SAME_COMPANY_COOLDOWN_DAYS|EMAIL_CAMPAIGN_NAME:|SENDER_PERSON_NAME:|SENDER_DIRECT_EMAIL:|SENDER_DIRECT_PHONE:|SENDER_JOB_TITLE:|EXPAND_TO_ALL_NOT_CONTACTED:", "export workflow duplicates Supabase business policy"),
    (".github/workflows/stock_promotional_agent_v15.yml", r"DAILY_EMAIL_LIMIT(?:=|:)|LOCAL_SEND_(?:START_HOUR|END_HOUR|WEEKDAYS)|CROSS_CAMPAIGN_COOLDOWN_DAYS|SAME_STOCK_ITEM_COOLDOWN_DAYS|MAX_PER_COUNTRY_PER_RUN|MAX_PER_ITEM_PER_RUN|MIN_STOCK_MATCH_SCORE|MIN_CATEGORY_FIT_SCORE|MAX_INVENTORY_AGE_DAYS|MAX_SELECTOR_STOCK_ITEMS|STOCK_CAMPAIGN_NAME:|INCLUDE_COLD_LEADS:|STOCK_SENDER_PERSON_NAME:|STOCK_SENDER_JOB_TITLE:|STOCK_REPLY_TO_EMAIL:|STOCK_SENDER_PHONE:|STOCK_FX_MAX_AGE_DAYS:", "stock workflow duplicates Supabase business policy"),
]

REQUIRED: list[tuple[str, str]] = [
    ("scripts/automated_email_agent.py", "claim_manual_lead_outreach_requests"),
    ("scripts/stock_promotional_agent_v15.py", "claim_manual_promotion_requests"),
    ("scripts/automated_email_agent.py", "manual_queue_fill_then_auto"),
    ("scripts/stock_promotional_agent_v15.py", "manual_queue_fill_then_auto"),
    ("scripts/automated_email_agent.py", "cross_campaign_cooldown_days = runtime_control.require_int("),
    ("scripts/stock_promotional_agent_v15.py", "cross_cooldown = runtime_control.require_int("),
    ("scripts/build_stock_inventory_snapshot.py", "resolve_effective_date"),
    ("scripts/build_stock_inventory_snapshot.py", "--price-config"),
    ("supabase/migrations/20260820090000_runtime_policy_and_manual_queue_priority.sql", "runtime_settings"),
    ("supabase/migrations/20260820090000_runtime_policy_and_manual_queue_priority.sql", "uq_manual_promotion_queue_active_lead"),
    ("supabase/migrations/20260820094500_outbound_runtime_rescan_hardening.sql", "manual_queue_scan_limit"),
    ("supabase/migrations/20260821130000_agent_reliability_currency_persistence.sql", "local_send_windows"),
    ("scripts/automated_email_agent.py", "RECONCILED_FOLLOWUP_WITHOUT_RESEND"),
]


def main() -> None:
    errors: list[str] = []
    for rel, pattern, label in CHECKS:
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        match = re.search(pattern, text)
        if match:
            line = text.count("\n", 0, match.start()) + 1
            errors.append(f"{label}: {rel}:{line}: {match.group(0)!r}")

    for rel, marker in REQUIRED:
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        if marker not in text:
            errors.append(f"required runtime-source marker missing: {rel}: {marker}")

    if errors:
        raise SystemExit("OUTBOUND RUNTIME AUDIT FAILED\n" + "\n".join(f"- {item}" for item in errors))
    print("OUTBOUND RUNTIME AUDIT PASSED: mutable outbound business policy is externalized.")


if __name__ == "__main__":
    main()
