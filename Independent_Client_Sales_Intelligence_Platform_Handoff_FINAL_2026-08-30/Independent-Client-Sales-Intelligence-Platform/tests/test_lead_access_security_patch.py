from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = (ROOT / "web/src/services/api.js").read_text(encoding="utf-8")
LEAD_PAGE = (ROOT / "web/src/components/Platform/LeadTablePage.js").read_text(encoding="utf-8")
SQL = (ROOT / "supabase/migrations/20260801110000_lead_access_security.sql").read_text(encoding="utf-8")


def test_frontend_never_reads_leads_table_directly():
    assert 'fetchPaged("leads"' not in API
    assert '.from("leads")' not in API
    assert "get_available_lead_pool" in API
    assert "get_my_claimed_lead_details" in API
    assert "bi_admin_lead_details" in API


def test_sales_pool_hides_contacts_and_bulk_export():
    assert "Claim to unlock" in LEAD_PAGE
    assert "Only company name and country are visible" in LEAD_PAGE
    assert "mine || !restrictedPool" in LEAD_PAGE
    assert 'Header: "country"' in LEAD_PAGE


def test_database_patch_revokes_direct_read_and_is_dynamic():
    assert "revoke select on table public.leads from authenticated" in SQL.lower()
    assert "get_available_lead_pool" in SQL
    assert "platform_lead_is_bi_admin_only" in SQL
    assert "contact_full_name" in SQL
    assert "account_tier" in SQL  # signature compatibility; not used as protection by itself
