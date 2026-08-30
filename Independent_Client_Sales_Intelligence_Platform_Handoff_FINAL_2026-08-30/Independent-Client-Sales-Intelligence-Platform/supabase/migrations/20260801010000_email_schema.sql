-- Compatibility schema for a fresh Supabase project.
-- On an existing production project this only adds missing columns/indexes.

create extension if not exists pgcrypto;

create table if not exists public.email_campaigns (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    status text not null default 'draft',
    sender_name text,
    sender_email text,
    daily_limit integer not null default 5,
    batch_size integer not null default 5,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.email_campaigns add column if not exists name text;
alter table public.email_campaigns add column if not exists status text default 'draft';
alter table public.email_campaigns add column if not exists sender_name text;
alter table public.email_campaigns add column if not exists sender_email text;
alter table public.email_campaigns add column if not exists daily_limit integer default 5;
alter table public.email_campaigns add column if not exists batch_size integer default 5;
alter table public.email_campaigns add column if not exists created_at timestamptz default now();
alter table public.email_campaigns add column if not exists updated_at timestamptz default now();

create table if not exists public.email_messages (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
    lead_id text references public.leads(lead_id) on delete set null,
    direction text not null default 'outbound',
    sequence_number integer not null default 0,
    message_type text,
    sender_email text,
    recipient_email text,
    subject text,
    body_text text,
    status text not null default 'generated',
    provider text,
    provider_message_id text,
    provider_thread_id text,
    ai_model text,
    generated_at timestamptz,
    sent_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.email_messages add column if not exists lead_id text;
alter table public.email_messages add column if not exists direction text default 'outbound';
alter table public.email_messages add column if not exists sequence_number integer default 0;
alter table public.email_messages add column if not exists message_type text;
alter table public.email_messages add column if not exists sender_email text;
alter table public.email_messages add column if not exists recipient_email text;
alter table public.email_messages add column if not exists subject text;
alter table public.email_messages add column if not exists body_text text;
alter table public.email_messages add column if not exists status text default 'generated';
alter table public.email_messages add column if not exists provider text;
alter table public.email_messages add column if not exists provider_message_id text;
alter table public.email_messages add column if not exists provider_thread_id text;
alter table public.email_messages add column if not exists ai_model text;
alter table public.email_messages add column if not exists generated_at timestamptz;
alter table public.email_messages add column if not exists sent_at timestamptz;
alter table public.email_messages add column if not exists error_message text;
alter table public.email_messages add column if not exists created_at timestamptz default now();
alter table public.email_messages add column if not exists updated_at timestamptz default now();

create index if not exists idx_email_campaigns_name_status on public.email_campaigns (name, status, created_at desc);
create index if not exists idx_email_messages_campaign_status on public.email_messages (campaign_id, direction, status, sent_at desc);
create index if not exists idx_email_messages_lead on public.email_messages (lead_id, created_at desc);
create unique index if not exists idx_email_messages_campaign_lead_sequence
    on public.email_messages (campaign_id, lead_id, direction, sequence_number)
    where lead_id is not null;

