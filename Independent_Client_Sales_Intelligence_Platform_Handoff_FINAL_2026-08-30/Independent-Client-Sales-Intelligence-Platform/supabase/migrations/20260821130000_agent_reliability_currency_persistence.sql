-- P37: reliable 15/day agents, split recipient-local windows, manual-first
-- queue draining with automatic quota fill, and persistent queue timing controls.

update public.email_campaigns
set daily_limit = 15,
    batch_size = 15
where name in (
  'Client Lead Outreach',
  'Client Ready Stock Promotion'
);

update public.email_campaigns
set campaign_goal = replace(
  campaign_goal,
  'TIMING: recipient-local weekdays, preferably 09:30-11:30 or 13:30-15:30. Never force sending outside the recipient''s local window.',
  'TIMING: recipient-local Monday-Friday, only 09:00-11:00 or 14:00-17:00. Manual timing overrides apply only to explicitly queued rows.'
)
where name = 'Client Lead Outreach';

update public.email_campaigns
set campaign_goal = campaign_goal || E'\n\nTIMING: recipient-local Monday-Friday, only 09:00-11:00 or 14:00-17:00. Manual timing overrides apply only to explicitly queued rows.'
where name = 'Client Ready Stock Promotion'
  and position(
    'TIMING: recipient-local Monday-Friday, only 09:00-11:00 or 14:00-17:00'
    in campaign_goal
  ) = 0;

update public.campaign_controls
set runtime_settings = coalesce(runtime_settings, '{}'::jsonb) || jsonb_build_object(
      'local_send_start_hour', 9,
      'local_send_end_hour', 17,
      'local_send_windows', jsonb_build_array(
        jsonb_build_array(9, 11),
        jsonb_build_array(14, 17)
      ),
      'local_send_weekdays', jsonb_build_array(0, 1, 2, 3, 4),
      'manual_queue_fill_then_auto', true,
      'manual_queue_strict_priority', false,
      'manual_queue_scan_limit', 500,
      'manual_processing_stale_hours', 1,
      'max_research_candidates_per_run', 60,
      'sender_job_title', 'International Sales'
    ),
    updated_at = now()
where control_key = 'lead_outreach';

update public.campaign_controls
set runtime_settings = coalesce(runtime_settings, '{}'::jsonb) || jsonb_build_object(
      'local_send_start_hour', 9,
      'local_send_end_hour', 17,
      'local_send_windows', jsonb_build_array(
        jsonb_build_array(9, 11),
        jsonb_build_array(14, 17)
      ),
      'local_send_weekdays', jsonb_build_array(0, 1, 2, 3, 4),
      'manual_queue_fill_then_auto', true,
      'manual_queue_strict_priority', false,
      'manual_queue_scan_limit', 500,
      'manual_processing_stale_hours', 1,
      'max_candidate_attempts_per_run', 60,
      'max_per_country_per_run', 4,
      'sender_job_title', 'Ready Stock Sales'
    ),
    updated_at = now()
where control_key = 'stock_promotion';

create or replace function public.set_manual_queue_timing_override(
  p_queue_id uuid,
  p_force_local_window boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_row public.manual_promotion_queue%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select lower(coalesce(p.role, ''))
    into v_role
  from public.app_profiles as p
  where p.id = auth.uid()
    and p.active is true
  limit 1;

  if coalesce(v_role, '') not in ('ceo', 'business_gm', 'bi_admin') then
    raise exception using errcode = '42501', message = 'Administrator role required';
  end if;

  update public.manual_promotion_queue
  set force_local_window = coalesce(p_force_local_window, false),
      updated_at = now()
  where id = p_queue_id
    and status = 'queued'
    and campaign_key in ('lead_outreach', 'stock_promotion')
  returning * into v_row;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Queued manual request was not found or is already processing';
  end if;

  return jsonb_build_object(
    'success', true,
    'queue_id', v_row.id,
    'campaign_key', v_row.campaign_key,
    'force_local_window', v_row.force_local_window,
    'status', v_row.status
  );
end;
$function$;

revoke all on function public.set_manual_queue_timing_override(uuid, boolean)
  from public, anon;
grant execute on function public.set_manual_queue_timing_override(uuid, boolean)
  to authenticated;
