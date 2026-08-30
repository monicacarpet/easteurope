# Cloudflare Pages setup

## Connect the repository

In the client-owned Cloudflare account, create a Pages project and connect the client-owned GitHub repository.

Build settings:

| Setting | Value |
| --- | --- |
| Framework | Create React App |
| Root directory | `web` |
| Build command | `npm ci && npm run build` |
| Build output directory | `build` |
| Node version | `22` |

Copy every line from `generated/cloudflare-pages.env` into both Preview and Production environment variables. The Supabase publishable key is browser-safe by design; never add the service-role key or any backend secret to Cloudflare frontend variables.

## Deploy and verify

1. Deploy the default branch.
2. Open a deep link such as `/stock` directly and confirm the SPA fallback works.
3. Sign in as administrator and as sales user.
4. Confirm logout, page refresh, role routing, map loading, and inventory template download.
5. Attach the client-owned custom domain and enable HTTPS.
6. Remove the temporary `pages.dev` URL from any customer-facing material if the client requires a single canonical domain.

Each approved push to the production branch triggers a Cloudflare deployment. Pull requests can use preview deployments.

References:

- https://developers.cloudflare.com/pages/get-started/git-integration/
- https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/
- https://developers.cloudflare.com/pages/configuration/build-configuration/
