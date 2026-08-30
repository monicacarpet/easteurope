-- Platform Sales Intelligence — final platform upgrade 2026-08-09
-- Run once in Supabase SQL Editor before deploying the matching frontend/agents.
-- Adds: notes/follow-ups, campaign controls for both agents, and the current stock summary.


create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Lead notes and follow-ups
-- ---------------------------------------------------------------------------
create table if not exists public.lead_notes (
    note_id uuid primary key default gen_random_uuid(),
    lead_id text not null references public.leads(lead_id) on delete cascade,
    body text not null check (length(trim(body)) > 0),
    created_by uuid default auth.uid(),
    created_at timestamptz not null default now()
);

create index if not exists idx_lead_notes_lead_created
    on public.lead_notes (lead_id, created_at desc);

create table if not exists public.lead_followups (
    followup_id uuid primary key default gen_random_uuid(),
    lead_id text not null references public.leads(lead_id) on delete cascade,
    title text not null check (length(trim(title)) > 0),
    due_at timestamptz not null,
    status text not null default 'open' check (status in ('open','completed','cancelled')),
    created_by uuid default auth.uid(),
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists idx_lead_followups_due
    on public.lead_followups (status, due_at);
create index if not exists idx_lead_followups_lead
    on public.lead_followups (lead_id, due_at);

alter table public.lead_notes enable row level security;
alter table public.lead_followups enable row level security;

grant select, insert on public.lead_notes to authenticated;
grant select, insert, update on public.lead_followups to authenticated;

-- Logged-in Platform users can read/write notes and follow-ups. Role-level route access
-- remains enforced by the app; the service role used by backend agents bypasses RLS.
drop policy if exists platform_notes_select on public.lead_notes;
create policy platform_notes_select on public.lead_notes
    for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists platform_notes_insert on public.lead_notes;
create policy platform_notes_insert on public.lead_notes
    for insert to authenticated with check ((select auth.uid()) is not null);

drop policy if exists platform_followups_select on public.lead_followups;
create policy platform_followups_select on public.lead_followups
    for select to authenticated using ((select auth.uid()) is not null);
drop policy if exists platform_followups_insert on public.lead_followups;
create policy platform_followups_insert on public.lead_followups
    for insert to authenticated with check ((select auth.uid()) is not null);
drop policy if exists platform_followups_update on public.lead_followups;
create policy platform_followups_update on public.lead_followups
    for update to authenticated
    using ((select auth.uid()) is not null)
    with check ((select auth.uid()) is not null);

-- ---------------------------------------------------------------------------
-- 2) Runtime controls for the two production email agents
-- ---------------------------------------------------------------------------
create table if not exists public.campaign_controls (
    control_key text primary key,
    display_name text not null,
    campaign_name text not null,
    sender_email text not null,
    enabled boolean not null default true,
    start_date date,
    end_date date,
    target_countries text[] not null default '{}',
    notes text,
    updated_by uuid,
    updated_at timestamptz not null default now(),
    check (end_date is null or start_date is null or end_date >= start_date)
);

alter table public.campaign_controls enable row level security;
grant select on public.campaign_controls to authenticated;
grant insert, update on public.campaign_controls to authenticated;

-- Everyone authenticated can see the controls, but only Platform admin/management roles can edit.
drop policy if exists platform_campaign_controls_select on public.campaign_controls;
create policy platform_campaign_controls_select on public.campaign_controls
    for select to authenticated using ((select auth.uid()) is not null);

drop policy if exists platform_campaign_controls_insert on public.campaign_controls;
create policy platform_campaign_controls_insert on public.campaign_controls
    for insert to authenticated
    with check (
      exists (
        select 1 from public.app_profiles p
        where p.id = (select auth.uid())
          and p.active = true
          and p.role in ('ceo','business_gm','bi_admin')
      )
    );

drop policy if exists platform_campaign_controls_update on public.campaign_controls;
create policy platform_campaign_controls_update on public.campaign_controls
    for update to authenticated
    using (
      exists (
        select 1 from public.app_profiles p
        where p.id = (select auth.uid())
          and p.active = true
          and p.role in ('ceo','business_gm','bi_admin')
      )
    )
    with check (
      exists (
        select 1 from public.app_profiles p
        where p.id = (select auth.uid())
          and p.active = true
          and p.role in ('ceo','business_gm','bi_admin')
      )
    );

insert into public.campaign_controls (
    control_key, display_name, campaign_name, sender_email, enabled,
    start_date, end_date, target_countries, notes, updated_at
) values
    (
      'lead_outreach',
      'Lead outreach',
      'Client Lead Outreach',
      'outreach@example.com',
      false, null, null, '{}',
      'Disabled until the client completes configuration and preview approval.', now()
    ),
    (
      'stock_promotion',
      'Stock promotion',
      'Client Ready Stock Promotion',
      'stock@example.com',
      false, null, null, '{}',
      'Disabled until client-owned inventory, prices, mailboxes, and preview approval are complete.', now()
    )
on conflict (control_key) do update set
    display_name = excluded.display_name,
    campaign_name = excluded.campaign_name,
    sender_email = excluded.sender_email,
    enabled = false,
    updated_at = public.campaign_controls.updated_at;

-- ---------------------------------------------------------------------------
-- 3) Current stock BI summary supplied 2026-08-08
-- ---------------------------------------------------------------------------
create table if not exists public.stock_dashboard_summaries (
    summary_id text primary key,
    effective_date date not null,
    total_models integer not null check (total_models >= 0),
    total_area_m2 numeric not null check (total_area_m2 >= 0),
    minimum_model_area_m2 numeric,
    all_models_above_minimum boolean not null default false,
    source_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.stock_dashboard_product_summary (
    summary_id text not null references public.stock_dashboard_summaries(summary_id) on delete cascade,
    product_group text not null,
    model_count integer not null check (model_count >= 0),
    area_m2 numeric not null check (area_m2 >= 0),
    primary key (summary_id, product_group)
);

alter table public.stock_dashboard_summaries enable row level security;
alter table public.stock_dashboard_product_summary enable row level security;
grant select on public.stock_dashboard_summaries to authenticated;
grant select on public.stock_dashboard_product_summary to authenticated;

drop policy if exists platform_authenticated_read_stock_dashboard_summaries
    on public.stock_dashboard_summaries;
create policy platform_authenticated_read_stock_dashboard_summaries
    on public.stock_dashboard_summaries for select to authenticated using (true);

drop policy if exists platform_authenticated_read_stock_dashboard_product_summary
    on public.stock_dashboard_product_summary;
create policy platform_authenticated_read_stock_dashboard_product_summary
    on public.stock_dashboard_product_summary for select to authenticated using (true);
