# Client Sales Intelligence frontend

React dashboard for the independent client deployment.

## Local preview

```bash
cp .env.example .env.local
npm ci
npm start
```

Keep `REACT_APP_DEMO_MODE=true` for the bundled synthetic preview. For production, use the values generated in `../generated/cloudflare-pages.env`.

Never place the Supabase service-role key, mailbox credentials, or AI keys in any `REACT_APP_*` variable.

## Production build

```bash
npm ci
npm run build
```

Cloudflare Pages configuration:

- Root directory: `web`
- Build command: `npm ci && npm run build`
- Output directory: `build`
- Node: `22`
