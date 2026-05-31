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

- Task: Implement watched audio and transcription recovery
  Outcome: Added watched audio ingestion, a transcription provider boundary, worker transcription execution, transcript artifacts, authenticated audio playback, failed-transcription retry, and manual transcript recovery from the work-item detail panel.
  Verification: `npm run doctor` passed; `git diff --check` passed; `cargo fmt --check` passed for the Tauri desktop crate; `npm run typecheck` was blocked because dependencies are not installed (`tsc` unavailable); `cargo check` was blocked by missing Tauri icon `apps/desktop/src-tauri/icons/icon.png`.
  Traceability: branch `main`, HEAD `badb12d`; changed files include `.env.example`, `apps/api/src/config.ts`, `apps/api/src/repositories/artifacts.ts`, `apps/api/src/repositories/source-memos.ts`, `apps/api/src/repositories/work-items.ts`, `apps/api/src/server.ts`, `apps/api/src/services/app.ts`, `apps/api/src/services/artifacts.ts`, `apps/api/src/services/diagnostics.ts`, `apps/api/src/services/imports.ts`, `apps/api/src/services/transcription.ts`, `apps/api/src/services/work-items.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/worker/src/index.ts`, `docs/env.md`, `docs/specs/ingestion-and-artifacts.md`, and `docs/specs/processing-jobs-and-diagnostics.md`.

- Task: Implement AI expansion and V1 hardening
  Outcome: Added the LLM provider/prompt boundary, strict AI expansion validation, suggestion create/list/accept/dismiss APIs, settings summary/update APIs, audit-event filters, provider and audit UI, and AI expansion controls in the work-item detail panel.
  Verification: `node scripts/doctor.mjs` passed; `git diff --check` passed; `npm run typecheck` was blocked because dependencies are not installed (`tsc` unavailable); `npm test` was blocked because dependencies are not installed (`tsx` unavailable); active shell reported Node `v24.14.0` and npm `11.9.0`, outside the repo engine range.
  Traceability: branch `main`, base HEAD `7ff2d30`; changed files include `.env.example`, `apps/api/db/migrations/0008_ai_settings_and_audit.sql`, `apps/api/src/config.ts`, `apps/api/src/repositories/`, `apps/api/src/services/`, `apps/api/src/server.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `docs/env.md`, `docs/specs/domain-model-and-schema.md`, `docs/specs/settings-and-audit.md`, `packages/domain/src/index.ts`, and `docs/completed-tasks.md`.

- Task: Install dependencies and complete local run/test readiness
  Outcome: Installed Node `22.14.0`/npm `10.9.2`, installed npm workspace dependencies, fixed TypeScript project-reference/package entrypoint issues, hardened Postgres query-result normalization for multi-statement migrations, resolved strict TypeScript errors, applied migrations through `0008`, activated workflow bundle `0.2.2`, and smoke-tested a local memo in Chrome.
  Verification: `npm run verify` passed outside the sandbox; `npm run db:migrate` applied `0001` through `0008` against local Postgres `16.8-alpine`; `git diff --check` passed; API `/health`, local-dev auth, Vite desktop UI, workflow activation, form memo creation, and Memos bucket rendering were smoke-tested.
  Traceability: branch `main`, base HEAD `1d38833`; changed files include `package.json`, `package-lock.json`, `packages/config/package.json`, `packages/domain/package.json`, `apps/api/src/db/postgres.ts`, `apps/api/src/migrate.ts`, `apps/api/src/services/exports.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src/App.tsx`, and `docs/completed-tasks.md`.

- Task: Guard watched-import archive result updates by machine ID
  Outcome: Added an import-event lookup and machine-ID mismatch check so archive-result updates cannot mark another machine's watched import as archived or failed.
  Verification: `node --test --import tsx --test-name-pattern='archive result rejects mismatched machine ids' apps/api/tests/backend-foundation.test.ts` passed; `npm run typecheck` passed; `git diff --check` passed.
  Traceability: branch `main`, HEAD `847efa2`; changed files include `apps/api/src/repositories/source-memos.ts`, `apps/api/src/services/imports.ts`, `apps/api/tests/backend-foundation.test.ts`, and `docs/completed-tasks.md`.

- Task: Refine work queue shell and layout
  Outcome: Reworked the desktop shell into top-level navigation, separated Work queue page identity from workflow bucket scope, moved workflow actions into selected rows with clearer intent styling and confirmation for risky actions, added labeled search, resizable list/detail panels, metadata copy controls, Settings-only export contract details, and light/dark semantic tokens.
  Verification: `npm run typecheck` passed; `npm run build` passed; `git diff --check` passed; Chrome visual pass at `http://127.0.0.1:5176/` covered Work queue and Settings in light/dark modes.
  Traceability: branch `main`, HEAD `9523e2f`; changed files include `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, and `docs/completed-tasks.md`.

## 2026-05-31

- Task: Move watched-folder actions left
  Outcome: Adjusted the watched-folder toolbar layout so `Add folder` and `Save settings` stay grouped on the left after the enabled-folder count.
  Verification: `npm run typecheck` passed; `git diff --check -- apps/desktop/src/styles.css` passed; Chrome visual check at `http://127.0.0.1:5175/` confirmed the buttons render on the left.
  Traceability: branch `main`, HEAD `9523e2f`; changed files include `apps/desktop/src/styles.css` and `docs/completed-tasks.md`.

