# Operations runbook

## Daily operator workflow

1. Review dashboard exceptions, overdue follow-ups, email failures, and data-quality gaps.
2. Work claimed leads in **My Leads**; add notes and next actions.
3. Review campaign queues before any manual live run.
4. Confirm current inventory and pricing before stock promotion.
5. Pause a campaign immediately if copy, delivery, credentials, or source data is uncertain.

## Inventory updates

1. Download the current template from the Stock page.
2. Populate a complete snapshot.
3. Upload and review validation results.
4. Confirm unusually large changes only after reconciling them to the source workbook.
5. Verify the new active snapshot, pricing coverage, and promotion-eligible rows.

## Email operations

Run each GitHub workflow in preview mode first. Review generated artifacts, then run a one-email live test using the exact confirmation phrase. Check the mailbox Sent folder, Supabase `email_messages`, campaign queue status, and activity log before raising the limit.

Scheduled sends require all three conditions:

1. `AUTOMATION_ENABLED=true` in GitHub repository variables.
2. The corresponding Supabase campaign control has `enabled=true`.
3. The related `email_campaigns` row has live status and valid sender settings.

## Pause procedure

Set `AUTOMATION_ENABLED=false` for a global stop. Also disable the relevant Supabase campaign control. Leave both disabled until the cause is identified and a preview passes.

## Common failures

| Symptom | Check |
| --- | --- |
| Zero sends | Campaign enabled state, time window, cooldown, queue candidates, daily cap, recipient route |
| Authentication failure | Rotated mailbox app password, SMTP/IMAP host and port, mailbox policy |
| Supabase error | Project URL/key pairing, migration status, RLS/grants, service-role secret |
| Stock rows disabled | Active snapshot, exact pricing rule, minimum area, export/domestic flag, inventory age |
| Dashboard build failure | Node 22, committed lockfile, Cloudflare variables, CI logs |
| User sees too much or too little | `app_profiles` role/active state and role-scoped RPC/RLS tests |

## Monthly controls

- Review users and remove inactive access.
- Reconcile GitHub scheduled runs to mailbox Sent counts and Supabase messages.
- Review bounced/invalid recipients and opt-outs.
- Reconfirm prices, inventory freshness, FX timestamps, and campaign limits.
- Rotate any credential affected by staff changes or provider policy.
- Export an operations report for the client owner.
