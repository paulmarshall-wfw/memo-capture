# Completed Tasks

Append brief entries here when project work is completed. Keep this file concise and append-only.

## 2026-05-29

- Task: Add backend foundation
  Outcome: Added the V1 schema alignment migration, Postgres DB client and migration runner, repository/service boundaries, request IDs, protected route skeletons, local-dev auth, OIDC validation boundary, form memo creation, environment/docs updates, and focused backend foundation tests.
  Verification: `node scripts/doctor.mjs` passed; `git diff --check` passed; `npm run typecheck -w @memo-capture/api`, `npm test -w @memo-capture/api`, and `npm run verify` were blocked because dependencies are not installed (`tsc`/`tsx` unavailable) and the active Node version is outside the declared engine range.
  Traceability: branch `main`, HEAD `504d2da`; changed files include `package.json`, `apps/api/package.json`, `apps/api/db/migrations/0002_align_target_v1_schema.sql`, `apps/api/src/db/`, `apps/api/src/repositories/`, `apps/api/src/services/`, `apps/api/src/server.ts`, `apps/api/tests/backend-foundation.test.ts`, `docs/development.md`, `docs/env.md`, `docs/specs/settings-and-audit.md`, `.env.example`, and `packages/domain/src/index.ts`.

- Task: Implement basic capture APIs
  Outcome: Added the protected current-session alias, feature group and contributor update/deactivate APIs with audit events, partial feature-group patching, not-found handling for single-record routes, and focused route coverage for the capture API surface.
  Verification: `git diff --check` passed; `node scripts/doctor.mjs` passed bootstrap checks but reported dependencies must be installed before typecheck, tests, builds, or dev servers; `npm run typecheck -w @memo-capture/api` and `npm test -w @memo-capture/api` were blocked because `tsc` and `tsx` are unavailable without installed dependencies.
  Traceability: branch `main`, HEAD `12d957b`; changed files include `apps/api/src/repositories/catalog.ts`, `apps/api/src/server.ts`, `apps/api/src/services/catalog.ts`, `apps/api/tests/backend-foundation.test.ts`, and `docs/specs/auth-and-security.md`.

## 2026-05-30

- Task: Align workflow state contract with memo terminology
  Outcome: Made `memo` the successful-capture app state, removed hardcoded bucket-role and terminal-state assumptions, documented app-owned workflow hook compatibility, and updated the 0.2.1 workflow bundle action IDs to stable semantic IDs.
  Verification: `git diff --check` passed; `node scripts/doctor.mjs` passed bootstrap checks but reported dependencies must be installed before typecheck, tests, builds, or dev servers; `python3 -m json.tool docs/design/memo-capture-0.2.1-workflow-definition-bundled.json` passed.
  Traceability: branch `main`, HEAD `54617af`; changed files include `packages/domain/src/index.ts`, `apps/api/src/services/form-memos.ts`, API migrations, desktop placeholder UI files, workflow/design specs, `docs/design/memo-capture-0.2.1-workflow-definition-bundled.json`, and `docs/completed-tasks.md`.

- Task: Align review state contract with 0.2.2 workflow definition
  Outcome: Renamed the app-level incomplete-ingestion state from `needs_ingestion_review` to `needs_review` across domain constants, tests, docs, and placeholder UI; updated the forward migration to convert existing rows to the new state.
  Verification: `git diff --check` passed; `node scripts/doctor.mjs` passed bootstrap checks but reported dependencies must be installed before typecheck, tests, builds, or dev servers; `python3 -m json.tool docs/design/memo-capture-0.2.2-workflow-definition-bundled.json` passed.
  Traceability: branch `main`, HEAD `54617af`; changed files include `packages/domain/src/index.ts`, `packages/domain/tests/states.test.ts`, `apps/api/db/migrations/0003_align_workflow_state_contract.sql`, desktop placeholder UI files, workflow/design specs, and `docs/completed-tasks.md`.

- Task: Integrate workflow runtime operations
  Outcome: Added active/staged workflow repositories, bundle validation and staging, explicit activation with active-job and content-hash guards, active workflow status and bucket APIs, runtime-derived work-item allowed actions, execute-action transitions, accepted snapshot hook execution, audit events, migration indexes/constraints, and focused route/runtime tests.
  Verification: `git diff --check` passed; `node scripts/doctor.mjs` passed bootstrap checks but reported dependencies must be installed before typecheck, tests, builds, or dev servers; `npm run typecheck -w @memo-capture/api` and `npm test -w @memo-capture/api` were blocked because `tsc` and `tsx` are unavailable without installed dependencies.
  Traceability: branch `main`, HEAD `bb17b3d`; changed files include `apps/api/db/migrations/0004_workflow_runtime_operations.sql`, `apps/api/src/repositories/workflows.ts`, `apps/api/src/repositories/work-items.ts`, `apps/api/src/services/workflow-runtime.ts`, `apps/api/src/services/workflows.ts`, `apps/api/src/services/app.ts`, `apps/api/src/server.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/api/tests/workflow-runtime.test.ts`, `packages/domain/src/index.ts`, and `docs/completed-tasks.md`.

