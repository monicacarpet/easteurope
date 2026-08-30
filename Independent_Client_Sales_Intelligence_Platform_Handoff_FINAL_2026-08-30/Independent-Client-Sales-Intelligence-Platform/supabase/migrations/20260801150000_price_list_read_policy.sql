-- Platform client price-list read policy
-- Gives BI Admin / Sales Manager read-only access to detailed stock rows.
-- Existing admin write policies remain unchanged.


create or replace function public.platform_react_can_read_stock_detail()
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
      and p.role in ('ceo', 'business_gm', 'bi_admin', 'sales_manager')
  );
$$;

revoke all on function public.platform_react_can_read_stock_detail() from public;
grant execute on function public.platform_react_can_read_stock_detail() to authenticated;

grant select on public.stock_items to authenticated;
grant select on public.stock_inventory_snapshots to authenticated;

alter table public.stock_items enable row level security;
alter table public.stock_inventory_snapshots enable row level security;

drop policy if exists platform_stock_items_read_authorized on public.stock_items;
create policy platform_stock_items_read_authorized
on public.stock_items
for select
to authenticated
using (public.platform_react_can_read_stock_detail());

drop policy if exists platform_stock_snapshots_read_authorized on public.stock_inventory_snapshots;
create policy platform_stock_snapshots_read_authorized
on public.stock_inventory_snapshots
for select
to authenticated
using (public.platform_react_can_read_stock_detail());


-- Verification: run while signed in through the application.
-- BI Admin / Sales Manager should see the current detailed snapshot.
