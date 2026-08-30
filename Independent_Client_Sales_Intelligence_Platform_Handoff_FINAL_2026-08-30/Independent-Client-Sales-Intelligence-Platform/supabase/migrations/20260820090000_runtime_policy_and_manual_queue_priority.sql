-- P33 repository reconstruction: runtime policy + manual queue integrity.
-- This file mirrors the idempotent production changes that were already applied
-- before P34, so a clean deployment has the complete migration chain.

update public.campaign_controls
set runtime_settings = coalesce(runtime_settings,'{}'::jsonb)
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'campaign_timezone' then jsonb_build_object('campaign_timezone','UTC') else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'local_send_start_hour' then jsonb_build_object('local_send_start_hour',9) else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'local_send_end_hour' then jsonb_build_object('local_send_end_hour',18) else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'local_send_weekdays' then jsonb_build_object('local_send_weekdays',jsonb_build_array(0,1,2,3,4)) else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'reply_sync_lookback_days' then jsonb_build_object('reply_sync_lookback_days',30) else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'cross_campaign_cooldown_days' then jsonb_build_object('cross_campaign_cooldown_days',14) else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'manual_queue_strict_priority' then jsonb_build_object('manual_queue_strict_priority',true) else '{}'::jsonb end
  || case when control_key='lead_outreach' and not coalesce(runtime_settings,'{}'::jsonb) ? 'same_company_cooldown_days' then jsonb_build_object('same_company_cooldown_days',30) else '{}'::jsonb end
  || case when control_key='lead_outreach' and not coalesce(runtime_settings,'{}'::jsonb) ? 'max_research_candidates_per_run' then jsonb_build_object('max_research_candidates_per_run',15) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'max_per_item_per_run' then jsonb_build_object('max_per_item_per_run',2) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'min_stock_match_score' then jsonb_build_object('min_stock_match_score',72) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'max_inventory_age_days' then jsonb_build_object('max_inventory_age_days',3650) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'min_category_fit_score' then jsonb_build_object('min_category_fit_score',20) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'max_per_country_per_run' then jsonb_build_object('max_per_country_per_run',2) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'max_selector_stock_items' then jsonb_build_object('max_selector_stock_items',30) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'normal_production_moq_m2' then jsonb_build_object('normal_production_moq_m2',800) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'minimum_promotional_area_m2' then jsonb_build_object('minimum_promotional_area_m2',20) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'same_stock_item_cooldown_days' then jsonb_build_object('same_stock_item_cooldown_days',30) else '{}'::jsonb end
  || case when control_key='stock_promotion' and not coalesce(runtime_settings,'{}'::jsonb) ? 'max_candidate_attempts_per_run' then jsonb_build_object('max_candidate_attempts_per_run',24) else '{}'::jsonb end,
    updated_at=now()
where control_key in ('lead_outreach','stock_promotion');

-- A lead may have only one active manual request across campaigns. This prevents
-- simultaneous export + stock processing and makes cross-campaign cooldown deterministic.
create unique index if not exists uq_manual_promotion_queue_active_lead
  on public.manual_promotion_queue(lead_id)
  where status in ('queued','processing');

create unique index if not exists uq_manual_promotion_queue_active_lead_campaign
  on public.manual_promotion_queue(lead_id,campaign_key)
  where status in ('queued','processing');
