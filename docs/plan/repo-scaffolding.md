# Plan — Repo Scaffolding

**Step:** 1 of 13 · **Status:** planned · **Date:** 2026-11-05

## Goal

Create the monorepo foundation that all later steps build on: one repo holding the
Next.js frontend, NestJS API, Python agent service, shared TypeScript types, plus
lint/format/commit hygiene so every future step lands as a clean, reviewed commit.

## Options considered

### 1. Repo structure

| Option                       | Pros                                                                                               | Cons                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Plain folders, no workspaces | Zero config                                                                                        | Types duplicated across apps, no task orchestration |
| npm/pnpm workspaces only     | Simple shared packages                                                                             | No build caching, no task graph                     |
| **Turborepo + pnpm** ✅      | Build caching, task pipeline (`build` → `lint`), reads well as "monorepo experience" in interviews | Slight extra config                                 |

**Chosen:** Turborepo + pnpm workspaces.

### 2. Package manager

| Option      | Pros                                                                  | Cons                                     |
| ----------- | --------------------------------------------------------------------- | ---------------------------------------- |
| **pnpm** ✅ | Already installed, fast, strict `node_modules` (catches phantom deps) | Contributors need `corepack`/global pnpm |
| npm         | Universal                                                             | Slower, hoisting hides missing deps      |

**Chosen:** pnpm 10.

### 3. Code standards

| Option                           | Pros                                                                              | Cons                                                |
| -------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| **ESLint + Prettier + Husky** ✅ | Industry standard; pre-commit hooks = "I set engineering standards" talking point | Two tools to configure                              |
| Biome                            | One fast tool                                                                     | Less universal, some rules gaps                     |
| Prettier only                    | Fastest                                                                           | No linting — weak for a principal-level application |

**Chosen:** ESLint (per-app, flat config) + Prettier (root) + Husky + lint-staged.

## Decisions

- **Monorepo:** Turborepo tasks: `build`, `dev`, `lint`, `test`
- **Layout:** `apps/web` (Next.js) · `apps/api` (NestJS) · `services/agent` (Python) · `packages/shared` (TS types) · `docs/`
- **Git:** repo `dme-prior-auth-agent` on GitHub, **private**, one commit per step, created via `gh`
- **Strict TS:** `strict: true` in root `tsconfig.base.json`, extended by each app
- **Python:** `services/agent` gets a placeholder in this step (real setup in step `agent-service-and-llm`)

## Definition of done

- [ ] `pnpm install` succeeds from clean clone
- [ ] `pnpm build` builds web + api through Turborepo
- [ ] `pnpm lint` passes
- [ ] Pre-commit hook formats staged files
- [ ] GitHub repo exists, first commit pushed
