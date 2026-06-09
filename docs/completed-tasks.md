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

- Task: Add ranked tag editor suggestions
  Outcome: Replaced comma-only memo tag editing with removable chips, add-tag input, and three ranked suggestion rows backed by a flat-tag suggestion API; preserved the no-hierarchy and no generated/user visual distinction rules, updated design/spec notes, and rebuilt the native `.app` bundle.
  Verification: `npm run verify` passed; `node --test --import tsx apps/api/tests/tag-suggestions.test.ts` passed; `npm run test -w @memo-capture/api` passed outside the sandbox for local route binding; `npm run test -w @memo-capture/desktop` passed; `npm run build` passed; `git diff --check` passed; `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt `Memo Capture.app`.
  Traceability: branch `main`, HEAD `c71f3d8`; changed files include `apps/api/src/repositories/tags.ts`, `apps/api/src/server.ts`, `apps/api/src/services/app.ts`, `apps/api/src/services/keywords.ts`, `apps/api/src/services/work-items.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/api/tests/tag-suggestions.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/domain-model-and-schema.md`, and `docs/completed-tasks.md`.

## 2026-06-01

- Task: Refine work queue UI and generated tag distinctiveness
  Outcome: Reworked the Work queue row layout, detail-panel tag editing layout, pane scrolling/resizing behavior, operational status display, and dark-theme balance; updated generated keyword extraction to filter generic terms and use corpus-aware distinctiveness scoring before saving generated tags.
  Verification: `npm test`, `npm run typecheck`, and `npm run build` passed; native Tauri visual smoke confirmed the row state chip, horizontal row actions, and wider tag suggestion rows; temporary dev API/Vite processes were stopped afterward.
  Traceability: branch `main`, base HEAD `22e1ff3`; changed files include `apps/api/src/services/keywords.ts`, `apps/api/tests/tag-suggestions.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, and `docs/completed-tasks.md`.

- Task: Remove durable project Context field
  Outcome: Removed project `context` from the Projects UI, API project contracts, AI expansion context shape, tests, and current docs; added migration `0011_remove_project_context.sql` to drop the persisted column while preserving prompt `context_config` and export `filterContext`.
  Verification: `npm run typecheck`, `npm run build`, `npm run verify`, and `git diff --check` passed; `npm test` passed outside the sandbox after sandbox route tests hit local bind `EPERM`; `npm run db:migrate` applied `0011_remove_project_context`; Chrome smoke confirmed Projects labels are `Name`, `Slug`, and `Synopsis` with no `Context`; `npm run tauri:build -w @memo-capture/desktop` rebuilt `Memo Capture.app` and `Memo Capture_0.1.0_aarch64.dmg`.
  Traceability: branch `main`, base HEAD `17f5394`; changed files include `apps/api/db/migrations/0011_remove_project_context.sql`, API project repositories/services/tests, `apps/desktop/src/App.tsx`, `apps/api/tests/llm-prompt.test.ts`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/`, and `docs/completed-tasks.md`.

- Task: Refine Projects page layout
  Outcome: Reworked the Projects page into a single dense scrollable project list, moved create into the page header, hid project slugs from the UI, added inline draft-row creation, and tightened project rows so counts sit beside the page title while project name and updated time share the row header.
  Verification: `npm run typecheck -w @memo-capture/desktop` passed; `npm run build` passed; `npm run verify` passed before the final row-tightening pass; `git diff --check -- apps/desktop/src/App.tsx apps/desktop/src/styles.css` passed; Chrome smoke confirmed the single list surface, no slug labels, draft-row creation, and project save flow; `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt `Memo Capture.app`.
  Traceability: branch `main`, base HEAD `e33019d`; changed files include `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, and `docs/completed-tasks.md`.

- Task: Make media and parser settings configurable and extensible
  Outcome: Added backend-owned media and parser registries, seeded text/audio/image/pdf and plain-text/markdown/audio-transcription/future transcription provider options, migrated legacy audio parser mappings to `audio-transcription`, exposed editable Settings UI sections, and made watched import processing respect media/parser support status and compatibility.
  Verification: `npm run typecheck` passed; `npm test` passed outside the sandbox after route tests needed local bind access; `npm run build` passed; `npm run verify` passed outside the sandbox; `npm run db:migrate` applied `0012_media_parser_type_settings`; `git diff --check` passed; Chrome smoke confirmed Settings renders Media types, Parser types, Audio transcription, Whisper.cpp, Faster-Whisper, and file-extension media/parser selectors.
  Traceability: branch `main`, base HEAD `97d32d8`; changed files include `apps/api/db/migrations/0012_media_parser_type_settings.sql`, settings repositories/services/routes, import finalization, backend and desktop tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/ingestion-and-artifacts.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Rebuild native Memo Capture app
  Outcome: Rebuilt the macOS Tauri `.app` bundle after the media/parser settings implementation.
  Verification: `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed and produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app` with timestamp `Jun 1 15:54:32 2026`.
  Traceability: branch `main`, base HEAD `97d32d8`; changed files include `docs/completed-tasks.md`, with native build output under `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

- Task: Add removal controls for media, parser, and file types
  Outcome: Added delete APIs and Settings UI remove actions for media types, parser types, and file extension mappings; tightened Settings table rows; and clarified Whisper.cpp/Faster-Whisper as specific future audio transcription parser implementations.
  Verification: `npm run typecheck`, `npm test`, `npm run build`, `npm run verify`, `npm run db:migrate`, and `git diff --check` passed; Chrome smoke confirmed remove controls for media/parser/file rows and compact Settings tables.
  Traceability: branch `main`, base HEAD `97d32d8`; changed files include `apps/api/db/migrations/0013_audio_parser_implementation_labels.sql`, settings repositories/services/routes, API and desktop tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/ingestion-and-artifacts.md`, `docs/specs/settings-and-audit.md`, `handoff.md`, and `docs/completed-tasks.md`.

- Task: Rebuild native Memo Capture app after settings delete controls
  Outcome: Rebuilt the macOS Tauri `.app` bundle after adding media/parser/file type removal controls.
  Verification: `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed and produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app` with timestamp `Jun 1 16:21:40 2026`.
  Traceability: branch `main`, base HEAD `97d32d8`; changed files include `docs/completed-tasks.md`, with native build output under `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

