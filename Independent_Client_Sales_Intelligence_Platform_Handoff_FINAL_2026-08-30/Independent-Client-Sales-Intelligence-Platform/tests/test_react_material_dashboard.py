import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"


def test_platform_frontend_shell_is_the_current_foundation():
    dashboard = (WEB / "src/layouts/dashboard/index.js").read_text(encoding="utf-8")
    app = (WEB / "src/App.js").read_text(encoding="utf-8")

    # The current production dashboard intentionally keeps the Material Dashboard
    # layout primitives while using Platform-owned chart/card composition.
    for component in (
        "DashboardLayout",
        "DashboardNavbar",
        "ChartJS",
        "Doughnut",
        "Line",
    ):
        assert component in dashboard

    assert "examples/Sidenav" in app

    # The old template configurator was intentionally removed from the production UI.
    assert "examples/Configurator" not in app


def test_white_label_demo_is_small_synthetic_and_self_contained():
    payload = json.loads((WEB / "public/demo/platform-demo.json").read_text(encoding="utf-8"))
    current = next(row for row in payload["stockSnapshots"] if row["is_active"])
    assert payload["synthetic"] is True
    assert len(payload["stockItems"]) == 4
    assert current["row_count"] == 4
    assert all(str(row["sku"]).startswith("DEMO-") for row in payload["stockItems"])
    assert all("example.com" in row["website"] for row in payload["leads"])


def test_react_database_contract_is_present():
    migration = (ROOT / "supabase/migrations/20260801030000_material_dashboard.sql").read_text(encoding="utf-8")
    api = (WEB / "src/services/api.js").read_text(encoding="utf-8")

    # The migration still owns the canonical auth/RPC and analytics objects.
    for name in (
        "claim_lead_for_current_user",
        "release_lead_for_current_user",
        "stock_inventory_snapshots",
        "stock_items",
        "stock_campaign_matches",
        "email_campaigns",
        "email_messages",
    ):
        assert name in migration

    # The React API now reads the proven base tables directly instead of the
    # obsolete/nonexistent platform_stock_* / v_platform_* relations.
    for table in (
        "stock_inventory_snapshots",
        "stock_items",
        "stock_campaign_matches",
        "email_campaigns",
        "email_messages",
        "leads",
    ):
        assert table in api

    assert ("claim_lead_for_current_user" in api) or ('rpc("claim_lead"' in api)
    assert "release_lead_for_current_user" in api


