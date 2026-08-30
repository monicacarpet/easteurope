-- Platform React lead ownership fix
-- 1) Only an available/unassigned lead can be claimed.
-- 2) Claim identity is taken from auth.uid() -> app_profiles, never from the browser payload.
-- 3) Release is allowed only to the owner (or an application admin).
-- 4) Release returns the lead to the shared available pool.
-- 5) lead_claims keeps the latest ownership state and existing activity triggers can audit the change.


create or replace function public.claim_lead_for_current_user(p_lead_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text;
    v_name text;
    v_updated integer;
begin
    select lower(trim(p.email)), coalesce(nullif(trim(p.full_name), ''), lower(trim(p.email)))
    into v_email, v_name
    from public.app_profiles p
    where p.id = auth.uid()
      and coalesce(p.active, false) = true
    limit 1;

    if v_email is null then
        raise exception 'Inactive or unauthorized account';
    end if;

    -- Atomic compare-and-set. Under concurrent claims, only one transaction can
    -- change this row from available/unassigned to claimed.
    update public.leads
    set lead_status = 'claimed',
        assigned_to_email = v_email,
        assigned_to_name = v_name,
        assigned_at = now(),
        updated_at = now()
    where lead_id = p_lead_id
      and lower(coalesce(lead_status, 'available')) = 'available'
      and nullif(trim(coalesce(assigned_to_email, '')), '') is null;

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
        return jsonb_build_object(
            'success', false,
            'message', 'Lead is already claimed or unavailable'
        );
    end if;

    insert into public.lead_claims (
        lead_id,
        user_email,
        user_name,
        claimed_at,
        action
    ) values (
        p_lead_id,
        v_email,
        v_name,
        now(),
        'claimed'
    )
    on conflict (lead_id) do update
    set user_email = excluded.user_email,
        user_name = excluded.user_name,
        claimed_at = excluded.claimed_at,
        action = 'claimed';

    return jsonb_build_object(
        'success', true,
        'message', 'Lead claimed successfully'
    );
end;
$$;

create or replace function public.release_lead_for_current_user(p_lead_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text;
    v_role text;
    v_is_admin boolean := false;
    v_updated integer;
begin
    select lower(trim(p.email)), lower(trim(coalesce(p.role, '')))
    into v_email, v_role
    from public.app_profiles p
    where p.id = auth.uid()
      and coalesce(p.active, false) = true
    limit 1;

    if v_email is null then
        raise exception 'Inactive or unauthorized account';
    end if;

    v_is_admin := v_role in ('ceo', 'business_gm', 'bi_admin');

    update public.leads
    set lead_status = 'available',
        assigned_to_email = null,
        assigned_to_name = null,
        assigned_at = null,
        updated_at = now()
    where lead_id = p_lead_id
      and lower(coalesce(lead_status, '')) = 'claimed'
      and (
          lower(trim(coalesce(assigned_to_email, ''))) = v_email
          or v_is_admin
      );

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
        return jsonb_build_object(
            'success', false,
            'message', 'Lead is not owned by your account or is already available'
        );
    end if;

    -- Preserve the row so the existing activity trigger sees the release event.
    -- The next successful claim will upsert this row back to action='claimed'.
    update public.lead_claims
    set action = 'released',
        claimed_at = now()
    where lead_id = p_lead_id;

    return jsonb_build_object(
        'success', true,
        'message', 'Lead released and returned to the shared lead pool'
    );
end;
$$;

revoke all on function public.claim_lead_for_current_user(text) from public;
revoke all on function public.release_lead_for_current_user(text) from public;
grant execute on function public.claim_lead_for_current_user(text) to authenticated;
grant execute on function public.release_lead_for_current_user(text) to authenticated;


-- Refresh PostgREST's function/schema cache immediately in Supabase.
notify pgrst, 'reload schema';

-- Verification: should return both functions.
select
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_lead_for_current_user', 'release_lead_for_current_user')
order by p.proname;

-- Ownership consistency audit. Expected result after normal operation: 0 rows.
select lead_id, lead_status, assigned_to_email, assigned_to_name, assigned_at
from public.leads
where (
        lower(coalesce(lead_status, 'available')) = 'available'
        and nullif(trim(coalesce(assigned_to_email, '')), '') is not null
      )
   or (
        lower(coalesce(lead_status, 'available')) = 'claimed'
        and nullif(trim(coalesce(assigned_to_email, '')), '') is null
      );
