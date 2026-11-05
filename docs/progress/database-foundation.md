# Progress — Database Foundation

**Step:** 2 of 13 · **Status:** ✅ done · **Date:** 2026-11-05

## What was built

- `docker-compose.yml` — Postgres 16 (Alpine, existing local image), healthcheck, named volume `pgdata`
- `apps/api/prisma/schema.prisma` — 4 models, 2 enums (see ER in plan doc)
- Migration `20261105183924_init` applied; client generated to `src/generated/prisma/`
- `apps/api/prisma/seed.ts` — 2 patients, 3 DME orders (real HCPCS + ICD-10 codes), audit rows
- `prisma7.config.ts` — datasource URL + seed command wired to `tsx`

## Verification

- `docker compose up -d` → container **healthy** ✅
- `prisma migrate dev --name init` → applied, DB in sync ✅
- `prisma db seed` → "2 patients, 3 orders" ✅
- psql: 4 tables + `_prisma_migrations`, rows verified ✅
- `pnpm build` + `pnpm lint` still green ✅

## Prisma 7 gotchas (this step was a masterclass in them)

1. **Config file is `prisma7.config.ts`** (not `prisma.config.ts`), and **`.env` is no longer
   auto-loaded** → installed `dotenv`, config does `import "dotenv/config"`.
2. **Datasource URL moved out of `schema.prisma`** into the config file
   (`datasource: { url: process.env["DATABASE_URL"] }`).
3. **Driver adapters are mandatory** → `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
   Every PrismaClient instantiation (seed, later PrismaService) must pass the adapter.
4. **Generator is `prisma-client`** (TS source output), not `prisma-client-js`.
5. **Output placed in `src/generated/prisma`** because Nest's `tsconfig.build.json` has
   `rootDir: ./src` — output outside `src` would break `nest build`.
6. **Seed command lives in config**: `migrations: { seed: "tsx prisma/seed.ts" }`.

## Other deviations / issues hit

- **Reused local `postgres:16-alpine` image** (instead of pulling 17-alpine) after reviewing
  `docker images`. PG data dirs are major-version incompatible, so the `pgdata` volume was
  recreated and the schema re-applied from scratch with `prisma migrate deploy` + seed —
  which also validated the fresh-clone path. Lesson: check local images before choosing tags.
- `prisma@latest` resolved to **8.0.0-rc.30** while client was **7.10.1** → pinned `prisma@7`
  so CLI and client match exactly.
- Docker Desktop wasn't running → started it; engine flaps for ~30s during startup
  (wait for **consecutive** `docker ps` successes, not one `docker info`).
- Slow network made several pnpm operations exceed 5–10 min timeouts → retried with
  larger timeouts + `--prefer-offline`.

## Next step

`api-service` — NestJS module structure, PrismaService provider, health endpoint,
and the first REST endpoints for orders.
