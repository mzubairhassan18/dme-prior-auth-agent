# Plan — API Service

**Step:** 3 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

NestJS API that serves the seeded data over validated REST endpoints under `/api/v1`,
with production-grade error contracts — the backend step 4's UI consumes.

## Options considered

### 1. Request validation

| Option                              | Pros                                                                           | Cons                                   |
| ----------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------- |
| **Zod schemas in `@dme/shared`** ✅ | One schema = API validation + frontend form validation; single source of truth | Custom pipe (~30 lines)                |
| class-validator DTOs                | Canonical NestJS                                                               | Schemas can't be reused by the web app |
| None                                | Fastest                                                                        | Weak API, no principal-level signal    |

**Chosen:** Zod v4 schemas in `packages/shared`, custom `ZodValidationPipe`.

### 2. API surface

| Option                      | Pros                                  | Cons                          |
| --------------------------- | ------------------------------------- | ----------------------------- |
| **Read + create orders** ✅ | Exactly what the vertical slice needs | No update/delete              |
| Full CRUD                   | Complete                              | UI never uses PATCH/DELETE    |
| + decision stub             | —                                     | Jumps ahead of the agent step |

**Chosen:** `GET /health`, `GET /patients`, `GET /patients/:id`, `GET /orders` (filterable),
`GET /orders/:id`, `POST /orders`.

### 3. Conventions

| Option                      | Pros                                                                 | Cons                                |
| --------------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| **`/api/v1` + RFC 7807** ✅ | URL versioning, cross-service error contract (fits gRPC/agent steps) | One global filter                   |
| `/api/v1` + Nest defaults   | Less code                                                            | Error shape changes across services |
| No prefix                   | Fastest                                                              | Painful versioning later            |

**Chosen:** `/api/v1` prefix, RFC 7807 `application/problem+json` for all errors,
environment config via `@nestjs/config` + Zod-validated env.

## Module structure

```
src/
  main.ts                      global prefix, CORS, problem filter, port
  app.module.ts                ConfigModule (zod-validated env) + feature modules
  config/env.ts                env schema (DATABASE_URL, PORT)
  prisma/                      PrismaModule (global) + PrismaService (pg adapter)
  health/                      GET /health (checks db with SELECT 1)
  patients/                    list, by id
  orders/                      list (filter by status/patient), by id, create
  common/
    pipes/zod-validation.pipe.ts
    filters/problem-details.filter.ts
```

## Definition of done

- [ ] `@dme/shared` builds (`tsc`) and exports schemas + types
- [ ] API builds, lints, starts on port 3001
- [ ] curl checks: health 200, patients 200, orders 200, create 201,
      invalid body → 400 problem+json, unknown patient → 404 problem+json
- [ ] Audit log row written on order create
- [ ] Unit test for the Zod pipe
- [ ] Docs + commit pushed
