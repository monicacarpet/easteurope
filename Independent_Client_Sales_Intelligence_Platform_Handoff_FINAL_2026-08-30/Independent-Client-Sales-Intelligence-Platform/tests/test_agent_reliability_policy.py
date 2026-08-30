from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


def test_both_scheduled_agents_can_fill_the_15_email_daily_quota():
    export_workflow = read(".github/workflows/automated_email_agent.yml")
    stock_workflow = read(".github/workflows/stock_promotional_agent_v15.yml")
    migration = read(
        "supabase/migrations/20260821130000_agent_reliability_currency_persistence.sql"
    )
    assert 'echo "MAX_EMAILS_PER_RUN=15"' in export_workflow
    assert 'echo "MAX_EMAILS_PER_RUN=15"' in stock_workflow
    assert "daily_limit = 15" in migration
    assert "batch_size = 15" in migration
    assert "STOCK_INVENTORY_SNAPSHOT_ID:" not in stock_workflow
    assert "DAILY_EMAIL_LIMIT:" not in export_workflow
    assert "DAILY_EMAIL_LIMIT:" not in stock_workflow
    assert "OUTREACH_MAIL_EMAIL:" not in stock_workflow
    assert "OUTREACH_MAIL_PASSWORD:" not in stock_workflow
    assert "STOCK_GEMINI_API_KEY" in stock_workflow


def test_manual_rows_are_ordered_first_and_automatic_rows_fill_empty_slots():
    export_agent = read("scripts/automated_email_agent.py")
    stock_agent = read("scripts/stock_promotional_agent_v15.py")
    for source, plural_claim in (
        (export_agent, "claim_manual_lead_outreach_requests"),
        (stock_agent, "claim_manual_promotion_requests"),
    ):
        assert plural_claim in source
        assert "manual_candidates + automatic_candidates" in source
        assert "manual_queue_fill_then_auto" in source
        assert "MANUAL QUEUE PRIORITY HOLD" not in source
        assert 'require_send_windows("local_send_windows")' in source


def test_proven_copy_renderer_and_sales_personas_are_release_guarded():
    export_agent = read("scripts/automated_email_agent.py")
    stock_agent = read("scripts/stock_promotional_agent_v15.py")
    assert "Write as an experienced export business developer" in export_agent
    assert "body = final_body(draft, lead)" in export_agent
    assert "localized_greeting(lead)" in export_agent
    assert 'EMAIL_RENDER_FIX_VERSION = "2026-08-22-NAMED-GREETING-COPY-P39"' in export_agent
    assert "dataset_draft_repair_prompt" in export_agent
    assert "Write as a consultative ready-stock salesperson" in stock_agent
    assert "full_body = compose_body(lead, language, draft)" in stock_agent
    assert "localized_greeting(lead, language)" in stock_agent
    assert 'STOCK_COPY_REPAIR_VERSION = "2026-08-22-STOCK-COPY-RETRY-P39"' in stock_agent
    assert "stage_b_repair_prompt" in stock_agent
    for source in (export_agent, stock_agent):
        assert "https://example.com/" in source
        assert "RELIABILITY_RELEASE_VERSION" in source


def test_stock_agent_refreshes_ui_fx_from_its_validated_ecb_table():
    stock_agent = read("scripts/stock_promotional_agent_v15.py")
    service = read("web/src/services/clientPriceList.js")
    assert "def persist_client_fx_rates" in stock_agent
    assert "persist_client_fx_rates(db, fx_table, now_utc)" in stock_agent
    assert 'db.table("stock_fx_rates")' in stock_agent
    assert 'from("stock_fx_rates")' in service
    assert 'quote_currency", ["USD", "EUR"]' in service