- Task: Complete watched-folder parser routing and add Whisper.cpp transcription provider
  Outcome: Centralized watched import parser routing, clarified audio-transcription as the file parser and Whisper.cpp as the transcription provider, added a `whisper-cpp` CLI provider that normalizes audio through `ffmpeg`, stores transcript artifacts through the existing job flow, replaced `extract_memo_metadata` shortcut handling with a deterministic metadata extraction service, surfaced Whisper.cpp runtime readiness in Settings/diagnostics, and documented the new provider configuration.
  Verification: `npm run typecheck` passed; `npm test` passed outside the sandbox after route tests needed local bind access; `npm run build` passed; `npm run verify` passed outside the sandbox; `npm run db:migrate` applied `0014_whisper_cpp_transcription_provider`; `git diff --check` passed.
  Traceability: branch `main`, base HEAD `24a5200`; changed files include `apps/api/db/migrations/0014_whisper_cpp_transcription_provider.sql`, `apps/api/src/services/import-parser-registry.ts`, `apps/api/src/services/transcription.ts`, `apps/api/src/services/metadata-extraction.ts`, `apps/api/src/services/imports.ts`, `apps/api/src/services/diagnostics.ts`, `apps/api/src/config.ts`, `apps/worker/src/index.ts`, `apps/desktop/src/App.tsx`, API tests, `.env.example`, `docs/env.md`, `docs/specs/ingestion-and-artifacts.md`, `docs/specs/processing-jobs-and-diagnostics.md`, and `docs/completed-tasks.md`.

- Task: Rebuild native Memo Capture app after Whisper.cpp provider work
  Outcome: Rebuilt the macOS Tauri `.app` bundle after the watched-folder parser routing and Whisper.cpp provider implementation.
  Verification: `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed and produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app` with timestamp `Jun 1 17:07:58 2026`.
  Traceability: branch `main`, base HEAD `24a5200`; changed files include `docs/completed-tasks.md`, with native build output under `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

- Task: Set up local Whisper.cpp runtime
  Outcome: Installed local build/audio tooling, cloned `whisper.cpp` pinned to `v1.8.5`, built it with Metal support for Apple Silicon, downloaded the `ggml-base.en.bin` model, and added PATH-accessible `whisper-cpp` and `whisper-cpp-server` commands.
  Verification: `cmake 4.3.3` and `ffmpeg 8.1.1` were available; `whisper.cpp` built at commit `f24588a`; `ggml-base.en.bin` SHA256 was `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002`; `whisper-cpp -m models/ggml-base.en.bin -f samples/jfk.wav -otxt` transcribed the JFK sample successfully with Metal on the M2 Max.
  Traceability: branch `main`, HEAD `7fb5d8a`; repo change is this `docs/completed-tasks.md` entry, with local runtime installed under `/Users/paulmarshall/Software Development/whisper.cpp` and symlinks under `/opt/homebrew/bin/`.

- Task: Implement active folder watching
  Outcome: Added native-desktop active polling for saved enabled watched folders, processing eligible files every 5 seconds through the existing automatic import/archive path while preserving Settings as configuration rather than a manual import picker.
  Verification: `npm run typecheck`, `npm test -w @memo-capture/desktop`, `npm run build`, `npm run verify`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed; the rebuilt native `Memo Capture.app` was launched, API health passed, and automatic watched-folder import produced new work items including `Butlers Cnr Rd` and `Rat check`.
  Traceability: branch `main`, HEAD `5778a78`; changed files include `apps/desktop/src/App.tsx`, `apps/desktop/tests/app-copy.test.ts`, `docs/specs/ingestion-and-artifacts.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Show original memo file timestamps in work items
  Outcome: Added source provenance for watched-file modified timestamps, carried it through upload sessions and import events, exposed it on work item API responses, sorted work items by original file time, and changed the work queue/detail panel to show the original memo time instead of workflow update time.
  Verification: `npm run typecheck`, `npm test` outside the sandbox, `npm run build`, `npm run verify` outside the sandbox, `npm run db:migrate` outside the sandbox, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed. The first sandboxed `npm test` hit local API route binding `EPERM`; the first sandboxed migration hit `tsx` IPC `EPERM`; the unsandboxed reruns passed.
  Traceability: branch `main`, base HEAD `3e4a827`; changed files include `apps/api/db/migrations/0015_original_file_modified_at.sql`, API repositories/services/tests, `packages/domain/src/index.ts`, `apps/desktop/src/App.tsx`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/ingestion-and-artifacts.md`, `handoff.md`, and `docs/completed-tasks.md`.

- Task: Backfill existing filename-stamped memo times
  Outcome: Added a numbered migration that recovers original memo times from existing watched-file names that start with `YYYYMMDD HHMMSS`, correcting pre-provenance rows that had been backfilled from ingestion time.
  Verification: `npm run db:migrate` applied `0016_backfill_original_file_time_from_filename`; database and API checks confirmed `20230726 205704-C846C071` now returns `2023-07-26T20:57:04.000Z` and `20190331 174222-7D10A0B5` returns `2019-03-31T17:42:22.000Z`.
  Traceability: branch `main`; changed files include `apps/api/db/migrations/0016_backfill_original_file_time_from_filename.sql` and `docs/completed-tasks.md`.

- Task: Preserve original filesystem creation time for watched imports
  Outcome: Changed native watched-folder ingestion to send filesystem creation time as the original memo timestamp with modified time as the OS fallback, added exact-duplicate repair for earlier observed original times, updated docs, and rebuilt the macOS `.app` bundle.
  Verification: `npm run doctor`, `npm run typecheck`, `npm test` outside the sandbox, `npm run build`, `cargo fmt --check`, `cargo check`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed; sandboxed API tests first hit expected local bind `EPERM`, then passed outside the sandbox.
  Traceability: branch `main`, base HEAD `5dba316`; changed files include `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src/App.tsx`, `apps/api/src/services/imports.ts`, `apps/api/src/repositories/source-memos.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/tests/app-copy.test.ts`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/ingestion-and-artifacts.md`, and `docs/completed-tasks.md`.

