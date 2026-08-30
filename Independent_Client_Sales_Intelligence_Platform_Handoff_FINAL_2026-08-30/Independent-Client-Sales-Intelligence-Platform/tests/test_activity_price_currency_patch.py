from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_activity_ui_reads_database_event_schema():
    text = (ROOT / "web/src/layouts/activity/index.js").read_text(encoding="utf-8")
    assert "row.event_type || row.action" in text
    assert "row.details || row.metadata" in text
    assert "campaign_control_updated" in text
    assert "email_sent" in text


def test_activity_sql_installs_triggers():
    text = (ROOT / "supabase/migrations/20260801050000_activity_guard.sql").read_text(encoding="utf-8")
    for trigger in [
        "trg_platform_activity_note",
        "trg_platform_activity_followup",
        "trg_platform_activity_claim",
        "trg_platform_activity_campaign_control",
        "trg_platform_activity_email",
    ]:
        assert trigger in text


def test_client_prices_are_database_managed_but_not_inherited():
    migration = (ROOT / "supabase/migrations/20260820114000_stock_ui_upload_pipeline.sql").read_text(encoding="utf-8")
    assert "stock_pricing_rules" in migration
    assert "insert into public.stock_pricing_rules" not in migration.lower()
    assert "price_source" in migration
    assert "price_effective_date" in migration


def test_client_price_list_has_no_stale_frontend_fx_table():
    text = (ROOT / "web/src/layouts/stock/index.js").read_text(encoding="utf-8")
    assert "active Supabase RMB stock price" in text
    assert 'value="CNY">RMB (CNY ¥)' in text
    assert 'value="USD"' in text
    assert 'value="EUR"' in text
    assert "platform-stock:price-list-currency" in text
    service = (ROOT / "web/src/services/clientPriceList.js").read_text(encoding="utf-8")
    assert 'from("stock_fx_rates")' in service
    assert '.eq("base_currency", "CNY")' in service
    assert "7.7834" not in text
    assert "1.1535" not in text


def test_manual_timing_overrides_persist_in_session_and_supabase():
    layout = (ROOT / "web/src/layouts/campaigns/index.js").read_text(encoding="utf-8")
    api = (ROOT / "web/src/services/api.js").read_text(encoding="utf-8")
    migration = (
        ROOT
        / "supabase/migrations/20260821130000_agent_reliability_currency_persistence.sql"
    ).read_text(encoding="utf-8")
    assert "platform-campaigns:lead-force-local-window" in layout
    assert "platform-campaigns:stock-force-local-window" in layout
    assert "setManualQueueTimingOverride" in layout
    assert 'rpc("set_manual_queue_timing_override"' in api
    assert "set search_path = ''" in migration
    assert "revoke all on function public.set_manual_queue_timing_override" in migration
    assert "to authenticated" in migration


def test_price_list_has_operational_inventory_fallback():
    text = (ROOT / "web/src/services/api.js").read_text(encoding="utf-8")
    assert "function buildClientPriceListItems" in text
    assert "priceListItems: buildClientPriceListItems(items)" in text
    assert "const priceListItems = buildClientPriceListItems(operationalItems)" in text
    assert "CLIENT_PRICE_LIST_RULES" not in text