- Task: Build work queue UI vertical slice
  Outcome: Replaced the static desktop placeholder with an API-backed work queue that loads runtime buckets and counts, bucket-filtered item lists, editable detail data, optimistic save conflicts, and workflow actions from backend/runtime projections.
  Verification: `git diff --check` passed; `node scripts/doctor.mjs` passed bootstrap checks but reported dependencies must be installed before typecheck, tests, builds, or dev servers; `npm run typecheck` was blocked because `tsc` is unavailable without installed dependencies.
  Traceability: branch `main`, HEAD `85c3b17`; changed files include `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/api/src/services/work-items.ts`, `apps/api/src/repositories/work-items.ts`, `apps/api/src/services/workflows.ts`, `apps/api/src/services/app.ts`, `apps/api/src/server.ts`, and `apps/api/tests/backend-foundation.test.ts`.

- Task: Build accepted snapshot and export flow
  Outcome: Implemented accepted snapshot creation after accepted-item edits, export snapshot listing and batch creation APIs, worker-generated manifest/JSONL/Markdown/ZIP artifacts, backend-controlled local object storage, authenticated export downloads, and an Export view for selecting snapshots and downloading completed batches.
  Verification: `git diff --check` passed; `npm run doctor` passed bootstrap checks and reported dependencies must be installed before typecheck, tests, builds, or dev servers; `npm run typecheck` was blocked because `tsc` is unavailable without installed dependencies; `npm test` was blocked because `tsx` is unavailable without installed dependencies.
  Traceability: branch `main`, HEAD `bb14b42`; changed files include `.env.example`, `apps/api/db/migrations/0005_export_runtime.sql`, `apps/api/src/config.ts`, `apps/api/src/repositories/artifacts.ts`, `apps/api/src/repositories/exports.ts`, `apps/api/src/repositories/jobs.ts`, `apps/api/src/repositories/users.ts`, `apps/api/src/server.ts`, `apps/api/src/services/app.ts`, `apps/api/src/services/export-renderer.ts`, `apps/api/src/services/exports.ts`, `apps/api/src/services/object-storage.ts`, `apps/api/src/services/work-items.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/api/tests/export-renderer.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/worker/package.json`, `apps/worker/src/index.ts`, `apps/worker/tsconfig.json`, `docs/env.md`, and `docs/completed-tasks.md`.

- Task: Implement processing jobs and diagnostics
  Outcome: Added worker heartbeats, processing job claim/lease/retry/cancel behavior, manual job retry and cancel APIs, item diagnostics, provider health diagnostics, system diagnostics, and the processing-jobs diagnostics migration/spec update.
  Verification: `node scripts/doctor.mjs` passed; `git diff --check` passed; `npm run typecheck` was blocked because `tsc` is unavailable without installed dependencies; `npm test -w @memo-capture/api` was blocked because `tsx` is unavailable without installed dependencies; active shell reported Node `v24.14.0` and npm `11.9.0`, outside the repo engine range.
  Traceability: branch `main`, HEAD `4fad083`; changed files include `apps/api/db/migrations/0006_processing_jobs_and_diagnostics.sql`, `apps/api/src/repositories/jobs.ts`, `apps/api/src/server.ts`, `apps/api/src/services/app.ts`, `apps/api/src/services/diagnostics.ts`, `apps/api/src/services/jobs.ts`, `apps/api/src/services/object-storage.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/worker/src/index.ts`, and `docs/specs/processing-jobs-and-diagnostics.md`.

- Task: Implement watched text ingestion
  Outcome: Added desktop watched-folder settings and stability scanning, backend upload/finalize/archive-result APIs, managed artifact storage, exact duplicate handling, source memo/work item creation, extraction job scheduling, and non-overwriting archive movement for watched text files.
  Verification: `node scripts/doctor.mjs` passed; `git diff --check` passed; `cargo fmt --check` passed for the Tauri desktop crate; `npm run typecheck` was blocked because `tsc` is unavailable without installed dependencies.
  Traceability: branch `main`, HEAD `4fad083`; changed files include `apps/api/db/migrations/0007_import_upload_sessions.sql`, `apps/api/src/repositories/artifacts.ts`, `apps/api/src/repositories/import-upload-sessions.ts`, `apps/api/src/repositories/source-memos.ts`, `apps/api/src/server.ts`, `apps/api/src/services/app.ts`, `apps/api/src/services/imports.ts`, `apps/api/src/services/object-storage.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `packages/domain/src/index.ts`, and `packages/domain/tests/states.test.ts`.
