# Client handoff guide

## 1. Create client-owned resources

The client creates the following with a company-controlled email address:

1. A GitHub organization and private repository.
2. A Supabase organization and new project.
3. A Cloudflare account and Pages project.
4. Two production mailboxes: lead outreach and stock promotion.
5. AI/API accounts and billing owned by the client.

Invite the implementer as a named temporary administrator. Do not share a permanent master password and do not place any production resource in the implementer's personal account.

## 2. Establish the independent repository

Create an empty private repository in the client GitHub organization, then push this package as its first commit. Confirm the Git remote, organization, Actions billing, and repository administrators all belong to the client.

Recommended protections:

- Require CI before merging to the default branch.
- Restrict changes to `.github/workflows/**` and `supabase/migrations/**`.
- Create a protected GitHub environment named `production-database` for database deployments.
- Keep Actions permissions at read-only by default.

## 3. Generate client configuration

Copy `client-config.example.json` to `client-config.json`, replace every placeholder with verified client facts, then run:

```bash
python scripts/generate_client_setup.py client-config.json
```

The command creates:

- `generated/github-repository-variables.env`
- `generated/cloudflare-pages.env`
- `generated/configure-client.sql`

The generator never creates secrets and leaves both automations disabled.

## 4. Provision the database

Follow `SUPABASE_SETUP.md`. Apply the ordered migrations to the new Supabase project, apply the generated client SQL, create users, and test every role.

## 5. Configure GitHub Actions

On a workstation authenticated to the client-owned GitHub organization:

```powershell
.\handoff\Configure-GitHub.ps1 -Repository "CLIENT-ORG/CLIENT-REPO"
```

The script loads non-secret repository variables and prompts interactively for secrets. It deliberately keeps `AUTOMATION_ENABLED=false`.

## 6. Deploy the dashboard

Follow `CLOUDFLARE_SETUP.md`. Connect the client-owned repository directly to Cloudflare Pages, copy the generated frontend variables, deploy, attach the client domain, and verify Auth and RLS behavior.

## 7. Load client-owned operating data

Follow `DATA_IMPORT_GUIDE.md`:

1. Insert only client-approved pricing rules.
2. Upload a full inventory snapshot using the clean workbook template.
3. Import or generate the client lead dataset.
4. Confirm email sender identities and campaign copy policy.

## 8. Acceptance and transfer

Complete every item in `DEPLOYMENT_CHECKLIST.md`. The client administrator then:

1. Runs CI and both email workflows in preview mode.
2. Reviews real mailbox Sent folders and Supabase activity records.
3. Enables one campaign at a time with a low initial limit.
4. Rotates temporary credentials used during implementation.
5. Removes the implementer's administrator access or converts it to time-limited support access.

The handoff is complete only when the client can deploy, add a user, upload inventory, run a preview, inspect logs, pause a campaign, and rotate a secret without the implementer.
