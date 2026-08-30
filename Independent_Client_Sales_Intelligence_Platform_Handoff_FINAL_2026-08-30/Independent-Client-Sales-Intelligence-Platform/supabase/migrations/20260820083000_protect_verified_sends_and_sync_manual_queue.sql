create or replace function public.protect_verified_email_delivery_truth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'sent'
     and old.sent_at is not null
     and old.provider = 'smtp+imap_sent'
     and new.status = 'failed' then
    new.status := 'sent';
    new.sent_at := old.sent_at;
    new.provider := old.provider;
    new.provider_message_id := coalesce(old.provider_message_id, new.provider_message_id);
    new.error_message := case
      when coalesce(new.error_message, '') = '' then old.error_message
      else left('Post-send processing warning: ' || new.error_message, 2000)
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_verified_email_delivery_truth on public.email_messages;
create trigger trg_protect_verified_email_delivery_truth
before update on public.email_messages
for each row
execute function public.protect_verified_email_delivery_truth();

create or replace function public.sync_manual_queue_on_verified_send()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_key text;
begin
  if new.sent_at is null or new.provider <> 'smtp+imap_sent' then
    return new;
  end if;

  select control_key
    into v_campaign_key
  from public.campaign_controls
  where lower(sender_email) = lower(new.sender_email)
  order by control_key
  limit 1;

  if v_campaign_key is null then
    return new;
  end if;

  update public.manual_promotion_queue
     set status = 'sent',
         started_at = coalesce(started_at, new.sent_at),
         completed_at = coalesce(completed_at, new.sent_at),
         recipient_email = lower(new.recipient_email),
         error_message = null,
         updated_at = now()
   where campaign_key = v_campaign_key
     and lead_id = new.lead_id
     and status in ('queued', 'processing')
     and requested_at <= new.sent_at;

  return new;
end;
$$;

drop trigger if exists trg_sync_manual_queue_on_verified_send on public.email_messages;
create trigger trg_sync_manual_queue_on_verified_send
after insert or update of status, provider, sent_at, sender_email, recipient_email, lead_id
on public.email_messages
for each row
execute function public.sync_manual_queue_on_verified_send();