- Task: Add configurable projects and Audit workspace
  Outcome: Added Settings project create/edit/deactivate controls, moved audit events to a new top-level Audit page, and mounted the generic `@state-workflow/debugger-react` event-journal debugger with a Memo Capture audit-event adapter.
  Verification: `npm run typecheck`, `npm run build`, and `npm run verify` passed; Chrome verification at `http://127.0.0.1:5176/` confirmed Audit events render in the left panel and the event-journal debugger renders in the right panel.
  Traceability: branch `main`, HEAD `fdfba67`; changed files include `apps/desktop/package.json`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/vite.config.ts`, `package-lock.json`, and `docs/completed-tasks.md`.

- Task: Wire runtime debugger controls to backend execution
  Outcome: Added a backend workflow debugger service, protected debugger snapshot/control endpoints, runtime journal events around workflow action execution, and step-mode wait points so Audit debugger controls command backend runtime execution instead of only changing frontend state.
  Verification: `npm run typecheck -w @memo-capture/api` passed; `npm run typecheck -w @memo-capture/desktop` passed; `npm run test -w @memo-capture/api` passed outside the sandbox because route tests bind `127.0.0.1`.
  Traceability: branch `main`, HEAD `9190f57`; changed files include `apps/api/src/services/workflow-debugger.ts`, `apps/api/src/services/workflows.ts`, `apps/api/src/server.ts`, `apps/api/tests/workflow-runtime.test.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src/App.tsx`, `docs/specs/workflow-runtime-integration.md`, and `docs/completed-tasks.md`.

- Task: Refine workflow debugger event layout
  Outcome: Split debugger control history from workflow runtime events, restored workflow-event filters, made control rows compact with date/time and event name only, expanded the workflow runtime event area, and renamed the step filter to `Checkpoints`.
  Verification: `npm run typecheck -w @memo-capture/desktop` passed; `git diff --check` passed; Chrome verification at `http://127.0.0.1:5175/` confirmed the Audit debugger layout and filters render.
  Traceability: branch `main`, HEAD `9190f57`; changed files include `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, and `docs/completed-tasks.md`.

- Task: Refine Audit events list
  Outcome: Replaced raw audit event rows with compact single-line user-facing summaries, enriched audit responses with display-safe project/group/file context, and made the Audit events list independently scrollable inside its panel.
  Verification: `npm run typecheck` passed; `npm test` passed outside the sandbox after allowing local API route tests to bind `127.0.0.1`; `npm run build` passed; `git diff --check` passed; Chrome verification at `http://127.0.0.1:5175/` confirmed single-line rows without UUID/email text and list-level `overflow: auto`.
  Traceability: branch `main`, HEAD `e794a2a`; changed files include `apps/api/src/repositories/audit.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, and `docs/completed-tasks.md`.

- Task: Reorganize Projects, Audit, and watched-folder navigation
  Outcome: Added a primary Projects page immediately after Work queue with dense project create/edit controls and a Synopsis field backed by project description storage; moved Audit to the right of Settings; moved watched-folder settings and scanned candidates under Settings; removed Watched folders from primary navigation.
  Verification: `npm run typecheck -w @memo-capture/desktop` passed; `npm run build` passed; `npm run verify` passed; `git diff --check -- apps/desktop/src/App.tsx apps/desktop/src/styles.css docs/specs/settings-and-audit.md` passed; Chrome verification at `http://127.0.0.1:5176/` confirmed primary navigation order, Projects page Synopsis fields, and watched folders under Settings with no Settings Projects section.
  Traceability: branch `main`, base HEAD `0fdaa47`; changed files include `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Prepare native Tauri app for watched-folder run/test
  Outcome: Added the missing Tauri icon, pinned native dev to strict `127.0.0.1:5178` so it cannot load another Vite app on `5173`, documented the native run path, ignored generated Tauri schemas, and verified native watched-folder text ingestion through Settings.
  Verification: `npm run verify` passed under Node `22.14.0` outside the sandbox; `cargo fmt --check` passed; `cargo check` passed; native Tauri smoke test imported `/private/tmp/memo-capture-watch-smoke/watched/native-smoke.md`, created a `needs_review` work item, and archived the original to `/private/tmp/memo-capture-watch-smoke/archive/2026/05/31/a7c23b92-native-smoke.md`.
  Traceability: branch `main`, base HEAD `0d2c485`; changed files include `.gitignore`, `AGENTS.md`, `README.md`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/icons/icon.png`, `docs/development.md`, and `docs/completed-tasks.md`.