- Task: Implement shared classify_item flow for text and audio imports
  Outcome: Registered `classify_item` as an app-supported workflow hook, added one shared classifier for watched text and post-transcription audio work items, gated automatic `review.memo` promotion on exactly one active project match at the configurable Project Config threshold, deferred audio work-item creation until transcription success or recoverable failure, and added the Projects page threshold control.
  Verification: `npm run typecheck` passed; `npm run test -w @memo-capture/api` passed outside the sandbox after route tests needed local bind access; `npm run test -w @memo-capture/worker` passed; `npm run test -w @memo-capture/desktop` passed; `npm test` passed outside the sandbox; `npm run build` passed; `npm run db:migrate` applied `0017_project_classification_threshold`; `npm run verify` passed outside the sandbox; `git diff --check` passed; Chrome smoke on `http://127.0.0.1:5173/` confirmed Project Config shows threshold `0.65` with no console errors; `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt `Memo Capture.app`.
  Traceability: branch `main`, base HEAD `11dfd33`; changed files include `apps/api/db/migrations/0017_project_classification_threshold.sql`, `apps/api/src/services/classification.ts`, API workflow/import/transcription/settings repositories and services, API tests, `apps/worker/src/index.ts`, `packages/domain/src/index.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `docs/design/memo-capture-design-learnings.md`, and `docs/completed-tasks.md`.

## 2026-06-02

- Task: Add project delete controls and create-on-demand project drafts
  Outcome: Added a guarded project delete API and Projects page delete button, kept deactivate as the fallback for projects still referenced by memos or snapshots, and documented that the Create button adds an unsaved draft row rather than creating an empty backend project.
  Verification: `npm run typecheck` passed; `npm test` passed outside the sandbox after sandboxed route tests hit local bind `EPERM`; `npm run verify` passed; browser smoke was attempted against `http://127.0.0.1:5173/` but the Node REPL environment did not have Playwright installed.
  Traceability: branch `main`, base HEAD `2a0ed16`; changed files include `apps/api/src/repositories/catalog.ts`, `apps/api/src/services/catalog.ts`, `apps/api/src/server.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src/App.tsx`, `packages/domain/src/index.ts`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/domain-model-and-schema.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Add Operations workflow import UI
  Outcome: Added a Settings Operations section for active workflow status, JSON bundle validation/staging, in-session validation results, rollback warning copy, and checkbox-gated workflow activation that refreshes workflow status and buckets.
  Verification: `npm run typecheck`, `npm test`, `npm run build`, `npm run verify`, and `git diff --check` passed; the first sandboxed `npm test` hit local route bind `EPERM`, then passed outside the sandbox; Chrome smoke was blocked because the Codex Chrome Extension communication timed out despite Chrome, extension, and native host checks passing; `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt `Memo Capture.app` with timestamp `Jun 2 12:54:30 2026`.
  Traceability: branch `main`, base HEAD `7dff35d`; changed files include `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Fix workflow runtime import compatibility and native worker crash path
  Outcome: Routed workflow bundle validation and projection through `state-workflow-runtime` `1.0.4` normalization for editor and runtime bundle shapes, kept work queue rows visible when row-action metadata fails, and fixed worker SQL/error-handling crashes that were shutting down the native API during recoverable audio processing.
  Verification: `node --test --import tsx apps/api/tests/workflow-runtime.test.ts`, focused classify-item API tests, `node --test --import tsx apps/worker/tests/*.test.ts`, `npm run typecheck`, `npm test` outside the sandbox, `npm run build`, `npm run verify`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, `git diff --check`, runtime JSON validation, and live native API health passed.
  Traceability: branch `main`, base HEAD `f40b3b1`; changed files include `apps/api/package.json`, `apps/api/src/services/workflow-runtime.ts`, `apps/api/src/repositories/work-items.ts`, `apps/api/src/services/transcription.ts`, `apps/api/tests/workflow-runtime.test.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/worker/src/index.ts`, `apps/desktop/src/App.tsx`, `docs/specs/workflow-runtime-integration.md`, and `package-lock.json`.

- Task: Add global suppressed-tag suggestions
  Outcome: Added a global suppressed-tag table and API, filtered Strong/Related/Weak suggestions without blocking manual tag entry, added detail-panel minus actions for selected and suggested tags, and added a Settings `Suppressed Tags` restore page.
  Verification: `npm run typecheck`, `npm test` outside the sandbox after a sandboxed route-test `listen EPERM`, `npm run verify`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed.
  Traceability: branch `main`, base HEAD `82c64f5`; changed files include `apps/api/db/migrations/0018_global_suppressed_tags.sql`, `apps/api/src/repositories/tags.ts`, `apps/api/src/services/tags.ts`, `apps/api/src/services/work-items.ts`, `apps/api/src/server.ts`, `apps/api/src/services/app.ts`, API tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/design/memo-capture-design-learnings.md`, and `docs/completed-tasks.md`.

- Task: Add watched-folder contributor attribution
  Outcome: Added per-watched-folder contributor names, hidden normalized contributor keys, contributor-linked watched import finalization for text/unsupported/audio source memos, audio work-item inheritance, and a denser watched-folder Settings layout.
  Verification: `npm run typecheck`, `npm test` outside the sandbox after a sandboxed route-test `listen EPERM`, `npm run build`, `npm run verify`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, `git diff --check`, and a local Vite `HTTP 200 OK` check passed; screenshot automation was not run because Playwright was unavailable in the Node REPL environment.
  Traceability: branch `main`, base HEAD `955f0d1`; changed files include `apps/api/db/migrations/0019_watched_folder_contributor_key.sql`, API catalog/import/source memo/transcription repositories and services, API tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/specs/ingestion-and-artifacts.md`, `docs/specs/settings-and-audit.md`, `docs/completed-tasks.md`, and `handoff.md`.

