-- Platform Activity Log Fix — 2026-08-09
-- Run once in Supabase SQL Editor.
-- Adds database-level audit events for notes, follow-ups, lead claims/releases,
-- campaign-control changes and sent email messages. It also backfills recent history.


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

create index if not exists idx_app_activity_created
    on public.app_activity_log (created_at desc);
create index if not exists idx_app_activity_event
    on public.app_activity_log (event_type, created_at desc);

alter table public.app_activity_log enable row level security;
grant select on public.app_activity_log to authenticated;

drop policy if exists platform_activity_select on public.app_activity_log;
create policy platform_activity_select on public.app_activity_log
    for select to authenticated
    using ((select auth.uid()) is not null);

create or replace function public.platform_activity_actor_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select lower(p.email)
    from public.app_profiles p
    where p.id = auth.uid()
      and p.active = true
    limit 1;
$$;

create or replace function public.platform_log_activity(
    p_event_type text,
    p_entity_type text,
    p_entity_id text,
    p_details jsonb default '{}'::jsonb,
    p_actor_profile_id uuid default null,
    p_actor_email text default null,
    p_created_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if nullif(trim(coalesce(p_event_type, '')), '') is null then
        return;
    end if;

    insert into public.app_activity_log (
        actor_profile_id,
        actor_email,
        event_type,
        entity_type,
        entity_id,
        details,
        created_at
    ) values (
        coalesce(p_actor_profile_id, auth.uid()),
        coalesce(nullif(lower(trim(coalesce(p_actor_email, ''))), ''), public.platform_activity_actor_email()),
        p_event_type,
        coalesce(nullif(trim(coalesce(p_entity_type, '')), ''), 'record'),
        nullif(trim(coalesce(p_entity_id, '')), ''),
        coalesce(p_details, '{}'::jsonb),
        coalesce(p_created_at, now())
    );
end;
$$;

create or replace function public.platform_activity_from_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company text;
begin
    select l.name into v_company from public.leads l where l.lead_id = new.lead_id;
    perform public.platform_log_activity(
        'note_added',
        'lead',
        new.lead_id,
        jsonb_build_object(
            'source_id', new.note_id::text,
            'company', coalesce(v_company, new.lead_id),
            'message', 'Sales note added'
        ),
        new.created_by,
        null,
        new.created_at
    );
    return new;
end;
$$;

drop trigger if exists trg_platform_activity_note on public.lead_notes;
create trigger trg_platform_activity_note
after insert on public.lead_notes
for each row execute function public.platform_activity_from_note();

create or replace function public.platform_activity_from_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company text;
    v_event text;
begin
    select l.name into v_company from public.leads l where l.lead_id = new.lead_id;

    if tg_op = 'INSERT' then
        v_event := 'followup_created';
    elsif new.status = 'completed' and old.status is distinct from new.status then
        v_event := 'followup_completed';
    elsif old.due_at is distinct from new.due_at or old.title is distinct from new.title or old.status is distinct from new.status then
        v_event := 'followup_updated';
    else
        return new;
    end if;

    perform public.platform_log_activity(
        v_event,
        'lead',
        new.lead_id,
        jsonb_build_object(
            'source_id', new.followup_id::text,
            'company', coalesce(v_company, new.lead_id),
            'message', new.title,
            'due_at', new.due_at,
            'status', new.status
        ),
        new.created_by,
        null,
        case when v_event = 'followup_completed' then coalesce(new.completed_at, now()) else new.created_at end
    );
    return new;
end;
$$;

drop trigger if exists trg_platform_activity_followup on public.lead_followups;
create trigger trg_platform_activity_followup
after insert or update on public.lead_followups
for each row execute function public.platform_activity_from_followup();

create or replace function public.platform_activity_from_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company text;
    v_profile uuid;
    v_event text;
begin
    if tg_op = 'UPDATE' and old.action is not distinct from new.action and old.claimed_at is not distinct from new.claimed_at then
        return new;
    end if;

    select l.name into v_company from public.leads l where l.lead_id = new.lead_id;
    select p.id into v_profile from public.app_profiles p where lower(p.email) = lower(new.user_email) limit 1;
    v_event := case when lower(coalesce(new.action, 'claimed')) = 'released' then 'lead_released' else 'lead_claimed' end;

    perform public.platform_log_activity(
        v_event,
        'lead',
        new.lead_id,
        jsonb_build_object(
            'source_id', new.claim_id::text,
            'company', coalesce(v_company, new.lead_id),
            'message', coalesce(v_company, new.lead_id)
        ),
        v_profile,
        new.user_email,
        new.claimed_at
    );
    return new;
end;
$$;

drop trigger if exists trg_platform_activity_claim on public.lead_claims;
create trigger trg_platform_activity_claim
after insert or update on public.lead_claims
for each row execute function public.platform_activity_from_claim();

create or replace function public.platform_activity_from_campaign_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'UPDATE'
       and old.enabled is not distinct from new.enabled
       and old.start_date is not distinct from new.start_date
       and old.end_date is not distinct from new.end_date
       and old.target_countries is not distinct from new.target_countries then
        return new;
    end if;

    perform public.platform_log_activity(
        'campaign_control_updated',
        'campaign_control',
        new.control_key,
        jsonb_build_object(
            'source_id', new.control_key || ':' || extract(epoch from new.updated_at)::bigint::text,
            'message', new.display_name,
            'sender_email', new.sender_email,
            'enabled', new.enabled,
            'start_date', new.start_date,
            'end_date', new.end_date,
            'target_countries', new.target_countries
        ),
        new.updated_by,
        null,
        new.updated_at
    );
    return new;
end;
$$;

drop trigger if exists trg_platform_activity_campaign_control on public.campaign_controls;
create trigger trg_platform_activity_campaign_control
after insert or update on public.campaign_controls
for each row execute function public.platform_activity_from_campaign_control();

create or replace function public.platform_activity_from_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_company text;
begin
    if lower(coalesce(new.direction, '')) <> 'outbound' or lower(coalesce(new.status, '')) <> 'sent' then
        return new;
    end if;

    if tg_op = 'UPDATE' and lower(coalesce(old.status, '')) = 'sent' then
        return new;
    end if;

    if new.lead_id is not null then
        select l.name into v_company from public.leads l where l.lead_id = new.lead_id;
    end if;

    if exists (
        select 1 from public.app_activity_log a
        where a.event_type = 'email_sent'
          and a.details ->> 'source_id' = new.id::text
    ) then
        return new;
    end if;

    perform public.platform_log_activity(
        'email_sent',
        'email_message',
        new.id::text,
        jsonb_build_object(
            'source_id', new.id::text,
            'company', coalesce(v_company, new.recipient_email, 'Recipient'),
            'subject', new.subject,
            'recipient_email', new.recipient_email,
            'sender_email', new.sender_email,
            'campaign_id', new.campaign_id
        ),
        null,
        new.sender_email,
        coalesce(new.sent_at, new.updated_at, new.created_at, now())
    );
    return new;
end;
$$;

drop trigger if exists trg_platform_activity_email on public.email_messages;
create trigger trg_platform_activity_email
after insert or update of status on public.email_messages
for each row execute function public.platform_activity_from_email();

-- Backfill existing notes.
insert into public.app_activity_log (actor_profile_id, actor_email, event_type, entity_type, entity_id, details, created_at)
select
    n.created_by,
    p.email,
    'note_added',
    'lead',
    n.lead_id,
    jsonb_build_object(
        'source_id', n.note_id::text,
        'company', coalesce(l.name, n.lead_id),
        'message', 'Sales note added'
    ),
    n.created_at
from public.lead_notes n
left join public.app_profiles p on p.id = n.created_by
left join public.leads l on l.lead_id = n.lead_id
where not exists (
    select 1 from public.app_activity_log a
    where a.event_type = 'note_added' and a.details ->> 'source_id' = n.note_id::text
);

-- Backfill existing follow-ups using their current state.
insert into public.app_activity_log (actor_profile_id, actor_email, event_type, entity_type, entity_id, details, created_at)
select
    f.created_by,
    p.email,
    case when f.status = 'completed' then 'followup_completed' else 'followup_created' end,
    'lead',
    f.lead_id,
    jsonb_build_object(
        'source_id', f.followup_id::text,
        'company', coalesce(l.name, f.lead_id),
        'message', f.title,
        'due_at', f.due_at,
        'status', f.status
    ),
    coalesce(f.completed_at, f.created_at)
from public.lead_followups f
left join public.app_profiles p on p.id = f.created_by
left join public.leads l on l.lead_id = f.lead_id
where not exists (
    select 1 from public.app_activity_log a
    where a.event_type in ('followup_created','followup_completed')
      and a.details ->> 'source_id' = f.followup_id::text
);

-- Backfill claim/release state.
insert into public.app_activity_log (actor_profile_id, actor_email, event_type, entity_type, entity_id, details, created_at)
select
    p.id,
    c.user_email,
    case when lower(coalesce(c.action, 'claimed')) = 'released' then 'lead_released' else 'lead_claimed' end,
    'lead',
    c.lead_id,
    jsonb_build_object(
        'source_id', c.claim_id::text,
        'company', coalesce(l.name, c.lead_id),
        'message', coalesce(l.name, c.lead_id)
    ),
    c.claimed_at
from public.lead_claims c
left join public.app_profiles p on lower(p.email) = lower(c.user_email)
left join public.leads l on l.lead_id = c.lead_id
where not exists (
    select 1 from public.app_activity_log a
    where a.event_type in ('lead_claimed','lead_released')
      and a.details ->> 'source_id' = c.claim_id::text
);

-- Backfill sent outbound email activity from the last 30 days.
insert into public.app_activity_log (actor_profile_id, actor_email, event_type, entity_type, entity_id, details, created_at)
select
    null,
    m.sender_email,
    'email_sent',
    'email_message',
    m.id::text,
    jsonb_build_object(
        'source_id', m.id::text,
        'company', coalesce(l.name, m.recipient_email, 'Recipient'),
        'subject', m.subject,
        'recipient_email', m.recipient_email,
        'sender_email', m.sender_email,
        'campaign_id', m.campaign_id
    ),
    coalesce(m.sent_at, m.updated_at, m.created_at)
from public.email_messages m
left join public.leads l on l.lead_id = m.lead_id
where lower(coalesce(m.direction, '')) = 'outbound'
  and lower(coalesce(m.status, '')) = 'sent'
  and coalesce(m.sent_at, m.updated_at, m.created_at) >= now() - interval '30 days'
  and not exists (
      select 1 from public.app_activity_log a
      where a.event_type = 'email_sent' and a.details ->> 'source_id' = m.id::text
  );

-- Correct the one price drift found in the exported 2026-08-09 client price list.
-- Approved source rule: LVT_3.0 = RMB 30/m², including 13% tax, freight excluded.
update public.stock_items
set target_price = 30,
    price_currency = 'CNY',
    price_unit = 'm2',
    updated_at = now()
where sku = '2QTU4243'
  and pricing_rule = 'LVT_3.0'
  and lower(coalesce(price_status, '')) = 'confirmed'
  and target_price is distinct from 30;


-- Verification: should now return rows, and will grow automatically after new actions.
select event_type, count(*) as events
from public.app_activity_log
group by event_type
order by count(*) desc, event_type;


-- Price-rule audit: expected result is zero rows.
with approved(rule, approved_cny_m2) as (
    values
      ('LVT_2.0', 15::numeric),
      ('LVT_2.5', 25::numeric),
      ('LVT_3.0', 30::numeric),
      ('LVT_4.0_NO_IXPE', 30::numeric),
      ('LOOSE_LAY_5.0', 44::numeric),
      ('SPC_4.0_NO_IXPE', 30::numeric),
      ('SPC_4.0_WITH_IXPE', 34::numeric),
      ('SPC_5.0_WITH_IXPE', 40::numeric)
)
select s.item_id, s.sku, s.pricing_rule, s.target_price, a.approved_cny_m2
from public.stock_items s
join approved a on a.rule = s.pricing_rule
where lower(coalesce(s.price_status, '')) = 'confirmed'
  and s.target_price is distinct from a.approved_cny_m2
order by s.pricing_rule, s.sku;
