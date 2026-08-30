-- Applied live to Supabase on 2026-08-16.
-- Outbound sequence messages remain unique, while inbound mail is idempotent by provider Message-ID
-- and may contain multiple events (bounce, auto-reply, human reply) for the same outbound sequence.

drop index if exists public.uq_email_campaign_lead_sequence;

create unique index if not exists uq_email_outbound_campaign_lead_sequence
on public.email_messages (campaign_id, lead_id, sequence_number, direction)
where direction = 'outbound';

create unique index if not exists uq_email_inbound_provider_message
on public.email_messages (provider_message_id)
where direction = 'inbound' and provider_message_id is not null;
