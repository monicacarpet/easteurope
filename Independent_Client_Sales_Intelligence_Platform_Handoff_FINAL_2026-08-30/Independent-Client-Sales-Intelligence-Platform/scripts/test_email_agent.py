from __future__ import annotations
# CI compatibility marker: 2026-08-06-GLOBAL-MARKET-MIX-NATIVE-FALLBACK-V16.5
import importlib.util
import os
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path

# Offline dependency stubs keep this suite independent of network installs.
try:
    from google import genai as _g  # noqa
except Exception:
    google_mod = sys.modules.get("google") or types.ModuleType("google")
    genai_mod = types.ModuleType("google.genai")
    genai_types = types.ModuleType("google.genai.types")
    class GenerateContentConfig:
        def __init__(self, **kwargs): self.kwargs = kwargs
    class DummyClient:
        def __init__(self, *a, **k): self.models = types.SimpleNamespace()
    genai_types.GenerateContentConfig = GenerateContentConfig
    genai_mod.Client = DummyClient; genai_mod.types = genai_types; google_mod.genai = genai_mod
    sys.modules["google"] = google_mod; sys.modules["google.genai"] = genai_mod; sys.modules["google.genai.types"] = genai_types
try:
    import dns.resolver as _dns  # noqa
except Exception:
    dns = types.ModuleType("dns"); exc = types.ModuleType("dns.exception"); res = types.ModuleType("dns.resolver")
    class DNSException(Exception): pass
    class Timeout(DNSException): pass
    class NXDOMAIN(DNSException): pass
    class NoAnswer(DNSException): pass
    class NoNameservers(DNSException): pass
    class Resolver:
        def __init__(self,*a,**k): self.timeout=0; self.lifetime=0
        def resolve(self,*a,**k): raise AssertionError("DNS disabled in offline test")
    exc.DNSException=DNSException; exc.Timeout=Timeout; res.NXDOMAIN=NXDOMAIN; res.NoAnswer=NoAnswer; res.NoNameservers=NoNameservers; res.Resolver=Resolver
    dns.exception=exc; dns.resolver=res; sys.modules["dns"]=dns; sys.modules["dns.exception"]=exc; sys.modules["dns.resolver"]=res
try:
    import supabase as _s  # noqa
except Exception:
    sm=types.ModuleType("supabase")
    class Client: pass
    sm.Client=Client; sm.create_client=lambda *a,**k: Client(); sys.modules["supabase"]=sm
try:
    import timezonefinder as _tz  # noqa
except Exception:
    tm=types.ModuleType("timezonefinder")
    class TimezoneFinder:
        def __init__(self,*a,**k): pass
        def timezone_at(self,*a,**k): return "UTC"
    tm.TimezoneFinder=TimezoneFinder; sys.modules["timezonefinder"]=tm

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
spec=importlib.util.spec_from_file_location("automated_email_agent", HERE/"automated_email_agent.py")
agent=importlib.util.module_from_spec(spec); sys.modules["automated_email_agent"]=agent; spec.loader.exec_module(agent)
from campaign_copy_policy import campaign_copy_policy, policy_forbidden_phrases, policy_paragraph_count, policy_subject_word_limits, policy_word_limits

# Generic offline fixtures only; production identity comes from Supabase runtime settings.
os.environ.setdefault("SENDER_PERSON_NAME", "Test Sender")
os.environ.setdefault("SENDER_DIRECT_EMAIL", "sender@example.com")
os.environ.setdefault("SENDER_DIRECT_PHONE", "+1 555 123 4567")
os.environ.setdefault("SENDER_JOB_TITLE", "Test Sales")
os.environ.setdefault("SENDER_IDENTITY_LINE", "Test outbound identity")
os.environ.setdefault("OUTREACH_OPENING_PARAGRAPH_MAX_WORDS", "100")
os.environ.setdefault("OUTREACH_SECOND_PARAGRAPH_MAX_WORDS", "70")