def test_browser_bundle_contains_no_privileged_secret_names():
    forbidden = ("service_role", "SUPABASE_SERVICE", "GEMINI_API_KEY", "ALI_EMAIL_PASSWORD")
    for path in list((WEB / "src").rglob("*.js")) + list((WEB / "public").rglob("*.json")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for token in forbidden:
            assert token not in text, f"{token} found in {path}"


def test_cloudflare_spa_and_local_secret_exclusions_exist():
    redirects = (WEB / "public/_redirects").read_text(encoding="utf-8")
    assert "/* /index.html 200" in redirects

    web_ignore = (WEB / ".gitignore").read_text(encoding="utf-8")
    root_ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert ".env.local" in web_ignore
    assert "web/.env.local" in root_ignore
    assert "web/node_modules/" in root_ignore
    assert "web/build/" in root_ignore


def test_brand_and_business_day_are_runtime_configurable():
    brand = (WEB / "src/config/brand.js").read_text(encoding="utf-8")
    app = (WEB / "src/App.js").read_text(encoding="utf-8")
    api = (WEB / "src/services/api.js").read_text(encoding="utf-8")
    assert "REACT_APP_COMPANY_NAME" in brand
    assert "REACT_APP_BUSINESS_UTC_OFFSET_HOURS" in brand
    assert "BRAND_SHORT_NAME" in app
    assert "BUSINESS_UTC_OFFSET_HOURS" in api


def test_manual_reach_uses_configurable_country_priority_named_decision_makers_and_separates_stock_pool():
    api = (WEB / "src/services/api.js").read_text(encoding="utf-8")
    campaigns = (WEB / "src/layouts/campaigns/index.js").read_text(encoding="utf-8")

    for token in (
        "manualLeadCandidates",
        "manualStockCandidates",
        "hasNamedDecisionMaker",
        "hasDecisionMakerContactRoute",
        "manualPriorityCountries",
        "manualPriorityRank",
        "priority_countries",
        "direct_phone",
        "mobile_phone",
        "whatsapp_phone",
    ):
        assert token in api

    assert 'lower(a?.country) === "france" ? 0 : 1' not in api
    assert "Manual Reach country priority" in campaigns
    assert "priorityCountries={data.manualPriorityCountries || []}" in campaigns
    assert "Country priority:" in campaigns
    assert "data.manualLeadCandidates" in campaigns
    assert "data.manualStockCandidates" in campaigns
    assert "preferredPhone" in campaigns



def test_p29_original_interactive_gis_and_compact_pattern_dashboard_regressions():
    dashboard = (WEB / "src/layouts/dashboard/index.js").read_text(encoding="utf-8")
    campaigns = (WEB / "src/layouts/campaigns/index.js").read_text(encoding="utf-8")
    gis = (WEB / "src/layouts/gis/index.js").read_text(encoding="utf-8")
    api = (WEB / "src/services/api.js").read_text(encoding="utf-8")
    data_quality = (WEB / "src/layouts/data-quality/index.js").read_text(encoding="utf-8")

    assert "const isLast = index === ticks.length - 1" in dashboard
    assert "const isLast = index === ticks.length - 1" in campaigns

    # Preserve the original interactive MapLibre GIS UX: filters, clusters,
    # popups and fallback.  Crucially, MapGL is aliased so JavaScript's native
    # Map remains available for the company-location dedupe map.  Importing it
    # as `Map` made `new Map()` resolve to the React component and could crash
    # the entire GIS route before the map rendered.
    assert 'import MapGL, { Layer, Popup, Source } from "react-map-gl/maplibre";' in gis
    assert "const grouped = new Map();" in gis
    assert "<MapGL" in gis
    assert "</MapGL>" in gis
    assert "MapRenderBoundary" in gis
    assert "GeographicFallback" in gis
    assert "Interactive sales territory map" in gis
    assert "All countries" in gis
    assert "All ownership" in gis
    assert "All scores" in gis
    assert "clusterLayer" in gis
    assert "clusterCountLayer" in gis
    assert "pointLayer" in gis
    assert "Popup" in gis
    assert "import Map, { Layer, Popup, Source }" not in gis
    assert "platform_visible_gis_leads unavailable; using the role-scoped lead pool fallback" in api

    # Data quality is compact and pattern-oriented: no repeated blocker/matrix cards.
    assert "Lead readiness funnel" in data_quality
    assert "Descriptive commercial patterns" in data_quality
    assert "Does the B2B score predict commercial response?" in data_quality
    assert "Market readiness patterns" in data_quality
    assert "Readiness blockers" not in data_quality
    assert "Decision maker × direct channel" not in data_quality
    assert "Quality scorecard" not in data_quality
    assert "B2B score profile" not in data_quality
    assert "Field coverage profile" not in data_quality
    assert "GIS coverage" not in data_quality

    for token in (
        "readiness_funnel",
        "readiness_blockers",
        "contactability_matrix",
        "score_effectiveness",
        "market_enrichment_priorities",
        "baseline_qualified_rate_pct",
    ):
        assert token in api

    # Dashboard keeps only executive commercial KPIs; detailed data-quality graphs
    # are deliberately not rendered there anymore.
    assert 'label="Sales-ready leads"' in dashboard
    assert 'label="Target-fit backlog"' in dashboard
    assert 'label="Qualified replies"' in dashboard
    assert 'label="Score validation sample"' in dashboard
    assert "Stock mix & campaign exposure" in dashboard
    assert "Inventory with no stock-email exposure" in dashboard
    assert "Email concentration" in dashboard
    assert 'lg: "repeat(3, minmax(0, 1fr))"' in dashboard
    assert "Bar = share of current inventory, not email priority" not in dashboard
