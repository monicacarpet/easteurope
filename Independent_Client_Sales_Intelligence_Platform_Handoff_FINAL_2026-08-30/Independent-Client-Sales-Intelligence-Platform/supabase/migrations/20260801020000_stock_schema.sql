-- Platform Stock Campaign V1.7 - current inventory snapshot
-- Generated from 库存清单（20260803更新）.xlsx.
-- This transaction touches only stock inventory/campaign configuration tables.
-- It does not modify leads or existing email history.


create extension if not exists pgcrypto;

create table if not exists public.stock_inventory_snapshots (
    inventory_snapshot_id text primary key,
    source_file text not null,
    source_sheet text not null,
    source_sha256 text not null,
    effective_date date not null,
    row_count integer not null,
    total_area_m2 numeric not null,
    export_row_count integer not null,
    export_area_m2 numeric not null,
    domestic_row_count integer not null,
    domestic_area_m2 numeric not null,
    promotional_item_count integer not null,
    promotional_area_m2 numeric not null,
    is_active boolean not null default false,
    created_at timestamptz not null default now(),
    activated_at timestamptz
);

-- Complete base table definition so this file also works on a fresh Supabase project.
create table if not exists public.stock_items (
    item_id text primary key,
    inventory_snapshot_id text,
    source_file text,
    source_sheet text,
    source_row integer,
    source_flag text,
    source_sha256 text,
    source_effective_date date,
    customer_code text,
    source_order_no text,
    sku text not null,
    offer_group text not null,
    product_type text not null,
    format text,
    specification text,
    thickness_mm numeric,
    wear_layer_mm numeric,
    uv_finish text,
    available_pieces numeric,
    available_boxes numeric,
    available_cases numeric,
    estimated_area_m2 numeric,
    stock_market text,
    surface_no text,
    top_layer text,
    single_piece_area_m2 numeric,
    source_remark text,
    material_type text,
    finished_category text,
    format_family text,
    texture_family text,
    has_ixpe boolean,
    pricing_rule text,
    price_status text not null default 'not_set',
    target_price numeric,
    price_currency text,
    price_unit text,
    incoterm text,
    moq_m2 numeric,
    price_note text,
    price_updated_at timestamptz,
    price_tax_included boolean,
    price_tax_rate numeric,
    freight_included boolean,
    price_source text,
    price_effective_date date,
    promotional_price_label text,
    exact_quantity_display text,
    exact_price_display text,
    price_conditions_display text,
    scarcity_type text,
    scarcity_statement text,
    immediate_availability_statement text,
    public_product_description text,
    public_format text,
    public_thickness text,
    public_wear_layer text,
    promotional_priority integer not null default 50,
    promotional_email_enabled boolean not null default false,
    interest_check_enabled boolean not null default false,
    availability_status text not null default 'manual_review',
    last_inventory_confirmed_at timestamptz,
    inventory_confirmed_by text,
    internal_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Idempotent upgrades for repositories that already have an older stock table.
alter table public.stock_items add column if not exists inventory_snapshot_id text;
alter table public.stock_items add column if not exists stock_market text;
alter table public.stock_items add column if not exists source_sha256 text;
alter table public.stock_items add column if not exists source_effective_date date;
alter table public.stock_items add column if not exists surface_no text;
alter table public.stock_items add column if not exists top_layer text;
alter table public.stock_items add column if not exists single_piece_area_m2 numeric;
alter table public.stock_items add column if not exists source_remark text;
alter table public.stock_items add column if not exists material_type text;
alter table public.stock_items add column if not exists finished_category text;
alter table public.stock_items add column if not exists format_family text;
alter table public.stock_items add column if not exists texture_family text;
alter table public.stock_items add column if not exists has_ixpe boolean;
alter table public.stock_items add column if not exists pricing_rule text;
alter table public.stock_items add column if not exists price_status text not null default 'not_set';
alter table public.stock_items add column if not exists target_price numeric;
alter table public.stock_items add column if not exists price_currency text;
alter table public.stock_items add column if not exists price_unit text;
alter table public.stock_items add column if not exists incoterm text;
alter table public.stock_items add column if not exists moq_m2 numeric;
alter table public.stock_items add column if not exists price_note text;
alter table public.stock_items add column if not exists price_updated_at timestamptz;
alter table public.stock_items add column if not exists price_tax_included boolean;
alter table public.stock_items add column if not exists price_tax_rate numeric;
alter table public.stock_items add column if not exists freight_included boolean;
alter table public.stock_items add column if not exists price_source text;
alter table public.stock_items add column if not exists price_effective_date date;
alter table public.stock_items add column if not exists promotional_price_label text;
alter table public.stock_items add column if not exists exact_quantity_display text;
alter table public.stock_items add column if not exists exact_price_display text;
alter table public.stock_items add column if not exists price_conditions_display text;
alter table public.stock_items add column if not exists scarcity_type text;
alter table public.stock_items add column if not exists scarcity_statement text;
alter table public.stock_items add column if not exists immediate_availability_statement text;
alter table public.stock_items add column if not exists public_product_description text;
alter table public.stock_items add column if not exists public_format text;
alter table public.stock_items add column if not exists public_thickness text;
alter table public.stock_items add column if not exists public_wear_layer text;
alter table public.stock_items add column if not exists promotional_priority integer not null default 50;
alter table public.stock_items add column if not exists promotional_email_enabled boolean not null default false;
alter table public.stock_items add column if not exists interest_check_enabled boolean not null default false;
alter table public.stock_items add column if not exists availability_status text not null default 'manual_review';
alter table public.stock_items add column if not exists last_inventory_confirmed_at timestamptz;
alter table public.stock_items add column if not exists inventory_confirmed_by text;
alter table public.stock_items add column if not exists internal_note text;
alter table public.stock_items add column if not exists created_at timestamptz not null default now();
alter table public.stock_items add column if not exists updated_at timestamptz not null default now();

create table if not exists public.stock_campaign_matches (
    id uuid primary key default gen_random_uuid(),
    campaign_id text not null,
    lead_id text not null references public.leads(lead_id) on delete cascade,
    offer_group text,
    selected_item_id text,
    status text not null default 'candidate',
    fit_reason text,
    website_fact text,
    website_fact_source_url text,
    buyer_need_inference text,
    match_score integer,
    category_fit_score integer,
    last_subject text,
    last_contacted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (campaign_id, lead_id)
);
alter table public.stock_campaign_matches add column if not exists selected_item_id text;
alter table public.stock_campaign_matches add column if not exists match_score integer;
alter table public.stock_campaign_matches add column if not exists category_fit_score integer;
alter table public.stock_campaign_matches add column if not exists website_fact_source_url text;
alter table public.stock_campaign_matches add column if not exists buyer_need_inference text;

create index if not exists idx_stock_inventory_snapshots_active
    on public.stock_inventory_snapshots (is_active, effective_date desc);
create index if not exists idx_stock_items_snapshot_promo
    on public.stock_items (inventory_snapshot_id, promotional_email_enabled,
        price_status, availability_status, estimated_area_m2 desc);

create index if not exists idx_stock_campaign_matches_status
    on public.stock_campaign_matches (campaign_id, status, last_contacted_at);


-- Verification: these values must match the workbook snapshot exactly.
select inventory_snapshot_id, source_file, source_sha256, effective_date,
       row_count, total_area_m2, export_row_count, export_area_m2,
       domestic_row_count, domestic_area_m2, promotional_item_count,
       promotional_area_m2, is_active
from public.stock_inventory_snapshots
where inventory_snapshot_id='inventory_20260803_9fa9eef9';

select
    count(*) as loaded_rows,
    round(sum(estimated_area_m2)::numeric, 8) as loaded_area_m2,
    count(*) filter (where promotional_email_enabled=true) as promotional_rows,
    round((sum(estimated_area_m2) filter (where promotional_email_enabled=true))::numeric, 8) as promotional_area_m2
from public.stock_items
where inventory_snapshot_id='inventory_20260803_9fa9eef9';

select product_type, pricing_rule, count(*) as item_count,
       round(sum(estimated_area_m2)::numeric, 2) as area_m2,
       min(target_price) as price_cny_m2, max(target_price) as price_cny_m2_check
from public.stock_items
where inventory_snapshot_id='inventory_20260803_9fa9eef9'
  and promotional_email_enabled=true
group by product_type, pricing_rule
order by product_type, pricing_rule;
