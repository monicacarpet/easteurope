
-- Role helper used by read-only analytics/stock policies.
create or replace function public.platform_can_view_analytics()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_profiles p
    where p.id = auth.uid()
      and p.active is true
      and lower(coalesce(p.role,'')) in ('ceo','business_gm','bi_admin','bi_partial','sales_manager')
  );
$$;
revoke all on function public.platform_can_view_analytics() from public, anon;
grant execute on function public.platform_can_view_analytics() to authenticated;

-- Follow-ups: users can read their own follow-ups without joining directly to public.leads.
create or replace function public.get_my_followups()
returns table(
  followup_id uuid,
  lead_id text,
  title text,
  due_at timestamptz,
  status text,
  created_by uuid,
  created_at timestamptz,
  completed_at timestamptz,
  company_name text,
  country text,
  owner_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_role text;
begin
  select lower(trim(p.email)), lower(trim(coalesce(p.role,'')))
    into v_email, v_role
  from public.app_profiles p
  where p.id = auth.uid() and p.active is true
  limit 1;

  if v_email is null or v_role not in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant') then
    return;
  end if;

  return query
  select
    f.followup_id,
    f.lead_id,
    f.title,
    f.due_at,
    f.status,
    f.created_by,
    f.created_at,
    f.completed_at,
    l.name::text as company_name,
    l.country::text as country,
    case
      when v_role in ('ceo','business_gm','bi_admin') then l.email::text
      when lower(coalesce(l.lead_status,''))='claimed'
       and lower(trim(coalesce(l.assigned_to_email,'')))=v_email
      then l.email::text
      else null::text
    end as owner_email
  from public.lead_followups f
  left join public.leads l on l.lead_id=f.lead_id
  where
    v_role in ('ceo','business_gm','bi_admin')
    or (
      (f.created_by = auth.uid()
       or lower(trim(coalesce(l.assigned_to_email,'')))=v_email)
      and not public.platform_lead_is_bi_admin_only(
        l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
      )
    )
  order by f.due_at asc nulls last, f.created_at desc;
end;
$$;
revoke all on function public.get_my_followups() from public, anon;
grant execute on function public.get_my_followups() to authenticated;

create or replace function public.complete_my_followup(p_followup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_role text;
  v_count integer;
begin
  select lower(trim(p.email)), lower(trim(coalesce(p.role,'')))
    into v_email, v_role
  from public.app_profiles p
  where p.id=auth.uid() and p.active is true
  limit 1;

  if v_email is null or v_role not in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant') then
    raise exception 'Inactive or unauthorized account';
  end if;

  update public.lead_followups f
  set status='completed', completed_at=now()
  where f.followup_id=p_followup_id
    and (
      v_role in ('ceo','business_gm','bi_admin')
      or f.created_by=auth.uid()
      or exists (
        select 1 from public.leads l
        where l.lead_id=f.lead_id
          and lower(coalesce(l.lead_status,''))='claimed'
          and lower(trim(coalesce(l.assigned_to_email,'')))=v_email
          and not public.platform_lead_is_bi_admin_only(
            l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
          )
      )
    );
  get diagnostics v_count=row_count;
  return jsonb_build_object('success',v_count=1,'updated',v_count);
end;
$$;
revoke all on function public.complete_my_followup(uuid) from public, anon;
grant execute on function public.complete_my_followup(uuid) to authenticated;

-- Approved client price list: safe for every active internal user; no internal stock notes/customer codes are returned.
create or replace function public.platform_client_price_list()
returns table(
  item_id text,
  inventory_snapshot_id text,
  source_date date,
  product_type text,
  sku text,
  specification text,
  format text,
  thickness_mm numeric,
  wear_layer_mm numeric,
  estimated_area_m2 numeric,
  exact_quantity_display text,
  price_status text,
  price_currency text,
  price_unit text,
  incoterm text,
  pricing_rule text,
  client_price_cny numeric,
  public_product_description text,
  public_format text,
  public_thickness text,
  public_wear_layer text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_snapshot text;
begin
  select exists (
    select 1 from public.app_profiles p
    where p.id=auth.uid() and p.active is true
      and lower(coalesce(p.role,'')) in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant')
  ) into v_allowed;
  if not v_allowed then return; end if;

  select s.inventory_snapshot_id into v_snapshot
  from public.stock_inventory_snapshots s
  where s.is_active is true
  order by s.effective_date desc nulls last, s.activated_at desc nulls last
  limit 1;

  if v_snapshot is null then return; end if;

  return query
  select
    i.item_id,
    i.inventory_snapshot_id,
    i.source_effective_date,
    i.product_type,
    i.sku,
    i.specification,
    i.format,
    i.thickness_mm,
    i.wear_layer_mm,
    i.estimated_area_m2,
    i.exact_quantity_display,
    i.price_status,
    i.price_currency,
    i.price_unit,
    i.incoterm,
    i.pricing_rule,
    case i.pricing_rule
      when 'LVT_2.0' then 15::numeric
      when 'LVT_2.5' then 25::numeric
      when 'LVT_3.0' then 30::numeric
      when 'LVT_4.0_NO_IXPE' then 30::numeric
      when 'LOOSE_LAY_5.0' then 44::numeric
      when 'SPC_4.0_NO_IXPE' then 30::numeric
      when 'SPC_4.0_WITH_IXPE' then 34::numeric
      when 'SPC_5.0_WITH_IXPE' then 40::numeric
      else null::numeric
    end as client_price_cny,
    i.public_product_description,
    i.public_format,
    i.public_thickness,
    i.public_wear_layer
  from public.stock_items i
  where i.inventory_snapshot_id=v_snapshot
    and lower(coalesce(i.price_status,''))='confirmed'
    and coalesce(i.estimated_area_m2,0) >= 20
    and (
      nullif(trim(coalesce(i.stock_market,i.source_flag,'')),'') is null
      or lower(trim(coalesce(i.stock_market,i.source_flag,''))) in ('外销','export','exports','export stock','export_stock')
    )
    and i.pricing_rule in ('LVT_2.0','LVT_2.5','LVT_3.0','LVT_4.0_NO_IXPE','LOOSE_LAY_5.0','SPC_4.0_NO_IXPE','SPC_4.0_WITH_IXPE','SPC_5.0_WITH_IXPE')
  order by i.estimated_area_m2 desc nulls last, i.item_id;
end;
$$;
revoke all on function public.platform_client_price_list() from public, anon;
grant execute on function public.platform_client_price_list() to authenticated;

-- Safe stock summary for dashboard users who do not have detailed-stock authority.
create or replace function public.platform_stock_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_allowed boolean;
  v_summary public.stock_dashboard_summaries%rowtype;
  v_products jsonb := '[]'::jsonb;
  v_prices jsonb := '[]'::jsonb;
begin
  select exists (
    select 1 from public.app_profiles p
    where p.id=auth.uid() and p.active is true
      and lower(coalesce(p.role,'')) in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant')
  ) into v_allowed;
  if not v_allowed then return '{}'::jsonb; end if;

  select * into v_summary
  from public.stock_dashboard_summaries s
  order by s.effective_date desc, s.updated_at desc
  limit 1;

  if v_summary.summary_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'label',p.product_group,
      'value',p.area_m2,
      'count',p.model_count
    ) order by p.area_m2 desc),'[]'::jsonb)
    into v_products
    from public.stock_dashboard_product_summary p
    where p.summary_id=v_summary.summary_id;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into v_prices
  from public.platform_client_price_list() x;

  return jsonb_build_object(
    'current', case when v_summary.summary_id is null then null else jsonb_build_object(
      'inventory_snapshot_id','dashboard:'||v_summary.summary_id,
      'summary_id',v_summary.summary_id,
      'effective_date',v_summary.effective_date,
      'row_count',v_summary.total_models,
      'total_area_m2',v_summary.total_area_m2,
      'promotional_item_count',case when v_summary.all_models_above_minimum then v_summary.total_models else 0 end,
      'promotional_area_m2',case when v_summary.all_models_above_minimum then v_summary.total_area_m2 else 0 end,
      'threshold_area_m2',v_summary.minimum_model_area_m2,
      'all_models_above_minimum',v_summary.all_models_above_minimum,
      'summary_only',true,
      'is_active',true
    ) end,
    'productMix',v_products,
    'priceListItems',v_prices,
    'priceListSourceDate',(select max((x->>'source_date')::date) from jsonb_array_elements(v_prices) x)
  );
