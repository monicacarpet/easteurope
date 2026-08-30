from pathlib import Path


REQUIRED_FILES = [
    "README.md",
    "requirements.txt",
    "requirements.lock.txt",
    "streamlit_app.py",
    "run_apify_hunter_pipeline.py",
    ".github/workflows/ci.yml",
    ".github/workflows/automated_email_agent.yml",
    ".github/workflows/stock_promotional_agent_v15.yml",
    ".github/workflows/deploy_supabase.yml",
    "scripts/automated_email_agent.py",
    "scripts/campaign_runtime_control.py",
    "scripts/test_email_agent.py",
    "scripts/stock_promotional_agent_v15.py",
    "scripts/test_stock_promotional_agent_v15.py",
    "src/extractors/apify_google_maps_csv.py",
    "src/transformers/split_brazil_gold.py",
    "src/enrichment/email_enrich_strong_gold.py",
    "src/enrichment/build_hunter_input.py",
    "src/enrichment/clean_hunter_input.py",
    "src/enrichment/hunter_enrich_missing_emails.py",
    "src/enrichment/finalize_hunter_enrichment.py",
    "src/supabase_client/lead_repository.py",
    "src/supabase_client/upload_leads_to_supabase.py",
    "scripts/generate_client_setup.py",
    "client-config.example.json",
    "handoff/Configure-GitHub.ps1",
    "docs/HANDOFF_GUIDE.md",
    "docs/SECURITY_AND_OWNERSHIP.md",
    "docs/SUPABASE_SETUP.md",
    "docs/CLOUDFLARE_SETUP.md",
    "docs/DATA_IMPORT_GUIDE.md",
    "docs/OPERATIONS_RUNBOOK.md",
    "docs/DEPLOYMENT_CHECKLIST.md",
    "supabase/migrations/20260801000000_base_leads.sql",
    "supabase/migrations/20260822000000_finalize_security_and_grants.sql",
    "templates/Stock_Upload_Template.xlsx",
    "web/public/demo/platform-demo.json",
]

OBSOLETE_FILES = [
    ".github/workflows/stock_promotional_agent_v14.yml",
    ".github/workflows/stock_interest_agent.yml",
    ".github/workflows/dry_run_email_agent.yml",
    ".github/workflows/send_one_test_email.yml",
    "scripts/stock_promotional_agent_v14.py",
    "scripts/test_stock_promotional_agent_v14.py",
    "scripts/stock_interest_agent.py",
    "scripts/test_stock_interest_agent.py",
    "scripts/dry_run_email_agent.py",
    "scripts/send_one_test_email.py",
]


def test_required_files_exist() -> None:
    for item in REQUIRED_FILES:
        assert Path(item).is_file(), f"Missing required file: {item}"


def test_obsolete_files_are_absent() -> None:
    for item in OBSOLETE_FILES:
        assert not Path(item).exists(), f"Obsolete file should be removed: {item}"


def test_exactly_one_production_workflow_per_agent() -> None:
    workflows = list(Path(".github/workflows").glob("*.yml")) + list(
        Path(".github/workflows").glob("*.yaml")
    )
    contents = {path: path.read_text(encoding="utf-8") for path in workflows}

    main_callers = [
        path
        for path, text in contents.items()
        if path.name not in {"ci.yml", "deploy_supabase.yml"}
        and "run: python scripts/automated_email_agent.py" in text
    ]
    stock_callers = [
        path
        for path, text in contents.items()
        if path.name not in {"ci.yml", "deploy_supabase.yml"}
        and "run: python scripts/stock_promotional_agent_v15.py" in text
    ]

    assert main_callers == [Path(".github/workflows/automated_email_agent.yml")]
    assert stock_callers == [Path(".github/workflows/stock_promotional_agent_v15.yml")]