- Task: Move generated tag nomination to `nominate_tags`
  Outcome: Registered `nominate_tags` as a workflow hook and processing job, moved automatic generated-tag assignment behind the active workflow's scheduled `while_in_state` hook, removed eager tag generation from import/transcription/metadata-extraction paths, and rebuilt the native `.app` bundle.
  Verification: `npm run typecheck` passed; `npm test` passed outside the sandbox after a sandboxed route-test `listen EPERM`; `npm run verify` passed outside the sandbox; `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed and produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app` with timestamp `Jun 2 21:12 2026`.
  Traceability: branch `main`, base HEAD `50dd7b5`; changed files include `packages/domain/src/index.ts`, `apps/api/src/services/workflow-runtime.ts`, `apps/api/src/services/workflow-hooks.ts`, `apps/api/src/services/classification.ts`, `apps/api/src/services/workflows.ts`, `apps/api/src/services/imports.ts`, `apps/api/src/services/transcription.ts`, `apps/api/src/services/keywords.ts`, `apps/api/src/services/metadata-extraction.ts`, `apps/worker/src/index.ts`, API/worker/domain tests, `docs/design/memo-capture-0.2.5-workflow-definition-bundled.json`, workflow/job docs, and `docs/completed-tasks.md`.

- Task: Fix workflow activation compatibility for active hook jobs
  Outcome: Changed workflow activation to compare active workflow-dependent jobs against the staged bundle so compatible queued `nominate_tags` hook jobs no longer block activating a new workflow definition.
  Verification: `npm run test -w @memo-capture/api` passed outside the sandbox; `npm run typecheck`, `npm run build`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed; a live read-only compatibility check showed staged import `7089f6ce-3986-43ca-bed3-177fe4c4b65a` had 1 active workflow-dependent job and 0 incompatible active jobs.
  Traceability: branch `main`, base HEAD `87318c8`; changed files include `apps/api/src/repositories/workflows.ts`, `apps/api/src/services/workflows.ts`, `apps/api/tests/backend-foundation.test.ts`, and `docs/completed-tasks.md`.

- Task: Add project-scoped tag visibility and nomination
  Outcome: Added tag nomination readiness, internal project tag lexicons, hidden tags until nomination completes for the current project, project-scoped Strong/Related/Weak suggestions, and desktop tag-editor gating.
  Verification: `npm run verify`, `npm run db:migrate`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed; migration `0020_project_scoped_tag_nomination` applied to the local database.
  Traceability: branch `main`, base HEAD `e00af92`; changed files include `apps/api/db/migrations/0020_project_scoped_tag_nomination.sql`, API tag/work-item repositories and services, API tests, `apps/desktop/src/App.tsx`, `packages/domain/src/index.ts`, and tag nomination docs.

- Task: Add isolated Postgres integration test lane
  Outcome: Added a dedicated `npm run test:postgres` lane that uses the local Docker Postgres container while resetting only `memo_capture_test`, documented the testing split, kept `FakeDatabase` tests as fast service checks, and recorded the policy for future Codex sessions.
  Verification: `npm run test:postgres`, `npm run typecheck`, and `npm test` passed outside the sandbox.
  Traceability: branch `main`, base HEAD `b163a47`; changed files include `package.json`, `apps/api/package.json`, `scripts/prepare-postgres-test-db.mjs`, `apps/api/tests/postgres/integration.test.ts`, `AGENTS.md`, `docs/development.md`, `docs/completed-tasks.md`, and the Codex memory note `2026-06-03-memo-capture-postgres-test-policy.md`.

## 2026-06-03

- Task: Implement AI work item review and suggestion flow
  Outcome: Made AI-suggested work items visually distinct pending review rows, hid accepted/rejected suggestions from the active review list, kept rejected suggestions as audit/status metadata only, preserved manual Save/Reset review for current-item AI drafts, and rebuilt the native macOS app bundle.
  Verification: `node --test --import tsx apps/api/tests/ai-suggestions.test.ts`, `npm run test -w @memo-capture/desktop`, `npm run typecheck`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed; the full sandboxed API workspace test attempt hit local route binding `listen EPERM` while the focused AI suggestion test passed.
  Traceability: branch `main`, HEAD `6767510`; changed files include `apps/api/src/repositories/ai-suggestions.ts`, `apps/api/src/services/ai-expansion.ts`, `apps/api/src/services/form-memos.ts`, `apps/api/tests/ai-suggestions.test.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/mvp-implementation-plan.md`, and `docs/specs/settings-and-audit.md`.

## 2026-06-04

- Task: Clarify and unblock local-dev LLM provider activation
  Outcome: Made AI expansion report the real Settings-vs-runtime mismatch when the provider row is enabled but the API is still running with `LLM_PROVIDER=disabled`, disabled the detail-panel Generate button for that known-bad state, let launcher scripts honor explicit `LLM_PROVIDER` and `LLM_MODEL` environment values, documented the runtime requirement, and tightened AI service operation return types so repo typecheck covers the flow.
  Verification: `node --test --import tsx apps/api/tests/llm-prompt.test.ts`, `npm run test -w @memo-capture/desktop`, `npm run typecheck`, `npm run verify`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `ce538b3`; changed files include `apps/api/src/services/app.ts`, `apps/api/src/services/llm.ts`, `apps/api/tests/llm-prompt.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/tests/app-copy.test.ts`, `scripts/applauncher-dev.mjs`, `scripts/applauncher-native-dev.mjs`, `docs/env.md`, `docs/completed-tasks.md`, and `handoff.md`.

