# Independent Client Sales Intelligence Platform

This repository is a handoff-ready, white-label copy of the proven lead, inventory, GIS, reporting, and outbound-email platform. It contains no inherited company credentials, customer records, production inventory, pricing, domains, repositories, or deployment identifiers.

## Ownership model

The client owns every production resource from the first day:

| Resource | Required owner |
| --- | --- |
| GitHub organization, repository, Actions, environments | Client company |
| Supabase organization, project, database, Auth | Client company |
| Cloudflare account, Pages project, DNS, custom domain | Client company |
| Sales mailboxes, app passwords, AI/API keys | Client company |
| Freelancer access | Temporary named collaborator only |

Do not create a second freelancer-owned GitHub account. The client should create a company organization or company-controlled account and invite the implementer temporarily.

## What is included

- React dashboard: executive dashboard, leads, lead claiming, follow-ups, GIS, inventory, campaigns, reporting, data quality, activity, and user administration.
- Supabase: ordered migrations, Auth/RLS, role-scoped RPCs, audit events, inventory snapshots, campaign controls, queues, and explicit API grants.
- Email automations: separate lead outreach and ready-stock agents, recipient-local send windows, preview mode, manual-first queues, reply sync, copy validation, and a shared send lock.
- GitHub Actions: backend/frontend CI, guarded agent schedules, manual preview/live runs, and manual Supabase migration deployment.
- Cloudflare Pages: static React build with SPA routing.
- White-label setup generator, neutral assets, synthetic demo data, clean inventory template, and handoff documentation.

All sending and campaign controls are disabled after database setup. A human must configure, preview, verify, and explicitly enable them.

## Fast start

1. Read `docs/HANDOFF_GUIDE.md`.
2. Copy `client-config.example.json` to `client-config.json` and replace every placeholder.
3. Generate non-secret deployment settings:

   ```bash
   python scripts/generate_client_setup.py client-config.json
   ```

4. Create the client-owned GitHub, Supabase, and Cloudflare resources.
5. Apply Supabase migrations, then apply `generated/configure-client.sql`.
6. Add repository variables/secrets and Cloudflare Pages variables.
7. Run CI, deploy the dashboard, create users, import client-owned data, and run email previews.
8. Enable live automation only after the acceptance checklist passes.

## Local verification

```bash
python -m pip install -r requirements.lock.txt
python verify_repository.py
cd web
npm ci
npm run build
```

The frontend starts in synthetic preview mode when Supabase browser credentials are absent.

## Primary documents

- `docs/HANDOFF_GUIDE.md` — complete transfer sequence
- `docs/DEPLOYMENT_CHECKLIST.md` — production acceptance gates
- `docs/SUPABASE_SETUP.md` — database and user setup
- `docs/CLOUDFLARE_SETUP.md` — frontend deployment
- `docs/OPERATIONS_RUNBOOK.md` — normal client operations
- `docs/SECURITY_AND_OWNERSHIP.md` — boundaries and credential rules
- `docs/DATA_IMPORT_GUIDE.md` — leads, inventory, and pricing initialization
- `docs/RELEASE_VALIDATION.md` — verification evidence and deployment boundary

## Licensing

Application code is delivered for the client project. The dashboard UI retains third-party Material Dashboard attribution and its license in `web/LICENSE.md`; review that license before redistribution outside this client deployment.
