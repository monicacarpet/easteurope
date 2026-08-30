from __future__ import annotations
import importlib.util
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import os

# Keep structural CI runnable before production dependencies are installed.
try:
    import dns.resolver as _dns  # noqa: F401
except Exception:
    dns = types.ModuleType("dns")
    dns_exception = types.ModuleType("dns.exception")
    dns_resolver = types.ModuleType("dns.resolver")
    class DNSException(Exception): pass
    class Timeout(DNSException): pass
    class NXDOMAIN(DNSException): pass
    class NoAnswer(DNSException): pass
    class NoNameservers(DNSException): pass
    class Resolver:
        def __init__(self,*args,**kwargs): self.timeout=0; self.lifetime=0
        def resolve(self,*args,**kwargs): raise AssertionError("DNS disabled in offline test")
    dns_exception.DNSException=DNSException; dns_exception.Timeout=Timeout
    dns_resolver.NXDOMAIN=NXDOMAIN; dns_resolver.NoAnswer=NoAnswer
    dns_resolver.NoNameservers=NoNameservers; dns_resolver.Resolver=Resolver
    dns.exception=dns_exception; dns.resolver=dns_resolver
    sys.modules["dns"]=dns; sys.modules["dns.exception"]=dns_exception; sys.modules["dns.resolver"]=dns_resolver
try:
    import requests as _requests  # noqa: F401
except Exception:
    requests = types.ModuleType("requests")
    class RequestException(Exception): pass
    class Timeout(RequestException): pass
    requests.exceptions=types.SimpleNamespace(RequestException=RequestException,Timeout=Timeout)
    requests.get=lambda *args,**kwargs: (_ for _ in ()).throw(AssertionError("HTTP disabled in offline test"))
    sys.modules["requests"]=requests
try:
    from bs4 import BeautifulSoup as _BeautifulSoup  # noqa: F401
except Exception:
    bs4=types.ModuleType("bs4")
    class BeautifulSoup:
        def __init__(self,*args,**kwargs): pass
    bs4.BeautifulSoup=BeautifulSoup
    sys.modules["bs4"]=bs4

HERE=Path(__file__).resolve().parent
if str(HERE) not in sys.path: sys.path.insert(0,str(HERE))
spec=importlib.util.spec_from_file_location("stock_promotional_agent_v15",HERE/"stock_promotional_agent_v15.py")
agent=importlib.util.module_from_spec(spec); sys.modules["stock_promotional_agent_v15"]=agent; spec.loader.exec_module(agent)

os.environ.setdefault("STOCK_SENDER_PERSON_NAME","Test Sender")
os.environ.setdefault("STOCK_SENDER_JOB_TITLE","Ready Stock Sales")
os.environ.setdefault("STOCK_REPLY_TO_EMAIL","stock@example.com")
os.environ.setdefault("STOCK_SENDER_PHONE","+1 555 123 4567")


