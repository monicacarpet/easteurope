-- P34: fresh outbound rescan hardening.
-- Keep mutable commercial/scheduling/copy policy in Supabase rather than Python/YAML.

update public.campaign_controls
set runtime_settings = coalesce(runtime_settings, '{}'::jsonb) || jsonb_build_object(
      'followup_1_days', 5,
      'followup_2_days', 6,
      'recent_subject_lookback_days', 180,
      'max_low_value_targets_per_run', 2,
      'max_same_sales_angle_per_run', 4,
      'max_draft_similarity', 0.82,
      'expand_to_all_not_contacted', true,
      'opening_paragraph_max_words', 100,
      'second_paragraph_max_words', 70,
      'manual_queue_scan_limit', 500,
      'manual_processing_stale_hours', 2,
      'sender_person_name', 'Sales Team',
      'sender_job_title', 'International Sales',
      'sender_phone', '',
      'reply_to_email', sender_email,
      'sender_identity_line', 'Configure the verified client identity before live sending'
    ),
    updated_at = now()
where control_key = 'lead_outreach';

update public.campaign_controls
set runtime_settings = coalesce(runtime_settings, '{}'::jsonb) || jsonb_build_object(
      'recent_subject_lookback_days', 180,
      'max_body_similarity', 0.82,
      'include_cold_leads', true,
      'fx_max_age_days', 10,
      'manual_queue_scan_limit', 500,
      'manual_processing_stale_hours', 2,
      'sender_person_name', 'Sales Team',
      'sender_job_title', 'Ready Stock Sales',
      'sender_phone', '',
      'reply_to_email', sender_email,
      'sender_identity_line', 'Configure the verified client identity before live sending'
    ),
    updated_at = now()
where control_key = 'stock_promotion';
