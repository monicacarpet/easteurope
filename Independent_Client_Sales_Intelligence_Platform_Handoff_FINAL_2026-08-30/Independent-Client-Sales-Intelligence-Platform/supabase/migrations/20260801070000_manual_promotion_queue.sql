-- Platform manual stock-promotion queue
-- Apply once in Supabase SQL Editor before uploading the patched frontend/agent files.

create table if not exists public.manual_promotion_queue (
    id uuid primary key default gen_random_uuid(),
    lead_id text not null references public.leads(lead_id) on delete cascade,
    campaign_key text not null default 'stock_promotion',
    status text not null default 'queued'
        check (status in ('queued','processing','sent','failed','cancelled')),
    force_local_window boolean not null default true,
    requested_by uuid null references auth.users(id) on delete set null,
    requested_at timestamptz not null default now(),
    started_at timestamptz null,
    completed_at timestamptz null,
    recipient_email text null,
    error_message text null,
    updated_at timestamptz not null default now()
);

create index if not exists manual_promotion_queue_requested_idx
    on public.manual_promotion_queue (status, requested_at);

create unique index if not exists manual_promotion_queue_one_active_per_lead_idx
    on public.manual_promotion_queue (lead_id, campaign_key)
    where status in ('queued','processing');

alter table public.manual_promotion_queue enable row level security;

drop policy if exists manual_promotion_queue_admin_read on public.manual_promotion_queue;
create policy manual_promotion_queue_admin_read
on public.manual_promotion_queue
for select
to authenticated
using (
    exists (
        select 1
        from public.app_profiles p
        where p.id = auth.uid()
          and coalesce(p.active, false) = true
          and lower(coalesce(p.role, '')) in ('ceo','business_gm','bi_admin')
    )
);

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
    where id = auth.uid()
      and coalesce(active, false) = true
    limit 1;

    if v_profile.id is null
       or lower(coalesce(v_profile.role, '')) not in ('ceo','business_gm','bi_admin') then
        raise exception 'You are not authorized to queue manual promotional emails';
    end if;

    select * into v_lead
    from public.leads
    where lead_id = trim(coalesce(p_lead_id, ''))
    limit 1;

    if v_lead.lead_id is null then
        raise exception 'Lead not found';
    end if;
    if coalesce(v_lead.do_not_contact, false) then
        raise exception 'Lead is marked do-not-contact';
    end if;
    if nullif(trim(coalesce(v_lead.email, '')), '') is null
       and nullif(trim(coalesce(v_lead.personal_email, '')), '') is null
       and nullif(trim(coalesce(v_lead.secondary_contact_email, '')), '') is null then
        raise exception 'Lead has no usable email field';
    end if;

    select * into v_existing
    from public.manual_promotion_queue
    where lead_id = v_lead.lead_id
      and campaign_key = 'stock_promotion'
      and status in ('queued','processing')
    order by requested_at desc
    limit 1;

    if v_existing.id is not null then
        return jsonb_build_object(
            'success', true,
            'already_queued', true,
            'id', v_existing.id,
            'lead_id', v_existing.lead_id,
            'status', v_existing.status
        );
    end if;

    insert into public.manual_promotion_queue (
        lead_id, campaign_key, status, force_local_window, requested_by
    ) values (
        v_lead.lead_id, 'stock_promotion', 'queued', coalesce(p_force_local_window, true), auth.uid()
    )
    returning * into v_row;

    return jsonb_build_object(
        'success', true,
        'already_queued', false,
        'id', v_row.id,
        'lead_id', v_row.lead_id,
        'status', v_row.status
    );
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
    v_count integer;
begin
    select lower(coalesce(role, '')) into v_role
    from public.app_profiles
    where id = auth.uid() and coalesce(active, false) = true
    limit 1;

    if v_role not in ('ceo','business_gm','bi_admin') then
        raise exception 'You are not authorized to cancel manual promotional emails';
    end if;

    update public.manual_promotion_queue
    set status = 'cancelled', completed_at = now(), updated_at = now()
    where id = p_queue_id and status = 'queued';
    get diagnostics v_count = row_count;

    return jsonb_build_object('success', v_count = 1, 'cancelled', v_count = 1);
end;
$$;

grant execute on function public.enqueue_manual_stock_promotion(text, boolean) to authenticated;
grant execute on function public.cancel_manual_stock_promotion(uuid) to authenticated;
