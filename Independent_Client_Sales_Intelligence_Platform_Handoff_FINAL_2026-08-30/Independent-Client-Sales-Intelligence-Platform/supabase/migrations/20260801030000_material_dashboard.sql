-- Platform Material Dashboard React migration
-- Run AFTER docs/SUPABASE_SCHEMA.sql and docs/STOCK_PROMOTIONAL_AGENT_SCHEMA.sql.
-- Safe for the existing Streamlit/Python agents: service-role access continues to bypass RLS.


create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Compatibility columns used by the React lead workspace and GIS
-- ---------------------------------------------------------------------------
alter table public.leads add column if not exists latitude double precision;
alter table public.leads add column if not exists longitude double precision;
alter table public.leads add column if not exists contact_full_name text;
alter table public.leads add column if not exists contact_first_name text;
alter table public.leads add column if not exists contact_last_name text;
alter table public.leads add column if not exists contact_job_title text;
alter table public.leads add column if not exists contact_department text;
alter table public.leads add column if not exists contact_linkedin_url text;
alter table public.leads add column if not exists company_domain text;
alter table public.leads add column if not exists company_linkedin_url text;
alter table public.leads add column if not exists email_verified boolean;
alter table public.leads add column if not exists email_verification_status text;
alter table public.leads add column if not exists account_tier text;
alter table public.leads add column if not exists pvc_fit_status text;
alter table public.leads add column if not exists next_followup_at timestamptz;

create index if not exists idx_leads_assigned_to_email on public.leads (lower(assigned_to_email));
create index if not exists idx_leads_country on public.leads (country);
create index if not exists idx_leads_coordinates on public.leads (latitude, longitude);
create index if not exists idx_leads_company_domain on public.leads (lower(company_domain));