- Task: Add development LLM provider setup in Settings
  Outcome: Added a compact Providers section setup row for the deterministic `local-dev` work-item expander, including readiness status, model/runtime display, and a one-click enable/reset action; changed AI expansion provider selection to prefer the enabled provider matching the active runtime so future local/cloud LLM providers can coexist without relying on one global enabled row.
  Verification: `npm run test -w @memo-capture/desktop`, `node --test --import tsx apps/api/tests/llm-prompt.test.ts`, `npm run typecheck`, `npm run verify`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `9fc5f92`; changed files include `apps/api/src/repositories/settings.ts`, `apps/api/src/services/ai-expansion.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, `docs/completed-tasks.md`, and `handoff.md`.

- Task: Add multiple LLM providers with AppLauncher runtime options
  Outcome: Added task-aware LLM routing with seeded tasks for memo expansion, suggested new memos, suggested selected tags, and OCR; added provider catalog metadata for `local-dev` and an OpenAI-compatible adapter; added user-created AI task hooks that start as `Not implemented` no-ops; routed memo expansion through task readiness and AppLauncher runtime env; replaced the redundant development LLM banner with Providers-screen AppLauncher status, task routing, and provider catalog controls; updated web/native AppLauncher manifests to `manifestVersion: "1.2.0"` runtime options with API keys delivered only through AppLauncher secrets; and preserved the native `executablePath` wrapper.
  Verification: AppLauncher manifest validation passed for repo and install-source `memo-capture` and `memo-capture-native` manifests, including native launch target readiness; `node --test --import tsx apps/api/tests/llm-prompt.test.ts`, `node --test --import tsx apps/api/tests/backend-foundation.test.ts`, `node --test apps/desktop/tests/app-copy.test.ts`, `npm run typecheck`, `npm test` outside the sandbox after a sandboxed route-test `listen EPERM`, `npm run test:postgres` outside the sandbox with Docker access, `npm run verify`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `9b329f7`; changed files include `.env.example`, `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`, API config/settings/LLM/AI-expansion/server files and tests, desktop Settings UI/styles/copy tests, generated AppLauncher manifest artifacts in `dist/applauncher-manifests` and AppLauncher install-source storage, `docs/env.md`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, `docs/completed-tasks.md`, and `handoff.md`.

- Task: Split Providers and task settings
  Outcome: Added task kinds, provider capabilities, task-owned prompt links, derived task-key creation, server-side route readiness enforcement, a catalog-only Providers Settings page, and a Tasks Settings page that owns task kinds, route controls, readiness, and prompt editing.
  Verification: `node --test --import tsx --test-name-pattern "settings summary|AI task" apps/api/tests/backend-foundation.test.ts`, `npm run test -w @memo-capture/desktop`, `npm run typecheck`, `npm test`, `npm run test:postgres`, `npm run verify`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `cc7c611`; changed files include `apps/api/db/migrations/0022_split_provider_catalog_and_task_settings.sql`, `apps/api/src/repositories/settings.ts`, `apps/api/src/services/settings.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/api/tests/postgres/integration.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/tests/app-copy.test.ts`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Allow draft task kinds before protected route implementation
  Outcome: Added task-kind create/update routes, kept new task kinds disabled by default, blocked task-kind enablement until implemented protected task logic exists, changed Provider kind and Capability key to controlled Settings selectors, documented provider/capability semantics, and rebuilt the native `.app` bundle.
  Verification: `node --test --import tsx apps/api/tests/backend-foundation.test.ts` passed with local bind permission; `npm run typecheck -w @memo-capture/desktop`, `npm run test -w @memo-capture/desktop`, `npm run typecheck`, `npm run build -w @memo-capture/desktop`, `npm run test:postgres`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `d57dd16`; changed files include `apps/api/db/migrations/0023_task_kind_enablement_requires_implemented_route.sql`, `apps/api/src/repositories/settings.ts`, `apps/api/src/server.ts`, `apps/api/src/services/app.ts`, `apps/api/src/services/settings.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/specs/settings-and-audit.md`, `docs/completed-tasks.md`, and `handoff.md`.

- Task: Simplify Providers and Tasks settings
  Outcome: Added provider create/edit settings, collapsed task-kind and task-route controls into one task configuration list, registered app-owned no-op task hooks, changed task prompt edits to update the current prompt in place, and aligned runtime env/docs with `suggest-tags`.
  Verification: `npm run typecheck`, `npm test` outside the sandbox after a sandboxed route-test `listen EPERM`, `npm run test:postgres` outside the sandbox after Docker socket denial, `npm run build`, `npm run verify`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `501789e`; changed files include `.env.example`, `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`, API config/settings repository/service/routes/tests, `apps/desktop/src/App.tsx`, `apps/desktop/tests/app-copy.test.ts`, `docs/env.md`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, `docs/completed-tasks.md`, and `handoff.md`.

- Task: Fix task hook registry display and stale API reuse
  Outcome: Changed the Tasks Settings hook key controls to use registered hook dropdowns, showed new-task prompt options immediately when enabled, preserved initial prompt context on task creation, added `revise-memo` runtime env coverage, aligned AppLauncher task runtime manifests, and made launcher scripts reject stale APIs that lack the current Settings task contract.
  Verification: `npm run verify`, `node --check scripts/applauncher-dev.mjs`, `node --check scripts/applauncher-native-dev.mjs`, `npm run test:postgres` outside the sandbox after Docker socket denial, Chrome smoke against the current API/UI, and live `curl /api/settings` contract checks passed; `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt the native `.app` bundle before the launcher-script follow-up.
  Traceability: branch `main`, base HEAD `220e194`; changed files include `.env.example`, `apps/api/src/config.ts`, `apps/api/src/services/settings.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/tests/app-copy.test.ts`, `docs/env.md`, `scripts/applauncher-dev.mjs`, `scripts/applauncher-native-dev.mjs`, and `docs/completed-tasks.md`.

- Task: Complete local development database migrations
  Outcome: Reconciled local `schema_migrations` checksums for edited applied migrations `0021` and `0024`, applied `0025_remove_seeded_ai_tasks`, confirmed seeded AI task definitions were removed, and restarted Memo Capture through the normal native helper.
  Verification: `npm run db:migrate` with Node `22.14.0` applied `0025`; a second `npm run db:migrate` pass applied nothing and skipped `0001` through `0025`; local Postgres confirmed `ai_task_definitions = 0`; API `/health` returned `ok: true`; native `memo-capture-desktop` was running.
  Traceability: branch `main`, HEAD `9d1a29e`; database state updated in local `memo_capture`, with repo files `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`, `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`, and `apps/api/db/migrations/0025_remove_seeded_ai_tasks.sql` as the migration sources.

