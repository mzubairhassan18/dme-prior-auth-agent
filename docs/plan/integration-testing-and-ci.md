# Plan — Integration Testing & CI

**Step:** 12 of 13 · **Status:** planned · **Date:** 2026-11-06

## Goal

Make every push prove the monorepo still works from a clean checkout:

- GitHub Actions runs **install → build → lint → tests** for the JS workspace.
- API e2e tests run against a real **Postgres 16 + pgvector** service container.
- Python tests run on **Python 3.13** with pinned requirements.
- CI is fast enough for a demo repo: parallel jobs, pnpm/pip caches, and no
  Redis/MinIO/Ollama services — those dependencies are mocked or degrade gracefully.

## Decisions (recommended options chosen autonomously)

### 1. CI provider

| Option             | Pros                                                                          | Cons                           |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------ |
| **GitHub Actions** | Native to the repo, service containers, free for private repos in plan limits | YAML maintenance               |
| GitLab CI          | Strong Docker support                                                         | Repo is on GitHub              |
| Local script only  | No CI minutes                                                                 | Doesn't prove a clean checkout |

**Chosen:** GitHub Actions, triggered on `main` pushes and pull requests, with a
concurrency group that cancels superseded runs.

### 2. Job layout

| Job       | What runs                                                                  | Services                 |
| --------- | -------------------------------------------------------------------------- | ------------------------ |
| `js`      | `pnpm install --frozen-lockfile`, Prisma generate, `build`, `lint`, `test` | none                     |
| `api-e2e` | install, Prisma generate + `migrate deploy`, `test:e2e`                    | `pgvector/pgvector:pg16` |
| `python`  | `pip install -r requirements-dev.txt`, `pytest -q`                         | none                     |

The JS build and e2e jobs are intentionally separate: the build/lint job stays fast
and does not wait for Postgres, while e2e can fail independently with a clear signal.

### 3. Clean-checkout gaps to close

- **Generated Prisma client is gitignored** → CI must run `prisma generate` before any
  TypeScript build. A dummy `DATABASE_URL` is supplied because generate does not connect.
- **E2E needs the schema** → run `prisma migrate deploy` against the service container.
  Tests do not depend on seed rows, so no seed step (keeps CI deterministic and quick).
- **Redis/MinIO are not CI services** → the API already degrades: cache misses fall
  through to Postgres and object storage warnings do not block startup. The e2e suite
  will assert this clean-environment behavior implicitly.
- **Python tests never call Ollama** → they inject fake providers; no model service needed.

### 4. Extra integration coverage

Add API e2e cases for the new surfaces and error contract:

- unknown order → `404` RFC 7807
- malformed UUID → `400` RFC 7807
- document upload without a file → `400`
- document upload with an invalid type → `400`
- valid-looking upload against an unknown order → `404` **before** touching MinIO
- presigned URL for an unknown document → `404`

These run without object storage, so they are safe in CI.

### 5. Housekeeping

- Add the CI badge to the root README.
- Document the pipeline and how to reproduce it locally in the progress note.
- Keep `pnpm-lock.yaml` frozen in CI (`--frozen-lockfile`) to catch dependency drift.

## Files

```
.github/workflows/ci.yml            three jobs + Postgres service + caches
apps/api/test/app.e2e-spec.ts       new 404/400/document e2e cases
README.md                           CI badge
docs/progress/integration-testing-and-ci.md
```

## Definition of done

- [ ] Workflow parses and both JS jobs + Python job pass on GitHub
- [ ] `prisma generate` + `migrate deploy` work from a clean checkout
- [ ] E2E covers 404/400 paths and document validation without Redis/MinIO
- [ ] Local equivalent (no Redis/MinIO) passes
- [ ] Badge and progress docs added, commit pushed
- [ ] Live GitHub run link recorded