end;
$$;
revoke all on function public.platform_stock_overview() from public, anon;
grant execute on function public.platform_stock_overview() to authenticated;

-- Campaign analytics without recipient identities, emails, subjects or message bodies.
create or replace function public.platform_campaign_analytics_payload()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_result jsonb;
begin
  select lower(trim(coalesce(p.role,''))) into v_role
  from public.app_profiles p
  where p.id=auth.uid() and p.active is true
  limit 1;
  if v_role not in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant') then
    return '{}'::jsonb;
  end if;

  with stock_ids as (
    select distinct scm.campaign_id::text as campaign_id from public.stock_campaign_matches scm
    union
    select ec.id::text from public.email_campaigns ec where lower(coalesce(ec.name,'')) like '%stock%'
  ),
  scoped as (
    select
      m.id,
      m.campaign_id::text as campaign_id,
      m.lead_id,
      m.recipient_email,
      m.status,
      m.direction,
      m.subject,
      m.generated_at,
      m.sent_at,
      coalesce(nullif(trim(l.country),''),'Unknown') as country,
      case when exists(select 1 from stock_ids s where s.campaign_id=m.campaign_id::text)
           then 'stock_promotion' else 'lead_outreach' end as campaign_key
    from public.email_messages m
    left join public.leads l on l.lead_id=m.lead_id
    where (
      v_role in ('ceo','business_gm','bi_admin')
      or l.lead_id is null
      or not public.platform_lead_is_bi_admin_only(
        l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
      )
    )
  ),
  keys as (select * from (values ('lead_outreach'::text),('stock_promotion'::text)) k(campaign_key)),
  metrics as (
    select k.campaign_key,
      count(*) filter (
        where s.direction='outbound' and lower(coalesce(s.status,''))='sent'
          and coalesce(s.sent_at,s.generated_at) >= date_trunc('month',now())
          and upper(coalesce(s.subject,'')) not like '[DRY RUN%'
      )::bigint as sent_this_month,
      count(distinct coalesce(s.lead_id,s.recipient_email,s.id::text)) filter (
        where s.direction='outbound' and lower(coalesce(s.status,''))='sent'
          and coalesce(s.sent_at,s.generated_at) >= date_trunc('month',now())
          and upper(coalesce(s.subject,'')) not like '[DRY RUN%'
      )::bigint as unique_this_month,
      count(distinct nullif(s.country,'Unknown')) filter (
        where s.direction='outbound' and lower(coalesce(s.status,''))='sent'
          and coalesce(s.sent_at,s.generated_at) >= date_trunc('month',now())
          and upper(coalesce(s.subject,'')) not like '[DRY RUN%'
      )::bigint as countries_this_month,
      count(*) filter (
        where lower(coalesce(s.status,''))='failed'
          and coalesce(s.generated_at,s.sent_at) >= date_trunc('month',now())
      )::bigint as failed_this_month,
      max(s.sent_at) filter (where lower(coalesce(s.status,''))='sent') as latest_send
    from keys k left join scoped s on s.campaign_key=k.campaign_key
    group by k.campaign_key
  ),
  countries as (
    select s.campaign_key,s.country,count(*)::bigint as sent
    from scoped s
    where s.direction='outbound' and lower(coalesce(s.status,''))='sent'
      and coalesce(s.sent_at,s.generated_at) >= date_trunc('month',now())
      and upper(coalesce(s.subject,'')) not like '[DRY RUN%'
      and s.country is not null
    group by s.campaign_key,s.country
  ),
  days as (
    select d::date as day from generate_series(current_date-29,current_date,interval '1 day') d
  ),
  daily as (
    select d.day,
      count(distinct coalesce(s.lead_id,s.recipient_email,s.id::text)) filter (
        where s.campaign_key='lead_outreach' and s.direction='outbound'
          and lower(coalesce(s.status,''))='sent' and upper(coalesce(s.subject,'')) not like '[DRY RUN%'
      )::bigint as lead_reach,
      count(distinct coalesce(s.lead_id,s.recipient_email,s.id::text)) filter (
        where s.campaign_key='stock_promotion' and s.direction='outbound'
          and lower(coalesce(s.status,''))='sent' and upper(coalesce(s.subject,'')) not like '[DRY RUN%'
      )::bigint as stock_reach
    from days d
    left join scoped s on coalesce(s.sent_at,s.generated_at)::date=d.day
    group by d.day order by d.day
  ),
  visible_countries as (
    select distinct l.country
    from public.leads l
    where nullif(trim(coalesce(l.country,'')),'') is not null
      and (
        v_role in ('ceo','business_gm','bi_admin')
        or not public.platform_lead_is_bi_admin_only(
          l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
        )
      )
  ),
  funnel as (
    select
      count(*) filter (where lower(coalesce(scm.status,'')) ~ '(interest|reply|positive|engaged)')::bigint as interested,
      count(*) filter (where lower(coalesce(scm.status,'')) ~ '(quote|quoted|quotation|proposal)')::bigint as quoted,
      count(*) filter (where lower(coalesce(scm.status,'')) ~ '(sold|won|order|closed_won)')::bigint as sold
    from public.stock_campaign_matches scm
    left join public.leads l on l.lead_id=scm.lead_id
    where v_role in ('ceo','business_gm','bi_admin')
       or l.lead_id is null
       or not public.platform_lead_is_bi_admin_only(
         l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
       )
  )
  select jsonb_build_object(
    'analytics', jsonb_build_object(
      'lead_outreach', jsonb_build_object(
        'sentThisMonth',(select sent_this_month from metrics where campaign_key='lead_outreach'),
        'uniqueReachedThisMonth',(select unique_this_month from metrics where campaign_key='lead_outreach'),
        'countriesReachedThisMonth',(select countries_this_month from metrics where campaign_key='lead_outreach'),
        'failedThisMonth',(select failed_this_month from metrics where campaign_key='lead_outreach'),
        'latestSend',(select latest_send from metrics where campaign_key='lead_outreach'),
        'countryBreakdown',coalesce((select jsonb_agg(jsonb_build_object('country',c.country,'sent',c.sent) order by c.sent desc,c.country) from countries c where c.campaign_key='lead_outreach'),'[]'::jsonb)
      ),
      'stock_promotion', jsonb_build_object(
        'sentThisMonth',(select sent_this_month from metrics where campaign_key='stock_promotion'),
        'uniqueReachedThisMonth',(select unique_this_month from metrics where campaign_key='stock_promotion'),
        'countriesReachedThisMonth',(select countries_this_month from metrics where campaign_key='stock_promotion'),
        'failedThisMonth',(select failed_this_month from metrics where campaign_key='stock_promotion'),
        'latestSend',(select latest_send from metrics where campaign_key='stock_promotion'),
        'countryBreakdown',coalesce((select jsonb_agg(jsonb_build_object('country',c.country,'sent',c.sent) order by c.sent desc,c.country) from countries c where c.campaign_key='stock_promotion'),'[]'::jsonb)
      )
    ),
    'reach', jsonb_build_object(
      'daily', coalesce((select jsonb_agg(jsonb_build_object('date',day,'lead_reach',lead_reach,'stock_reach',stock_reach) order by day) from daily),'[]'::jsonb)
    ),
    'countries', coalesce((select jsonb_agg(country order by country) from visible_countries),'[]'::jsonb),
    'funnel', jsonb_build_object(
      'sent',coalesce((select sent_this_month from metrics where campaign_key='stock_promotion'),0),
      'interested',coalesce((select interested from funnel),0),
      'quoted',coalesce((select quoted from funnel),0),
      'sold',coalesce((select sold from funnel),0)
    )
  ) into v_result;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.platform_campaign_analytics_payload() from public, anon;
