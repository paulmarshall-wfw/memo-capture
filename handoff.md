# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: verification handoff
- Created timestamp UTC: 2026-05-30T05:20:57Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: dependencies installed, verification fixed, migrations applied, and local app smoke-tested.

### Checkpoint Status

- Git HEAD: `1d38833`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/db/postgres.ts`
  - `apps/api/src/migrate.ts`
  - `apps/api/src/services/exports.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `docs/completed-tasks.md`
  - `handoff.md`
  - `package.json`
  - `packages/config/package.json`
  - `packages/domain/package.json`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `package-lock.json`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/design/memo-capture-0.2.2-workflow-definition-bundled.json`
  - `docs/specs/index.md`
  - `docs/specs/domain-model-and-schema.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `apps/api/db/migrations/0001_initial.sql`
  - `apps/api/db/migrations/0008_ai_settings_and_audit.sql`
  - `apps/api/src/db/postgres.ts`
  - `apps/api/src/server.ts`
  - `apps/api/src/services/`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/worker/src/index.ts`
  - `packages/domain/src/index.ts`
- Last verification:
  - command: `npm run verify`; `npm run db:migrate`; `git diff --check`
  - result: passed
  - timestamp UTC: 2026-05-30T05:20:57Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is recorded, dirty/untracked files are accounted for, full npm verification passed, migrations through `0008` applied, and Chrome smoke testing reached a populated work queue.
- Next checkpoint action: review the dirty changes, then commit or continue runtime testing.

## 2. Executive Summary

Memo Capture is now runnable for local testing from this checkout.

Complete now:

- Node `22.14.0` and npm `10.9.2` were installed via nvm.
- npm workspace dependencies were installed and `package-lock.json` was created.
- TypeScript project-reference verification now works from the root `typecheck` script.
- Shared workspace package `main`/`types` entries now match the emitted `dist/src/index.*` files.
- Strict TypeScript errors in API, desktop, and tests were fixed.
- Postgres adapter result normalization now handles multi-statement migration SQL.
- `npm run verify` passed outside the sandbox.
- Migrations `0001` through `0008` applied to a local Postgres `16.8-alpine` dev container.
- API, worker, and desktop dev servers are running.
- Workflow bundle `0.2.2` was imported and activated for local testing.
- A smoke-test project, feature group, and form memo were created through the API and rendered in Chrome in the Memos bucket.
- Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

Incomplete now:

- The dirty fixes and generated `package-lock.json` are not committed.
- Tauri/Rust desktop build/check was not run in this pass.
- Full watched-folder, audio/transcription, export download, settings/audit, and AI suggestion workflows still need manual/end-to-end testing.
- Object storage was only exercised enough for app startup; export artifact generation still needs a runtime smoke.

Safe to continue from this state if the next session treats `1d38833` as the committed baseline plus the dirty verification/runtime-readiness patch set listed above.

## 3. Current Objective

Immediate goal: continue local runtime testing from a verified, migrated, running app.

Intended finished state:

- Smoke the main V1 flows end-to-end against the local Postgres dev database.
- Fix any runtime issues found in watched import, transcription recovery, exports, settings/audit, and AI suggestion flows.
- Commit the dependency/runtime-readiness fixes when reviewed.

Definition of done:

- Dirty fixes are reviewed and committed.
- Runtime smoke coverage includes at least one work item through accepted/export flow.
- Any remaining environmental blockers are recorded explicitly.

## 4. Current State

### Working

- `npm run verify` passes under Node `22.14.0`/npm `10.9.2`.
- `npm run db:migrate` applied migrations `0001` through `0008`.
- API public health route works at `http://127.0.0.1:4788/health`.
- Local-dev auth session creation works at `POST /api/dev-auth/session`.
- Desktop Vite UI is running at `http://127.0.0.1:5175/`.
- Worker dev process is running and supports `transcribe_audio` and `generate_export_batch`.
- Active workflow status reports workflow version `0.2.2`.
- Chrome smoke verified the populated Memos bucket and visible workflow actions for a smoke-test memo.