class CopyPolicyArchitectureTests(unittest.TestCase):
    def test_versions(self):
        self.assertEqual(agent.AGENT_VERSION, "2026-08-06-GLOBAL-MARKET-MIX-NATIVE-FALLBACK-V16.5")
        self.assertEqual(agent.PATCH_VERSION, "2026-08-17-SENDER-PROFILE-POLICY-ISOLATION-P14")
        self.assertEqual(agent.MANUAL_QUEUE_FIX_VERSION, "2026-08-19-PERSIST-UNTIL-SENT-P26")
        self.assertEqual(agent.MANUAL_RUN_FIX_VERSION, "2026-08-21-MANUAL-RUN-QUEUE-FORCE-P36")
        self.assertEqual(agent.RELIABILITY_RELEASE_VERSION, "2026-08-21-MANUAL-FIRST-AUTO-FILL-P37")
        self.assertEqual(agent.EMAIL_RENDER_FIX_VERSION, "2026-08-22-NAMED-GREETING-COPY-P39")

    def test_campaign_goal_fails_closed(self):
        with self.assertRaises(RuntimeError):
            campaign_copy_policy({"campaign_goal": ""})
        self.assertEqual(campaign_copy_policy({"campaign_goal": "Exactly TWO paragraphs."}), "Exactly TWO paragraphs.")

    def test_policy_format_is_parsed_from_configuration(self):
        policy='70-105 words before signature. Exactly TWO coherent paragraphs. SUBJECT: 3-6 natural words. NEVER use these phrases: "Bad fixed CTA".'
        self.assertEqual(policy_word_limits(policy), (70,105))
        self.assertEqual(policy_subject_word_limits(policy), (3,6))
        self.assertEqual(policy_paragraph_count(policy), 2)
        self.assertIn("Bad fixed CTA", policy_forbidden_phrases(policy))

    def test_customer_copy_is_preserved_not_retemplated(self):
        lead={"name":"Example Floors","country":"United Kingdom","email":"sarah.buyer@examplefloors.com","contact_first_name":"Sarah","contact_last_name":"Buyer","contact_full_name":"Sarah Buyer"}
        research=agent.CompanyResearch(confidence="high",business_model="distributor",buyer_type="distributor",verified_facts=["The company distributes LVT through a professional dealer network."],source_urls=["https://example.com"])
        body="Your professional dealer network already carries LVT, so specification matching is a practical point for comparison. Platform can prepare a focused factory option around the formats already relevant to that channel.\n\nWould a short specification and FOB comparison be useful for your purchasing review?"
        raw=agent.EmailDraft(language_name="English",subject="LVT specification comparison",body=body,research_fact_used="F1",personalization_used="dealer network")
        out=agent.normalize_generated_draft(raw,lead,research)
        self.assertEqual(out.subject, raw.subject)
        self.assertEqual(out.body, body)


    def test_research_prompt_does_not_expose_sender_history_blocked_by_policy(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        start=source.index("def research_company(")
        end=source.index("def ", start + len("def research_company("))
        block=source[start:end]
        self.assertNotIn("Profile: {COMPANY_PROFILE}", block)
        self.assertIn("Sender product/capability claims must come only from the live campaign policy below.", block)
        self.assertIn("Do not use company age, establishment year, joint-venture history or production-location background", block)

    def test_body_sanitizer_preserves_policy_paragraph_breaks(self):
        raw = "First business paragraph with useful detail.\r\n\r\nWould a short comparison be useful?"
        self.assertEqual(
            agent.safe_email_body_text(raw),
            "First business paragraph with useful detail.\n\nWould a short comparison be useful?",
        )

    def test_policy_normalizer_recovers_collapsed_final_cta_without_rewriting(self):
        policy = "70-105 words before signature. Exactly TWO coherent paragraphs."
        body = (
            "Your dealer network already carries LVT, so a specification comparison is relevant. "
            "Platform can prepare a factory option around those formats. "
            "Would a short FOB comparison be useful?"
        )
        out = agent.normalize_body_to_policy(body, policy_paragraph_count(policy))
        self.assertEqual(out.count("\n\n"), 1)
        self.assertTrue(out.endswith("Would a short FOB comparison be useful?"))
        self.assertIn("Platform can prepare a factory option around those formats.", out)

    def test_renderer_does_not_hardcode_paragraph_count(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        start=source.index("def normalize_rendered_body_copy")
        end=source.index("def validate_rendered_email", start)
        block=source[start:end]
        self.assertNotIn("len(paragraphs) != 2", block)
        self.assertIn("policy_paragraph_count(copy_policy", source)


    def test_localized_research_confidence_does_not_override_objective_evidence(self):
        lead={"name":"Example Floors","country":"France","email":"buyer@example.fr"}
        for label in ("Élevée", "hoch", "alta", "high", "medium"):
            research=agent.CompanyResearch(
                confidence=label,
                company_fit=True,
                business_model="flooring distributor",
                buyer_type="distributor",
                verified_facts=["The company distributes LVT and SPC through a professional flooring network."],
                source_urls=["https://example.fr/products/lvt"],
                commercial_interpretation="A focused factory range is relevant to the current resilient-flooring offer.",
                selected_sales_angle="range comparison",
            )
            ok, reason=agent.research_is_usable(lead,research)
            self.assertTrue(ok, (label, reason))

    def test_research_gate_remains_fail_closed_on_missing_commercial_evidence(self):
        lead={"name":"Example Floors","country":"France","email":"buyer@example.fr"}
        research=agent.CompanyResearch(
            confidence="Élevée",
            company_fit=True,
            business_model="flooring distributor",
            buyer_type="distributor",
            verified_facts=["The company has a website."],
            source_urls=["https://example.fr/contact"],
        )
        ok, _=agent.research_is_usable(lead,research)
        self.assertFalse(ok)


    def test_subject_normalizer_trims_only_to_live_policy_max(self):
        policy = "SUBJECT:\n- 3-6 natural words tied to the commercial angle/product."
        raw = "Approvisionnement LVT direct adapté à votre réseau professionnel"
        normalized = agent.normalize_subject_to_policy(raw, policy)
        self.assertEqual(normalized, "Approvisionnement LVT direct adapté à votre")
        self.assertEqual(len(normalized.split()), 6)
        self.assertTrue(raw.startswith(normalized))

    def test_subject_normalizer_does_not_leave_dangling_connector_after_trim(self):
        policy = "SUBJECT:\n- 3-6 natural words tied to the commercial angle/product."
        raw = "Spécifications sur mesure en LVT et PVC"
        normalized = agent.normalize_subject_to_policy(raw, policy)
        self.assertEqual(normalized, "Spécifications sur mesure en LVT")
        self.assertEqual(len(normalized.split()), 5)
        self.assertFalse(normalized.casefold().endswith(" et"))

    def test_subject_normalizer_keeps_connector_when_not_created_by_trimming(self):
        policy = "SUBJECT:\n- 3-6 natural words tied to the commercial angle/product."
        raw = "LVT et SPC"
        self.assertEqual(agent.normalize_subject_to_policy(raw, policy), raw)

    def test_subject_normalizer_does_not_invent_words_when_too_short(self):
        policy = "SUBJECT:\n- 3-6 natural words tied to the commercial angle/product."
        self.assertEqual(agent.normalize_subject_to_policy("LVT direct", policy), "LVT direct")

    def test_named_first_last_mailbox_uses_first_name(self):
        lead={"email":"james.heese@headlam.com","contact_first_name":"James","contact_last_name":"Heese","contact_full_name":"James Heese","contact_scope":"named_contact","decision_email_class":"direct_decision_maker"}
        self.assertEqual(agent.greeting_person_name(lead), "James")
        self.assertEqual(agent.localized_greeting({**lead,"country":"United Kingdom","name":"Headlam Group plc"}), "Hello James,")

    def test_reversed_mailbox_is_not_guessed(self):
        lead={"email":"heese.james@headlam.com","contact_first_name":"James","contact_last_name":"Heese","contact_full_name":"James Heese","contact_scope":"named_contact","decision_email_class":"direct_decision_maker"}
        self.assertEqual(agent.greeting_person_name(lead), "")

    def test_old_copy_is_absent_and_generation_is_policy_driven(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        for bad in (
            "Worth sending the comparison?",
            "For that model, an additional direct factory can help",
            "I can compare 3 formats against your current range",
        ):
            self.assertNotIn(bad, source)
        self.assertIn("AUTHORITATIVE CAMPAIGN COPY POLICY", source)
        self.assertIn("campaign_copy_policy(campaign)", source)
        self.assertIn("recent_sent_drafts", source)
        self.assertIn("policy_forbidden_phrases", source)
        self.assertNotIn("deterministic_v17_followup_compat", source)

    def test_followups_use_live_policy_and_model(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        start=source.index("def _followup_body")
        end=source.index("def _latest_initial_message", start)
        block=source[start:end]
        self.assertIn("campaign_copy_policy(campaign)", block)
        self.assertIn("gemini_generate_with_failover", block)
        self.assertNotIn("One practical point", block)

    def test_historical_similarity_not_only_current_batch(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        self.assertIn("comparison_drafts = historical_drafts + accepted_drafts", source)
        self.assertIn('runtime_control.require_float("max_draft_similarity"', source)
        self.assertNotIn("MAX_DRAFT_SIMILARITY", source)

    def test_manual_reach_country_priority_matches_ui_order(self):
        priority=("france","spain","portugal")
        fr={"lead_id":"fr","country":"France","b2b_score":10,"_buying_likelihood_score":55,"_dynamic_fair_priority":3,"_company_contact_rank":1}
        es={"lead_id":"es","country":"Spain","b2b_score":99,"_buying_likelihood_score":90,"_dynamic_fair_priority":1,"_company_contact_rank":1}
        nz={"lead_id":"nz","country":"New Zealand","b2b_score":100,"_buying_likelihood_score":100,"_dynamic_fair_priority":1,"_company_contact_rank":1}
        now=datetime(2026,8,17,10,0)
        items=[(nz,"Pacific/Auckland",now),(es,"Europe/Madrid",now),(fr,"Europe/Paris",now)]
        ordered=sorted(items,key=lambda item: agent.configured_priority_sort_key(item,priority))
        self.assertEqual([item[0]["lead_id"] for item in ordered],["fr","es","nz"])

    def test_live_buying_score_overrides_raw_b2b_for_quality_order(self):
        priority=("france",)
        a={"lead_id":"a","country":"France","b2b_score":99,"_buying_likelihood_score":40,"_dynamic_fair_priority":4,"_company_contact_rank":1}
        b={"lead_id":"b","country":"France","b2b_score":50,"_buying_likelihood_score":80,"_dynamic_fair_priority":1,"_company_contact_rank":1}
        now=datetime(2026,8,17,10,0)
        ordered=sorted([(a,"Europe/Paris",now),(b,"Europe/Paris",now)],key=lambda item: agent.configured_priority_sort_key(item,priority))
        self.assertEqual(ordered[0][0]["lead_id"],"b")


    def test_manual_queue_waits_without_consuming_until_recipient_window(self):
        lead={"country":"France"}
        request={"force_local_window":False}
        early=datetime(2026,8,18,5,0,tzinfo=timezone.utc)
        due=datetime(2026,8,18,8,0,tzinfo=timezone.utc)
        ok, reason=agent.manual_lead_request_due_now(lead,request,early,9,18,{0,1,2,3,4})
        self.assertFalse(ok)
        self.assertIn("waiting", reason)
        ok, reason=agent.manual_lead_request_due_now(lead,request,due,9,18,{0,1,2,3,4})
        self.assertTrue(ok, reason)

    def test_manual_queue_force_window_bypasses_timing(self):
        lead={"country":"France"}
        ok, _=agent.manual_lead_request_due_now(
            lead,{"force_local_window":True},datetime(2026,8,18,2,0,tzinfo=timezone.utc),9,18,{0,1,2,3,4}
        )
        self.assertTrue(ok)

    def test_manual_workflow_force_window_bypasses_queued_row_timing(self):
        lead={"country":"France"}
        ok, reason=agent.manual_lead_request_due_now(
            lead,
            {"force_local_window":False},
            datetime(2026,8,18,2,0,tzinfo=timezone.utc),
            9,
            18,
            {0,1,2,3,4},
            run_force_local_window=True,
        )
        self.assertTrue(ok,reason)
        self.assertIn("manual workflow override",reason)

    def test_manual_claim_scans_past_sleeping_timezones(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        start=source.index("def claim_manual_lead_outreach_request")
        end=source.index("def finish_manual_lead_outreach_request", start)
        block=source[start:end]
        self.assertIn("limit(scan_limit)", block)
        self.assertIn("manual_lead_request_due_now", block)
        self.assertIn("run_force_local_window=run_force_local_window", block)
        self.assertIn("continue", block)
        self.assertIn('eq("status", "queued")', block)
        self.assertIn("run_force_local_window=force_window", source)
        self.assertIn("def claim_manual_lead_outreach_requests", source)
        self.assertIn("candidates = manual_candidates + automatic_candidates", source)
        self.assertNotIn("MANUAL QUEUE PRIORITY HOLD", source)

    def test_manual_queue_and_live_rank_are_runtime_sources(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        self.assertIn('db.table("manual_promotion_queue")', source)
        self.assertIn('campaign_key", "lead_outreach"', source)
        self.assertIn('platform_lead_buying_rank_current', source)
        self.assertIn('runtime_control.priority_countries', source)
        self.assertIn('claim_manual_lead_outreach_request', source)

    def test_route_and_send_time_safety_remain(self):
        good={"procurement_route":"strategic_oem_container","ai_outreach_status":"not_contacted","ai_outreach_enabled":True,"do_not_contact":False}
        self.assertTrue(agent.strategic_route_eligible(good))
        self.assertTrue(agent.inside_send_window(datetime(2026,8,14,10,0),9,18,{0,1,2,3,4}))
        self.assertFalse(agent.inside_send_window(datetime(2026,8,16,10,0),9,18,{0,1,2,3,4}))
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        self.assertNotIn("preferred_send_window", source)
        self.assertNotIn("09:30-11:30", source)

    def test_no_google_search_tool(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        self.assertNotIn('"google_search"', source)
        self.assertIn('"url_context"', source)

    def test_manual_soft_stops_are_deferred_not_consumed(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        self.assertIn("def defer_manual_lead_outreach_request", source)
        self.assertIn("manual_retry_reasons", source)
        self.assertIn("manual_dataset_override", source)
        self.assertIn("copy-similarity gate is advisory", source)

    def test_split_recipient_windows_exclude_lunch_and_weekends(self):
        windows=((9,11),(14,17))
        self.assertTrue(agent.inside_send_window(datetime(2026,8,20,10,0),9,17,{0,1,2,3,4},windows))
        self.assertFalse(agent.inside_send_window(datetime(2026,8,20,12,0),9,17,{0,1,2,3,4},windows))
        self.assertTrue(agent.inside_send_window(datetime(2026,8,20,15,0),9,17,{0,1,2,3,4},windows))
        self.assertFalse(agent.inside_send_window(datetime(2026,8,22,10,0),9,17,{0,1,2,3,4},windows))

    def test_proven_renderer_keeps_named_greeting_hook_cta_and_signature(self):
        lead={
            "name":"Example Floors",
            "country":"United Kingdom",
            "email":"sarah.buyer@examplefloors.com",
            "contact_first_name":"Sarah",
            "contact_last_name":"Buyer",
            "contact_full_name":"Sarah Buyer",
        }
        draft=agent.EmailDraft(
            language_name="English",
            subject="Relevant SPC formats",
            body=(
                "Your professional flooring range makes a focused SPC comparison relevant. "
                "Platform can prepare factory options around the formats visible in your channel."
                "\n\nWould a concise specification and FOB comparison be useful?"
            ),
            research_fact_used="F1",
            personalization_used="professional flooring range",
        )
        rendered=agent.final_body(draft,lead)
        self.assertTrue(rendered.startswith("Hello Sarah,\n\n"))
        self.assertIn("\n\nWould a concise specification and FOB comparison be useful?\n\n",rendered)
        self.assertIn(f"{os.environ['SENDER_JOB_TITLE']} | Client Company",rendered)
        self.assertIn("https://example.com",rendered)

    def test_vincent_timber_compact_named_mailbox_keeps_ben_greeting(self):
        lead={
            "name":"Vincent Timber",
            "country":"United Kingdom",
            "email":"benf@vincenttimber.co.uk",
            "contact_first_name":"Ben",
            "contact_last_name":"Fowles",
            "contact_full_name":"Ben Fowles",
            "contact_scope":"named_key_person",
            "email_source":"named_person_direct_source",
            "decision_email_class":"A1 - Named direct key-person email",
        }
        draft=agent.EmailDraft(
            language_name="English",
            subject="SPC formats for project use",
            body=(
                "Your specialist timber and flooring range makes a focused SPC comparison relevant. "
                "Platform can prepare traceable production options around the formats used in your channel."
                "\n\nWould a short specification and sample comparison be useful?"
            ),
            research_fact_used="F1",
            personalization_used="specialist timber and flooring range",
        )
        self.assertTrue(agent.contact_name_safe_for_email(lead))
        self.assertTrue(agent.final_body(draft,lead).startswith("Hello Ben,\n\n"))

    def test_export_writer_retries_one_policy_bound_copy_repair(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        self.assertIn("dataset_draft_repair_prompt",source)
        self.assertIn("gemini_campaign_policy_repair",source)
        self.assertIn("steady stock availability",source)
        self.assertIn("Opening paragraph must contain no more than three short sentences",source)



    def test_manual_retry_is_throttled_to_one_attempt_per_recipient_day(self):
        lead={"country":"United Kingdom"}
        request={
            "force_local_window":False,
            "error_message":"retry: model temporarily unavailable",
            "updated_at":"2026-08-19T08:00:00+00:00",
        }
        ok, reason=agent.manual_lead_request_due_now(
            lead,request,datetime(2026,8,19,10,0,tzinfo=timezone.utc),9,18,{0,1,2,3,4}
        )
        self.assertFalse(ok)
        self.assertIn("retry already attempted today",reason)
        ok, reason=agent.manual_lead_request_due_now(
            lead,request,datetime(2026,8,20,10,0,tzinfo=timezone.utc),9,18,{0,1,2,3,4}
        )
        self.assertTrue(ok,reason)

    def test_manual_operator_selection_bypasses_soft_fit_but_not_hard_safety(self):
        soft={
            "lead_id":"manual-1",
            "email":"buyer@example.com",
            "procurement_route":"hold_unqualified",
            "ai_outreach_enabled":False,
            "do_not_contact":False,
        }
        self.assertEqual(agent.manual_lead_hard_stop_reason(soft,"outreach@example.com"),"")
        blocked={**soft,"do_not_contact":True}
        self.assertIn("do_not_contact",agent.manual_lead_hard_stop_reason(blocked,"outreach@example.com"))
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        self.assertIn("build_manual_lead_candidate",source)
        self.assertIn("defer_manual_lead_outreach_request",source)
        self.assertIn("retry already attempted today",source)

    def test_p31_sent_folder_contract_is_fail_closed_and_repairable(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        self.assertIn("verify_sent_mailbox_access(sender_email, password)",source)
        self.assertIn("reconcile_unarchived_sent_messages",source)
        self.assertIn("smtp+imap_sent",source)
        self.assertIn("smtp_unarchived",source)
        self.assertIn("Message-ID",source)

    def test_p32_confirmed_send_cannot_be_downgraded_by_post_send_failure(self):
        source=(HERE/"automated_email_agent.py").read_text(encoding="utf-8")
        start=source.index("def mark_failed")
        end=source.index("def mark_success", start)
        self.assertIn('.eq("status", "generated")', source[start:end])
        success=source[source.index("def mark_success"):source.index("def main()", source.index("def mark_success"))]
        self.assertIn("email delivery confirmed, but strict lead-state update did not apply", success)
        self.assertNotIn('raise RuntimeError("Email sent and logged, but lead update failed")', success)


if __name__ == "__main__":
    unittest.main(verbosity=2)
