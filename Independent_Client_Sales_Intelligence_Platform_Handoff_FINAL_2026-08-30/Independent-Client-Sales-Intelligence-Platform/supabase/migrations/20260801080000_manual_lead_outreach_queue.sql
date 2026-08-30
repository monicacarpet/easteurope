-- Platform manual lead-outreach queue
-- Apply once in Supabase SQL Editor.
-- This extends the existing manual_promotion_queue used by stock promotion.
-- Do not drop or recreate the existing table.

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
    where id = auth.uid()
      and coalesce(active, false) = true
    limit 1;

    if v_profile.id is null
       or lower(coalesce(v_profile.role, '')) not in ('ceo','business_gm','bi_admin') then
        raise exception 'You are not authorized to queue manual lead-outreach emails';
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

    if lower(coalesce(v_lead.ai_outreach_status, '')) <> 'not_contacted' then
        raise exception 'Lead has already been processed by lead outreach';
    end if;

    select * into v_existing
    from public.manual_promotion_queue
    where lead_id = v_lead.lead_id
      and campaign_key = 'lead_outreach'
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
        v_lead.lead_id, 'lead_outreach', 'queued',
        coalesce(p_force_local_window, true), auth.uid()
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

create or replace function public.cancel_manual_lead_outreach(p_queue_id uuid)
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
    where id = auth.uid()
      and coalesce(active, false) = true
    limit 1;

    if v_role not in ('ceo','business_gm','bi_admin') then
        raise exception 'You are not authorized to cancel manual lead-outreach emails';
    end if;

    update public.manual_promotion_queue
    set status = 'cancelled',
        completed_at = now(),
        updated_at = now()
    where id = p_queue_id
      and campaign_key = 'lead_outreach'
      and status = 'queued';

    get diagnostics v_count = row_count;

    return jsonb_build_object('success', v_count = 1, 'cancelled', v_count = 1);
end;
$$;

grant execute on function public.enqueue_manual_lead_outreach(text, boolean) to authenticated;
grant execute on function public.cancel_manual_lead_outreach(uuid) to authenticated;