grant execute on function public.platform_campaign_analytics_payload() to authenticated;

-- Safe GIS: normal roles get only company/location fields for shared available leads + their own claimed leads.
create or replace function public.platform_visible_gis_leads()
returns table(
  lead_id text,
  name text,
  country text,
  state text,
  city text,
  latitude double precision,
  longitude double precision,
  b2b_score integer,
  lead_status text,
  website text,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_role text;
begin
  select lower(trim(p.email)),lower(trim(coalesce(p.role,''))) into v_email,v_role
  from public.app_profiles p
  where p.id=auth.uid() and p.active is true
  limit 1;
  if v_email is null or v_role not in ('ceo','business_gm','bi_admin','bi_partial','sales_manager') then return; end if;

  return query
  select l.lead_id,l.name,l.country,l.state,l.city,l.latitude,l.longitude,l.b2b_score,l.lead_status,
    case when v_role in ('ceo','business_gm','bi_admin') then l.website else null::text end,
    case when v_role in ('ceo','business_gm','bi_admin') then l.email else null::text end
  from public.leads l
  where l.latitude is not null and l.longitude is not null
    and (
      v_role in ('ceo','business_gm','bi_admin')
      or (
        not public.platform_lead_is_bi_admin_only(
          l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
        )
        and (
          (lower(coalesce(l.lead_status,'available'))='available' and nullif(trim(coalesce(l.assigned_to_email,'')),'') is null)
          or (lower(coalesce(l.lead_status,''))='claimed' and lower(trim(coalesce(l.assigned_to_email,'')))=v_email)
        )
      )
    )
  order by coalesce(l.b2b_score,0) desc,l.name nulls last,l.lead_id;
end;
$$;
revoke all on function public.platform_visible_gis_leads() from public, anon;
grant execute on function public.platform_visible_gis_leads() to authenticated;

-- Aggregate lead/data-quality metrics. Non-admin roles see aggregate statistics only for non-protected leads.
create or replace function public.platform_data_quality_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_result jsonb;
begin
  select lower(trim(coalesce(p.role,''))) into v_role
  from public.app_profiles p
  where p.id=auth.uid() and p.active is true
  limit 1;
  if v_role not in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant') then return '{}'::jsonb; end if;

  with scoped as (
    select l.*,
      (nullif(trim(coalesce(l.email,'')),'') is not null) as has_email,
      (nullif(trim(coalesce(l.contact_full_name,'')),'') is not null) as has_contact,
      (l.latitude is not null and l.longitude is not null) as has_coords,
      (
        l.email_verified is true
        or lower(coalesce(l.email_status,''))='verified'
        or (
          lower(coalesce(l.email_verification_status,'')) !~ '(unverified|not_verified)'
          and lower(coalesce(l.email_verification_status,'')) ~ '(verified|valid)'
        )
        or lower(coalesce(l.email_confidence,''))='high'
      ) as is_verified
    from public.leads l
    where v_role in ('ceo','business_gm','bi_admin')
       or not public.platform_lead_is_bi_admin_only(
         l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
       )
  ),
  domains as (
    select lower(trim(company_domain)) as domain,count(*)::bigint as n
    from scoped
    where nullif(trim(coalesce(company_domain,'')),'') is not null
    group by lower(trim(company_domain))
    having count(*)>1
  ),
  agg as (
    select
      count(*)::bigint total,
      count(*) filter (where lower(coalesce(lead_status,'available'))='available' and nullif(trim(coalesce(assigned_to_email,'')),'') is null)::bigint available,
      count(*) filter (where lower(coalesce(lead_status,''))='claimed')::bigint claimed,
      count(*) filter (where has_email)::bigint usable_email,
      count(*) filter (where has_email and is_verified)::bigint verified_email,
      count(*) filter (where has_contact)::bigint contacts,
      count(*) filter (where coalesce(b2b_score,0)>=75)::bigint high_priority,
      count(*) filter (where has_coords)::bigint geocoded,
      avg(coalesce(b2b_score,0))::numeric average_score,
      count(*) filter (where has_email and has_contact and has_coords)::bigint ready,
      count(*) filter (where has_email and is_verified and has_contact and has_coords)::bigint verified_ready,
      count(*) filter (where not has_email)::bigint missing_email,
      count(*) filter (where has_email and not is_verified)::bigint unverified_email,
      count(*) filter (where not has_contact)::bigint missing_contact,
      count(*) filter (where not has_coords)::bigint missing_coordinates
    from scoped
  )
  select jsonb_build_object(
    'total_leads',a.total,
    'available_leads',a.available,
    'claimed_leads',a.claimed,
    'usable_email',a.usable_email,
    'verified_email_count',a.verified_email,
    'decision_contacts',a.contacts,
    'high_priority',a.high_priority,
    'geocoded',a.geocoded,
    'average_score',coalesce(a.average_score,0),
    'ready_leads',a.ready,
    'verified_ready_leads',a.verified_ready,
    'missing_email',a.missing_email,
    'unverified_email',a.unverified_email,
    'missing_contact',a.missing_contact,
    'missing_coordinates',a.missing_coordinates,
    'duplicate_domains',(select count(*) from domains),
    'duplicate_leads',coalesce((select sum(n) from domains),0),
    'email_coverage_pct',case when a.total>0 then a.usable_email*100.0/a.total else 0 end,
    'verified_email_coverage_pct',case when a.total>0 then a.verified_email*100.0/a.total else 0 end,
    'contact_coverage_pct',case when a.total>0 then a.contacts*100.0/a.total else 0 end,
    'high_priority_share',case when a.total>0 then a.high_priority*100.0/a.total else 0 end,
    'gis_coverage_pct',case when a.total>0 then a.geocoded*100.0/a.total else 0 end,
    'readiness_pct',case when a.total>0 then a.ready*100.0/a.total else 0 end,
    'verified_readiness_pct',case when a.total>0 then a.verified_ready*100.0/a.total else 0 end
  ) into v_result
  from agg a;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.platform_data_quality_summary() from public, anon;
grant execute on function public.platform_data_quality_summary() to authenticated;

-- Detailed stock is readable by analytics roles; price list remains separately safe for every active role.
alter table public.stock_inventory_snapshots enable row level security;
alter table public.stock_items enable row level security;
drop policy if exists platform_stock_inventory_analytics_select on public.stock_inventory_snapshots;
create policy platform_stock_inventory_analytics_select on public.stock_inventory_snapshots
for select to authenticated using (public.platform_can_view_analytics());
drop policy if exists platform_stock_items_analytics_select on public.stock_items;
create policy platform_stock_items_analytics_select on public.stock_items
for select to authenticated using (public.platform_can_view_analytics());
grant select on public.stock_inventory_snapshots,public.stock_items,public.stock_dashboard_summaries,public.stock_dashboard_product_summary to authenticated;

-- Own activity stays visible to every user; BI admin can see all activity.
drop policy if exists platform_activity_admin_select on public.app_activity_log;
drop policy if exists platform_react_activity_select on public.app_activity_log;
drop policy if exists platform_activity_own_or_bi_admin_select on public.app_activity_log;
create policy platform_activity_own_or_bi_admin_select on public.app_activity_log
for select to authenticated
using (
  public.platform_is_bi_admin()
  or actor_profile_id=auth.uid()
);
grant select on public.app_activity_log to authenticated;


-- Six-month aggregate quality trend used by Dashboard and Reports without exposing lead rows.
create or replace function public.platform_lead_quality_history()
returns table(
  month text,
  total bigint,
  usable_email bigint,
  decision_contacts bigint,
  high_priority bigint,
  geocoded bigint,
  average_score numeric,
  email_coverage numeric,
  contact_coverage numeric,
  high_priority_share numeric,
  geocode_coverage numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select lower(trim(coalesce(p.role,''))) into v_role
  from public.app_profiles p
  where p.id=auth.uid() and p.active is true
  limit 1;
  if v_role not in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant') then
    return;
  end if;

  return query
  with months as (
    select date_trunc('month', current_date) - (n || ' months')::interval as month_start
    from generate_series(5,0,-1) g(n)
  ),
  scoped as (
    select l.*, coalesce(l.imported_at,l.created_at,l.updated_at) as event_at
    from public.leads l
    where v_role in ('ceo','business_gm','bi_admin')
       or not public.platform_lead_is_bi_admin_only(
         l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
       )
  ),
  agg as (
    select
      m.month_start,
      count(s.*)::bigint as total,
      count(*) filter (where nullif(trim(coalesce(s.email,'')),'') is not null)::bigint as usable_email,
      count(*) filter (where nullif(trim(coalesce(s.contact_full_name,'')),'') is not null)::bigint as decision_contacts,
      count(*) filter (where coalesce(s.b2b_score,0)>=75)::bigint as high_priority,
      count(*) filter (where s.latitude is not null and s.longitude is not null)::bigint as geocoded,
      coalesce(avg(coalesce(s.b2b_score,0)),0)::numeric as average_score
    from months m
    left join scoped s on s.event_at >= m.month_start and s.event_at < m.month_start + interval '1 month'
    group by m.month_start
  )
  select
    to_char(a.month_start,'YYYY-MM')::text,
    a.total,a.usable_email,a.decision_contacts,a.high_priority,a.geocoded,a.average_score,
    case when a.total>0 then a.usable_email*100.0/a.total else 0 end,
    case when a.total>0 then a.decision_contacts*100.0/a.total else 0 end,
    case when a.total>0 then a.high_priority*100.0/a.total else 0 end,
    case when a.total>0 then a.geocoded*100.0/a.total else 0 end
  from agg a
  order by a.month_start;
end;
$$;
revoke all on function public.platform_lead_quality_history() from public, anon;
grant execute on function public.platform_lead_quality_history() to authenticated;


-- Notes and follow-ups are written through ownership-checked RPCs so users do not need raw leads SELECT.
create or replace function public.add_my_followup(p_lead_id text, p_due_at timestamptz, p_title text)
returns table(
  followup_id uuid,
  lead_id text,
  title text,
  due_at timestamptz,
  status text,
  created_by uuid,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_role text;
  v_row public.lead_followups%rowtype;
begin
  select lower(trim(p.email)),lower(trim(coalesce(p.role,''))) into v_email,v_role
  from public.app_profiles p
  where p.id=auth.uid() and p.active is true
  limit 1;

  if v_email is null or v_role not in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant') then
    raise exception 'Inactive or unauthorized account';
  end if;
  if nullif(trim(coalesce(p_title,'')),'') is null then raise exception 'Follow-up title is required'; end if;
  if p_due_at is null then raise exception 'Follow-up due date is required'; end if;

  if not exists (
    select 1 from public.leads l
    where l.lead_id=trim(coalesce(p_lead_id,''))
      and (
        v_role in ('ceo','business_gm','bi_admin')
        or (
          lower(coalesce(l.lead_status,''))='claimed'
          and lower(trim(coalesce(l.assigned_to_email,'')))=v_email
          and not public.platform_lead_is_bi_admin_only(
            l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
          )
        )
      )
  ) then
    raise exception 'Lead is not available to this account';
  end if;

  insert into public.lead_followups(lead_id,title,due_at,status,created_by)
  values(trim(p_lead_id),trim(p_title),p_due_at,'open',auth.uid())
  returning * into v_row;

  return query select v_row.followup_id,v_row.lead_id,v_row.title,v_row.due_at,v_row.status,v_row.created_by,v_row.created_at,v_row.completed_at;
end;
$$;
revoke all on function public.add_my_followup(text,timestamptz,text) from public, anon;
grant execute on function public.add_my_followup(text,timestamptz,text) to authenticated;

create or replace function public.add_my_lead_note(p_lead_id text, p_body text)
returns table(
  note_id uuid,
  lead_id text,
  body text,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_role text;
  v_row public.lead_notes%rowtype;
begin
  select lower(trim(p.email)),lower(trim(coalesce(p.role,''))) into v_email,v_role
  from public.app_profiles p
  where p.id=auth.uid() and p.active is true
  limit 1;

  if v_email is null or v_role not in ('ceo','business_gm','bi_admin','bi_partial','sales_manager','sales_rep','business_assistant') then
    raise exception 'Inactive or unauthorized account';
  end if;
  if nullif(trim(coalesce(p_body,'')),'') is null then raise exception 'Note is required'; end if;

  if not exists (
    select 1 from public.leads l
    where l.lead_id=trim(coalesce(p_lead_id,''))
      and (
        v_role in ('ceo','business_gm','bi_admin')
        or (
          lower(coalesce(l.lead_status,''))='claimed'
          and lower(trim(coalesce(l.assigned_to_email,'')))=v_email
          and not public.platform_lead_is_bi_admin_only(
            l.account_tier,l.contact_tier,l.decision_email_class,l.contact_full_name,l.contact_job_title
          )
        )
      )
  ) then
    raise exception 'Lead is not available to this account';
  end if;

  insert into public.lead_notes(lead_id,body,created_by)
  values(trim(p_lead_id),trim(p_body),auth.uid())
  returning * into v_row;

  return query select v_row.note_id,v_row.lead_id,v_row.body,v_row.created_by,v_row.created_at;
end;
$$;
revoke all on function public.add_my_lead_note(text,text) from public, anon;
grant execute on function public.add_my_lead_note(text,text) to authenticated;
