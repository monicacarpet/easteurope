-- Configurable Manual Reach country priority.
-- No country is hardcoded here. Set priority_countries from Campaign Control UI.
alter table public.campaign_controls
  add column if not exists priority_countries text[] not null default '{}'::text[];

comment on column public.campaign_controls.priority_countries is
  'Ordered business-priority countries for manual reach. Empty means no country receives a priority boost.';
