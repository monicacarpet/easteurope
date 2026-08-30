#!/usr/bin/env python3
"""Generate non-secret handoff configuration for one independent client deployment."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]


def clean(value: Any) -> str:
    return str(value or "").strip()


def require(config: dict[str, Any], key: str) -> str:
    value = clean(config.get(key))
    if not value:
        raise ValueError(f"Missing required configuration: {key}")
    return value


def require_email(value: Any, label: str) -> str:
    email = clean(value).lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError(f"{label} must be a valid email address")
    return email


def require_url(value: Any, label: str) -> str:
    url = clean(value).rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError(f"{label} must be a valid https URL")
    return url


def require_port(value: Any, label: str) -> int:
    try:
        port = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be a numeric port") from exc
    if not 1 <= port <= 65535:
        raise ValueError(f"{label} must be between 1 and 65535")
    return port


def sql_text(value: Any) -> str:
    return "'" + clean(value).replace("'", "''") + "'"


def shell_value(value: Any) -> str:
    text = clean(value)
    if "\n" in text or "\r" in text:
        raise ValueError("Configuration values must be single-line")
    return text


def placeholder_values(config: dict[str, Any]) -> list[str]:
    found: list[str] = []

    def visit(value: Any, path: str) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                visit(child, f"{path}.{key}" if path else key)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{path}[{index}]")
        elif any(token in clean(value).lower() for token in ("replace", "example.com", "replace.example")):
            found.append(path)

    visit(config, "")
    return found


def validate(config: dict[str, Any]) -> dict[str, Any]:
    placeholders = placeholder_values(config)
    if placeholders:
        raise ValueError("Replace placeholder values before generation: " + ", ".join(placeholders))

    company_name = require(config, "company_name")
    app_name = require(config, "app_name")
    brand_short_name = require(config, "brand_short_name")
    company_website = require_url(config.get("company_website"), "company_website")
    company_domain = require(config, "company_email_domain").lower()
    company_profile = require(config, "company_profile")
    timezone = require(config, "campaign_timezone")
    if "/" not in timezone and timezone != "UTC":
        raise ValueError("campaign_timezone must be UTC or an IANA timezone such as Asia/Singapore")
    offset = float(config.get("business_utc_offset_hours", 0))
    if not -12 <= offset <= 14:
        raise ValueError("business_utc_offset_hours must be between -12 and 14")
    daily_limit = int(config.get("daily_email_limit", 15))
    if not 1 <= daily_limit <= 100:
        raise ValueError("daily_email_limit must be between 1 and 100")

    channels: dict[str, dict[str, Any]] = {}
    for key in ("outreach", "stock"):
        raw = config.get(key)
        if not isinstance(raw, dict):
            raise ValueError(f"{key} must be an object")
        channels[key] = {
            "sender_name": require(raw, "sender_name"),
            "sender_job_title": require(raw, "sender_job_title"),
            "sender_email": require_email(raw.get("sender_email"), f"{key}.sender_email"),
            "sender_phone": clean(raw.get("sender_phone")),
            "smtp_host": require(raw, "smtp_host"),
            "smtp_port": require_port(raw.get("smtp_port"), f"{key}.smtp_port"),
            "imap_host": require(raw, "imap_host"),
            "imap_port": require_port(raw.get("imap_port"), f"{key}.imap_port"),
            "sent_mailbox": require(raw, "sent_mailbox"),
        }

    priority = config.get("priority_countries") or []
    if not isinstance(priority, list) or any(not clean(item) for item in priority):
        raise ValueError("priority_countries must be a list of non-empty country names")

    return {
        "company_name": company_name,
        "app_name": app_name,
        "brand_short_name": brand_short_name,
        "company_website": company_website,
        "company_email_domain": company_domain,
        "company_profile": company_profile,
        "campaign_timezone": timezone,
        "business_utc_offset_hours": offset,
        "daily_email_limit": daily_limit,
        "priority_countries": [clean(item) for item in priority],
        "outreach": channels["outreach"],
        "stock": channels["stock"],
        "supabase_url": require_url(config.get("supabase_url"), "supabase_url"),
        "supabase_publishable_key": require(config, "supabase_publishable_key"),
        "cloudflare_project_name": require(config, "cloudflare_project_name"),
    }


def github_variables(config: dict[str, Any]) -> str:
    outreach = config["outreach"]
    stock = config["stock"]
    values = {
        "AUTOMATION_ENABLED": "false",
        "COMPANY_NAME": config["company_name"],
        "COMPANY_WEBSITE": config["company_website"],
        "COMPANY_PROFILE": config["company_profile"],
        "COMPANY_EMAIL_DOMAIN": config["company_email_domain"],
        "OUTREACH_SMTP_HOST": outreach["smtp_host"],
        "OUTREACH_SMTP_PORT": outreach["smtp_port"],
        "OUTREACH_IMAP_HOST": outreach["imap_host"],
        "OUTREACH_IMAP_PORT": outreach["imap_port"],
        "OUTREACH_SENT_MAILBOX": outreach["sent_mailbox"],
        "STOCK_SMTP_HOST": stock["smtp_host"],
        "STOCK_SMTP_PORT": stock["smtp_port"],
        "STOCK_IMAP_HOST": stock["imap_host"],
        "STOCK_IMAP_PORT": stock["imap_port"],
        "STOCK_SENT_MAILBOX": stock["sent_mailbox"],
    }
    return "\n".join(f"{key}={shell_value(value)}" for key, value in values.items()) + "\n"


def cloudflare_variables(config: dict[str, Any]) -> str:
    values = {
        "REACT_APP_DEMO_MODE": "false",
        "REACT_APP_SUPABASE_URL": config["supabase_url"],
        "REACT_APP_SUPABASE_PUBLISHABLE_KEY": config["supabase_publishable_key"],
        "REACT_APP_NAME": config["app_name"],
        "REACT_APP_BRAND_SHORT_NAME": config["brand_short_name"],
        "REACT_APP_COMPANY_NAME": config["company_name"],
        "REACT_APP_COMPANY_WEBSITE": config["company_website"],
        "REACT_APP_SUPPORT_EMAIL": config["outreach"]["sender_email"],
        "REACT_APP_BUSINESS_UTC_OFFSET_HOURS": config["business_utc_offset_hours"],
    }
    return "\n".join(f"{key}={shell_value(value)}" for key, value in values.items()) + "\n"


def configuration_sql(config: dict[str, Any]) -> str:
    outreach = config["outreach"]
    stock = config["stock"]
    lead_name = f"{config['company_name']} Lead Outreach"
    stock_name = f"{config['company_name']} Ready Stock Promotion"
    priority_array = "array[" + ",".join(sql_text(value) for value in config["priority_countries"]) + "]::text[]"
    if not config["priority_countries"]:
        priority_array = "'{}'::text[]"

    return f"""-- Generated client configuration. Review before applying.