### Partially Working

- Local Postgres is running in Docker container `memo-capture-postgres-16-8` from image `postgres:16.8-alpine`.
- `.env` exists locally from `.env.example`; it is intentionally git-ignored.
- Dev servers were started with local-dev auth overrides for API and worker.
- Object storage uses the configured local adapter path and still needs export/runtime validation.

### Not Working Yet

- `/api/health` is protected and returns `unauthorized` without a bearer token; this is expected, not a health-route failure.
- No active workflow exists in a fresh database until a workflow bundle is imported and activated.
- The ambient shell may still default to Node `v24.14.0`; use the Node 22 nvm path or `nvm use 22.14.0`.

### Not Yet Verified

- Tauri Rust build/check.
- Watched-folder file scanning from the native shell path.
- Audio playback/transcription retry/manual recovery against the running worker.
- Export generation and authenticated bundle download.
- Settings/audit filters against live data.
- AI expansion with any non-disabled provider.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, deploy, delete files, or weaken project instructions unless explicitly asked.
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

Use Node 22 for npm commands:

```bash
nvm use 22.14.0
npm run verify
npm run db:migrate
npm run dev:api
npm run dev:worker
npm run dev:desktop
```

Current local runtime commands used:

```bash
docker run --name memo-capture-postgres-16-8 -e POSTGRES_USER=memo_capture -e POSTGRES_PASSWORD=memo_capture -e POSTGRES_DB=memo_capture -p 5432:5432 -d postgres:16.8-alpine
MEMO_CAPTURE_AUTH_MODE=local-dev MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED=true npm run dev:api
MEMO_CAPTURE_AUTH_MODE=local-dev MEMO_CAPTURE_LOCAL_DEV_AUTH_ENABLED=true npm run dev:worker
npm run dev:desktop
```

Passed in this refresh:

```bash
npm run verify
npm run db:migrate
git diff --check
```

Runtime smoke evidence:

- `GET http://127.0.0.1:4788/health` returned `ok: true`.
- `POST http://127.0.0.1:4788/api/dev-auth/session` returned a local-dev bearer token.
- Workflow import/activation of `docs/design/memo-capture-0.2.2-workflow-definition-bundled.json` succeeded.
- Smoke memo `Smoke test memo` rendered in Chrome under the Memos bucket.

Current blockers:

- No `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py` exists in this repo, so freshness was checked manually with Git status, file existence, and verification evidence.
- Sandbox blocks localhost listen/tsx IPC for some commands; run verification and dev servers outside the sandbox when needed.

## 7. Files to Open First

- `AGENTS.md`: repo-local instructions and constraints.
- `handoff.md`: hot-context continuity source.
- `docs/completed-tasks.md`: compact completed work ledger.
- `docs/design/memo-capture-design-learnings.md`: resolved V1 product decisions.
- `docs/design/memo-capture-0.2.2-workflow-definition-bundled.json`: workflow bundle activated in local smoke testing.
- `docs/specs/index.md`: V1 spec reading order.
- `docs/specs/workflow-runtime-integration.md`: import/activation/status/bucket contracts.
- `apps/api/src/db/postgres.ts`: DB adapter fix for multi-statement migration results.
- `apps/api/src/server.ts`: protected route wiring.
- `apps/api/src/services/app.ts`: service composition.
- `apps/api/tests/backend-foundation.test.ts`: route/service coverage and test stubs.
- `apps/desktop/src/App.tsx`: desktop UI flows.
- `apps/worker/src/index.ts`: worker job loop.
- `package.json`: workspace order and root verification script.

## 8. Suggested Next Steps

1. Review the dirty changes and `package-lock.json`.
2. Continue runtime smoke testing from `http://127.0.0.1:5175/`.
3. Test accepted/export flow with the smoke memo.
4. Test watched text/audio import paths.
5. Run Tauri/Rust verification if native desktop packaging is in scope.
6. Commit the readiness fixes once the patch set is acceptable.
