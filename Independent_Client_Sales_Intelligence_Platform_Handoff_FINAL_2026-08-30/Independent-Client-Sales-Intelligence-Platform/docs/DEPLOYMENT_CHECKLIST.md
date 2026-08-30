# Production deployment checklist

## Ownership

- [ ] GitHub organization/repository is client-owned.
- [ ] Supabase organization/project is client-owned and new.
- [ ] Cloudflare account/project/domain is client-owned and new.
- [ ] Mailboxes, API accounts, billing, and recovery methods are client-controlled.
- [ ] No external client data, brand, domain, repository, or secret appears in this repository.

## Build and database

- [ ] Backend verification passes.
- [ ] `npm ci` and production build pass on Node 22.
- [ ] Supabase migration dry run reviewed.
- [ ] All migrations applied to the new project.
- [ ] Generated client SQL applied; campaigns remain paused/disabled.
- [ ] Admin and sales roles tested separately.

## Frontend

- [ ] Cloudflare Pages uses `web`, `npm ci && npm run build`, and `build`.
- [ ] All generated frontend variables are configured.
- [ ] Custom domain and HTTPS work.
- [ ] Direct deep links, refresh, sign-in, logout, and role routing work.

## Data and email

- [ ] Client-approved pricing rules loaded.
- [ ] Full current inventory uploaded and reconciled.
- [ ] Client leads loaded with consent/legal basis confirmed by the client.
- [ ] Both workflows pass preview review.
- [ ] One lead email and one stock email pass controlled live tests.
- [ ] Sent folders, reply sync, bounce handling, activity, and audit data reconcile.

## Handoff

- [ ] Client administrator can deploy, create users, upload stock, preview, pause, and rotate a secret.
- [ ] Temporary credentials rotated.
- [ ] Implementer access removed or reduced to an agreed support role.
- [ ] `AUTOMATION_ENABLED` remains false until the client signs off on live scheduling.
