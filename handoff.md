# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-05-29T19:59:58Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: refreshed after Milestone 1 backend foundation scaffolding was added.

### Checkpoint Status

- Git HEAD: `504d2da`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `.env.example`
  - `apps/api/package.json`
  - `apps/api/src/config.ts`
  - `apps/api/src/index.ts`
  - `apps/api/src/server.ts`
  - `docs/development.md`
  - `docs/env.md`
  - `docs/specs/settings-and-audit.md`
  - `handoff.md`
  - `package.json`
  - `packages/domain/src/index.ts`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0002_align_target_v1_schema.sql`
  - `apps/api/src/db/`
  - `apps/api/src/migrate.ts`
  - `apps/api/src/repositories/`
  - `apps/api/src/services/`
  - `apps/api/tests/backend-foundation.test.ts`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `package.json`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/architecture.md`
  - `docs/schema-baseline.md`
  - `docs/specs/index.md`
  - `docs/specs/schema-alignment.md`
  - `docs/specs/domain-model-and-schema.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/specs/auth-and-security.md`
  - `docs/specs/exports.md`
  - `docs/specs/mvp-implementation-plan.md`
  - `docs/specs/decision-log.md`
  - `apps/api/db/migrations/0001_initial.sql`
  - `apps/api/db/migrations/0002_align_target_v1_schema.sql`
  - `apps/api/src/config.ts`
  - `apps/api/src/db/migrations.ts`
  - `apps/api/src/db/postgres.ts`
  - `apps/api/src/db/types.ts`
  - `apps/api/src/migrate.ts`
  - `apps/api/src/repositories/`
  - `apps/api/src/services/`
  - `apps/api/src/server.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `packages/domain/src/index.ts`
  - `packages/domain/tests/states.test.ts`
- Last verification:
  - command: `node scripts/doctor.mjs`
  - result: passed
  - timestamp UTC: 2026-05-29T21:12:00Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: schema-alignment work is committed at `504d2da`; backend foundation files are intentionally dirty/untracked and not yet committed.
- Next checkpoint action: install dependencies only if explicitly approved, then run typecheck/tests/verify; review and commit the backend foundation changes if they pass.

## 2. Executive Summary

Memo Capture is a scaffolded TypeScript/Tauri workspace. Milestone 0 schema/spec alignment is committed at `504d2da Add schema alignment spec and shared domain constants`. Milestone 1 backend foundation scaffolding has now been added in the dirty working tree.

Complete now:

- `docs/specs/schema-alignment.md` records the concrete delta from `0001_initial.sql` to the target V1 schema.
- The selected migration path is a forward-only `0002_align_target_v1_schema.sql`; `0001_initial.sql` remains the committed bootstrap baseline.
- `docs/specs/index.md`, `domain-model-and-schema.md`, `mvp-implementation-plan.md`, and `decision-log.md` point to the schema-alignment contract.
- `packages/domain/src/index.ts` now includes shared schema/API constants and types for source memos, artifacts, import events, possible duplicates, provider/settings states, workflow staged imports, export batches, audit events, and accepted snapshots.
- `packages/domain/tests/states.test.ts` includes a focused contract test for the new constants.
- `node scripts/doctor.mjs` and `git diff --check` passed during the schema-alignment work.
- `apps/api/db/migrations/0002_align_target_v1_schema.sql` now represents the forward-only V1 schema alignment migration.
- `apps/api/src/db/` now contains the Postgres query/transaction abstraction and SQL migration runner.
- `npm run db:migrate` now delegates to `@memo-capture/api`.
- `apps/api/src/repositories/` and `apps/api/src/services/` now contain the first backend repository/service boundaries for users, catalog data, source memos, work items, artifacts, audit, jobs, auth, OIDC, and form memo creation.
- `apps/api/src/server.ts` now has request IDs, public health/version routes, local-dev auth route, protected route enforcement, current session, catalog route skeletons, work item read skeletons, and form memo creation.
- Local-dev auth is explicitly configurable and returns a development-only bearer token when enabled.
- OIDC validation has a backend boundary with issuer, audience, expiry, RS256 signature, and JWKS validation.
- `apps/api/tests/backend-foundation.test.ts` adds focused tests for local-dev auth, form memo creation, and protected route behavior, but they are not executable until dependencies are installed.

Incomplete now:

- The new backend foundation has not been typechecked or test-run because dependencies are not installed.
- The new `0002` migration has not been applied to a live Postgres database.
- Database-backed route behavior has not been manually exercised against Postgres.
- Workflow runtime adapter, object storage, processing job execution, exports, and providers are still unimplemented beyond repository/skeleton boundaries.
- Dependencies are not installed in this workspace, so typecheck, tests, builds, and dev servers have not passed.

Safe to continue from this state, but the next practical step is dependency installation and verification before building more feature behavior on top.

## 3. Current Objective

Immediate goal: verify and harden the newly added Milestone 1 backend foundation.

Intended finished state for the next workstream:

- install dependencies only with explicit approval
- use the required Node range `>=22.14.0 <23`
- run `npm run typecheck`, `npm test`, and `npm run verify`
- fix any compile/test failures in the backend foundation
- run `npm run db:migrate` against a local Postgres `DATABASE_URL` when available
- verify local-dev auth and protected route behavior against the running API
- document any implementation-discovered schema changes in `docs/specs/decision-log.md`

Definition of done:

- the backend foundation compiles and tests
- the migration runner can apply `0001` and `0002` to local Postgres
- local-dev auth creates the fixed app user
- form submission creates `source_memo`, `work_item`, import event, and audit rows

## 4. Current State

### Working

- Git repo is on `main` at `504d2da`.
- Root scripts are defined in `package.json`.
- `node scripts/doctor.mjs` passes and confirms required bootstrap files.
- API exposes health, readiness, version, local-dev auth, current session, protected route skeletons, catalog skeletons, work item read skeletons, and form memo creation.
- Request IDs are generated or propagated via `x-request-id`.
- Protected `/api/*` routes require bearer auth except explicitly public/dev routes.
- Local-dev auth can create or refresh the fixed development app user when explicitly enabled.
- OIDC validation boundary exists for issuer, audience, expiry, RS256 signature, and JWKS.
- Postgres DB client, transaction wrapper, SQL migration runner, and `npm run db:migrate` exist.
- Repository/service boundaries exist for users, projects, feature groups, contributors, source memos, import events, work items, artifacts, processing jobs, audit events, auth, and form memos.
- Worker has a placeholder startup path.
- Desktop has a placeholder React/Tauri operational workspace UI.
- Shared domain constants cover the first schema/API contract and include source/work item audit events.

### Partially Working

- `0001_initial.sql` exists as a bootstrap schema and `0002_align_target_v1_schema.sql` exists as the target V1 alignment migration, but it has not been applied to Postgres.
- Backend foundation tests exist, but cannot run until dependencies are installed.
- API route skeletons exist, but most domain behavior beyond catalog scaffolding and form memo creation is not implemented.
- Desktop UI is static and not API-backed.

### Not Working Yet

- Workflow definition import, staging, activation, and runtime actions.
- Watched-folder ingestion and archive handling.
- Artifact upload, playback, download, and object storage integration.
- Processing job claiming, retries, cancellation, execution, and diagnostics.
- Accepted snapshots and export batch generation.
- AI expansion and transcription providers.
- Real settings, operations, export, and diagnostics screens.

### Not Yet Verified

- `npm install`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run verify`
- `npm run db:migrate`
- `npm run dev:api`
- `npm run dev:worker`
- `npm run dev:desktop`
- Tauri Rust build
- Chrome validation of the desktop UI

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not install dependencies, commit, tag, release, publish, deploy, delete files, or weaken project instructions unless explicitly asked.
- Never use `latest`; always use numbered versions.
- Apply `engineering-project-standard` for setup, maintenance, versioning, and stack work.
- Apply `web-app-design-standard` for frontend UI work.
- Use Chrome for browser automation unless the user explicitly asks for another browser or Chrome is unavailable.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export, delete behavior, and privacy purge behavior are out of scope for V1.

## 6. Commands and Verification

Current known commands:

```bash
npm install
npm run doctor
npm run db:migrate
npm run typecheck
npm test
npm run build
npm run verify
npm run dev:api
npm run dev:worker
npm run dev:desktop
```

Most recent passed command:

```bash
node scripts/doctor.mjs
```

Result: passed at 2026-05-29T19:59:58Z.
Latest result: passed at 2026-05-29T21:12:00Z.

Additional verification from the backend foundation work:

- `git diff --check`: passed.
- `npm run typecheck -w @memo-capture/api`: blocked because `tsc` is unavailable.
- `npm test -w @memo-capture/api`: blocked because `tsx` is unavailable.
- `npm run verify`: blocked at workspace typecheck because `tsc` is unavailable.

Current blockers:

- `node_modules` is absent. Install dependencies before typecheck, tests, builds, or dev servers.
- The local shell reported Node `v24.14.0` during the failed test attempt, while `package.json` requires `>=22.14.0 <23`.
- Postgres-backed migration and route verification need a live `DATABASE_URL` target.

Prerequisites:

- Node.js `>=22.14.0 <23`
- npm `>=10.9.0 <11`
- Rust stable toolchain for Tauri builds
- Postgres for backend persistence work
- S3-compatible object storage for artifact/export integration work
- OIDC provider details or local-dev auth mode for auth work

## 7. Files to Open First

- `AGENTS.md`: repo-local instructions and constraints.
- `handoff.md`: hot-context continuity source.
- `docs/specs/index.md`: reading order for the V1 spec set.
- `docs/specs/schema-alignment.md`: concrete migration delta and next schema path.
- `docs/specs/mvp-implementation-plan.md`: milestone sequence.
- `docs/specs/domain-model-and-schema.md`: target schema and API contracts.
- `docs/specs/decision-log.md`: schema decisions and open implementation decisions.
- `apps/api/db/migrations/0001_initial.sql`: bootstrap migration that `0002` must build from.
- `apps/api/db/migrations/0002_align_target_v1_schema.sql`: target V1 alignment migration added in the dirty tree.
- `apps/api/src/db/migrations.ts`: migration runner.
- `apps/api/src/db/postgres.ts`: Postgres DB client and transaction wrapper.
- `apps/api/src/services/app.ts`: service composition.
- `apps/api/src/services/auth.ts`: local-dev/OIDC auth boundary.
- `apps/api/src/services/form-memos.ts`: form memo creation service.
- `apps/api/src/server.ts`: request routing, request IDs, protected skeletons.
- `apps/api/tests/backend-foundation.test.ts`: new focused backend foundation tests.
- `packages/domain/src/index.ts`: shared constants/types that implementation code should import.
- `package.json`: root scripts, workspace shape, and runtime version requirements.

## 8. Next Actions

Next:

- Review the backend foundation diff.
- Install dependencies only if explicitly approved.
- Switch to a Node version matching `>=22.14.0 <23`.
- Run `npm run typecheck`, `npm test`, and `npm run verify`.
- Fix compile/test issues surfaced by verification.
- Run `npm run db:migrate` against local Postgres when `DATABASE_URL` is available.

Blocked:

- Full verification is blocked until dependencies are installed.
- Postgres-backed verification is blocked until a local `DATABASE_URL` target is available.
- Current shell Node version is outside the declared engine range.

Later:

- Implement workflow runtime operations after backend foundation verification passes.
- Implement backend repositories/services beyond the initial catalog/form-memo skeletons.
- Use Chrome verification for future UI behavior/layout changes.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source of current state. Then review `AGENTS.md`, `docs/specs/index.md`, `docs/specs/schema-alignment.md`, `docs/specs/mvp-implementation-plan.md`, `docs/specs/domain-model-and-schema.md`, `docs/specs/auth-and-security.md`, `docs/specs/settings-and-audit.md`, `apps/api/db/migrations/0001_initial.sql`, `apps/api/db/migrations/0002_align_target_v1_schema.sql`, `apps/api/src/db/migrations.ts`, `apps/api/src/db/postgres.ts`, `apps/api/src/services/app.ts`, `apps/api/src/services/auth.ts`, `apps/api/src/services/form-memos.ts`, `apps/api/src/server.ts`, `apps/api/tests/backend-foundation.test.ts`, `packages/domain/src/index.ts`, and `package.json`. Treat `504d2da Add schema alignment spec and shared domain constants` as the current committed checkpoint with backend foundation changes intentionally dirty/untracked. Start by verifying the backend foundation after dependency installation and a Node version matching `>=22.14.0 <23`; do not install dependencies, commit, tag, release, publish, deploy, delete files, or start unrelated feature implementation unless explicitly requested.