-- ---------------------------------------------------------------------------
-- 2. Application users and operational workspace
-- ---------------------------------------------------------------------------
create table if not exists public.app_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    full_name text,
    role text not null default 'sales_rep'
        check (role in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep')),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.lead_notes (
    note_id uuid primary key default gen_random_uuid(),
    lead_id text not null references public.leads(lead_id) on delete cascade,
    author_id uuid not null default auth.uid() references public.app_profiles(id) on delete restrict,
    body text not null check (length(trim(body)) > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.lead_followups (
    followup_id uuid primary key default gen_random_uuid(),
    lead_id text not null references public.leads(lead_id) on delete cascade,
    owner_id uuid not null default auth.uid() references public.app_profiles(id) on delete restrict,
    title text not null check (length(trim(title)) > 0),
    due_at timestamptz not null,
    status text not null default 'open' check (status in ('open','completed','cancelled')),
    completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.app_activity_log (
    activity_id bigserial primary key,
    actor_profile_id uuid references public.app_profiles(id) on delete set null,
    actor_email text,
    event_type text not null,
    entity_type text not null,
    entity_id text,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- One compact row per month; the source inventory tables remain authoritative.
create table if not exists public.platform_stock_monthly_snapshots (
    snapshot_month date primary key check (snapshot_month = date_trunc('month', snapshot_month)::date),
    source_inventory_snapshot_id text references public.stock_inventory_snapshots(inventory_snapshot_id) on delete restrict,
    total_area_m2 numeric not null,
    total_item_count integer not null,
    promotional_area_m2 numeric not null,
    promotional_item_count integer not null,
    export_area_m2 numeric not null,
    domestic_area_m2 numeric not null,
    price_confirmed_item_count integer not null,
    product_mix jsonb not null default '[]'::jsonb,
    captured_by uuid references public.app_profiles(id) on delete set null,
    captured_at timestamptz not null default now()
);

create index if not exists idx_lead_notes_lead_created on public.lead_notes (lead_id, created_at desc);
create index if not exists idx_lead_followups_owner_due on public.lead_followups (owner_id, status, due_at);
create index if not exists idx_lead_followups_lead_due on public.lead_followups (lead_id, due_at);
create index if not exists idx_app_activity_created on public.app_activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Auth profile bootstrap (never trusts role metadata from the browser)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_app_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.app_profiles (id, email, full_name, role, active)
    values (
        new.id,
        lower(coalesce(new.email, '')),
        nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
        'sales_rep',
        true
    )
    on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.app_profiles.full_name, excluded.full_name),
        updated_at = now();
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_platform_profile on auth.users;
create trigger on_auth_user_created_platform_profile
after insert or update of email on auth.users
for each row execute function public.handle_new_app_user();

insert into public.app_profiles (id, email, full_name, role, active)
select id, lower(coalesce(email, '')), nullif(trim(coalesce(raw_user_meta_data ->> 'full_name', '')), ''), 'sales_rep', true
from auth.users
where email is not null
on conflict (id) do update
set email = excluded.email,
    full_name = coalesce(public.app_profiles.full_name, excluded.full_name),
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 4. Role helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_app_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select lower(email) from public.app_profiles where id = auth.uid() and active = true;
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from public.app_profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_app_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists(select 1 from public.app_profiles where id = auth.uid() and active = true);
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(public.current_app_role() in ('ceo','business_gm','bi_admin'), false);
$$;

create or replace function public.can_view_analytics()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce(public.current_app_role() in ('ceo','business_gm','bi_admin','bi_partial','sales_manager'), false);
$$;

-- ---------------------------------------------------------------------------
-- 5. Secure lead ownership functions
-- ---------------------------------------------------------------------------
create or replace function public.claim_lead_for_current_user(p_lead_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := public.current_app_email();
    v_name text;
    v_updated integer;
begin
    if v_email is null then
        raise exception 'Inactive or unauthorized account';
    end if;

    select coalesce(full_name, email) into v_name
    from public.app_profiles where id = auth.uid();

    update public.leads
    set lead_status = 'claimed',
        assigned_to_email = v_email,
        assigned_to_name = v_name,
        assigned_at = now(),
        updated_at = now()
    where lead_id = p_lead_id
      and coalesce(lead_status, 'available') = 'available';

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
        return jsonb_build_object('success', false, 'message', 'Lead already claimed or unavailable');
    end if;

    insert into public.lead_claims (lead_id, user_email, user_name, claimed_at, action)
    values (p_lead_id, v_email, v_name, now(), 'claimed')
    on conflict (lead_id) do update
    set user_email = excluded.user_email,
        user_name = excluded.user_name,
        claimed_at = excluded.claimed_at,
        action = 'claimed';

    insert into public.app_activity_log(actor_profile_id, actor_email, event_type, entity_type, entity_id)
    values (auth.uid(), v_email, 'lead_claimed', 'lead', p_lead_id);

    return jsonb_build_object('success', true, 'message', 'Lead claimed successfully');
end;
$$;

create or replace function public.release_lead_for_current_user(p_lead_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text := public.current_app_email();
    v_updated integer;
begin
    if v_email is null then
        raise exception 'Inactive or unauthorized account';
    end if;

    update public.leads
    set lead_status = 'available',
        assigned_to_email = null,
        assigned_to_name = null,
        assigned_at = null,
        updated_at = now()
    where lead_id = p_lead_id
      and (lower(coalesce(assigned_to_email, '')) = v_email or public.is_app_admin());

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
        return jsonb_build_object('success', false, 'message', 'You do not own this lead');
    end if;

    update public.lead_claims
    set action = 'released', claimed_at = now()
    where lead_id = p_lead_id;

    insert into public.app_activity_log(actor_profile_id, actor_email, event_type, entity_type, entity_id)
    values (auth.uid(), v_email, 'lead_released', 'lead', p_lead_id);

    return jsonb_build_object('success', true, 'message', 'Lead released successfully');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Monthly stock snapshot function
-- ---------------------------------------------------------------------------
create or replace function public.capture_platform_stock_monthly_snapshot(p_snapshot_month date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_month date := date_trunc('month', coalesce(p_snapshot_month, current_date))::date;
    v_source public.stock_inventory_snapshots%rowtype;
    v_product_mix jsonb;
begin
    if not public.is_app_admin() then
        raise exception 'Administrator role required';
    end if;

    select * into v_source
    from public.stock_inventory_snapshots
    where is_active = true
    order by effective_date desc, created_at desc
    limit 1;

    if v_source.inventory_snapshot_id is null then
        raise exception 'No active stock inventory snapshot';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'product_type', product_type,
        'area_m2', area_m2,
        'item_count', item_count
    ) order by area_m2 desc), '[]'::jsonb)
    into v_product_mix
    from (
        select coalesce(product_type, 'Other') product_type,
               round(coalesce(sum(estimated_area_m2), 0), 4) area_m2,
               count(*)::integer item_count
        from public.stock_items
        where inventory_snapshot_id = v_source.inventory_snapshot_id
        group by coalesce(product_type, 'Other')
    ) mix;

    insert into public.platform_stock_monthly_snapshots (
        snapshot_month, source_inventory_snapshot_id,
        total_area_m2, total_item_count,
        promotional_area_m2, promotional_item_count,
        export_area_m2, domestic_area_m2,
        price_confirmed_item_count, product_mix,
        captured_by, captured_at
    )
    select
        v_month,
        v_source.inventory_snapshot_id,
        round(coalesce(sum(si.estimated_area_m2), 0), 4),
        count(*)::integer,
        round(coalesce(sum(si.estimated_area_m2) filter (
            where si.promotional_email_enabled = true
               or si.interest_check_enabled = true
               or si.availability_status = 'promotional_ready'
        ), 0), 4),
        count(*) filter (
            where si.promotional_email_enabled = true
               or si.interest_check_enabled = true
               or si.availability_status = 'promotional_ready'
        )::integer,
        round(coalesce(sum(si.estimated_area_m2) filter (where si.stock_market = '外销'), 0), 4),
        round(coalesce(sum(si.estimated_area_m2) filter (where si.stock_market = '内销'), 0), 4),
        count(*) filter (where si.price_status = 'confirmed')::integer,
        v_product_mix,
        auth.uid(),
        now()
    from public.stock_items si
    where si.inventory_snapshot_id = v_source.inventory_snapshot_id
    on conflict (snapshot_month) do update
    set source_inventory_snapshot_id = excluded.source_inventory_snapshot_id,
        total_area_m2 = excluded.total_area_m2,
        total_item_count = excluded.total_item_count,
        promotional_area_m2 = excluded.promotional_area_m2,
        promotional_item_count = excluded.promotional_item_count,
        export_area_m2 = excluded.export_area_m2,
        domestic_area_m2 = excluded.domestic_area_m2,
        price_confirmed_item_count = excluded.price_confirmed_item_count,
        product_mix = excluded.product_mix,
        captured_by = excluded.captured_by,
        captured_at = excluded.captured_at;

    insert into public.app_activity_log(actor_profile_id, actor_email, event_type, entity_type, entity_id, details)
    values (
        auth.uid(), public.current_app_email(), 'stock_snapshot_captured', 'stock_month', v_month::text,
        jsonb_build_object('source_inventory_snapshot_id', v_source.inventory_snapshot_id)
    );

    return jsonb_build_object(
        'success', true,
        'message', 'Monthly stock snapshot captured',
        'snapshot_month', v_month,
        'source_inventory_snapshot_id', v_source.inventory_snapshot_id
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Dashboard views
-- ---------------------------------------------------------------------------
create or replace view public.v_platform_stock_email_country as
select
    coalesce(nullif(trim(l.country), ''), 'Unknown') as country,
    count(*)::bigint as emails_sent,
    count(distinct em.lead_id)::bigint as companies_reached,
    max(em.sent_at) as last_sent_at
from public.email_messages em
join public.email_campaigns ec on ec.id::text = em.campaign_id::text
left join public.leads l on l.lead_id = em.lead_id
where public.is_app_active()
  and ec.name = 'Platform Ready Stock Promotional Offers'
  and em.direction = 'outbound'
  and em.status = 'sent'
  and em.sent_at >= date_trunc('month', now())
  and coalesce(em.subject, '') !~* '^\[DRY RUN'
group by coalesce(nullif(trim(l.country), ''), 'Unknown');

create or replace view public.v_platform_stock_daily_emails as
select
    coalesce(em.sent_at, em.generated_at, em.created_at)::date as sent_date,
    count(*) filter (where em.status = 'sent' and coalesce(em.subject, '') !~* '^\[DRY RUN')::bigint as sent_count,
    count(*) filter (where em.status = 'failed')::bigint as failed_count
from public.email_messages em
join public.email_campaigns ec on ec.id::text = em.campaign_id::text
where public.is_app_active()
  and ec.name = 'Platform Ready Stock Promotional Offers'
  and em.direction = 'outbound'
  and coalesce(em.sent_at, em.generated_at, em.created_at) >= date_trunc('month', now())
group by coalesce(em.sent_at, em.generated_at, em.created_at)::date;

create or replace view public.v_platform_stock_action_queue as
with active as (
    select inventory_snapshot_id
    from public.stock_inventory_snapshots
    where is_active = true
    order by effective_date desc, created_at desc
    limit 1
), stock as (
    select
        coalesce(si.product_type, 'Other') product_group,
        count(*)::integer stock_items,
        round(coalesce(sum(si.estimated_area_m2), 0), 4) stock_area_m2,
        array_agg(si.item_id) item_ids
    from public.stock_items si
    join active a on a.inventory_snapshot_id = si.inventory_snapshot_id
    where si.promotional_email_enabled = true
       or si.interest_check_enabled = true
       or si.availability_status = 'promotional_ready'
    group by coalesce(si.product_type, 'Other')
), sent as (
    select
        coalesce(si.product_type, 'Other') product_group,
        count(*) filter (where scm.status in ('sent','interested','quoted','sold'))::integer emails_sent,
        count(*) filter (where scm.status = 'interested')::integer interested,
        count(*) filter (where scm.status = 'quoted')::integer quoted,
        count(*) filter (where scm.status = 'sold')::integer sold
    from public.stock_campaign_matches scm
    join public.stock_items si on si.item_id = scm.selected_item_id
    group by coalesce(si.product_type, 'Other')
)
select
    s.product_group,
    s.stock_items,
    s.stock_area_m2,
    coalesce(e.emails_sent, 0) emails_sent,
    coalesce(e.interested, 0) interested,
    coalesce(e.quoted, 0) quoted,
    coalesce(e.sold, 0) sold,
    round((s.stock_area_m2 / greatest(coalesce(e.emails_sent, 0), 1))::numeric, 2) priority_score
from stock s
left join sent e using (product_group)
where public.is_app_active();

create or replace view public.v_platform_stock_campaign_funnel as
with campaign as (
    select id::text campaign_id
    from public.email_campaigns
    where name = 'Platform Ready Stock Promotional Offers'
    order by created_at desc
    limit 1
), counts as (
    select 'sent'::text stage,
           count(*)::bigint stage_count
    from public.email_messages em
    join campaign c on c.campaign_id = em.campaign_id::text
    where em.direction = 'outbound' and em.status = 'sent'
      and coalesce(em.subject, '') !~* '^\[DRY RUN'
    union all
    select 'interested', count(*)::bigint
    from public.stock_campaign_matches scm join campaign c on c.campaign_id = scm.campaign_id::text
    where scm.status = 'interested'
    union all
    select 'quoted', count(*)::bigint
    from public.stock_campaign_matches scm join campaign c on c.campaign_id = scm.campaign_id::text
    where scm.status = 'quoted'
    union all
    select 'sold', count(*)::bigint
    from public.stock_campaign_matches scm join campaign c on c.campaign_id = scm.campaign_id::text
    where scm.status = 'sold'
)
select stage, stage_count from counts where public.is_app_active();

create or replace view public.v_platform_lead_summary as
select
    count(*)::bigint total,
    count(*) filter (where coalesce(lead_status, 'available') = 'available')::bigint available,
    count(*) filter (where lead_status = 'claimed')::bigint claimed,
    count(*) filter (where email is not null and trim(email) <> '')::bigint "verifiedEmails",
    count(*) filter (where latitude between -90 and 90 and longitude between -180 and 180)::bigint geocoded,
    count(distinct country) filter (where country is not null and trim(country) <> '')::bigint countries
from public.leads
where public.is_app_active()
  and (
      public.can_view_analytics()
      or coalesce(lead_status, 'available') = 'available'
      or lower(coalesce(assigned_to_email, '')) = public.current_app_email()
  );

create or replace view public.v_platform_data_quality as
select
    count(*)::bigint total_leads,
    count(*) filter (where email is null or trim(email) = '')::bigint missing_email,
    count(*) filter (where latitude is null or longitude is null or latitude not between -90 and 90 or longitude not between -180 and 180)::bigint missing_coordinates,
    count(*) filter (
        where email is not null and trim(email) <> ''
          and not coalesce(email_verified, false)
          and lower(coalesce(email_verification_status, '')) not in ('valid','verified')
          and lower(coalesce(email_confidence, '')) <> 'high'
    )::bigint unverified_email,
    count(*) filter (where contact_full_name is null or trim(contact_full_name) = '')::bigint missing_contact,
    (
        select count(*)::bigint
        from (
            select lower(coalesce(nullif(trim(company_domain), ''), nullif(trim(website), ''))) domain_key
            from public.leads
            where coalesce(nullif(trim(company_domain), ''), nullif(trim(website), '')) is not null
            group by lower(coalesce(nullif(trim(company_domain), ''), nullif(trim(website), '')))
            having count(*) > 1
        ) d
    ) duplicate_domains
from public.leads
where public.can_view_analytics();

-- ---------------------------------------------------------------------------
-- 8. Row-level security
-- ---------------------------------------------------------------------------
alter table public.app_profiles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_claims enable row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_followups enable row level security;
alter table public.app_activity_log enable row level security;
alter table public.platform_stock_monthly_snapshots enable row level security;
alter table public.stock_inventory_snapshots enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_campaign_matches enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_messages enable row level security;

-- Recreate named policies idempotently.
do $$
declare p record;
begin
    for p in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and policyname like 'platform_react_%'
    loop
        execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    end loop;
end $$;

create policy platform_react_profiles_select on public.app_profiles
for select to authenticated
using (id = auth.uid() or public.is_app_admin());

create policy platform_react_profiles_admin_update on public.app_profiles
for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

create policy platform_react_leads_select on public.leads
for select to authenticated
using (
    public.is_app_active()
    and (
        public.can_view_analytics()
        or coalesce(lead_status, 'available') = 'available'
        or lower(coalesce(assigned_to_email, '')) = public.current_app_email()
    )
);

create policy platform_react_leads_admin_update on public.leads
for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

create policy platform_react_claims_select on public.lead_claims
for select to authenticated
using (public.can_view_analytics() or lower(user_email) = public.current_app_email());

create policy platform_react_notes_select on public.lead_notes
for select to authenticated
using (
    public.can_view_analytics()
    or author_id = auth.uid()
    or exists (
        select 1 from public.leads l
        where l.lead_id = lead_notes.lead_id
          and lower(coalesce(l.assigned_to_email, '')) = public.current_app_email()
    )
);

create policy platform_react_notes_insert on public.lead_notes
for insert to authenticated
with check (
    author_id = auth.uid()
    and public.is_app_active()
    and (
        public.can_view_analytics()
        or exists (
            select 1 from public.leads l
            where l.lead_id = lead_notes.lead_id
              and lower(coalesce(l.assigned_to_email, '')) = public.current_app_email()
        )
    )
);

create policy platform_react_followups_select on public.lead_followups
for select to authenticated
using (public.can_view_analytics() or owner_id = auth.uid());

create policy platform_react_followups_insert on public.lead_followups
for insert to authenticated
with check (
    owner_id = auth.uid()
    and public.is_app_active()
    and (
        public.can_view_analytics()
        or exists (
            select 1 from public.leads l
            where l.lead_id = lead_followups.lead_id
              and lower(coalesce(l.assigned_to_email, '')) = public.current_app_email()
        )
    )
);

create policy platform_react_followups_update on public.lead_followups
for update to authenticated
using (public.is_app_admin() or owner_id = auth.uid())
with check (public.is_app_admin() or owner_id = auth.uid());

create policy platform_react_activity_select on public.app_activity_log
for select to authenticated
using (public.can_view_analytics() or actor_profile_id = auth.uid());

create policy platform_react_stock_monthly_select on public.platform_stock_monthly_snapshots
for select to authenticated
using (public.is_app_active());

create policy platform_react_stock_source_select on public.stock_inventory_snapshots
for select to authenticated
using (public.is_app_active());

create policy platform_react_stock_items_select on public.stock_items
for select to authenticated
using (public.is_app_active());

create policy platform_react_stock_items_admin_update on public.stock_items
for update to authenticated
using (public.is_app_admin())
with check (public.is_app_admin());

create policy platform_react_stock_matches_analytics_select on public.stock_campaign_matches
for select to authenticated
using (public.can_view_analytics());

create policy platform_react_campaigns_analytics_select on public.email_campaigns
for select to authenticated
using (public.can_view_analytics());

create policy platform_react_messages_analytics_select on public.email_messages
for select to authenticated
using (public.can_view_analytics());

-- ---------------------------------------------------------------------------
-- 9. Grants for browser client
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select on public.app_profiles, public.leads, public.lead_claims,
    public.lead_notes, public.lead_followups, public.app_activity_log,
    public.platform_stock_monthly_snapshots, public.stock_inventory_snapshots,
    public.stock_items, public.stock_campaign_matches,
    public.email_campaigns, public.email_messages to authenticated;
grant insert on public.lead_notes, public.lead_followups to authenticated;
grant update on public.lead_followups, public.stock_items, public.app_profiles to authenticated;
grant usage, select on sequence public.app_activity_log_activity_id_seq to authenticated;

grant select on public.v_platform_stock_email_country,
    public.v_platform_stock_daily_emails,
    public.v_platform_stock_action_queue,
    public.v_platform_stock_campaign_funnel,
    public.v_platform_lead_summary,
    public.v_platform_data_quality to authenticated;

grant execute on function public.claim_lead_for_current_user(text) to authenticated;
grant execute on function public.release_lead_for_current_user(text) to authenticated;
grant execute on function public.capture_platform_stock_monthly_snapshot(date) to authenticated;

-- Seed the current month as the first baseline only when an app admin invokes the RPC.
-- This migration intentionally does not fabricate a previous-month value.

