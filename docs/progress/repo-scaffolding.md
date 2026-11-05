# Progress — Repo Scaffolding

**Step:** 1 of 13 · **Status:** ✅ done · **Date:** 2026-11-05

## What was built

```
dme-prior-auth-agent/
├── apps/
│   ├── web/          Next.js 16.4 · React 19 · Tailwind 4 · ESLint 9 (flat config)
│   └── api/          NestJS 12 · Node 24 · oxlint · vitest · strict TS
├── packages/shared/  @dme/shared — TS contracts (placeholder, wired in web-app-vertical-slice)
├── services/agent/   Python 3.13 placeholder (real setup in agent-service-and-llm)
├── docs/             plan/ + progress/ + README index
├── turbo.json        tasks: build · dev · lint · test
├── pnpm-workspace.yaml
├── tsconfig.base.json   strict:true, extended by both apps
├── .husky/pre-commit → lint-staged → prettier
└── .prettierrc / .prettierignore / .gitignore
```

## Verification

- `pnpm install` — 4 workspace projects, clean ✅
- `pnpm build` — turbo: web ✓ + api ✓ (17s) ✅
- `pnpm lint` — eslint (web) + oxlint type-aware (api), 0 errors ✅

## Decisions (recap)

| Decision    | Choice                                                     |
| ----------- | ---------------------------------------------------------- |
| Structure   | Turborepo + pnpm workspaces                                |
| Lint/format | ESLint (web) + oxlint (api) + Prettier + Husky/lint-staged |
| Repo        | `dme-prior-auth-agent`, private, one commit per step       |

## Deviations from plan (and why)

1. **NestJS 12 CLI now scaffolds oxlint + vitest** instead of ESLint + Jest.
   Kept it — modern default, same job-to-be-done, zero extra config.
2. **create-next-app initialized a nested `.git`** inside `apps/web` — removed so the
   root repo owns everything.
3. **create-next-app wrote its own lockfile + `pnpm-workspace.yaml` inside `apps/web`**
   (standalone install) — deleted both and reinstalled from the root so one lockfile
   governs the whole workspace.

## Gotchas for future reference

- `create-next-app apps/web` fails with _"path is not writable"_ if the parent `apps/`
  directory doesn't exist → create the parent first.
- `tsconfig.base.json` is extended via relative path from each app
  (`../../tsconfig.base.json`) — keeps `strict` in one place.

## Next step

`database-foundation` — Dockerized Postgres, schema, migrations, seed data.