class StockCopyPolicyTests(unittest.TestCase):
    def test_versions_and_route(self):
        self.assertEqual(agent.AGENT_VERSION,"2026-08-07-STOCK-CURRENT-WORKBOOK-SNAPSHOT-V1.7")
        self.assertEqual(agent.PATCH_VERSION,"2026-08-17-RECIPIENT-FALLBACK-P9")
        self.assertEqual(agent.MANUAL_QUEUE_FIX_VERSION,"2026-08-19-PERSIST-UNTIL-SENT-P26")
        self.assertEqual(agent.MANUAL_RUN_FIX_VERSION,"2026-08-21-MANUAL-RUN-QUEUE-FORCE-P36")
        self.assertEqual(agent.RELIABILITY_RELEASE_VERSION,"2026-08-21-MANUAL-FIRST-AUTO-FILL-P37")
        self.assertEqual(agent.STOCK_MATCH_FIX_VERSION,"2026-08-21-CANONICAL-SCORE-LIVE-SEND-P38")
        self.assertEqual(agent.STOCK_COPY_REPAIR_VERSION,"2026-08-22-STOCK-COPY-RETRY-P39")
        self.assertEqual(agent.LOW_MOQ_ROUTE,"ready_stock_low_moq")
        self.assertFalse(hasattr(agent,"NORMAL_PRODUCTION_MOQ_M2"))

    def test_stage_a_thresholds_are_runtime_inputs(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        self.assertIn("min_match_score: int",source)
        self.assertIn("min_category_fit_score: int",source)
        self.assertIn("stage_a_prompt(lead, selector_items, local_prices, urls, min_match, min_category)",source)
        self.assertNotIn("DEFAULT_MATCH_SCORE",source)
        self.assertNotIn("DEFAULT_CATEGORY_FIT_SCORE",source)

    def test_stage_a_aggregate_is_normalized_to_component_total(self):
        choice=agent.RankedStockMatch(
            rank=1,item_id="stock-1",match_score=81,
            category_fit_score=24,format_fit_score=15,lot_size_fit_score=16,
            positioning_fit_score=12,availability_fit_score=8,price_fit_score=4,
            selection_reason="This buyer sells compatible resilient flooring products.",
            quantity_fit_reason="The lot size fits the documented distribution scale.",
            recommended_hook="A ready lot can complement the buyer's current flooring range.",
            product_category_evidence="The company website lists resilient vinyl flooring.",
            format_evidence="The company lists a compatible plank format on its website.",
            scale_evidence="The website documents trade distribution across multiple regions.",
        )
        normalized=agent.canonical_ranked_choice(choice)
        self.assertEqual(normalized.match_score,79)
        self.assertEqual(agent.validate_ranked_choice(normalized,{"stock-1":SimpleNamespace(estimated_area_m2=400)},75,20),[])

    def test_stage_b_prompt_is_supabase_policy_driven(self):
        lead={"name":"Example Flooring","country":"United States"}
        match=agent.WebsiteMatchDecision(send=True,selected_item_id="x",language_name="English",website_fact="The company sells vinyl flooring to trade customers.")
        item=SimpleNamespace(item_id="x",product_type="LVT",public_product_description="LVT plank",public_format="7 x 48 inch",public_thickness="3 mm",public_wear_layer="",immediate_availability_statement="Confirmed available.",scarcity_statement="")
        locked={"exact_quantity_display":"500 m²","exact_price_display":"US$4.50/m²","price_conditions_display":"indicative price; freight excluded; final quote to confirm","target_currency":"USD","fx_rate_date":"2026-08-17","fx_rate_source":"ECB"}
        policy="70-110 words before signature. Exactly TWO coherent paragraphs. Subject: 3-6 natural words."
        prompt=agent.stage_b_prompt(lead,match,item,locked,policy,"RECENT OLD COPY")
        self.assertIn(policy,prompt)
        self.assertIn("RECENT OLD COPY",prompt)
        self.assertNotIn("exactly FOUR blocks",prompt)
        self.assertNotIn("allowed_cta exactly",prompt)

    def test_production_uses_model_writer_not_deterministic_copy(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        self.assertIn("stage_b_prompt(lead, match, item, locked, copy_policy, recent_copy)",source)
        self.assertIn('model_used = f"selector={model_a};writer={model_b}"',source)
        self.assertNotIn("writer=deterministic_commercial_stock",source)
        self.assertNotIn("exactly FOUR blocks",source)

    def test_stock_copy_canonicalizer_locks_facts_and_removes_recipient_brand(self):
        lead={"name":"Trap Flooring"}
        item=SimpleNamespace(item_id="stock-1")
        locked={
            "exact_quantity_display":"500 m²",
            "exact_price_display":"US$4.50/m²",
            "price_conditions_display":"freight excluded",
        }
        draft=agent.PromotionalEmailDraft(
            subject="Ready LVT stock for Trap Flooring",
            body="The exact offer is shown in the body.",
            selected_item_id="wrong",
            quantity_copy="500 sqm",
            price_copy="$4.50",
            price_conditions_copy="excluding shipping",
        )
        fixed=agent.canonicalize_stock_draft(draft,lead,item,locked)
        self.assertEqual(fixed.subject,"Ready LVT stock")
        self.assertEqual(fixed.selected_item_id,"stock-1")
        self.assertEqual(fixed.quantity_copy,"500 m²")
        self.assertEqual(fixed.price_copy,"US$4.50/m²")
        self.assertEqual(fixed.price_conditions_copy,"freight excluded")

    def test_stock_writer_gets_one_repair_attempt_before_skip(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        self.assertIn("stage_b_repair_prompt",source)
        self.assertIn("Initial Stage B draft failed QA; requesting one repair",source)
        self.assertIn("Stage B repair model/calls",source)

    def test_deterministic_fallback_fails_closed(self):
        with self.assertRaises(RuntimeError):
            agent.deterministic_fallback()

    def test_locked_values_are_facts_not_copy_template(self):
        item=SimpleNamespace(exact_quantity_display="500 m²")
        price=SimpleNamespace(display="US$4.50/m²",conditions_display="indicative price; freight excluded; final quote to confirm",target_currency="USD",rate_date="2026-08-17",rate_source="ECB")
        locked=agent.locked_values(item,"English",price)
        self.assertEqual(locked["exact_quantity_display"],"500 m²")
        self.assertEqual(locked["exact_price_display"],"US$4.50/m²")
        self.assertNotIn("allowed_cta",locked)
        self.assertNotIn("commercial_value_statement",locked)


    def test_generic_secondary_company_email_is_valid_when_primary_is_empty(self):
        lead={
            "email":None,
            "personal_email":None,
            "secondary_contact_email":"info@artofflooring.co.uk",
            "secondary_contact_full_name":None,
            "contact_full_name":"Phil Stratton",
            "contact_first_name":"Phil",
            "decision_email_class":"company_contact",
        }
        resolved=agent.preferred_recipient_lead(lead)
        self.assertEqual(resolved["email"],"info@artofflooring.co.uk")
        self.assertEqual(resolved["_recipient_source"],"secondary_company_email_fallback")
        self.assertEqual(agent.contact_greeting(resolved,"English"),"")

    def test_named_secondary_email_still_beats_generic_fallback(self):
        lead={
            "email":None,
            "personal_email":None,
            "secondary_contact_email":"sarah.buyer@exampleflooring.com",
            "secondary_contact_full_name":"Sarah Buyer",
            "decision_email_class":"named_work_email",
        }
        resolved=agent.preferred_recipient_lead(lead)
        self.assertEqual(resolved["email"],"sarah.buyer@exampleflooring.com")
        self.assertEqual(resolved["_recipient_source"],"secondary_contact_email")
        self.assertEqual(resolved["contact_first_name"],"Sarah")

    def test_named_first_last_mailbox_uses_first_name(self):
        lead={"email":"james.heese@headlam.com","contact_first_name":"James","contact_last_name":"Heese","contact_full_name":"James Heese"}
        self.assertEqual(agent.contact_greeting(lead,"English"),"James")

    def test_reversed_mailbox_is_not_guessed(self):
        lead={"email":"heese.james@headlam.com","contact_first_name":"James","contact_last_name":"Heese","contact_full_name":"James Heese"}
        self.assertEqual(agent.contact_greeting(lead,"English"),"")

    def test_generic_company_mailbox_does_not_use_person_name(self):
        lead={"email":"info@headlam.com","contact_first_name":"James","contact_last_name":"Heese","contact_full_name":"James Heese"}
        self.assertEqual(agent.contact_greeting(lead,"English"),"")

    def test_history_similarity_is_enforced(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        self.assertIn("historical_bodies + accepted_bodies",source)
        self.assertIn("recent_stock_copy_context",source)
        self.assertIn('runtime_control.require_float("max_body_similarity"',source)
        self.assertNotIn("MAX_BODY_SIMILARITY",source)


    def test_manual_stock_queue_waits_until_local_send_window(self):
        lead={"country":"United Kingdom"}
        request={"force_local_window":False}
        early=datetime(2026,8,18,5,0,tzinfo=timezone.utc)
        due=datetime(2026,8,18,9,0,tzinfo=timezone.utc)
        ok, reason=agent.manual_stock_request_due_now(lead,request,early,9,18,{0,1,2,3,4})
        self.assertFalse(ok)
        self.assertIn("waiting",reason)
        ok, reason=agent.manual_stock_request_due_now(lead,request,due,9,18,{0,1,2,3,4})
        self.assertTrue(ok,reason)

    def test_manual_stock_force_window_bypasses_timing(self):
        lead={"country":"Brazil"}
        ok, _=agent.manual_stock_request_due_now(
            lead,{"force_local_window":True},datetime(2026,8,18,2,0,tzinfo=timezone.utc),9,18,{0,1,2,3,4}
        )
        self.assertTrue(ok)

    def test_manual_workflow_force_window_bypasses_queued_row_timing(self):
        lead={"country":"Brazil"}
        ok, reason=agent.manual_stock_request_due_now(
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

    def test_manual_stock_claim_scans_past_sleeping_timezones(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        start=source.index("def claim_manual_promotion_request")
        end=source.index("def finish_manual_promotion_request",start)
        block=source[start:end]
        self.assertIn("limit(scan_limit)",block)
        self.assertIn("manual_stock_request_due_now",block)
        self.assertIn("run_force_local_window=run_force_local_window",block)
        self.assertIn("continue",block)
        self.assertIn('eq("status", "queued")',block)
        self.assertIn("run_force_local_window=force_window",source)
        self.assertIn("def claim_manual_promotion_requests",source)
        self.assertIn("candidates = manual_candidates + automatic_candidates",source)
        self.assertIn("manual_retry_reasons",source)

    def test_inventory_and_low_moq_safety_remain(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        for marker in ("fetch_active_inventory_snapshot","filter_low_moq_stock_items","select_cap_aware_match","stock_item_counts_sent_today","recent_stock_offer_by_lead","next_campaign_sequence_number"):
            self.assertIn(marker,source)
        self.assertFalse(hasattr(agent,"DEFAULT_DAILY_LIMIT"))
        self.assertIn('runtime_control.require_float("normal_production_moq_m2"',source)
        self.assertNotIn("MANUAL QUEUE PRIORITY HOLD",source)
        self.assertIn('runtime_control.require_bool("manual_queue_fill_then_auto")',source)

    def test_split_recipient_windows_exclude_lunch_and_weekends(self):
        windows=((9,11),(14,17))
        self.assertTrue(agent.inside_send_window(datetime(2026,8,20,10,0),9,17,{0,1,2,3,4},windows))
        self.assertFalse(agent.inside_send_window(datetime(2026,8,20,12,0),9,17,{0,1,2,3,4},windows))
        self.assertTrue(agent.inside_send_window(datetime(2026,8,20,15,0),9,17,{0,1,2,3,4},windows))
        self.assertFalse(agent.inside_send_window(datetime(2026,8,22,10,0),9,17,{0,1,2,3,4},windows))

    def test_stock_renderer_keeps_named_greeting_offer_cta_and_signature(self):
        lead={
            "name":"Example Floors",
            "country":"United Kingdom",
            "email":"sarah.buyer@examplefloors.com",
            "contact_first_name":"Sarah",
            "contact_last_name":"Buyer",
            "contact_full_name":"Sarah Buyer",
        }
        draft=agent.PromotionalEmailDraft(
            language_name="English",
            subject="Ready stock for your range",
            body=(
                "Your trade flooring range makes this confirmed LVT lot relevant: "
                "500 m² at US$4.50/m², available for export."
                "\n\nWould you like the specifications and loading details?"
            ),
            selected_item_id="stock-1",
            quantity_copy="500 m²",
            price_copy="US$4.50/m²",
            price_conditions_copy="freight excluded",
        )
        rendered=agent.compose_body(lead,"English",draft)
        self.assertTrue(rendered.startswith("Hello Sarah,\n\n"))
        self.assertIn("\n\nWould you like the specifications and loading details?\n\n",rendered)
        self.assertIn("Ready Stock Sales | Client Company",rendered)
        self.assertIn("https://example.com",rendered)

    def test_stock_mailbox_reply_to_is_supabase_driven(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        self.assertIn('runtime_control.require_text("reply_to_email")',source)
        self.assertNotIn("DEFAULT_REPLY_TO",source)


    def test_manual_stock_retry_is_throttled_to_one_attempt_per_recipient_day(self):
        lead={"country":"United Kingdom"}
        request={
            "force_local_window":False,
            "error_message":"retry: draft service unavailable",
            "updated_at":"2026-08-19T08:00:00+00:00",
        }
        ok, reason=agent.manual_stock_request_due_now(
            lead,request,datetime(2026,8,19,10,0,tzinfo=timezone.utc),9,18,{0,1,2,3,4}
        )
        self.assertFalse(ok)
        self.assertIn("retry already attempted today",reason)
        ok, reason=agent.manual_stock_request_due_now(
            lead,request,datetime(2026,8,20,10,0,tzinfo=timezone.utc),9,18,{0,1,2,3,4}
        )
        self.assertTrue(ok,reason)

    def test_explicit_timing_override_can_retry_after_deploying_a_fix(self):
        lead={"country":"United Kingdom"}
        request={
            "force_local_window":True,
            "error_message":"retry: Stage A score arithmetic failed",
            "updated_at":"2026-08-21T08:45:00+00:00",
        }
        ok, reason=agent.manual_stock_request_due_now(
            lead,request,datetime(2026,8,21,10,0,tzinfo=timezone.utc),9,18,{0,1,2,3,4}
        )
        self.assertTrue(ok,reason)
        self.assertIn("queued request override",reason)

    def test_manual_stock_operator_selection_bypasses_soft_route_but_not_hard_safety(self):
        soft={
            "lead_id":"manual-stock-1",
            "email":"buyer@example.com",
            "procurement_route":"hold_unqualified",
            "ai_outreach_enabled":False,
            "do_not_contact":False,
        }
        self.assertEqual(agent.manual_stock_hard_stop_reason(soft,"stock@example.com"),"")
        blocked={**soft,"email_bounce_status":"bounced"}
        self.assertIn("bounced/invalid",agent.manual_stock_hard_stop_reason(blocked,"stock@example.com"))
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        self.assertIn("build_manual_stock_candidate",source)
        self.assertIn("defer_manual_promotion_request",source)
        self.assertIn("retry already attempted today",source)

    def test_p31_stock_uses_live_active_snapshot_and_sent_folder_contract(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        workflow=(HERE.parent/".github/workflows/stock_promotional_agent_v15.yml").read_text(encoding="utf-8")
        self.assertEqual(agent.DEFAULT_INVENTORY_SNAPSHOT_ID,"")
        self.assertIn('required_snapshot_id = clean(os.environ.get("STOCK_INVENTORY_SNAPSHOT_ID"))',source)
        self.assertIn('.eq("is_active", True)',source)
        self.assertNotIn('STOCK_INVENTORY_SNAPSHOT_ID: "inventory_20260803_9fa9eef9"',workflow)
        self.assertIn("verify_sent_mailbox_access(sender, password)",source)
        self.assertIn("reconcile_unarchived_sent_messages",source)
        self.assertIn("smtp+imap_sent",source)


    def test_p32_stock_failure_logging_cannot_downgrade_confirmed_send(self):
        source=(HERE/"stock_promotional_agent_v15.py").read_text(encoding="utf-8")
        start=source.index("def mark_message_failed")
        end=source.index("def mark_message_sent", start)
        self.assertIn('.eq("status", "generated")', source[start:end])


if __name__=="__main__": unittest.main(verbosity=2)
