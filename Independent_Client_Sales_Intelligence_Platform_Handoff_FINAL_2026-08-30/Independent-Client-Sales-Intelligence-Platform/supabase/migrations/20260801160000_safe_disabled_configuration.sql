-- Safe bootstrap state for a new client-owned project.
-- The automations remain disabled until the generated client configuration is applied.

alter table public.email_campaigns
  add column if not exists campaign_goal text;

alter table public.campaign_controls
  add column if not exists runtime_settings jsonb not null default '{}'::jsonb;

alter table public.campaign_controls
  add column if not exists priority_countries text[] not null default '{}'::text[];

create unique index if not exists uq_email_campaigns_name
  on public.email_campaigns(name);

insert into public.email_campaigns
  (name, status, sender_name, sender_email, daily_limit, batch_size, campaign_goal)
values
  (
    'Client Lead Outreach',
    'paused',
    'Sales Team',
    'outreach@example.com',
    15,
    15,
    E'AUTHORITATIVE CAMPAIGN COPY POLICY\nWrite a factual B2B outreach email in the recipient business language. Use exactly two short paragraphs and 55-105 customer-facing words. The subject must contain 2-7 natural words and must not include the recipient company name. Use only verified lead or website facts. Paragraph 1 connects one verified business fact to one relevant, configured company capability. Paragraph 2 contains exactly one low-pressure question. Never invent demand, volumes, projects, suppliers, budgets, urgency, scarcity, certifications, prices, or delivery claims. Do not add a greeting, signature, website, contact details, or opt-out; the application adds protected elements. TIMING: recipient-local Monday-Friday, only 09:00-11:00 or 14:00-17:00.'
  ),
  (
    'Client Ready Stock Promotion',
    'paused',
    'Ready Stock Sales',
    'stock@example.com',
    15,
    15,
    E'AUTHORITATIVE CAMPAIGN COPY POLICY\nWrite a factual ready-stock B2B email in the recipient business language. Use exactly two short paragraphs and 55-110 customer-facing words. The subject must contain 2-7 natural words and must not include the recipient company name. Use only the selected active inventory row, approved price, and verified lead or website facts. State quantities, price, currency, unit, and commercial conditions exactly as supplied. Paragraph 2 contains exactly one low-pressure question. Never invent stock, price, discount, scarcity, demand, delivery, replenishment, certifications, or buyer intent. Do not add a greeting, signature, website, contact details, or opt-out; the application adds protected elements. TIMING: recipient-local Monday-Friday, only 09:00-11:00 or 14:00-17:00.'
  )
on conflict (name) do update set
  status = 'paused',
  sender_name = excluded.sender_name,
  sender_email = excluded.sender_email,
  daily_limit = excluded.daily_limit,
  batch_size = excluded.batch_size,
  campaign_goal = excluded.campaign_goal,
  updated_at = now();

update public.campaign_controls
set campaign_name = case control_key
      when 'lead_outreach' then 'Client Lead Outreach'
      when 'stock_promotion' then 'Client Ready Stock Promotion'
      else campaign_name
    end,
    sender_email = case control_key
      when 'lead_outreach' then 'outreach@example.com'
      when 'stock_promotion' then 'stock@example.com'
      else sender_email
    end,
    enabled = false,
    updated_at = now()
where control_key in ('lead_outreach', 'stock_promotion');

