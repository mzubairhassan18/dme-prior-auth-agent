# Plan — Web App Vertical Slice

**Step:** 4 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

First end-to-end user flow in Next.js: clinician submits a DME order via the intake
form → API persists it → the orders dashboard reflects it. The UI runs on the shared
Zod contracts from step 3.

## Decisions (recommended options chosen autonomously)

| Decision      | Choice                                                     | Why                                                                                                                         |
| ------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Data fetching | **Client components + TanStack Query**                     | Explicit loading/error states, cache invalidation after create, and the cleanest hook for live WebSocket updates in step 10 |
| Scope         | **Intake form + orders dashboard**                         | Complete user loop without a patients CRUD detour                                                                           |
| Validation UX | **Shared `CreateOrderSchema` client-side + inline errors** | One contract, two layers (client + API); server 400 errors map back onto fields                                             |

## Screens

- `/` — orders dashboard: status badges, patient, HCPCS/ICD-10, created time,
  loading skeletons, error banner, empty state, "New intake" CTA
- `/intake` — form: patient select (from API), equipment code, diagnosis code,
  quantity, clinical notes; inline validation; success panel with "view dashboard"
- Shared shell: header nav, light healthcare palette, Tailwind only (no UI library)

## Technical notes

- `NEXT_PUBLIC_API_URL` (default `http://localhost:3001/api/v1`), API CORS already open
- `ApiError` wraps RFC 7807 problem details → form maps `errors[].path` to fields
- Query keys: `['orders']`, `['patients']`; create invalidates `['orders']`

## Definition of done

- [ ] `pnpm build` (web) + `pnpm lint` green
- [ ] Dev server serves `/` and `/intake`
- [ ] Creating an order through the form appears on the dashboard (verified via API/browser)
- [ ] Server 400 errors render as inline field errors
- [ ] Docs + commit pushed
