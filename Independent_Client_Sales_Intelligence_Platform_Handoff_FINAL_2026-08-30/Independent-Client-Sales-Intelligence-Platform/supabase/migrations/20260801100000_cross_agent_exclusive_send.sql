-- Platform CROSS-AGENT EXCLUSIVE SEND V2
-- 2026-08-12
--
-- Problem:
-- A lead could exist in BOTH manual queues and/or be selected by both
-- production agents because the old queue uniqueness was per campaign and
-- the old send lock was transient. Different recipient addresses could also
-- bypass recipient-level "already contacted" checks.
--
-- This migration makes Supabase the final authority:
--   1. Only ONE active manual queue may exist for a lead across both agents.
--   2. A lead can have only ONE active/sent cross-agent claim.
--   3. A successful send holds the claim for 14 days.
--   4. A generated-but-not-sent claim expires after 2 hours.
--   5. email_messages inserts for the two production agents are guarded by
--      the same claim, so even concurrent agents cannot both create/send.
--
-- IMPORTANT:
-- Run this SQL ONCE before enabling manual sends again.
-- Then upload scripts/manual_send_lock.py to the repository.
--
-- This does NOT change either mailbox:
--   Lead outreach  -> outreach@example.com
--   Stock promotion -> stock@example.com


create table if not exists public.lead_send_claims (
    lead_id text primary key references public.leads(lead_id) on delete cascade,
    agent_key text not null check (agent_key in ('lead_outreach','stock_promotion')),
    status text not null default 'reserved'
        check (status in ('reserved','sent')),
    claimed_at timestamptz not null default now(),
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

create index if not exists lead_send_claims_expiry_idx
    on public.lead_send_claims (expires_at);

alter table public.lead_send_claims enable row level security;

drop policy if exists lead_send_claims_admin_read on public.lead_send_claims;
create policy lead_send_claims_admin_read
on public.lead_send_claims
for select to authenticated
using (
    exists (
        select 1
        from public.app_profiles p
        where p.id = auth.uid()
          and coalesce(p.active,false) = true
          and lower(coalesce(p.role,'')) in ('ceo','business_gm','bi_admin')
    )
);

-- Atomically claim one lead for one agent.
-- Historical sent messages in the two production campaigns also block a
-- new cross-agent claim for 14 days, even if they predate this migration.
create or replace function public.claim_lead_send_claim(
    p_lead_id text,
    p_agent_key text,
    p_ttl_minutes integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_agent text;
    v_status text;
    v_expires timestamptz;
    v_acquired boolean := false;
begin
    if trim(coalesce(p_lead_id,'')) = '' then
        return false;
    end if;

    if p_agent_key not in ('lead_outreach','stock_promotion') then
        return false;
    end if;

    -- Historical cross-agent send guard.
    if exists (
        select 1
        from public.email_messages em
        join public.email_campaigns ec on ec.id = em.campaign_id
        where em.lead_id = trim(p_lead_id)
          and em.direction = 'outbound'
          and em.status = 'sent'
          and coalesce(em.sequence_number,0) = 0
          and em.sent_at >= now() - interval '14 days'
          and (
              lower(coalesce(ec.name,'')) = 'platform automated flooring outreach'
              or lower(coalesce(ec.name,'')) = 'platform ready stock promotional offers'
              or lower(coalesce(ec.sender_email,'')) in (
                  'outreach@example.com',
                  'stock@example.com'
              )
          )
    ) then
        return false;
    end if;

    -- Ensure one row exists. A primary-key conflict is serialized by
    -- PostgreSQL; the following SELECT FOR UPDATE sees the winner.
    insert into public.lead_send_claims (
        lead_id, agent_key, status, claimed_at, expires_at, updated_at
    )
    values (
        trim(p_lead_id),
        p_agent_key,
        'reserved',
        now(),
        now() + make_interval(mins => greatest(5, least(coalesce(p_ttl_minutes,120), 1440))),
        now()
    )
    on conflict (lead_id) do nothing;

    select agent_key, status, expires_at
      into v_agent, v_status, v_expires
    from public.lead_send_claims
    where lead_id = trim(p_lead_id)
    for update;

    if not found then
        return false;
    end if;

    -- An expired claim can be taken over.
    if v_expires <= now() then
        update public.lead_send_claims
        set agent_key = p_agent_key,
            status = 'reserved',
            claimed_at = now(),
            expires_at = now() + make_interval(mins => greatest(5, least(coalesce(p_ttl_minutes,120), 1440))),
            updated_at = now()
        where lead_id = trim(p_lead_id);
        return true;
    end if;

    -- Same agent can continue its own reservation.
    if v_agent = p_agent_key and v_status = 'reserved' then
        return true;
    end if;

    -- A live claim owned by the other agent blocks this send.
    return false;
end;
$$;

-- Successful sends remain reserved for 14 days.
create or replace function public.mark_lead_send_claim_sent(
    p_lead_id text,
    p_agent_key text,
    p_ttl_days integer default 14
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    update public.lead_send_claims
    set status = 'sent',
        expires_at = now() + make_interval(days => greatest(1, least(coalesce(p_ttl_days,14), 30))),
        updated_at = now()
    where lead_id = trim(coalesce(p_lead_id,''))
      and agent_key = p_agent_key;

    get diagnostics v_count = row_count;
    return v_count = 1;
end;
$$;

-- Only reserved/unsent claims can be released.
-- A sent claim is intentionally retained for the cross-agent cooldown.
create or replace function public.release_lead_send_claim(
    p_lead_id text,
    p_agent_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_count integer;
begin
    delete from public.lead_send_claims
    where lead_id = trim(coalesce(p_lead_id,''))
      and agent_key = p_agent_key
      and status = 'reserved';

    get diagnostics v_count = row_count;
    return v_count = 1;
end;
$$;

create or replace function public.get_lead_send_claim_owner(
    p_lead_id text
)
returns text
language sql
security definer
set search_path = public
as $$
    select agent_key
    from public.lead_send_claims
    where lead_id = trim(coalesce(p_lead_id,''))
      and expires_at > now()
    limit 1;
$$;

grant execute on function public.claim_lead_send_claim(text,text,integer) to authenticated;
grant execute on function public.claim_lead_send_claim(text,text,integer) to service_role;
grant execute on function public.mark_lead_send_claim_sent(text,text,integer) to authenticated;
grant execute on function public.mark_lead_send_claim_sent(text,text,integer) to service_role;
grant execute on function public.release_lead_send_claim(text,text) to authenticated;
grant execute on function public.release_lead_send_claim(text,text) to service_role;
grant execute on function public.get_lead_send_claim_owner(text) to authenticated;
grant execute on function public.get_lead_send_claim_owner(text) to service_role;

-- -------------------------------------------------------------------------
-- Manual queue: make the active uniqueness GLOBAL by lead, not per campaign.
-- Existing cross-agent duplicate queue rows are cancelled, keeping the most
-- recently requested row for each lead.
-- -------------------------------------------------------------------------

with ranked as (
    select
        id,
        row_number() over (
            partition by lead_id
            order by requested_at desc, id desc
        ) as rn,
        count(*) over (partition by lead_id) as cnt
    from public.manual_promotion_queue
    where status in ('queued','processing')
)
update public.manual_promotion_queue q
set status = 'cancelled',
    completed_at = now(),
    updated_at = now(),
    error_message = 'Cancelled by V2 cross-agent exclusive-send migration: another active manual queue existed for this lead.'
from ranked r
where q.id = r.id
  and r.cnt > 1
  and r.rn > 1;

drop index if exists public.manual_promotion_queue_one_active_per_lead_idx;

create unique index if not exists manual_promotion_queue_one_active_global_idx
    on public.manual_promotion_queue (lead_id)
    where status in ('queued','processing');

-- Rehydrate claims for any single surviving manual request created before this
-- migration. A queued request gets a 24-hour reservation; a processing request
-- gets a 2-hour reservation so the active worker has exclusive ownership.
insert into public.lead_send_claims (
    lead_id, agent_key, status, claimed_at, expires_at, updated_at
)
select
    q.lead_id,
    q.campaign_key,
    'reserved',
    coalesce(q.started_at, q.requested_at, now()),
    coalesce(q.started_at, now()) + case
        when q.status = 'processing' then interval '2 hours'
        else interval '24 hours'
    end,
    now()
from public.manual_promotion_queue q
where q.status in ('queued','processing')
  and q.campaign_key in ('lead_outreach','stock_promotion')
on conflict (lead_id) do nothing;

-- -------------------------------------------------------------------------
-- Queue functions: reserve the lead before a manual request is inserted.
-- -------------------------------------------------------------------------

create or replace function public.enqueue_manual_lead_outreach(
    p_lead_id text,
    p_force_local_window boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.app_profiles%rowtype;
    v_lead public.leads%rowtype;
    v_existing public.manual_promotion_queue%rowtype;
    v_other public.manual_promotion_queue%rowtype;
    v_row public.manual_promotion_queue%rowtype;
begin
    select * into v_profile
    from public.app_profiles
    where id = auth.uid() and coalesce(active,false)=true
    limit 1;

    if v_profile.id is null
       or lower(coalesce(v_profile.role,'')) not in ('ceo','business_gm','bi_admin') then
        raise exception 'You are not authorized to queue manual lead-outreach emails';
    end if;

    select * into v_lead
    from public.leads
    where lead_id = trim(coalesce(p_lead_id,''))
    limit 1;

    if v_lead.lead_id is null then raise exception 'Lead not found'; end if;
    if coalesce(v_lead.do_not_contact,false) then raise exception 'Lead is marked do-not-contact'; end if;

    select * into v_existing
    from public.manual_promotion_queue
    where lead_id = v_lead.lead_id
      and campaign_key = 'lead_outreach'
      and status in ('queued','processing')
    order by requested_at desc
    limit 1;

    if v_existing.id is not null then
        return jsonb_build_object(
            'success',true,
            'already_queued',true,
            'id',v_existing.id,
            'lead_id',v_existing.lead_id,
            'status',v_existing.status,
            'agent_key','lead_outreach'
        );
    end if;

    select * into v_other
    from public.manual_promotion_queue
    where lead_id = v_lead.lead_id
      and campaign_key <> 'lead_outreach'
      and status in ('queued','processing')
    order by requested_at desc
    limit 1;

    if v_other.id is not null then
        raise exception 'This lead is already queued for the stock-promotion agent. Cancel that request first if you want lead outreach instead.';
    end if;

    if not public.claim_lead_send_claim(v_lead.lead_id,'lead_outreach',1440) then
        raise exception 'This lead is already reserved or was contacted by one of the Platform agents within the last 14 days.';
    end if;

    begin
        insert into public.manual_promotion_queue (
            lead_id,campaign_key,status,force_local_window,requested_by
        ) values (
            v_lead.lead_id,'lead_outreach','queued',coalesce(p_force_local_window,true),auth.uid()
        )
        returning * into v_row;
    exception when others then
        perform public.release_lead_send_claim(v_lead.lead_id,'lead_outreach');
        raise;
    end;

    return jsonb_build_object(
        'success',true,
        'already_queued',false,
        'id',v_row.id,
        'lead_id',v_row.lead_id,
        'status',v_row.status,
        'agent_key','lead_outreach'
    );
end;
$$;

create or replace function public.enqueue_manual_stock_promotion(
    p_lead_id text,
    p_force_local_window boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_profile public.app_profiles%rowtype;
    v_lead public.leads%rowtype;
    v_existing public.manual_promotion_queue%rowtype;
    v_other public.manual_promotion_queue%rowtype;
    v_row public.manual_promotion_queue%rowtype;
begin
    select * into v_profile
    from public.app_profiles
    where id = auth.uid() and coalesce(active,false)=true
    limit 1;

    if v_profile.id is null
       or lower(coalesce(v_profile.role,'')) not in ('ceo','business_gm','bi_admin') then
        raise exception 'You are not authorized to queue manual promotional emails';
    end if;

    select * into v_lead
    from public.leads
    where lead_id = trim(coalesce(p_lead_id,''))
    limit 1;

    if v_lead.lead_id is null then raise exception 'Lead not found'; end if;
    if coalesce(v_lead.do_not_contact,false) then raise exception 'Lead is marked do-not-contact'; end if;

    select * into v_existing
    from public.manual_promotion_queue
    where lead_id = v_lead.lead_id
      and campaign_key = 'stock_promotion'
      and status in ('queued','processing')
    order by requested_at desc
    limit 1;

    if v_existing.id is not null then
        return jsonb_build_object(
            'success',true,
            'already_queued',true,
            'id',v_existing.id,
            'lead_id',v_existing.lead_id,
            'status',v_existing.status,
            'agent_key','stock_promotion'
        );
    end if;

    select * into v_other
    from public.manual_promotion_queue
    where lead_id = v_lead.lead_id
      and campaign_key <> 'stock_promotion'
      and status in ('queued','processing')
    order by requested_at desc
    limit 1;

    if v_other.id is not null then
        raise exception 'This lead is already queued for the lead-outreach agent. Cancel that request first if you want stock promotion instead.';
    end if;

    if not public.claim_lead_send_claim(v_lead.lead_id,'stock_promotion',1440) then
        raise exception 'This lead is already reserved or was contacted by one of the Platform agents within the last 14 days.';
    end if;

    begin
        insert into public.manual_promotion_queue (
            lead_id,campaign_key,status,force_local_window,requested_by
        ) values (
            v_lead.lead_id,'stock_promotion','queued',coalesce(p_force_local_window,true),auth.uid()
        )
        returning * into v_row;
    exception when others then
        perform public.release_lead_send_claim(v_lead.lead_id,'stock_promotion');
        raise;
    end;

    return jsonb_build_object(
        'success',true,
        'already_queued',false,
        'id',v_row.id,
        'lead_id',v_row.lead_id,
        'status',v_row.status,
        'agent_key','stock_promotion'
    );
end;
$$;

-- Cancellation releases only an unsent claim.
create or replace function public.cancel_manual_lead_outreach(p_queue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
    v_lead_id text;
    v_count integer;
begin
    select lower(coalesce(role,'')) into v_role
    from public.app_profiles
    where id=auth.uid() and coalesce(active,false)=true
    limit 1;

    if v_role not in ('ceo','business_gm','bi_admin') then
        raise exception 'You are not authorized to cancel manual lead-outreach emails';
    end if;

    select lead_id into v_lead_id
    from public.manual_promotion_queue
    where id=p_queue_id
    limit 1;

    update public.manual_promotion_queue
    set status='cancelled',completed_at=now(),updated_at=now()
    where id=p_queue_id and campaign_key='lead_outreach' and status='queued';

    get diagnostics v_count = row_count;

    if v_count=1 then
        perform public.release_lead_send_claim(v_lead_id,'lead_outreach');
    end if;

    return jsonb_build_object('success',v_count=1,'cancelled',v_count=1);
end;
$$;

create or replace function public.cancel_manual_stock_promotion(p_queue_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
    v_lead_id text;
    v_count integer;
begin
    select lower(coalesce(role,'')) into v_role
    from public.app_profiles
    where id=auth.uid() and coalesce(active,false)=true
    limit 1;

    if v_role not in ('ceo','business_gm','bi_admin') then
        raise exception 'You are not authorized to cancel manual promotional emails';
    end if;

    select lead_id into v_lead_id
    from public.manual_promotion_queue
    where id=p_queue_id
    limit 1;

    update public.manual_promotion_queue
    set status='cancelled',completed_at=now(),updated_at=now()
    where id=p_queue_id and campaign_key='stock_promotion' and status='queued';

    get diagnostics v_count = row_count;

    if v_count=1 then
        perform public.release_lead_send_claim(v_lead_id,'stock_promotion');
    end if;

    return jsonb_build_object('success',v_count=1,'cancelled',v_count=1);
end;
$$;

grant execute on function public.enqueue_manual_lead_outreach(text,boolean) to authenticated;
grant execute on function public.enqueue_manual_stock_promotion(text,boolean) to authenticated;
grant execute on function public.cancel_manual_lead_outreach(uuid) to authenticated;
grant execute on function public.cancel_manual_stock_promotion(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Final database-level send guard.
-- It runs when either production agent creates an outbound initial message.
-- This is the last line of defense even if an agent is misconfigured.
-- -------------------------------------------------------------------------

create or replace function public.platform_guard_cross_agent_email_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_agent_key text;
begin
    if NEW.direction <> 'outbound'
       or coalesce(NEW.sequence_number,0) <> 0
       or NEW.lead_id is null
       or NEW.status not in ('generated','sent') then
        return NEW;
    end if;

    select case
        when lower(coalesce(ec.name,'')) = 'platform automated flooring outreach'
          or lower(coalesce(ec.sender_email,'')) = 'outreach@example.com'
            then 'lead_outreach'
        when lower(coalesce(ec.name,'')) = 'platform ready stock promotional offers'
          or lower(coalesce(ec.sender_email,'')) = 'stock@example.com'
            then 'stock_promotion'
        else null
    end
    into v_agent_key
    from public.email_campaigns ec
    where ec.id = NEW.campaign_id;

    if v_agent_key is null then
        return NEW;
    end if;

    if NEW.status = 'generated' then
        if not public.claim_lead_send_claim(NEW.lead_id, v_agent_key, 120) then
            raise exception 'CROSS_AGENT_SEND_BLOCKED: lead % is already reserved or was contacted by the other Platform email agent within 14 days.', NEW.lead_id;
        end if;
    elsif NEW.status = 'sent' then
        if not public.mark_lead_send_claim_sent(NEW.lead_id, v_agent_key, 14) then
            raise exception 'CROSS_AGENT_SEND_BLOCKED: no valid send claim exists for lead %.', NEW.lead_id;
        end if;
    end if;

    return NEW;
end;
$$;

drop trigger if exists platform_cross_agent_email_message_guard on public.email_messages;
create trigger platform_cross_agent_email_message_guard
before insert or update of status on public.email_messages
for each row
execute function public.platform_guard_cross_agent_email_message();


-- Diagnostics:
-- SELECT * FROM public.lead_send_claims ORDER BY claimed_at DESC;
-- SELECT lead_id,campaign_key,status,requested_at
-- FROM public.manual_promotion_queue
-- WHERE status IN ('queued','processing')
-- ORDER BY requested_at DESC;
