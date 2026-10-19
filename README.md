# Fantasy Dashboard

One place to follow all of my fantasy football teams across platforms: live matchups, standings, and lineup alerts.

## Stack

- **Frontend:** React 19, TypeScript, Vite, TanStack Query, Tailwind CSS
- **Backend:** Node.js, TypeScript, Fastify
- **Testing:** Vitest
- **Repo:** npm workspaces monorepo

```
apps/
  api/        Fastify server: platform adapters, caching, /api/dashboard
  web/        React dashboard
packages/
  shared/     Platform-neutral TypeScript types used by both apps
```

Each platform has an **adapter** in `apps/api/src/adapters/<platform>/` that fetches that platform's data and maps it into the shared model, so the frontend never deals with platform differences.

## Platforms

| Platform | Status |
|---|---|
| Sleeper | ✅ Done (public API) |
| ESPN | Planned |
| Yahoo | Planned (OAuth 2.0) |
| FFPC | Planned |

## Running locally

Requires Node 20.12+.

```bash
npm install
cp .env.example .env   # then set your usernames
npm run dev            # API on :3001, web on http://localhost:5173
```

Other scripts: `npm test`, `npm run typecheck`.
