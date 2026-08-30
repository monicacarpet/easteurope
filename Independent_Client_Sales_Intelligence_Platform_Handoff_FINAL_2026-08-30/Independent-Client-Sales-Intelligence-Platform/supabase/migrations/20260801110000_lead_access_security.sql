-- Platform lead-access security patch — 2026-08-16
-- Live database patch mirrored in source control.
-- Goals:
--   * no direct browser SELECT from public.leads
--   * normal sales pool reveals only lead_id + company name + country
--   * full contact data is exposed only after the current user claims a lead
--   * named key-decision-maker leads are BI-admin-only automatically
--   * generic-email/no-key-decision-contact leads remain claimable by sales


create or replace function public.platform_lead_is_bi_admin_only(
  p_account_tier text,
  p_contact_tier text,
  p_decision_email_class text,
  p_contact_full_name text,
  p_contact_job_title text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    nullif(trim(coalesce(p_contact_full_name,'')),'') is not null
    and (
      upper(trim(coalesce(p_contact_tier,''))) like 'A%'
      or lower(coalesce(p_decision_email_class,'')) ~ '(direct_decision_maker|named_decision_maker|named direct key-person|public direct|named_work_email|public named corporate email|key-person)'
      or lower(coalesce(p_contact_job_title,'')) ~ '(chief executive|ceo|owner|founder|president|managing director|general manager|commercial director|sales director|procurement|purchas|buyer|sourc|supply chain|directeur.*achat|achats|geschäftsführ|geschaeftsfuehr|einkauf|category manager|head of (sales|procurement|purchasing|sourcing|commercial|operations)|acquisition manager)'
    );
$$;

create or replace function public.get_available_lead_pool()
returns table(
  lead_id text,
  name text,
  country text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select lower(trim(coalesce(p.role,'')))
  into v_role
  from public.app_profiles p
  where p.id = auth.uid()
    and p.active is true
  limit 1;

  if v_role not in ('sales_manager','sales_rep','business_assistant','bi_admin') then
    return;
  end if;

  return query
  select l.lead_id, l.name, l.country
  from public.leads l
  where lower(coalesce(l.lead_status,'available')) = 'available'
    and nullif(trim(coalesce(l.assigned_to_email,'')),'') is null
    and (
      v_role = 'bi_admin'
      or not public.platform_lead_is_bi_admin_only(
        l.account_tier,
        l.contact_tier,
        l.decision_email_class,
        l.contact_full_name,
        l.contact_job_title
      )
    )
  order by l.name nulls last, l.lead_id;
end;
$$;

revoke all on table public.leads from anon;
revoke select on table public.leads from authenticated;

revoke execute on function public.get_available_lead_pool() from public, anon;
grant execute on function public.get_available_lead_pool() to authenticated;

revoke execute on function public.bi_admin_lead_details(text) from public, anon;
grant execute on function public.bi_admin_lead_details(text) to authenticated;

revoke execute on function public.get_my_claimed_lead_details(text) from public, anon;
grant execute on function public.get_my_claimed_lead_details(text) to authenticated;

revoke execute on function public.claim_lead_for_current_user(text) from public, anon;
grant execute on function public.claim_lead_for_current_user(text) to authenticated;

revoke execute on function public.claim_lead(text,text,text) from public, anon;
grant execute on function public.claim_lead(text,text,text) to authenticated;

revoke execute on function public.release_lead_for_current_user(text) from public, anon;
grant execute on function public.release_lead_for_current_user(text) to authenticated;

