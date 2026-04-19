# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands use `pnpm` from the repo root.

**Development:**
```bash
pnpm --filter @workspace/api-server run dev          # API server with hot reload
pnpm --filter @workspace/classroom-control run dev   # Classroom control Vite dev server
pnpm --filter @workspace/mockup-sandbox run dev      # Mockup sandbox Vite dev server
```

**Build:**
```bash
pnpm run build                                        # Typecheck all, then build all
pnpm --filter @workspace/api-server run build        # esbuild → dist/index.mjs
pnpm --filter @workspace/classroom-control run build
```

**Type checking:**
```bash
pnpm run typecheck                # All packages via TS project references
pnpm --filter @workspace/<pkg> run typecheck
```

**Database:**
```bash
pnpm --filter @workspace/db run push        # Apply Drizzle migrations
pnpm --filter @workspace/db run push-force  # Force apply
```

**API code generation** (run after editing `lib/api-spec/openapi.yaml`):
```bash
pnpm --filter @workspace/api-spec run codegen  # Regenerates lib/api-zod and lib/api-client-react
```

## Architecture

This is a **pnpm monorepo** for a classroom PC management system, structured as:

```
artifacts/   # Deployable applications
lib/         # Shared libraries (cross-artifact)
scripts/     # Utility/maintenance scripts
```

### Artifacts

**`api-server`** — Express 5 REST API. Entry point `src/index.ts`, app setup in `src/app.ts`. Routes mounted under `/api`. Bundled with esbuild to `dist/index.mjs` (ESM). Requires `PORT` env var.

**`classroom-control`** — Telegram Mini App (React 19 + Vite). Three-page SPA managing 13 classroom PCs. Pages: `ListPage` (PC grid) → `ActionsPage` (PC controls) → `ProgramsPage` (launch programs). State lives in `App.tsx` — `selectedPcs: Set<string>` tracks selected PCs across pages. PC data (IPs, names) is static in `src/data/constants.ts`.

**`mockup-sandbox`** — Development-only component preview server. A custom Vite plugin (`mockupPreviewPlugin.ts`) auto-discovers `.tsx` files in `src/components/mockups/` (ignoring `_`-prefixed files) and generates a dynamic loader at `src/.generated/`. Navigate to `/preview/ComponentName` to render any mockup.

### Shared Libraries

**`lib/api-spec`** — Source of truth: `openapi.yaml` (OpenAPI 3.1). Running `codegen` triggers Orval to regenerate the two downstream libs.

**`lib/api-zod`** — Auto-generated Zod schemas from OpenAPI. Do not edit files in `src/generated/`.

**`lib/api-client-react`** — Auto-generated React Query hooks from OpenAPI. `src/custom-fetch.ts` is hand-written and wraps `fetch` with base URL injection (`setBaseUrl()`), bearer token support (`setAuthTokenGetter()`), and typed errors (`ApiError`, `ResponseParseError`).

**`lib/db`** — Drizzle ORM + PostgreSQL. Pool/db instance exported from `src/index.ts`. Table definitions go in `src/schema/index.ts`. Requires `DATABASE_URL` env var.

### Data Flow

`openapi.yaml` → Orval codegen → `api-zod` (validation) + `api-client-react` (React Query hooks) → consumed by frontend artifacts.

Frontend components call generated hooks (e.g. `useHealthCheck()`), which call `customFetch` against the Express API at `/api/*` paths.

### TypeScript Setup

Composite project references with a shared `tsconfig.base.json` (strict, ES2022, bundler module resolution). Each package has its own `tsconfig.json` extending the base. Run `pnpm run typecheck` from root to check all packages in dependency order.

### Environment Variables

| Variable | Required by | Purpose |
|---|---|---|
| `PORT` | api-server | HTTP listen port |
| `DATABASE_URL` | lib/db | PostgreSQL connection |
| `BASE_PATH` | classroom-control, mockup-sandbox | Vite base path (Replit deployment) |