- Task: Separate task routing from AppLauncher LLM runtime
  Outcome: Removed task-specific LLM runtime config from the API, changed Settings readiness and memo expansion invocation to use the generic AppLauncher LLM runtime, dispatch memo expansion by `hookKey`, allow multiple enabled tasks to share one hook, hide generated task keys from normal Settings UI, normalized AI task runtime metadata with migration `0026`, and replaced task-named AppLauncher runtime options with one `llm-runtime` selector in web and native manifests.
  Verification: focused backend Settings tests passed; desktop copy and manifest tests passed; `npm run typecheck`, `npm test` outside the sandbox after sandbox `listen EPERM`, `npm run test:postgres` outside the sandbox after Docker socket denial, `npm run verify`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `fff24ee`; changed files include `.env.example`, `apps/api/db/migrations/0026_generic_llm_runtime_options.sql`, `apps/api/src/config.ts`, `apps/api/src/services/ai-expansion.ts`, `apps/api/src/services/settings.ts`, API tests, `apps/desktop/src/App.tsx`, `apps/desktop/tests/app-copy.test.ts`, generated AppLauncher manifests in `dist/applauncher-manifests`, `docs/env.md`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Rationalize Hook Key dropdowns in Tasks Settings
  Outcome: Replaced the Tasks Settings Hook Key datalist controls with editable select menus for both new and existing tasks, showing each registered hook once by display label while preserving existing custom hook values.
  Verification: `node --test apps/desktop/tests/app-copy.test.ts`, `npm run typecheck`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed.
  Traceability: branch `main`, base HEAD `9dac386`; changed files include `apps/desktop/src/App.tsx`, `apps/desktop/tests/app-copy.test.ts`, and `docs/completed-tasks.md`.

- Task: Add configurable Processing Hooks registry
  Outcome: Added a persisted Processing Hooks registry seeded from existing hook keys, create/delete Settings APIs, derived hook implementation status, a new Settings page for hook status and deletion, Tasks dropdowns backed by the registry, launcher contract checks, and matching docs.
  Verification: `npm run typecheck`, focused API and desktop tests, `npm test` outside the sandbox after route-test `listen EPERM`, `npm run test:postgres` outside the sandbox after Docker socket denial, `npm run build`, `npm run verify`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed.
  Traceability: branch `main`, base HEAD `035bc3f`; changed files include `apps/api/db/migrations/0027_processing_hooks_registry.sql`, API settings repository/service/routes/tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, launcher scripts, `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

## 2026-06-05

- Task: Add task-rendered work item detail buttons
  Outcome: Added task render-location and display-order metadata, a task-id work item invocation endpoint, explicit task dispatch for memo expansion, task-rendered detail-panel buttons, Tasks Settings placement controls, and matching docs/tests.
  Verification: `npm run typecheck`, `npm test` outside the sandbox after route-test `listen EPERM`, `npm run verify`, `npm run test:postgres` outside the sandbox after Docker socket denial, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed.
  Traceability: branch `main`, HEAD `5648cd9`; changed files include `apps/api/db/migrations/0028_task_render_locations.sql`, API settings/AI-expansion/server/service files and tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/specs/index.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Refresh AppLauncher native LLM runtime setup
  Outcome: Updated and installed the Memo Capture AppLauncher web/native manifests with the generic `llm-runtime` selector, repaired the stale native saved setup to use `LLM_PROVIDER=local-dev`, and patched AppLauncher so saved setup drafts prune obsolete runtime option IDs after manifest changes.
  Verification: AppLauncher manifest validation passed for installed Memo Capture web and native manifests with zero errors/warnings; native launch-target readiness validation passed; the native `.app` bundle exists; the saved AppLauncher profile now stores `llm-runtime -> local-dev`; and `npm run build` passed in the AppLauncher repo.
  Traceability: branch `main`, HEAD `5648cd9`; changed files/artifacts include generated Memo Capture manifests under `dist/applauncher-manifests`, AppLauncher install-source/registry manifests under `~/Library/Application Support/AppLauncher`, AppLauncher profile SQLite state, AppLauncher `src/features/launcher/ProfileEditorPanel.tsx`, and `docs/completed-tasks.md`.

- Task: Expose task prompt system messages
  Outcome: Added editable task-owned System message fields directly under Prompt text, persisted the value in prompt context config, used it for OpenAI-compatible LLM requests, backfilled existing prompts with migration `0029`, and removed the local-dev `Prompt focus:` echo from generated memo bodies.
  Verification: `node --test --import tsx apps/api/tests/llm-prompt.test.ts`, focused API task prompt tests, focused desktop Settings copy test, `npm run typecheck`, `npm run test:postgres` with Docker access, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed; broad sandboxed `npm test` still hit unrelated protected-route `listen EPERM 127.0.0.1` failures while changed tests passed.
  Traceability: branch `main`, base HEAD `0b1766a`; changed files include `apps/api/db/migrations/0029_prompt_system_message.sql`, `apps/api/src/services/llm.ts`, `apps/api/src/services/settings.ts`, API and desktop tests, `apps/desktop/src/App.tsx`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

## 2026-06-06

- Task: Add ephemeral AI review modals and prompt schema defaults
  Outcome: Split work-item task output into `memo-expansion` expanded memo candidates and `suggest-new-memos` ephemeral suggested work item candidates, stopped task runs from creating `ai_suggestions` rows, added a candidate accept endpoint that creates normal memo work items, added modal review flows for expanded memos and suggested new work items, and added hook-aware System message defaults with explicit restore buttons in Task Settings.
  Verification: `npm run typecheck`, focused API prompt/task tests with local route binding, `npm test` outside the sandbox after sandboxed route-test `listen EPERM`, `npm run build`, `npm run verify`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `89e5a3c`; changed files include `apps/api/db/migrations/0030_ephemeral_ai_review_prompt_defaults.sql`, API AI-expansion/LLM/settings/server/service files and tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Fix Accept workflow action snapshot failure
  Outcome: Added migration `0031` to make the obsolete accepted-snapshot `legacy_snapshot_kind` column nullable, added a real Postgres regression test for `memo.accepted`, applied the local dev migration, verified the live Accept endpoint, and rebuilt the native `.app` bundle.
  Verification: `npm run test:postgres`, `npm run db:migrate`, live `memo.accepted` API smoke with cleanup, `npm run typecheck`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, base HEAD `038ed72`; changed files include `apps/api/db/migrations/0031_nullable_accepted_snapshot_legacy_kind.sql`, `apps/api/tests/postgres/integration.test.ts`, and `docs/completed-tasks.md`.

- Task: Harden workflow definition enforcement
  Outcome: Made the backend public action surface enforce visible no-input user actions, rejected hidden and automatic direct-post actions, added phase-aware hook validation for the V1 hook matrix, rejected unsupported input-required actions, and documented the hardened workflow contract.
  Verification: `npm run verify`, `npm run typecheck`, focused workflow runtime/service tests, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed.
  Traceability: branch `main`, HEAD `1f574e1`; changed files include `apps/api/src/services/workflow-runtime.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/api/tests/workflow-runtime.test.ts`, `docs/specs/workflow-runtime-integration.md`, and native build output at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

## 2026-06-07

- Task: Wire LM Studio as the local OpenAI-compatible LLM runtime
  Outcome: Added an explicit `LM Studio` AppLauncher `llm-runtime` option for the web and native Memo Capture manifests, documented the local OpenAI-compatible env values, updated the local `memo_capture` provider/task settings so `expand memo` and `suggest memos` route to the existing `openai-compatible` provider backed by `http://127.0.0.1:1234/v1`, and relaunched the native dev stack with `LLM_PROVIDER=openai-compatible`, `LLM_MODEL=qwen/qwen3-coder-next`, `LLM_ENDPOINT=http://127.0.0.1:1234/v1`, and `OPENAI_COMPATIBLE_API_KEY=lm-studio`.
  Verification: LM Studio `GET /v1/models` returned model IDs; all tested chat models failed to load inside LM Studio (`qwen/qwen3-coder-next` hit resource guardrails, and `nvidia/nemotron-3-nano` plus `qwen/qwen3-vl-30b` failed on missing `libpython3.11.dylib`); `node --test --import tsx apps/api/tests/llm-prompt.test.ts`, `node --test apps/desktop/tests/app-copy.test.ts`, `npm run typecheck`, AppLauncher manifest validation for installed Memo Capture web/native manifests, live `/api/settings` runtime readiness, and a work-item task API smoke all ran. The task API smoke reached the OpenAI-compatible provider and failed with HTTP 400 from LM Studio because the selected model could not load.
  Traceability: branch `main`, committed HEAD `64a09d0`; changed tracked files include `.env.example`, `apps/desktop/tests/app-copy.test.ts`, `docs/env.md`, `docs/completed-tasks.md`, and `handoff.md`; generated/installed manifest artifacts were updated under `dist/applauncher-manifests` and `~/Library/Application Support/AppLauncher`; local database state was updated in `memo_capture`.

