from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_stock_upload_ui_is_real_and_template_backed():
    dialog = read("web/src/components/Platform/StockUploadDialog.js")
    parser = read("web/src/services/stockUpload.js")
    assert "parseStockUploadFile" in dialog
    assert "importStockInventory" in dialog
    assert "/templates/Stock_Upload_Template.xlsx" in dialog
    assert "/templates/Stock_Upload_Template.csv" in dialog
    assert "Native WPS .et files are not supported reliably" in parser
    assert '"库存总表"' in parser
    assert (ROOT / "web/public/templates/Stock_Upload_Template.xlsx").is_file()
    assert (ROOT / "web/public/templates/Stock_Upload_Template.csv").is_file()


def test_stock_import_is_atomic_and_idempotent():
    sql = read("supabase/migrations/20260820114000_stock_ui_upload_pipeline.sql")
    lower = sql.lower()
    # Snapshot is initially staged inactive and only switched after all rows are built.
    insert_pos = lower.index("insert into public.stock_inventory_snapshots")
    deactivate_pos = lower.index("update public.stock_inventory_snapshots set is_active=false")
    activate_pos = lower.index("set is_active=true,activated_at=now()")
    assert insert_pos < deactivate_pos < activate_pos
    assert "source_sha256" in lower
    assert "already_imported" in lower
    assert "stock_upload_min_row_ratio" in lower
    assert "stock_upload_min_area_ratio" in lower
    assert "stock_upload_max_area_ratio" in lower


def test_stock_pricing_is_supabase_source_of_truth_in_active_ui_path():
    api = read("web/src/services/api.js")
    price_list = read("web/src/services/clientPriceList.js")
    dialog = read("web/src/components/Platform/StockUploadDialog.js")
    combined = "\n".join([api, price_list, dialog])
    assert "CLIENT_PRICE_CNY" not in combined
    assert "CLIENT_PRICE_LIST_RULES" not in combined
    assert "7.7834" not in combined
    assert "2026-08-07" not in combined
    assert "client_price_cny" in price_list
    assert "platform_client_price_list" in price_list


def test_manual_queue_defaults_still_respect_recipient_local_time():
    api = read("web/src/services/api.js")
    assert "queueManualStockPromotion(leadId, forceLocalWindow = false)" in api
    assert "queueManualLeadOutreach(leadId, forceLocalWindow = false)" in api


def test_dashboard_layout_is_not_three_equal_dense_stock_cards():
    dashboard = read("web/src/layouts/dashboard/index.js")
    stock = read("web/src/layouts/stock/index.js")
    assert 'xl={8}' in dashboard and 'xl={4}' in dashboard
    assert 'lg={6}' in dashboard
    assert "StockUploadDialog" in stock
    assert 'sm: "repeat(2, minmax(0,1fr))"' in stock
    assert "Stock data management" in stock
    assert "Choose stock file" in stock


def test_stock_upload_rejects_non_inventory_file_types():
    dialog = read("web/src/components/Platform/StockUploadDialog.js")
    parser = read("web/src/services/stockUpload.js")
    assert 'accept=".xlsx,.csv"' in dialog
    assert '["xlsx", "csv"].includes(extension)' in dialog
    assert ".xlsx or .csv stock file" in dialog
    assert 'from "read-excel-file/browser"' in parser
    assert 'from "xlsx"' not in parser
    assert "legacy .xls files should be saved as .xlsx" in dialog


def test_stock_manual_queue_only_counts_stock_campaign_rows():
    campaigns = read("web/src/layouts/campaigns/index.js")
    assert 'row?.campaign_key === "stock_promotion"' in campaigns