-- Safety rule: both campaign controls remain disabled and both campaigns remain paused.

begin;

update public.email_campaigns
set name = {sql_text(lead_name)},
    sender_name = {sql_text(outreach['sender_name'])},
    sender_email = {sql_text(outreach['sender_email'])},
    daily_limit = {config['daily_email_limit']},
    batch_size = {config['daily_email_limit']},
    status = 'paused',
    updated_at = now()
where name = 'Client Lead Outreach';

update public.email_campaigns
set name = {sql_text(stock_name)},
    sender_name = {sql_text(stock['sender_name'])},
    sender_email = {sql_text(stock['sender_email'])},
    daily_limit = {config['daily_email_limit']},
    batch_size = {config['daily_email_limit']},
    status = 'paused',
    updated_at = now()
where name = 'Client Ready Stock Promotion';

update public.campaign_controls
set campaign_name = {sql_text(lead_name)},
    sender_email = {sql_text(outreach['sender_email'])},
    priority_countries = {priority_array},
    enabled = false,
    runtime_settings = coalesce(runtime_settings, '{{}}'::jsonb) || jsonb_build_object(
      'campaign_timezone', {sql_text(config['campaign_timezone'])},
      'sender_person_name', {sql_text(outreach['sender_name'])},
      'sender_job_title', {sql_text(outreach['sender_job_title'])},
      'sender_phone', {sql_text(outreach['sender_phone'])},
      'reply_to_email', {sql_text(outreach['sender_email'])},
      'sender_identity_line', {sql_text(config['company_name'] + ' | ' + outreach['sender_job_title'])}
    ),
    updated_at = now()
where control_key = 'lead_outreach';

update public.campaign_controls
set campaign_name = {sql_text(stock_name)},
    sender_email = {sql_text(stock['sender_email'])},
    priority_countries = {priority_array},
    enabled = false,
    runtime_settings = coalesce(runtime_settings, '{{}}'::jsonb) || jsonb_build_object(
      'campaign_timezone', {sql_text(config['campaign_timezone'])},
      'sender_person_name', {sql_text(stock['sender_name'])},
      'sender_job_title', {sql_text(stock['sender_job_title'])},
      'sender_phone', {sql_text(stock['sender_phone'])},
      'reply_to_email', {sql_text(stock['sender_email'])},
      'sender_identity_line', {sql_text(config['company_name'] + ' | ' + stock['sender_job_title'])}
    ),
    updated_at = now()
where control_key = 'stock_promotion';

commit;
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path, help="Completed client-config.json")
    parser.add_argument("--output", type=Path, default=ROOT / "generated")
    args = parser.parse_args()

    raw = json.loads(args.config.read_text(encoding="utf-8"))
    config = validate(raw)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "github-repository-variables.env").write_text(github_variables(config), encoding="utf-8")
    (args.output / "cloudflare-pages.env").write_text(cloudflare_variables(config), encoding="utf-8")
    (args.output / "configure-client.sql").write_text(configuration_sql(config), encoding="utf-8")
    print(f"Generated client setup in {args.output.resolve()}")
    print("Campaigns remain paused and AUTOMATION_ENABLED remains false.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
