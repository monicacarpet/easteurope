#!/usr/bin/env python3
"""Offline release verification for the independent client handoff repository."""
from __future__ import annotations

import json
import py_compile
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent

REQUIRED = [
    "README.md",
    "requirements.lock.txt",
    "client-config.example.json",
    "handoff/Configure-GitHub.ps1",
    "docs/HANDOFF_GUIDE.md",
    "docs/SECURITY_AND_OWNERSHIP.md",
    "docs/SUPABASE_SETUP.md",
    "docs/CLOUDFLARE_SETUP.md",
    "docs/DATA_IMPORT_GUIDE.md",
    "docs/OPERATIONS_RUNBOOK.md",
    "docs/DEPLOYMENT_CHECKLIST.md",
    "docs/RELEASE_VALIDATION.md",
    ".github/workflows/ci.yml",
    ".github/workflows/deploy_supabase.yml",
    ".github/workflows/automated_email_agent.yml",
    ".github/workflows/stock_promotional_agent_v15.yml",
    "scripts/generate_client_setup.py",
    "scripts/automated_email_agent.py",
    "scripts/stock_promotional_agent_v15.py",
    "scripts/sync_inbound_replies.py",
    "templates/Stock_Upload_Template.xlsx",
    "templates/Stock_Upload_Template.csv",
    "web/public/templates/Stock_Upload_Template.xlsx",
    "web/public/templates/Stock_Upload_Template.csv",
    "web/public/demo/platform-demo.json",
    "web/src/config/brand.js",
    "web/src/assets/images/platform-logo.svg",
    "web/src/assets/images/platform-cover.svg",
    "supabase/migrations/20260801000000_base_leads.sql",
    "supabase/migrations/20260822000000_finalize_security_and_grants.sql",
]

COMPILE = [
    "verify_repository.py",
    "run_apify_hunter_pipeline.py",
    "streamlit_app.py",
    "scripts/generate_client_setup.py",
    "scripts/automated_email_agent.py",
    "scripts/stock_promotional_agent_v15.py",
    "scripts/sync_inbound_replies.py",
    "scripts/campaign_runtime_control.py",
    "scripts/campaign_copy_policy.py",
    "scripts/manual_send_lock.py",
    "scripts/build_stock_inventory_snapshot.py",
    "src/supabase_client/lead_repository.py",
    "src/supabase_client/upload_leads_to_supabase.py",
    "src/extractors/apify_google_maps_csv.py",
    "src/transformers/split_brazil_gold.py",
    "src/enrichment/email_enrich_strong_gold.py",
    "src/enrichment/build_hunter_input.py",
    "src/enrichment/clean_hunter_input.py",
    "src/enrichment/hunter_enrich_missing_emails.py",
    "src/enrichment/finalize_hunter_enrichment.py",
]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def check_required() -> None:
    missing = [path for path in REQUIRED if not (ROOT / path).is_file()]
    if missing:
        raise RuntimeError("Missing required files:\n- " + "\n- ".join(missing))

    workflows = sorted(path.name for path in (ROOT / ".github/workflows").glob("*.yml"))
    expected = [
        "automated_email_agent.yml",
        "ci.yml",
        "deploy_supabase.yml",
        "stock_promotional_agent_v15.yml",
    ]
    if workflows != expected:
        raise RuntimeError(f"Unexpected workflow set: {workflows}")


def check_isolation() -> None:
    forbidden = [
        "J" + "CL",
        "G" + "CL",
        "Chang" + "long",
        "othman" + "hanoune",
        "ALI" + "_MAIL",
        "ALI" + "BABA",
        "j" + "cl" + "-demo",
        "Client Company" + "Flor",
    ]
    allowed_suffixes = {
        ".py", ".js", ".jsx", ".json", ".md", ".sql", ".yml", ".yaml",
        ".toml", ".txt", ".csv", ".env", ".example", ".ps1", ".svg", ".html",
    }
    allowed_names = {".gitignore", ".npmrc", ".nvmrc", "Dockerfile"}
    violations: list[str] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in {"node_modules", "build", ".venv", "venv", ".git", "__pycache__"} for part in path.parts):
            continue
        if (
            path.name == "package-lock.json"
            or (path.suffix.lower() not in allowed_suffixes and path.name not in allowed_names)
        ):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for token in forbidden:
            pattern = rf"\b{re.escape(token)}\b" if len(token) <= 3 else re.escape(token)
            if re.search(pattern, text, flags=re.IGNORECASE):
                violations.append(f"{path.relative_to(ROOT)} contains forbidden token {token}")

    for workbook in (ROOT / "templates/Stock_Upload_Template.xlsx", ROOT / "web/public/templates/Stock_Upload_Template.xlsx"):
        with zipfile.ZipFile(workbook) as archive:
            xml = "\n".join(
                archive.read(name).decode("utf-8", errors="ignore")
                for name in archive.namelist()
                if name.endswith(".xml")
            )
        for token in forbidden:
            pattern = rf"\b{re.escape(token)}\b" if len(token) <= 3 else re.escape(token)
            if re.search(pattern, xml, flags=re.IGNORECASE):
                violations.append(f"{workbook.relative_to(ROOT)} contains forbidden token {token}")

    if violations:
        raise RuntimeError("Isolation verification failed:\n- " + "\n- ".join(violations))

    source_files = sorted(path.name for path in (ROOT / "data/stock/source").iterdir() if path.is_file())
    if source_files != ["README.md"]:
        raise RuntimeError(f"Production inventory leaked into source folder: {source_files}")
    manual_files = sorted(path.name for path in (ROOT / "data/manual").iterdir() if path.is_file())
    if manual_files != ["leads_import_template.csv"]:
        raise RuntimeError(f"Production leads leaked into manual data folder: {manual_files}")


