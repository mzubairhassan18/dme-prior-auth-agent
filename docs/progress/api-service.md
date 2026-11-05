# Progress — API Service

**Step:** 3 of 13 · **Status:** ✅ done · **Date:** 2026-11-06

## What was built

```
packages/shared/src/schemas/   patient · order · decision · problem (Zod 4, compiled to dist/)
apps/api/src/
  config/env.ts                Zod-validated env (DATABASE_URL, PORT=3001)
  prisma/                      PrismaModule (global) + PrismaService (PrismaPg adapter)
  common/pipes/                ZodValidationPipe (body/query/param)
  common/filters/              ProblemDetailsFilter (RFC 7807 for every error)
  health/                      GET /health → SELECT 1 db check
  patients/                    GET /patients, GET /patients/:id
  orders/                      GET /orders (?status=&patientId=), GET /orders/:id, POST /orders
```

- `main.ts`: global prefix `/api/v1`, CORS on, problem filter, port from env
- POST /orders writes the order **and** an `audit_logs` row in one transaction
- Removed the Nest hello-world scaffold; added a unit test for the pipe and rewrote the e2e spec

## Verification

| Check                   | Result                                                  |
| ----------------------- | ------------------------------------------------------- |
| `pnpm build`            | shared → api → web, 3/3 ✅                              |
| `pnpm lint`             | oxlint 18 files, 0 errors ✅                            |
| Unit tests              | Zod pipe 2/2 ✅                                         |
| E2E tests               | health + orders + 400 shape, 3/3 ✅                     |
| `GET /api/v1/health`    | `{"status":"ok","db":"up"}` ✅                          |
| `POST /orders` valid    | 201, patient joined, **audit row (actor: api)** ✅      |
| `POST /orders` invalid  | 400 `application/problem+json` with per-field errors ✅ |
| unknown patient / order | 404 problem+json ✅                                     |

## Decisions in practice

- **Zod schemas are the contract**: `@dme/shared` exports `CreateOrderSchema`, `OrderSchema`,
  `ProblemDetailsSchema`; the API validates with the exact objects the web app will import in step 4.
- **Shared package compiles** (`tsc` → `dist/`) instead of raw TS source — keeps Nest's
  `rootDir: src` happy and works for Next without `transpilePackages`.
- **`/api/v1` + RFC 7807** everywhere, including 404/500 — one error contract to reuse in the
  agent and gRPC steps.

## Deviations / gotchas

- Zod 4 message wording changed ("Too small: expected string to have >=20 characters") —
  tests assert structure, not prose.
- API runs on **3001** (web dev server owns 3000).
- POST returns Nest's default **201**; problem+json for errors only.

## Next step

`web-app-vertical-slice` — Next.js intake form + API wiring, first end-to-end user flow.
