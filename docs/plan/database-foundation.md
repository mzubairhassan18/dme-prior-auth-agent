# Plan — Database Foundation

**Step:** 2 of 13 · **Status:** planned · **Date:** 2026-11-05

## Goal

Dockerized PostgreSQL + Prisma schema + migrations + seed data — the system of record
the API (step 3) and agent (steps 5–7) will build on.

## Options considered

### 1. Database engine

| Option            | Pros                                                                     | Cons                                     |
| ----------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| **PostgreSQL** ✅ | JSONB for agent payloads, `pgvector` available later, first in job stack | —                                        |
| MySQL             | In job stack                                                             | No vector extension, weaker JSON support |
| Both              | —                                                                        | Double ops burden for a demo             |

**Chosen:** PostgreSQL 16 (Alpine) via Docker — reused the image already present locally
(no pull needed).

### 2. ORM / migrations

| Option         | Pros                                              | Cons                          |
| -------------- | ------------------------------------------------- | ----------------------------- |
| **Prisma** ✅  | Schema-first, type-safe client, industry standard | Schema DSL to learn           |
| Drizzle        | Lighter, SQL-first                                | Smaller ecosystem             |
| TypeORM        | NestJS docs default                               | Weak types, clunky migrations |
| Knex / raw SQL | Full control                                      | Slow to build with            |

**Chosen:** Prisma — schema in `apps/api/prisma/schema.prisma`, migrations in
`apps/api/prisma/migrations/`.

### 3. Schema scope

| Option                  | Pros                                        | Cons                           |
| ----------------------- | ------------------------------------------- | ------------------------------ |
| **Core + audit log** ✅ | Healthcare needs audit trails (HIPAA angle) | One extra table                |
| Minimal (3 tables)      | Fastest                                     | Misses compliance story        |
| Full auth               | Real product feel                           | Auth is a detour for this demo |

**Chosen:** `patients`, `dme_orders`, `authorization_decisions`, `audit_logs`.

## Data model (ER)

```
Patient 1 ──── * DmeOrder 1 ──── 1 AuthorizationDecision
                    │
                    └── (audit_logs reference any entity via entityType/entityId)
```

- **dme_orders.status**: `SUBMITTED → ANALYZING → DECISION_READY | FAILED`
  (drives the real-time dashboard later)
- **authorization_decisions.outcome**: `APPROVE | NEEDS_MORE_INFO | DENY`
  (narrowed for phi4-mini — classification, not prose generation)
- **audit_logs**: generic `entityType/entityId/action/actor/detail` so every future
  write (API, agent, human) can append without schema changes

## Definition of done

- [ ] `docker compose up -d` starts healthy Postgres
- [ ] `prisma migrate dev` creates initial migration
- [ ] Seed loads 2 patients / 3 realistic DME orders (HCPCS + ICD-10 codes)
- [ ] Tables verified via psql
- [ ] `.env.example` committed, `.env` gitignored, commit pushed
