-- P35: safe UI-driven stock inventory replacement.
-- Uploads are validated and activated atomically; the previous active snapshot remains
-- authoritative if any validation or insert step fails.

create extension if not exists pgcrypto;

create table if not exists public.stock_pricing_rules (
  rule_key text primary key,
  process_type text not null,
  thickness_mm numeric not null,
  ixpe_mode text not null default 'any' check (ixpe_mode in ('any','yes','no')),
  target_price numeric not null check (target_price > 0),
  price_currency text not null default 'CNY',
  price_unit text not null default 'm2',
  price_tax_included boolean not null default true,
  price_tax_rate numeric,
  freight_included boolean not null default false,
  price_source text,
  price_effective_date date,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_inventory_uploads (
  upload_id uuid primary key default gen_random_uuid(),
  inventory_snapshot_id text not null references public.stock_inventory_snapshots(inventory_snapshot_id) on delete restrict,
  source_file text not null,
  source_sheet text,
  source_sha256 text not null,
  effective_date date not null,
  row_count integer not null,
  total_area_m2 numeric not null,
  promotional_item_count integer not null,
  promotional_area_m2 numeric not null,
  uploaded_by uuid,
  uploaded_by_email text,
  uploaded_at timestamptz not null default now(),
  warning text
);

alter table public.stock_pricing_rules enable row level security;
alter table public.stock_inventory_uploads enable row level security;

drop policy if exists platform_stock_pricing_rules_read on public.stock_pricing_rules;
create policy platform_stock_pricing_rules_read on public.stock_pricing_rules
for select to authenticated using (true);

drop policy if exists platform_stock_inventory_uploads_admin_read on public.stock_inventory_uploads;
create policy platform_stock_inventory_uploads_admin_read on public.stock_inventory_uploads
for select to authenticated using (
  exists (
    select 1 from public.app_profiles p
    where p.id=auth.uid() and p.active is true
      and lower(coalesce(p.role,'')) in ('ceo','business_gm','bi_admin')
  )
);

grant select on public.stock_pricing_rules to authenticated;
grant select on public.stock_inventory_uploads to authenticated;

-- Keep stock-upload safety thresholds in Supabase runtime policy rather than UI/Python.
update public.campaign_controls
set runtime_settings = coalesce(runtime_settings,'{}'::jsonb)
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'stock_upload_max_rows' then jsonb_build_object('stock_upload_max_rows',5000) else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'stock_upload_min_row_ratio' then jsonb_build_object('stock_upload_min_row_ratio',0.50) else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'stock_upload_min_area_ratio' then jsonb_build_object('stock_upload_min_area_ratio',0.35) else '{}'::jsonb end
  || case when not coalesce(runtime_settings,'{}'::jsonb) ? 'stock_upload_max_area_ratio' then jsonb_build_object('stock_upload_max_area_ratio',3.00) else '{}'::jsonb end,
    updated_at=now()
where control_key='stock_promotion';

create or replace function public.import_stock_inventory_snapshot(
  p_source_file text,
  p_source_sha256 text,
  p_effective_date date,
  p_source_sheet text,
  p_rows jsonb,
  p_confirm_large_change boolean default false
) returns jsonb
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_profile public.app_profiles%rowtype;
  v_control public.campaign_controls%rowtype;
  v_old public.stock_inventory_snapshots%rowtype;
  v_existing public.stock_inventory_snapshots%rowtype;
  v_snapshot_id text;
  v_row jsonb;
  v_rule public.stock_pricing_rules%rowtype;
  v_row_count integer;
  v_total_area numeric;
  v_export_rows integer;
  v_export_area numeric;
  v_domestic_rows integer;
  v_domestic_area numeric;
  v_promo_rows integer := 0;
  v_promo_area numeric := 0;
  v_min_promo numeric;
  v_max_rows integer;
  v_min_row_ratio numeric;
  v_min_area_ratio numeric;
  v_max_area_ratio numeric;
  v_large_change boolean := false;
  v_warning text := null;
  v_source_row integer;
  v_market text;
  v_area numeric;
  v_thickness numeric;
  v_ixpe boolean;
  v_process text;
  v_sku text;
  v_item_id text;
  v_enabled boolean;
  v_product_type text;
  v_format_family text;
  v_texture_family text;
  v_public_format text;
  v_public_desc text;
  v_wear numeric;
begin
  select * into v_profile from public.app_profiles
  where id=auth.uid() and coalesce(active,false)=true limit 1;
  if v_profile.id is null or lower(coalesce(v_profile.role,'')) not in ('ceo','business_gm','bi_admin') then
    raise exception 'You are not authorized to replace stock inventory';
  end if;

  select * into v_control from public.campaign_controls where control_key='stock_promotion' limit 1;
  if v_control.control_key is null then raise exception 'Stock promotion runtime control is missing'; end if;
  if not (coalesce(v_control.runtime_settings,'{}'::jsonb) ? 'minimum_promotional_area_m2') then
    raise exception 'minimum_promotional_area_m2 is missing from stock runtime settings';
  end if;
  v_min_promo := (v_control.runtime_settings->>'minimum_promotional_area_m2')::numeric;
  v_max_rows := (v_control.runtime_settings->>'stock_upload_max_rows')::integer;
  v_min_row_ratio := (v_control.runtime_settings->>'stock_upload_min_row_ratio')::numeric;
  v_min_area_ratio := (v_control.runtime_settings->>'stock_upload_min_area_ratio')::numeric;
  v_max_area_ratio := (v_control.runtime_settings->>'stock_upload_max_area_ratio')::numeric;

  if nullif(trim(coalesce(p_source_file,'')),'') is null then raise exception 'Source filename is required'; end if;
  if lower(trim(coalesce(p_source_sha256,''))) !~ '^[0-9a-f]{64}$' then raise exception 'A valid SHA-256 checksum is required'; end if;
  if p_effective_date is null then raise exception 'Stock effective date is required'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Stock rows must be a JSON array'; end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 then raise exception 'The stock file contains no data rows'; end if;
  if v_row_count > v_max_rows then raise exception 'The stock file has % rows; maximum configured upload is %', v_row_count, v_max_rows; end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where nullif(trim(coalesce(r->>'sku','')),'') is null
       or nullif(trim(coalesce(r->>'process_type','')),'') is null
       or nullif(trim(coalesce(r->>'specification','')),'') is null
       or coalesce(nullif(r->>'area_m2','')::numeric,0) <= 0
       or coalesce(r->>'stock_market','') not in ('外销','内销')
       or nullif(r->>'source_row','') is null
  ) then
    raise exception 'One or more stock rows are missing SKU, process, specification, positive area, source row, or valid market';
  end if;

  if (select count(*) from jsonb_array_elements(p_rows)) <>
     (select count(distinct (r->>'source_row')) from jsonb_array_elements(p_rows) r) then
    raise exception 'Duplicate source-row numbers were detected in the upload';
  end if;

  select * into v_existing from public.stock_inventory_snapshots
  where lower(source_sha256)=lower(p_source_sha256)
  order by created_at desc limit 1;
  if v_existing.inventory_snapshot_id is not null then
    return jsonb_build_object(
      'success',true,
      'already_imported',true,
      'active',coalesce(v_existing.is_active,false),
      'inventory_snapshot_id',v_existing.inventory_snapshot_id,
      'message',case when v_existing.is_active then 'This exact file is already the active stock snapshot.' else 'This exact file was imported previously; current stock was left unchanged.' end
    );
  end if;

  select
    count(*)::integer,
    coalesce(sum((r->>'area_m2')::numeric),0),
    count(*) filter (where r->>'stock_market'='外销')::integer,
    coalesce(sum((r->>'area_m2')::numeric) filter (where r->>'stock_market'='外销'),0),
    count(*) filter (where r->>'stock_market'='内销')::integer,
    coalesce(sum((r->>'area_m2')::numeric) filter (where r->>'stock_market'='内销'),0)
  into v_row_count,v_total_area,v_export_rows,v_export_area,v_domestic_rows,v_domestic_area
  from jsonb_array_elements(p_rows) r;

  select * into v_old from public.stock_inventory_snapshots
  where is_active=true order by activated_at desc nulls last limit 1;

  if v_old.inventory_snapshot_id is not null and v_old.row_count > 0 and v_old.total_area_m2 > 0 then
    v_large_change :=
      (v_row_count::numeric / v_old.row_count::numeric) < v_min_row_ratio
      or (v_total_area / v_old.total_area_m2) < v_min_area_ratio
      or (v_total_area / v_old.total_area_m2) > v_max_area_ratio;
    if v_large_change then
      v_warning := format('Large inventory change: previous %s rows / %s m²; upload %s rows / %s m².',v_old.row_count,round(v_old.total_area_m2,2),v_row_count,round(v_total_area,2));
      if not coalesce(p_confirm_large_change,false) then
        raise exception '% Confirm the full-replacement warning before importing.', v_warning;
      end if;
    end if;
  end if;

  v_snapshot_id := 'inventory_' || to_char(p_effective_date,'YYYYMMDD') || '_' || substr(lower(p_source_sha256),1,8);

  insert into public.stock_inventory_snapshots(
    inventory_snapshot_id,source_file,source_sheet,source_sha256,effective_date,
    row_count,total_area_m2,export_row_count,export_area_m2,domestic_row_count,domestic_area_m2,
    promotional_item_count,promotional_area_m2,is_active,created_at
  ) values (
    v_snapshot_id,trim(p_source_file),coalesce(nullif(trim(p_source_sheet),''),'Stock Upload'),lower(p_source_sha256),p_effective_date,
    v_row_count,v_total_area,v_export_rows,v_export_area,v_domestic_rows,v_domestic_area,
    0,0,false,now()
  );

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_source_row := (v_row->>'source_row')::integer;
    v_market := v_row->>'stock_market';
    v_area := (v_row->>'area_m2')::numeric;
    v_process := trim(v_row->>'process_type');
    v_sku := trim(v_row->>'sku');
    v_thickness := nullif(v_row->>'thickness_mm','')::numeric;
    v_wear := nullif(v_row->>'wear_layer_mm','')::numeric;
    v_ixpe := coalesce((v_row->>'has_ixpe')::boolean,false);
    v_product_type := coalesce(nullif(trim(v_row->>'product_type'),''),v_process,'Flooring');
    v_format_family := coalesce(nullif(trim(v_row->>'format_family'),''),'plank');
    v_texture_family := coalesce(nullif(trim(v_row->>'texture_family'),''),'decorative');
    v_public_format := coalesce(nullif(trim(v_row->>'public_format'),''),trim(v_row->>'specification'));
    v_public_desc := coalesce(nullif(trim(v_row->>'public_product_description'),''),v_product_type || ' stock item');

    v_rule := null;
    if v_thickness is not null then
      select * into v_rule from public.stock_pricing_rules r
      where r.active=true
        and lower(trim(r.process_type))=lower(v_process)
        and r.thickness_mm=v_thickness
        and (r.ixpe_mode='any' or (r.ixpe_mode='yes' and v_ixpe) or (r.ixpe_mode='no' and not v_ixpe))
      order by case r.ixpe_mode when 'any' then 1 else 0 end
      limit 1;
    end if;

    v_enabled := v_market='外销' and v_area>=v_min_promo and v_rule.rule_key is not null;
    if v_enabled then
      v_promo_rows := v_promo_rows + 1;
      v_promo_area := v_promo_area + v_area;
    end if;

    v_item_id := v_snapshot_id || '_r' || v_source_row::text || '_' || substr(encode(digest(v_sku,'sha256'),'hex'),1,10);

    insert into public.stock_items(
      item_id,inventory_snapshot_id,source_file,source_sheet,source_row,source_flag,source_sha256,source_effective_date,
      sku,offer_group,product_type,format,specification,thickness_mm,wear_layer_mm,
      available_pieces,available_boxes,available_cases,estimated_area_m2,stock_market,surface_no,top_layer,single_piece_area_m2,
      source_remark,material_type,finished_category,format_family,texture_family,has_ixpe,pricing_rule,
      price_status,target_price,price_currency,price_unit,price_tax_included,price_tax_rate,freight_included,price_source,price_effective_date,
      promotional_price_label,exact_quantity_display,exact_price_display,price_conditions_display,scarcity_type,scarcity_statement,
      immediate_availability_statement,public_product_description,public_format,public_thickness,public_wear_layer,promotional_priority,
      promotional_email_enabled,interest_check_enabled,availability_status,last_inventory_confirmed_at,inventory_confirmed_by,internal_note,updated_at
    ) values (
      v_item_id,v_snapshot_id,trim(p_source_file),coalesce(nullif(trim(p_source_sheet),''),'Stock Upload'),v_source_row,v_market,lower(p_source_sha256),p_effective_date,
      v_sku,coalesce(v_rule.rule_key,v_product_type),v_product_type,v_public_format,trim(v_row->>'specification'),v_thickness,v_wear,
      nullif(v_row->>'pieces','')::numeric,nullif(v_row->>'boxes','')::numeric,nullif(v_row->>'cases','')::numeric,v_area,v_market,
      nullif(trim(v_row->>'surface_no'),''),nullif(trim(v_row->>'top_layer'),''),nullif(v_row->>'single_piece_area_m2','')::numeric,
      nullif(trim(v_row->>'source_remark'),''),nullif(trim(v_row->>'material_type'),''),nullif(trim(v_row->>'finished_category'),''),
      v_format_family,v_texture_family,v_ixpe,v_rule.rule_key,
      case when v_rule.rule_key is null then 'not_set' else 'confirmed' end,
      v_rule.target_price,v_rule.price_currency,v_rule.price_unit,v_rule.price_tax_included,v_rule.price_tax_rate,v_rule.freight_included,v_rule.price_source,v_rule.price_effective_date,
      case when v_rule.rule_key is null then null else v_rule.price_currency || ' ' || trim(to_char(v_rule.target_price,'FM999999990.00')) || '/' || v_rule.price_unit end,
      trim(to_char(v_area,'FM999999990.00')) || ' m²',
      case when v_rule.rule_key is null then null else v_rule.price_currency || ' ' || trim(to_char(v_rule.target_price,'FM999999990.00')) || '/' || v_rule.price_unit end,
      case when v_rule.rule_key is null then null else case when v_rule.price_tax_included then 'tax included' else 'tax excluded' end || ', ' || case when v_rule.freight_included then 'freight included' else 'freight excluded' end end,
      case when v_enabled then 'one_off_lot' else 'none' end,
      case when v_enabled then 'This is a one-off ready-stock lot; allocation is subject to remaining availability.' else null end,
      case when v_enabled then 'The lot can be allocated without waiting for a new production run.' else null end,
      v_public_desc,v_public_format,coalesce(nullif(trim(v_row->>'public_thickness'),''),case when v_thickness is null then '' else trim(to_char(v_thickness,'FM999999990.0')) || ' mm' end),
      coalesce(nullif(trim(v_row->>'public_wear_layer'),''),case when v_wear is null then '' else trim(to_char(v_wear,'FM999999990.00')) || ' mm' end),
      50,v_enabled,v_enabled,case when v_enabled then 'promotional_ready' else 'inventory_only_current' end,
      now(),coalesce(v_profile.email,'UI stock upload'),
      case when v_enabled then 'UI import: eligible for stock promotion under current Supabase pricing/runtime rules.'
           when v_market<>'外销' then 'UI import: domestic stock; not eligible for export promotion.'
           when v_area<v_min_promo then 'UI import: below configured promotional area threshold.'
           else 'UI import: no active exact pricing rule for this process/thickness/backing combination.' end,
      now()
    );
  end loop;

  update public.stock_inventory_snapshots
  set promotional_item_count=v_promo_rows,promotional_area_m2=v_promo_area
  where inventory_snapshot_id=v_snapshot_id;

  -- Activation is last. Any failure above rolls back and leaves the old snapshot untouched.
  update public.stock_inventory_snapshots set is_active=false where is_active=true;
  if v_old.inventory_snapshot_id is not null then
    update public.stock_items
    set promotional_email_enabled=false,interest_check_enabled=false,
        availability_status='superseded_inventory_snapshot',updated_at=now()
    where inventory_snapshot_id=v_old.inventory_snapshot_id;
  end if;
  update public.stock_inventory_snapshots
  set is_active=true,activated_at=now()
  where inventory_snapshot_id=v_snapshot_id;

  insert into public.stock_inventory_uploads(
    inventory_snapshot_id,source_file,source_sheet,source_sha256,effective_date,row_count,total_area_m2,
    promotional_item_count,promotional_area_m2,uploaded_by,uploaded_by_email,warning
  ) values (
    v_snapshot_id,trim(p_source_file),coalesce(nullif(trim(p_source_sheet),''),'Stock Upload'),lower(p_source_sha256),p_effective_date,
    v_row_count,v_total_area,v_promo_rows,v_promo_area,v_profile.id,v_profile.email,v_warning
  );

  insert into public.app_activity_log(actor_profile_id,actor_email,event_type,action,entity_type,entity_id,details,created_at)
  values(v_profile.id,v_profile.email,'stock_inventory_uploaded','replace_active_stock','stock_inventory_snapshot',v_snapshot_id,
    jsonb_build_object('source_file',p_source_file,'effective_date',p_effective_date,'row_count',v_row_count,'total_area_m2',v_total_area,'promotional_item_count',v_promo_rows,'promotional_area_m2',v_promo_area,'previous_snapshot_id',v_old.inventory_snapshot_id,'warning',v_warning),now());

  return jsonb_build_object(
    'success',true,'already_imported',false,'inventory_snapshot_id',v_snapshot_id,
    'row_count',v_row_count,'total_area_m2',v_total_area,
    'export_row_count',v_export_rows,'export_area_m2',v_export_area,
    'promotional_item_count',v_promo_rows,'promotional_area_m2',v_promo_area,
    'previous_snapshot_id',v_old.inventory_snapshot_id,'warning',v_warning,
    'message','Stock inventory activated. Dashboard and stock email agent will use this snapshot immediately.'
  );