def check_workflows() -> None:
    lead = read(".github/workflows/automated_email_agent.yml")
    stock = read(".github/workflows/stock_promotional_agent_v15.yml")
    database = read(".github/workflows/deploy_supabase.yml")
    for name, text, confirmation in (
        ("lead", lead, "SEND_OUTREACH_EMAILS"),
        ("stock", stock, "SEND_STOCK_EMAILS"),
    ):
        for marker in (
            "vars.AUTOMATION_ENABLED == 'true'",
            "preview_only:",
            "default: true",
            confirmation,
            "group: client-sales-email-sending",
        ):
            if marker not in text:
                raise RuntimeError(f"{name} workflow is missing safety marker: {marker}")
    if "supabase db push --dry-run" not in database or "if: inputs.apply == true" not in database:
        raise RuntimeError("Database deployment does not require dry-run and explicit apply")
    if "version: 2.116.0" not in database or "supabase/setup-cli@v3" not in database:
        raise RuntimeError("Supabase CLI is not pinned to the reviewed version")


def check_database_security() -> None:
    migrations = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    if len(migrations) < 20:
        raise RuntimeError(f"Incomplete migration chain: {len(migrations)} files")
    if len({path.name for path in migrations}) != len(migrations):
        raise RuntimeError("Duplicate migration filenames")

    safe = read("supabase/migrations/20260801160000_safe_disabled_configuration.sql").lower()
    final = read("supabase/migrations/20260822000000_finalize_security_and_grants.sql").lower()
    for marker in ("status = 'paused'", "enabled = false"):
        if marker not in safe:
            raise RuntimeError(f"Safe bootstrap state missing: {marker}")
    for marker in (
        "enable row level security",
        "revoke all on all tables in schema public from anon",
        "grant all privileges on all tables in schema public to service_role",
        "security_invoker = true",
    ):
        if marker not in final:
            raise RuntimeError(f"Final database security migration missing: {marker}")

    p35 = read("supabase/migrations/20260820114000_stock_ui_upload_pipeline.sql").lower()
    if "insert into public.stock_pricing_rules" in p35:
        raise RuntimeError("Client-specific pricing is still seeded by a migration")


def check_frontend_and_demo() -> None:
    demo = json.loads(read("web/public/demo/platform-demo.json"))
    if demo.get("synthetic") is not True:
        raise RuntimeError("Frontend demo is not explicitly synthetic")
    if len(demo.get("leads", [])) > 10 or len(demo.get("stockItems", [])) > 10:
        raise RuntimeError("Frontend demo unexpectedly contains a production-sized dataset")
    if "/* /index.html 200" not in read("web/public/_redirects"):
        raise RuntimeError("Cloudflare Pages SPA redirect is missing")
    package = json.loads(read("web/package.json"))
    if package.get("engines", {}).get("node") != ">=22 <25":
        raise RuntimeError("Frontend Node engine is not pinned to the supported handoff range")
    if not (ROOT / "web/package-lock.json").is_file():
        raise RuntimeError("Frontend package-lock.json is missing")
    dependencies = package.get("dependencies", {})
    if "xlsx" in dependencies or dependencies.get("read-excel-file") != "9.3.10":
        raise RuntimeError("Frontend must use the reviewed stock workbook reader")
    if dependencies.get("react-router-dom") != "7.18.3":
        raise RuntimeError("Frontend router is not pinned to the reviewed security release")


def compile_python() -> None:
    for relative in COMPILE:
        py_compile.compile(str(ROOT / relative), doraise=True)


def run(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    check_required()
    check_isolation()
    check_workflows()
    check_database_security()
    check_frontend_and_demo()
    compile_python()
    run([sys.executable, "scripts/test_email_agent.py"])
    run([sys.executable, "scripts/test_stock_promotional_agent_v15.py"])
    run([sys.executable, "scripts/test_outreach_v17_static.py"])
    run([sys.executable, "-m", "pytest", "-q"])
    print("Independent client handoff verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
