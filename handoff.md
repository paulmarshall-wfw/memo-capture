# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-05-30T04:53:00Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: refreshed after AI expansion/settings hardening and the follow-up photo-ingestion design plan were committed.

### Checkpoint Status

- Git HEAD: `b59c895`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/design/Photo-ingestion-plan.md`
  - `docs/specs/index.md`
  - `docs/specs/domain-model-and-schema.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `docs/specs/settings-and-audit.md`
  - `apps/api/db/migrations/0001_initial.sql`
  - `apps/api/db/migrations/0002_align_target_v1_schema.sql`
  - `apps/api/db/migrations/0003_align_workflow_state_contract.sql`
  - `apps/api/db/migrations/0004_workflow_runtime_operations.sql`
  - `apps/api/db/migrations/0005_export_runtime.sql`
  - `apps/api/db/migrations/0006_processing_jobs_and_diagnostics.sql`
  - `apps/api/db/migrations/0007_import_upload_sessions.sql`
  - `apps/api/db/migrations/0008_ai_settings_and_audit.sql`
  - `apps/api/src/config.ts`
  - `apps/api/src/server.ts`
  - `apps/api/src/repositories/`
  - `apps/api/src/services/`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/worker/src/index.ts`
  - `packages/domain/src/index.ts`
- Last verification:
  - command: `node scripts/doctor.mjs`; `git diff --check`
  - result: passed
  - timestamp UTC: 2026-05-30T04:53:00Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is recorded, `handoff.md` is the only intentional dirty file, core docs and source paths exist, and verification blockers are explicitly listed.
- Next checkpoint action: commit the handoff refresh if desired; otherwise install dependencies only if explicitly approved, switch to Node `>=22.14.0 <23`, then run `npm run verify`.

## 2. Executive Summary

Memo Capture is a TypeScript/Tauri desktop app with a TypeScript API and worker, Postgres persistence, S3-compatible artifact storage, workflow-runtime driven review states, watched-folder ingestion, export batches, transcription recovery, and AI suggestion hardening in place.

Complete now:

- Backend foundation, auth boundary, migration runner, catalog/form memo APIs, workflow runtime operations, work queue UI, accepted snapshot/export flow, processing job diagnostics, watched text/audio ingestion, transcription recovery, and AI expansion/settings hardening are implemented in the repo.
- AI expansion now has a backend provider/prompt boundary, strict structured JSON validation, suggestion create/list/accept/dismiss flows, settings summary/update APIs, audit filters, and desktop UI controls.
- `docs/design/Photo-ingestion-plan.md` exists at `HEAD` as the next design-plan artifact.
- Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

Incomplete now:

- Dependencies are not installed in this checkout, so TypeScript typecheck, tests, build, dev servers, and full verification cannot run yet.
- The local shell is Node `v24.14.0` and npm `11.9.0`, outside `package.json` engines (`node >=22.14.0 <23`, `npm >=10.9.0 <11`).
- Database migrations through `0008` have not been verified against a live local Postgres in this session.
- Browser/Tauri UI validation has not been run after the AI/settings UI changes.

Safe to continue from this state if the next session treats `b59c895` as the committed code baseline, preserves the dirty `handoff.md` refresh, and does not assume runtime verification has passed.

## 3. Current Objective

Immediate goal: perform deterministic verification of the committed V1 implementation and fix any compile/test/runtime issues.

Intended finished state for the next workstream:

- Use a compatible Node/npm toolchain.
- Install dependencies only with explicit approval.
- Run `npm run verify`.
- Apply migrations through `0008` against a local Postgres target when available.
- Smoke the API and desktop UI, including watched import, audio/transcript recovery, exports, settings, audit filters, and AI suggestion flows.
- Update `docs/completed-tasks.md` after any completed verification or fix work.

Definition of done:

- `npm run verify` passes or has a clearly documented blocker.
- Migrations apply cleanly from a fresh database or the migration blocker is captured precisely.
- AI expansion rejects invalid output and persists only validated suggestions.
- Suggestion accept creates a normal `memo` work item without mutating the parent workflow state.
- Desktop UI has been checked in Chrome/Tauri with the backend running.

## 4. Current State

### Working

- Git repo is on `main` at `b59c895` with only `handoff.md` dirty from this refresh.
- `node scripts/doctor.mjs` passes and confirms required bootstrap files.
- `git diff --check` passes.
- Root scripts exist: `doctor`, `db:migrate`, `typecheck`, `test`, `build`, `verify`, `dev:api`, `dev:worker`, and `dev:desktop`.
- API has health/readiness/version, local-dev auth, protected route enforcement, catalog APIs, work-item APIs, workflow buckets/actions, export APIs, diagnostics/jobs APIs, upload/finalize/archive APIs, settings/audit APIs, and AI suggestion APIs.
- Desktop UI has work queue, exports, watched folders, audio transcript recovery, AI expansion/suggestion controls, settings provider toggles, and audit filtering.
- Worker has processing job loop support for transcription and export generation.
- Shared domain constants include current workflow states, provider/config states, processing jobs, export statuses, and audit events.

### Partially Working

- `0001` through `0008` migrations exist, but this session did not apply them to Postgres.
- API and desktop route tests are written, but cannot run without dependencies.
- Local-dev deterministic transcription and AI expansion providers are present; external provider integration remains intentionally bounded by configuration.
- Object storage currently uses the local backend adapter path and still needs environment-specific verification.

### Not Working Yet

- Full verification in this checkout because `node_modules` is absent.
- Tauri/Rust desktop build verification after the UI work.
- End-to-end import/transcription/export/AI validation against a running API, worker, Postgres, and object storage.
- External LLM/transcription provider implementations beyond the configured/deterministic local-dev boundary.

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
- Tauri Rust build/check
- Chrome/Tauri browser validation of the desktop UI

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not install dependencies, commit, tag, release, publish, deploy, delete files, or weaken project instructions unless explicitly asked.
- Never use `latest`; always use numbered versions.
- Apply `engineering-project-standard` for setup, maintenance, versioning, stack, documentation, and verification work.
- Apply `web-app-design-standard` for frontend UI work.
- Use Chrome for browser automation unless the user explicitly asks for another browser or Chrome is unavailable.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- AI output consumed by code must be structured JSON and validated before storage.
- AI expansion is an app-owned side action, not a workflow transition.
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

Passed in this refresh:

```bash
node scripts/doctor.mjs
git diff --check
```

Current blockers:

- `node_modules` is absent.
- `npm run verify` previously stopped at workspace typecheck because `tsc` was unavailable.
- `npm test` previously stopped because `tsx` was unavailable.
- Current shell reports Node `v24.14.0` and npm `11.9.0`, outside the declared engine range.
- No `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py` exists in this repo, so freshness was checked manually with Git status and file existence.

Prerequisites:

- Node.js `>=22.14.0 <23`
- npm `>=10.9.0 <11`
- Rust stable toolchain for Tauri builds
- Postgres for backend persistence work
- S3-compatible object storage or local object-storage root for artifacts
- OIDC provider details or local-dev auth mode for auth work

## 7. Files to Open First

- `AGENTS.md`: repo-local instructions and constraints.
- `handoff.md`: hot-context continuity source.
- `docs/completed-tasks.md`: compact completed work ledger.
- `docs/design/memo-capture-design-learnings.md`: resolved V1 product decisions.
- `docs/design/Photo-ingestion-plan.md`: current photo ingestion design plan at `HEAD`.
- `docs/specs/index.md`: V1 spec reading order.
- `docs/specs/domain-model-and-schema.md`: schema and API contract.
- `docs/specs/ingestion-and-artifacts.md`: watched import and managed artifact rules.
- `docs/specs/processing-jobs-and-diagnostics.md`: jobs, retries, diagnostics, provider health.
- `docs/specs/settings-and-audit.md`: settings, provider/prompt, audit, and AI suggestion contracts.
- `apps/api/db/migrations/0008_ai_settings_and_audit.sql`: latest schema migration.
- `apps/api/src/server.ts`: protected route wiring.
- `apps/api/src/services/app.ts`: service composition.
- `apps/api/src/services/ai-expansion.ts`: AI expansion orchestration and validation.
- `apps/api/src/services/settings.ts`: settings service.
- `apps/api/src/repositories/ai-suggestions.ts`: suggestion persistence.
- `apps/api/src/repositories/settings.ts`: settings persistence.
- `apps/desktop/src/App.tsx`: desktop UI flows.
- `apps/desktop/src/styles.css`: desktop UI layout and controls.
- `apps/worker/src/index.ts`: worker job loop.
- `packages/domain/src/index.ts`: shared constants and types.

## 8. Suggested Next Steps

1. Switch to Node `>=22.14.0 <23` and npm `>=10.9.0 <11`.
2. Ask explicitly before running `npm install`.
3. Run `npm run verify`; fix compile/test issues first.
4. Start Postgres/object storage as needed and run `npm run db:migrate`.
5. Launch API, worker, and desktop; smoke the main flows with Chrome/Tauri.
6. Record completed verification/fix work in `docs/completed-tasks.md`.
