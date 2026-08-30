# Supabase setup

## Create the project

The client creates a new Supabase organization/project. Do not clone or link another client's database. Record the project reference, project URL, publishable key, service-role key, database password, and a personal access token in the client's password manager.

## Apply migrations

Preferred path:

1. Add the required GitHub secrets using `handoff/Configure-GitHub.ps1`.
2. Open GitHub Actions → **Deploy Supabase Migrations**.
3. Run once with `apply=false` and review the dry run.
4. Run again with `apply=true` after approval from the protected `production-database` environment.

Local CLI path:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Migrations are ordered in `supabase/migrations`. Never edit a migration after it has been applied to production; add a new migration.

## Apply company identity

Open Supabase SQL Editor, review and run `generated/configure-client.sql`. It updates verified sender identities while keeping both campaigns paused and disabled.

## Create the first administrator

1. Create the user in Supabase Authentication using the client's work email.
2. Confirm a matching `app_profiles` row exists.
3. Promote only the designated administrator:

```sql
update public.app_profiles
set role = 'bi_admin', active = true
where lower(email) = lower('ADMIN@CLIENT.DOMAIN');
```

Use `sales_rep` for normal users. Test admin and sales accounts separately; a sales user must not see unclaimed contact details or administration controls.

## Verify before data load

- No campaign control is enabled.
- Both email campaigns are paused.
- The browser can sign in with the publishable key.
- `anon` cannot read business tables.
- A sales user sees only the role-scoped lead pool.
- A BI administrator can manage users and upload inventory.

References:

- https://supabase.com/docs/guides/local-development/cli-workflows
- https://supabase.com/docs/reference/cli/supabase-db-push
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
