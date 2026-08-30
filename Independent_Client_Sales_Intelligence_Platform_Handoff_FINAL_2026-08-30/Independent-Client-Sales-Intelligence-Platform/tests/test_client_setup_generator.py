from copy import deepcopy

import pytest

from scripts.generate_client_setup import cloudflare_variables, configuration_sql, github_variables, validate


VALID_CONFIG = {
    "company_name": "Acme Flooring",
    "app_name": "Acme Sales Intelligence",
    "brand_short_name": "ASI",
    "company_website": "https://acme.test",
    "company_email_domain": "acme.test",
    "company_profile": "Commercial flooring supplier.",
    "campaign_timezone": "Asia/Singapore",
    "business_utc_offset_hours": 8,
    "daily_email_limit": 12,
    "priority_countries": ["Singapore", "Malaysia"],
    "supabase_url": "https://project.supabase.co",
    "supabase_publishable_key": "sb_publishable_test_value",
    "cloudflare_project_name": "acme-sales-intelligence",
    "outreach": {
        "sender_name": "Sales Team",
        "sender_job_title": "Business Development",
        "sender_email": "sales@acme.test",
        "sender_phone": "+65 6000 0000",
        "smtp_host": "smtp.acme.test",
        "smtp_port": 465,
        "imap_host": "imap.acme.test",
        "imap_port": 993,
        "sent_mailbox": "Sent",
    },
    "stock": {
        "sender_name": "Stock Team",
        "sender_job_title": "Inventory Sales",
        "sender_email": "stock@acme.test",
        "sender_phone": "+65 6000 0001",
        "smtp_host": "smtp.acme.test",
        "smtp_port": 465,
        "imap_host": "imap.acme.test",
        "imap_port": 993,
        "sent_mailbox": "Sent",
    },
}


def test_generated_setup_is_independent_and_disabled_by_default() -> None:
    config = validate(deepcopy(VALID_CONFIG))
    github = github_variables(config)
    cloudflare = cloudflare_variables(config)
    sql = configuration_sql(config)

    assert "AUTOMATION_ENABLED=false" in github
    assert "REACT_APP_DEMO_MODE=false" in cloudflare
    assert "Acme Flooring Lead Outreach" in sql
    assert "Acme Flooring Ready Stock Promotion" in sql
    assert sql.count("enabled = false") == 2
    assert sql.count("status = 'paused'") == 2
    assert "SERVICE_ROLE" not in cloudflare
    assert "PASSWORD" not in github


def test_placeholder_config_is_rejected() -> None:
    config = deepcopy(VALID_CONFIG)
    config["company_website"] = "https://replace.example.com"
    with pytest.raises(ValueError, match="Replace placeholder values"):
        validate(config)


def test_invalid_timezone_is_rejected() -> None:
    config = deepcopy(VALID_CONFIG)
    config["campaign_timezone"] = "Singapore"
    with pytest.raises(ValueError, match="IANA timezone"):
        validate(config)