- Task: Complete LM Studio structured-output smoke and AppLauncher secret repair
  Outcome: Patched the OpenAI-compatible adapter to request task-specific `json_schema` responses, allowed empty valid suggested-work-item output, changed the LM Studio runtime model to `openai/gpt-oss-20b`, verified both real work-item AI tasks against LM Studio, and moved `OPENAI_COMPATIBLE_API_KEY=lm-studio` from AppLauncher plain environment overrides into the AppLauncher macOS Keychain secret.
  Verification: `node --test --import tsx apps/api/tests/llm-prompt.test.ts`, `npm run typecheck`, AppLauncher manifest validation for installed Memo Capture web/native manifests, `git diff --check`, LM Studio `/v1/models` and chat smoke, live expand-memo and suggest-memos work-item task API smokes, AppLauncher profile SQLite verification, and macOS Keychain item verification passed.
  Traceability: branch `main`, base HEAD `64a09d0`; changed tracked files include `.env.example`, `apps/api/src/services/ai-expansion.ts`, `apps/api/src/services/llm.ts`, `apps/api/tests/llm-prompt.test.ts`, `docs/env.md`, `docs/completed-tasks.md`, and `handoff.md`; generated/installed AppLauncher manifests and AppLauncher profile/keychain state were updated locally.

- Task: Supply LM Studio dummy key in native dev launcher
  Outcome: Added a local LM Studio fallback in the native AppLauncher helper so `OPENAI_COMPATIBLE_API_KEY=lm-studio` is supplied when the selected runtime is `openai-compatible` at `http://127.0.0.1:1234/v1` and no key was injected, then documented the behavior in `docs/env.md`.
  Verification: `node --check scripts/applauncher-native-dev.mjs`, `git diff --check`, and a live `/api/settings` check after relaunch showed the `openai-compatible` provider `secretConfigured: true` and both `expand memo` and `suggest memos` `runtimeReady: true`.
  Traceability: branch `main`, committed HEAD `11ff2d3`; changed files include `scripts/applauncher-native-dev.mjs` and `docs/env.md`.

- Task: Generate AppLauncher provider-slot manifests
  Outcome: Updated the Memo Capture web and native AppLauncher manifests to `manifestVersion: 1.3.0` provider slots with LM Studio `openai/gpt-oss-20b`, LM Studio `nvidia/nemotron-3-nano`, generic OpenAI-compatible, local development, and Codex CLI setup choices; installed and registry copies were synced, and `docs/env.md` now documents the provider-slot boundary.
  Verification: AppLauncher manifest validation passed with zero errors/warnings for generated, install-source, and registry web/native manifests; native launch-target readiness validation passed for the native manifest; registry and install-source copies match the generated repo artifacts; `git diff --check` passed.
  Traceability: branch `main`, base HEAD `350b5a0`; changed tracked files include `docs/env.md` and `docs/completed-tasks.md`; generated/installed artifacts include `dist/applauncher-manifests/memo-capture/0.1.0/manifest.json`, `dist/applauncher-manifests/memo-capture-native/0.1.0/manifest.json`, and matching AppLauncher copies under `~/Library/Application Support/AppLauncher`.

- Task: Add photo intake and fix active bucket refresh
  Outcome: Added watched-folder photo intake with a Photos bucket, photo import storage/preprocessing, create-memo-from-photos UI, docs/tests, and fixed automatic import refresh so new Photos, Review, and Memos items appear in the active list without navigating away.
  Verification: `npm run typecheck`, `npm run build`, `npm run test:postgres`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed; broad `npm run verify` still hit existing unrelated workflow-runtime and AppLauncher manifest-copy expectation failures.
  Traceability: branch `main`, base HEAD `350b5a0`; changed files include `apps/api/db/migrations/0032_photo_imports.sql`, photo import API/repository/service/preprocessing files, `apps/api/src/services/imports.ts`, `apps/api/src/services/workflows.ts`, `apps/worker/src/index.ts`, `packages/domain/src/index.ts`, `apps/desktop/src/App.tsx`, desktop/API/domain/worker tests, `docs/design/memo-capture-design-learnings.md`, `docs/specs/ingestion-and-artifacts.md`, and `docs/completed-tasks.md`.