- Task: Rework Settings for backend-owned file types and prompts
  Outcome: Replaced the mixed Settings page with section navigation, removed manual per-file import controls, added editable prompt composition controls with freeform text first, made backend file-type settings authoritative for scanning/import validation, and ensured LLM prompts use text/transcript context only.
  Verification: `npm run verify` passed; `npm run db:migrate` applied the prompt context migration; `git diff --check` passed.
  Traceability: branch `main`, HEAD `f915cd4`; changed files include `apps/api/db/migrations/0009_prompt_context_config.sql`, `apps/api/src/services/settings.ts`, `apps/api/src/services/imports.ts`, `apps/api/src/services/ai-expansion.ts`, `apps/api/src/services/llm.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/api/tests/llm-prompt.test.ts`, `docs/design/memo-capture-design-learnings.md`, and `docs/specs/settings-and-audit.md`.

- Task: Add configurable new file types with unsupported-parser review flow
  Outcome: Added creation of new text/audio file-type settings, UI controls for extension/media/parser/status, settings-driven watched-file source-type selection, and an ingestion finalization path that stores active unimplemented parser files as managed artifacts with a `needs_review` work item and no processing job.
  Verification: `npm run verify` passed; `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt the native `.app`; full default `tauri build` built the app but failed optional DMG packaging.
  Traceability: branch `main`, HEAD `f915cd4`; changed files include `apps/api/src/repositories/settings.ts`, `apps/api/src/server.ts`, `apps/api/src/services/app.ts`, `apps/api/src/services/imports.ts`, `apps/api/src/services/settings.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/ingestion-and-artifacts.md`, and `docs/specs/settings-and-audit.md`.

- Task: Prepare native AppLauncher run path
  Outcome: Updated local AppLauncher port usage, generated/installed AppLauncher manifests for web and native launch targets, added a native bootstrap script that starts Postgres/API/worker and opens the rebuilt Tauri bundle, and recorded that native app validation is the priority debugging surface for this repo.
  Verification: AppLauncher manifest validation passed for native and web manifests; `npm run typecheck` passed; `git diff --check` passed for the memo-capture repo and local port registry changes; rebuilt native `.app` timestamp was confirmed at `2026-06-01 06:07:33` local time and the stale running native process was quit.
  Traceability: branch `main`, HEAD `f915cd4`; changed files include `AGENTS.md`, `scripts/applauncher-dev.mjs`, `scripts/applauncher-native-dev.mjs`, `scripts/applauncher-native-dev.sh`, generated AppLauncher manifest artifacts, and `/Users/paulmarshall/Software Development/All Standards/local-port-registry.md`.

- Task: Remove feature groups in favor of derived tag grouping
  Outcome: Removed `feature_group` from the V1 domain/API/export/UI contract, migrated existing assignments into normal tags, added tag statistics/co-occurrence support, wired deterministic keyword generation jobs, refreshed docs/handoff, and rebuilt the native macOS `.app` for testing.
  Verification: `npm run typecheck`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check` passed; `npm run db:migrate` applied `0010_remove_feature_groups_for_tag_grouping` against local Postgres and an idempotence rerun skipped `0001` through `0010`; Chrome smoke loaded `http://127.0.0.1:5177/` with no console errors and no `Feature group` label; `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt `Memo Capture.app`.
  Traceability: branch `main`, HEAD `401438e`; changed files include `apps/api/db/migrations/0010_remove_feature_groups_for_tag_grouping.sql`, `apps/api/src/repositories/tags.ts`, `apps/api/src/services/keywords.ts`, API repositories/services/routes/tests, `apps/desktop/src/App.tsx`, `apps/worker/src/index.ts`, `packages/domain/src/index.ts`, `docs/specs/`, `docs/design/memo-capture-design-learnings.md`, `handoff.md`, and `docs/completed-tasks.md`.
