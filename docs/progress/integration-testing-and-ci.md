# Progress — Integration Testing & CI

**Step:** 12 of 13 · **Status:** complete (GitHub-hosted run blocked by account billing) · **Date:** 2026-11-06

## What was delivered

### GitHub Actions pipeline

`.github/workflows/ci.yml` runs on pushes to `main`, pull requests, and manual dispatch,
with a concurrency group that cancels superseded runs.

| Job                          | Steps                                                                                                                        | Services                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Build, lint & unit tests** | checkout → pnpm 10.17.1 → Node 24 (pnpm cache) → frozen install → Prisma generate → `pnpm build` → `pnpm lint` → `pnpm test` | —                                                      |
| **API e2e (Postgres)**       | same install/generate → `prisma migrate deploy` → `test:e2e`                                                                 | `pgvector/pgvector:pg16` with `pg_isready` healthcheck |
| **Python tests**             | Python 3.13 (pip cache) → `pip install -r requirements-dev.txt` → `pytest -q`                                                | —                                                      |

Design choices:

- **Separate JS jobs** keep build/lint fast and let e2e fail with a focused signal.
- **`prisma generate` before every JS build** closes the clean-checkout gap caused by the
  generated client being gitignored.
- **`prisma migrate deploy`** builds the schema from migrations; no seed data is required,
  so e2e results are deterministic.
- **No Redis/MinIO/Ollama services in CI.** The API degrades to Postgres on cache misses
  and object storage is only hit by successful uploads; Python tests inject fake providers.
  This keeps CI fast and avoids brittle infrastructure.
- **`--frozen-lockfile`** makes dependency drift a CI failure.

### Expanded API e2e suite

`apps/api/test/app.e2e-spec.ts` grew from 3 to **9 tests**:

- health + database check
- order list
- invalid create body → `400` RFC 7807 with field errors
- unknown order → `404` problem+json
- malformed order id → `400` problem+json
- document upload with no file → `400`
- document upload with unsupported type → `400`
- PDF upload against an unknown order → `404` **before** object storage is touched
- presigned URL for an unknown document → `404`

The last four exercise the step-11 document surface without needing MinIO.

## Verification

All commands run locally on 2026-11-06:

| Gate                              | Result                                            |
| --------------------------------- | ------------------------------------------------- |
| `pnpm build`                      | 3/3 tasks successful                              |
| `pnpm lint`                       | 0 warnings, 0 errors (32 files)                   |
| `pnpm test`                       | 2/2 unit tests                                    |
| `pnpm --filter @dme/api test:e2e` | **9/9 passed** (2.7 s with Redis + MinIO stopped) |
| `python -m pytest -q`             | **21/21 passed**                                  |
| `actionlint` (Docker)             | exit 0, no findings                               |

The e2e suite was also run with `dme-redis` and `dme-minio` stopped to reproduce the CI
environment; startup stayed under 4 seconds and all tests passed. Both containers were
restarted afterwards.

## GitHub run status — external blocker

The repository was made **public** (it was private during development):

- https://github.com/mzubairhassan18/dme-prior-auth-agent

Two runs were attempted:

- `42151591435` — push of `2a312a0` (private repo): `startup_failure`
- `42152042177` — manual dispatch after making the repo public:
  https://github.com/mzubairhassan18/dme-prior-auth-agent/actions/runs/42152042177

Both fail before any step with this annotation on **all three jobs**:

> The job was not started because your account is locked due to a billing issue.

This is an account-level GitHub billing lock, not a workflow error. `actionlint` exits 0 and
the exact job commands pass locally. The CI badge was removed from the README until the
account is unblocked, so the public repo does not advertise a red status caused by billing.

**To finish the remote verification (repo owner):**

1. Resolve the billing lock at https://github.com/settings/billing (payment method or
   outstanding balance).
2. Trigger the workflow: `gh workflow run ci.yml` (or push any commit).
3. Watch it: `gh run watch` / `gh run list --workflow=ci.yml`.
4. Once green, re-add the badge at the top of `README.md`:
   `[![CI](https://github.com/mzubairhassan18/dme-prior-auth-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/mzubairhassan18/dme-prior-auth-agent/actions/workflows/ci.yml)`

## Definition of done

- [x] Workflow committed, actionlint-clean, and job commands reproduce locally
- [x] `prisma generate` + `migrate deploy` covered from a clean checkout design
- [x] E2E covers 404/400 paths and document validation without Redis/MinIO
- [x] Local equivalent (no Redis/MinIO) passes — 9/9
- [x] Progress docs recorded, commit pushed
- [ ] GitHub-hosted jobs green — **blocked by account billing lock; workflow itself validated**

## Files

```
.github/workflows/ci.yml
apps/api/test/app.e2e-spec.ts
docs/plan/integration-testing-and-ci.md
docs/progress/integration-testing-and-ci.md
README.md
```