## 2026-06-08

- Task: Add shared invoke-provider registry support
  Outcome: Added registry-backed provider selection fields, shared capability normalization, invoke task-run history, a Memo Capture runtime facade for registry/readiness/render-slot/task-run diagnostics, Settings API/UI registry status, environment docs, and rebuilt the native `.app` bundle.
  Verification: `npm run typecheck`, `npm run build`, `node --test --import tsx apps/desktop/tests/app-copy.test.ts`, `git diff --check`, and `npm run tauri:build -w @memo-capture/desktop -- --bundles app` passed; `node --test --import tsx apps/api/tests/backend-foundation.test.ts` passed 40/42 with only sandbox `listen EPERM 127.0.0.1` failures in protected-route listener tests.
  Traceability: branch `main`, committed HEAD `6638621`; changed files include `.env.example`, `apps/api/db/migrations/0033_invoke_provider_registry_runtime.sql`, API config/settings/runtime/provider-registry service files and tests, `apps/desktop/src/App.tsx`, `docs/env.md`, `docs/plans/04 Memo Capture Shared Runtime And Provider Registry Companion Plan.md`, and `package-lock.json`.

- Task: Make Providers Settings read-only from the shared registry
  Outcome: Changed the Providers Settings page to display the shared provider registry as a read-only catalog, removed Memo Capture provider add/save/enable controls and mutation APIs, and documented that provider management belongs outside Memo Capture.
  Verification: `npm test -w @memo-capture/desktop`, `npm run typecheck`, `npm run build`, `node --test --import tsx apps/api/tests/backend-foundation.test.ts` outside the sandbox, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed; the full API package test still has an unrelated `workflow-runtime.test.ts` assertion failure.
  Traceability: branch `main`, base HEAD `3d90c59`; changed files include API settings repository/service/server/interfaces/tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/desktop/tests/app-copy.test.ts`, `docs/design/memo-capture-design-learnings.md`, and `docs/completed-tasks.md`.

- Task: Bump Memo Capture to version 1.0.0
  Outcome: Updated npm workspace package versions, internal `@memo-capture/*` pins, runtime version defaults, Tauri/Cargo app metadata, app header version, version tests, docs, and local AppLauncher `1.0.0` manifest artifacts.
  Verification: `npm run typecheck`, config/domain/worker/desktop workspace tests, `node --test --import tsx apps/api/tests/health.test.ts`, `node --test --import tsx apps/api/tests/backend-foundation.test.ts` outside the sandbox, `npm run build`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed.
  Traceability: branch `main`, base HEAD `3d90c59`; changed files include package manifests and lockfile, Tauri Cargo/config files, runtime launcher scripts, version tests, `apps/desktop/src/App.tsx`, docs version references, generated local `dist/applauncher-manifests/*/1.0.0/manifest.json` artifacts, and `docs/completed-tasks.md`.

## 2026-06-09

- Task: Add provider registry profile selection
  Outcome: Added backend-owned provider registry profile settings with saved-profile-over-env resolution, registry profile lookup APIs, Settings API/UI profile selection, missing-profile readiness blocking, audit logging, docs, and a rebuilt native `.app` bundle.
  Verification: `npm run typecheck`, focused API settings tests, focused workflow runtime tests, `npm run test:postgres` outside the sandbox after Docker socket denial, `npm run verify`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed.
  Traceability: branch `main`; changed files include `apps/api/db/migrations/0034_provider_registry_profile_settings.sql`, API settings repository/service/routes/registry helpers/tests, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `.env.example`, `docs/env.md`, `docs/specs/settings-and-audit.md`, and `docs/completed-tasks.md`.

- Task: Fix local provider task secret readiness
  Outcome: Updated local OpenAI-compatible task validation so `openai-compatible-local` and localhost endpoints can run `suggest memos` without a real API key while remote OpenAI-compatible providers still require one.
  Verification: `node --test --import tsx apps/api/tests/llm-prompt.test.ts`, `npm run typecheck -w @memo-capture/api`, `npm run typecheck`, `npm test` outside the sandbox after sandbox-only `listen EPERM 127.0.0.1`, `npm run build`, `npm run tauri:build -w @memo-capture/desktop -- --bundles app`, and `git diff --check` passed.
  Traceability: branch `main`, base HEAD `17de6a6`; changed files include `apps/api/src/services/ai-expansion.ts`, `apps/api/src/services/invoke-providers/runtime.ts`, `apps/api/src/services/invoke-providers/secrets.ts`, `apps/api/src/services/settings.ts`, `apps/api/tests/llm-prompt.test.ts`, and `docs/completed-tasks.md`.

- Task: Align Memo Capture task invocation with shared invoke-providers runtime
  Outcome: Replaced Memo Capture's local `TargetAppRuntimeService` class with a factory around `@invoke-providers/client`, aliased local shared types to `@invoke-providers/core`, moved registry fetches to the shared remote registry client, registered shared provider adapters with Memo Capture prompt/context glue, routed work-item AI task execution through shared `invokeTask`, and stopped writing or requiring `provider_config_id` for new registry-backed task routes while retaining compatibility reads.
  Verification: `npm install`, `npm run typecheck`, sandboxed `npm test` until local listener tests hit `listen EPERM 127.0.0.1`, `npm test` outside the sandbox, and `npm run verify` outside the sandbox passed. The install reported the current Node/npm runtime is newer than this repo's declared engine range.
  Traceability: branch `main`, base HEAD `8140bc9`; changed files include API AI expansion, invoke-providers runtime/adapters/hooks/mapping/registry/repositories/secrets/types glue, Settings service route persistence, `docs/completed-tasks.md`, and `handoff.md`.
