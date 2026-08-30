-- Platform cross-agent send lock hotfix
-- Purpose: one lead can be sent by ONLY ONE of the two email agents at a time.
-- Apply once in Supabase SQL Editor BEFORE enabling manual sends again.

create table if not exists public.lead_send_locks (
    lead_id text primary key references public.leads(lead_id) on delete cascade,
    agent_key text not null check (agent_key in ('lead_outreach','stock_promotion')),
    acquired_at timestamptz not null default now(),
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

create index if not exists lead_send_locks_expiry_idx
    on public.lead_send_locks (expires_at);

alter table public.lead_send_locks enable row level security;

drop policy if exists lead_send_locks_admin_read on public.lead_send_locks;
create policy lead_send_locks_admin_read
on public.lead_send_locks
for select to authenticated
using (
    exists (
        select 1 from public.app_profiles p
        where p.id = auth.uid()
          and coalesce(p.active,false)=true
          and lower(coalesce(p.role,'')) in ('ceo','business_gm','bi_admin')
    )
);

create or replace function public.acquire_lead_send_lock(
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
    v_acquired boolean := false;
begin
    if trim(coalesce(p_lead_id,'')) = '' then
        return false;
    end if;

    if p_agent_key not in ('lead_outreach','stock_promotion') then
        return false;
    end if;

    with upserted as (
        insert into public.lead_send_locks (
            lead_id, agent_key, acquired_at, expires_at, updated_at
        )
        values (
            trim(p_lead_id),
            p_agent_key,
            now(),
            now() + make_interval(mins => greatest(5, least(coalesce(p_ttl_minutes,120), 240))),
            now()
        )
        on conflict (lead_id) do update
        set agent_key = excluded.agent_key,
            acquired_at = excluded.acquired_at,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
        where public.lead_send_locks.agent_key = excluded.agent_key
           or public.lead_send_locks.expires_at <= now()
        returning 1
    )
    select exists(select 1 from upserted) into v_acquired;

    return v_acquired;
end;
$$;

create or replace function public.release_lead_send_lock(
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
    delete from public.lead_send_locks
    where lead_id = trim(coalesce(p_lead_id,''))
      and agent_key = p_agent_key;
    get diagnostics v_count = row_count;
    return v_count = 1;
end;
$$;

create or replace function public.get_lead_send_lock_owner(
    p_lead_id text
)
returns text
language sql
security definer
set search_path = public
as $$
    select agent_key
    from public.lead_send_locks
    where lead_id = trim(coalesce(p_lead_id,''))
      and expires_at > now()
    limit 1;
$$;

grant execute on function public.acquire_lead_send_lock(text,text,integer) to authenticated;
grant execute on function public.acquire_lead_send_lock(text,text,integer) to service_role;
grant execute on function public.release_lead_send_lock(text,text) to authenticated;
grant execute on function public.release_lead_send_lock(text,text) to service_role;
grant execute on function public.get_lead_send_lock_owner(text) to authenticated;
grant execute on function public.get_lead_send_lock_owner(text) to service_role;

-- Reserve the stock lock when the user clicks "Send with agent".
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
        return jsonb_build_object('success',true,'already_queued',true,'id',v_existing.id,'lead_id',v_existing.lead_id,'status',v_existing.status);
    end if;

    if not public.acquire_lead_send_lock(v_lead.lead_id, 'stock_promotion', 120) then
        raise exception 'This lead is currently reserved by the lead-outreach agent. Choose another lead or wait until that send finishes.';
    end if;

    begin
        insert into public.manual_promotion_queue (
            lead_id,campaign_key,status,force_local_window,requested_by
        ) values (
            v_lead.lead_id,'stock_promotion','queued',coalesce(p_force_local_window,true),auth.uid()
        )
        returning * into v_row;
    exception when others then
        perform public.release_lead_send_lock(v_lead.lead_id,'stock_promotion');
        raise;
    end;

    return jsonb_build_object('success',true,'already_queued',false,'id',v_row.id,'lead_id',v_row.lead_id,'status',v_row.status);
end;
$$;

-- Reserve the lead-outreach lock when the user clicks its manual-send button.
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
    where lead_id=v_lead.lead_id
      and campaign_key='lead_outreach'
      and status in ('queued','processing')
    order by requested_at desc
    limit 1;

    if v_existing.id is not null then
        return jsonb_build_object('success',true,'already_queued',true,'id',v_existing.id,'lead_id',v_existing.lead_id,'status',v_existing.status);
    end if;

    if not public.acquire_lead_send_lock(v_lead.lead_id, 'lead_outreach', 120) then
        raise exception 'This lead is currently reserved by the stock-promotion agent. Choose another lead or wait until that send finishes.';
    end if;

    begin
        insert into public.manual_promotion_queue (
            lead_id,campaign_key,status,force_local_window,requested_by
        ) values (
            v_lead.lead_id,'lead_outreach','queued',coalesce(p_force_local_window,true),auth.uid()
        )
        returning * into v_row;
    exception when others then
        perform public.release_lead_send_lock(v_lead.lead_id,'lead_outreach');
        raise;
    end;

    return jsonb_build_object('success',true,'already_queued',false,'id',v_row.id,'lead_id',v_row.lead_id,'status',v_row.status);
end;
$$;

-- Cancel functions now release the reserved lock.
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

    select lead_id into v_lead_id from public.manual_promotion_queue where id=p_queue_id limit 1;

    update public.manual_promotion_queue
    set status='cancelled',completed_at=now(),updated_at=now()
    where id=p_queue_id and status='queued';

    get diagnostics v_count = row_count;
    if v_count=1 then perform public.release_lead_send_lock(v_lead_id,'stock_promotion'); end if;

    return jsonb_build_object('success',v_count=1,'cancelled',v_count=1);
end;
$$;

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

    select lead_id into v_lead_id from public.manual_promotion_queue where id=p_queue_id limit 1;

    update public.manual_promotion_queue
    set status='cancelled',completed_at=now(),updated_at=now()
    where id=p_queue_id and campaign_key='lead_outreach' and status='queued';

    get diagnostics v_count = row_count;
    if v_count=1 then perform public.release_lead_send_lock(v_lead_id,'lead_outreach'); end if;

    return jsonb_build_object('success',v_count=1,'cancelled',v_count=1);
end;
$$;
