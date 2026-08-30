from pathlib import Path
HERE=Path(__file__).resolve().parent
MAIN=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
STOCK=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
POLICY=(HERE/"campaign_copy_policy.py").read_text(encoding="utf-8")

def test_versions_and_routes():
    assert 'AGENT_VERSION = "2026-08-06-GLOBAL-MARKET-MIX-NATIVE-FALLBACK-V16.5"' in MAIN
    assert 'PATCH_VERSION = "2026-08-17-SENDER-PROFILE-POLICY-ISOLATION-P14"' in MAIN
    assert 'AGENT_VERSION = "2026-08-07-STOCK-CURRENT-WORKBOOK-SNAPSHOT-V1.7"' in STOCK
    assert 'PATCH_VERSION = "2026-08-17-RECIPIENT-FALLBACK-P9"' in STOCK
    assert 'STRATEGIC_ROUTE = "strategic_oem_container"' in MAIN
    assert 'LOW_MOQ_ROUTE = "ready_stock_low_moq"' in STOCK

def test_supabase_campaign_goal_is_runtime_copy_source():
    assert 'campaign_copy_policy(campaign)' in MAIN
    assert 'campaign_copy_policy(campaign)' in STOCK
    assert 'AUTHORITATIVE CAMPAIGN COPY POLICY' in MAIN
    assert 'AUTHORITATIVE CAMPAIGN COPY POLICY' in STOCK
    assert 'policy_forbidden_phrases' in POLICY
    assert 'policy_paragraph_count' in POLICY

def test_old_export_template_is_gone():
    for text in ('Worth sending the comparison?','For that model, an additional direct factory can help','I can compare 3 formats against your current range'):
        assert text not in MAIN

def test_stock_writer_is_model_generated_after_locked_facts():
    assert 'stage_b_prompt(lead, match, item, locked, copy_policy, recent_copy)' in STOCK
    assert 'writer={model_b}' in STOCK
    assert 'deterministic_commercial_stock' not in STOCK
    assert 'exactly FOUR blocks' not in STOCK

def test_historical_anti_repetition_is_not_batch_only():
    assert 'historical_drafts + accepted_drafts' in MAIN
    assert 'historical_bodies + accepted_bodies' in STOCK

def test_followups_are_not_fixed_copy():
    block=MAIN[MAIN.index('def _followup_body'):MAIN.index('def _latest_initial_message')]
    assert 'campaign_copy_policy(campaign)' in block
    assert 'gemini_generate_with_failover' in block
    assert 'One practical point' not in block


def test_export_runtime_respects_manual_queue_and_supabase_priority():
    assert 'claim_manual_lead_outreach_request' in MAIN
    assert 'manual_promotion_queue' in MAIN
    assert 'runtime_control.priority_countries' in MAIN
    assert 'platform_lead_buying_rank_current' in MAIN
    assert 'configured_priority_sort_key' in MAIN


def test_export_prompt_does_not_feed_banned_sender_history_to_writer():
    block=MAIN[MAIN.index('def research_company('):MAIN.index('def ', MAIN.index('def research_company(')+10)]
    assert 'Profile: {COMPANY_PROFILE}' not in block
    assert 'Sender product/capability claims must come only from the live campaign policy below.' in block
