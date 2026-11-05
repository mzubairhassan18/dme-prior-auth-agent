# Progress — Web App Vertical Slice

**Step:** 4 of 13 · **Status:** ✅ done · **Date:** 2026-11-06

## What was built

```
apps/web/src/
  lib/api.ts               typed fetch wrapper; ApiError wraps RFC 7807 problems
  lib/query-provider.tsx   TanStack Query client (10s staleTime, 1 retry)
  components/status-badge.tsx
  app/layout.tsx           shell: header nav, Geist, providers, light theme
  app/page.tsx             orders dashboard (stats, list, skeletons, empty/error states)
  app/intake/page.tsx      intake form with shared-Zod validation + server error mapping
apps/web/.env.example      NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
docs/assets/dashboard.png  screenshot used in the README
```

## Verification (real browser, not just curl)

| Check                         | Result                                                          |
| ----------------------------- | --------------------------------------------------------------- |
| `pnpm build` / `pnpm lint`    | green (3/3 tasks)                                               |
| `GET /`                       | 200 — dashboard lists the 3 seeded orders with status badges ✅ |
| `GET /intake`                 | 200 — patient dropdown populated from `GET /patients` ✅        |
| Submit valid order in browser | `POST /orders` → 201; success panel; form reset ✅              |
| Dashboard after submit        | new order appears; stats update (4 submitted) ✅                |
| Submit invalid form           | inline errors on all four fields from shared Zod schema ✅      |
| Server 400 mapping            | `problem.errors[].path` → field errors in the form ✅           |
| Cleanup                       | verification order removed; seed stays canonical (3 orders)     |

## Decisions in practice

- **Client components + TanStack Query** as chosen: dashboard polls every 5s
  (`refetchInterval`) — a stand-in until the WebSocket live updates in step 10.
- **One Zod contract, two layers**: `CreateOrderSchema.safeParse` runs client-side before
  the request; the API re-validates with the identical object.
- **Server problem details drive UX**: `ApiError` carries `ProblemDetails`, non-field
  errors render as a banner, field errors map back to inputs.
- No UI library — small hand-rolled Tailwind components keep the surface auditable.

## Deviations / gotchas

- `apps/web/.gitignore` (create-next-app) ignored `.env*` including `.env.example`;
  added `!.env.example` so the env template is committed.
- Tailwind v4: avoided `ring-inset` (renamed in v4); badges use plain `ring-1`.
- Next.js prefetches `/intake` from the header link, so the patients query fires early —
  harmless, and the form shows a loading option until it resolves.

## Next step

`agent-service-and-llm` — Python FastAPI agent service with a local Ollama provider layer
(phi4-mini + nomic-embed-text), structured clinical extraction endpoint.
