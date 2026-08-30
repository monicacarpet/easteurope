# Security and ownership

## Hard boundary

This deployment must not reuse any other client's GitHub repository, Supabase project, Cloudflare project, database records, domain, mailboxes, API keys, secrets, logs, or analytics.

| Item | Storage | Browser visible |
| --- | --- | --- |
| Supabase project URL | Cloudflare and GitHub settings | Yes |
| Supabase publishable key | Cloudflare Pages variable | Yes, by design |
| Supabase service-role key | GitHub Actions secret only | Never |
| Supabase DB password/access token | Protected GitHub environment secrets | Never |
| Mailbox passwords/app passwords | GitHub Actions secrets only | Never |
| AI provider keys | GitHub Actions secrets only | Never |
| Company identity and SMTP/IMAP hosts | GitHub repository variables | No secret value |

## Database controls

- Row Level Security is enabled for public tables.
- Browser access is granted only to `authenticated` where required.
- `anon` receives no table, sequence, or function access.
- `service_role` is used only by backend automations.
- Views use invoker security so they cannot silently bypass the caller's RLS context.
- Migrations finish with explicit grants because new tables are not assumed to be API-exposed automatically.

## Sending controls

- Database campaigns start `paused`.
- Runtime campaign controls start `enabled=false`.
- The repository variable `AUTOMATION_ENABLED` starts `false`.
- Manual live runs require an exact confirmation phrase.
- Preview mode does not send or require inbound-mail synchronization.
- Lead and stock agents share one concurrency group and a database send lock.
- Recipient-local windows, weekdays, cooldowns, and daily limits are enforced at runtime.

## Handoff closeout

- Rotate every credential entered during implementation.
- Review GitHub organization owners and Supabase/Cloudflare members.
- Remove personal recovery emails or phone numbers belonging to the implementer.
- Export or document billing ownership.
- Store emergency recovery codes in the client's approved password manager.
- Review GitHub audit logs after removing temporary access.