end;
$function$;

grant execute on function public.import_stock_inventory_snapshot(text,text,date,text,jsonb,boolean) to authenticated;

-- Client price list now reads the same centrally managed pricing rules used by stock imports.
create or replace function public.platform_client_price_list()
returns table(item_id text, inventory_snapshot_id text, source_date date, product_type text, sku text,
  specification text, format text, thickness_mm numeric, wear_layer_mm numeric, estimated_area_m2 numeric,
  exact_quantity_display text, price_status text, price_currency text, price_unit text, incoterm text,
  pricing_rule text, client_price_cny numeric, public_product_description text, public_format text,
  public_thickness text, public_wear_layer text)
language plpgsql
stable security definer
set search_path=''
as $function$
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
  order by s.effective_date desc nulls last,s.activated_at desc nulls last limit 1;
  if v_snapshot is null then return; end if;

  return query
  select i.item_id,i.inventory_snapshot_id,i.source_effective_date,i.product_type,i.sku,i.specification,i.format,
    i.thickness_mm,i.wear_layer_mm,i.estimated_area_m2,i.exact_quantity_display,i.price_status,i.price_currency,
    i.price_unit,i.incoterm,i.pricing_rule,r.target_price,i.public_product_description,i.public_format,
    i.public_thickness,i.public_wear_layer
  from public.stock_items i
  join public.stock_pricing_rules r on r.rule_key=i.pricing_rule and r.active=true
  where i.inventory_snapshot_id=v_snapshot
    and lower(coalesce(i.price_status,''))='confirmed'
    and coalesce(i.estimated_area_m2,0) >= (
      select (c.runtime_settings->>'minimum_promotional_area_m2')::numeric
      from public.campaign_controls c where c.control_key='stock_promotion' limit 1
    )
    and lower(trim(coalesce(i.stock_market,i.source_flag,''))) in ('外销','export','exports','export stock','export_stock')
  order by i.estimated_area_m2 desc nulls last,i.item_id;
end;
$function$;
