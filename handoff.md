# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-05-31T05:32:05Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: remove Feature Groups as a V1 domain concept and replace below-project grouping with tag/keyword metadata plus derived grouping support.

### Checkpoint Status

- Git HEAD: `401438e`
- Working tree before this feature-group removal pass: clean
- Working tree after this feature-group removal pass: dirty
- Dirty files intentionally in scope:
  - API repositories/services/routes for work items, exports, settings, audit, AI suggestions, imports, catalog, source memos, and tag handling
  - worker job handling for keyword extraction
  - desktop UI work queue/detail/search/export surfaces
  - domain shared contracts
  - specs/design docs, completed-task ledger, and this handoff
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0010_remove_feature_groups_for_tag_grouping.sql`
  - `apps/api/src/repositories/tags.ts`
  - `apps/api/src/services/keywords.ts`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/design/Photo-ingestion-plan.md`
  - `docs/specs/mvp-implementation-plan.md`
  - `docs/specs/settings-and-audit.md`
  - `apps/api/db/migrations/0010_remove_feature_groups_for_tag_grouping.sql`
  - `apps/api/src/config.ts`
  - `apps/api/src/server.ts`
  - `apps/api/src/repositories/tags.ts`
  - `apps/api/src/services/keywords.ts`
  - `apps/api/src/services/object-storage.ts`
  - `apps/api/src/services/llm.ts`
  - `apps/api/src/services/transcription.ts`
  - `apps/api/src/services/imports.ts`
  - `apps/worker/src/index.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/desktop/src-tauri/tauri.conf.json`
  - `handoff.md`
- Last verification recorded by completed-task ledger:
  - command: `npm run typecheck`; `npm test`; `npm run build`; `npm run verify`; `git diff --check`; `npm run db:migrate`; Chrome smoke at `http://127.0.0.1:5177/`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - scope: feature-group removal, derived tag grouping, DB migration `0010`, and rebuilt native `.app`
- Verification for this handoff refresh:
  - command: `npm run typecheck`; `npm test`; `npm run build`; `npm run verify`; `git diff --check`; `DATABASE_URL=postgres://memo_capture:memo_capture@127.0.0.1:5432/memo_capture npm run db:migrate`; Chrome smoke at `http://127.0.0.1:5177/`; `/Users/paulmarshall/.nvm/versions/node/v22.14.0/bin/npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed for typecheck, tests, build, verify, diff whitespace, DB migration, migration idempotence check, Chrome shell load with no console errors, and native macOS `.app` rebuild
  - note: first sandboxed `npm test` and `npm run dev:desktop` attempts hit local bind `EPERM`; reruns with local bind approval passed. Chrome smoke could load the desktop shell and confirmed no `Feature group` label, but a populated UI check was limited by local-dev auth/data setup.
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: the working tree contains the feature-group removal/tag grouping implementation plus matching docs/tests, completed-task entry, applied DB migration, and rebuilt native `.app`; verification listed above passed.
- Next checkpoint action: review the feature-group removal diff, then commit if acceptable.

## 2. Executive Summary

Memo Capture is past scaffold stage and has many V1 vertical slices implemented. This pass removes `feature_group` from the V1 contract and replaces it with generic tags/keywords plus derived grouping metadata:

- Migration `0010` converts existing feature-group assignments into normal tags, removes feature-group columns/tables from future reliance, and adds tag statistics/co-occurrence tables.
- Backend work-item, export, settings, audit, catalog, AI suggestion, and form memo contracts no longer accept or return feature-group fields.
- Tag assignment is now a first-class repository/service path for work items, form memos, AI suggestion acceptance, and migration-preserved labels.
- Worker supports `extract_memo_metadata` and `generate_keywords` jobs through deterministic keyword/tag generation with confidence, item counts, corpus/project counts, and co-occurrence refresh.
- Desktop work queue/detail/search/export surfaces use tags where feature group previously supplied below-project grouping affordance.
- JSONL and Markdown exports carry flat `tags` and no longer emit `featureGroup` or `feature_group`.
- Backend foundation, protected API skeleton, local-dev auth, OIDC validation boundary, migrations through `0010`, and root verification readiness.
- Workflow runtime integration with staged imports, activation, runtime buckets, allowed actions, action execution, accepted snapshot hook, and backend debugger controls.
- Work queue UI with workflow buckets, item list/detail, explicit save, optimistic concurrency, runtime-backed row actions, resizable detail panel, and light/dark styling.
- Accepted snapshots and export flow with Markdown/JSONL/ZIP generation, durable export batches, authenticated downloads, and Export view.
- Processing jobs repository/service support, worker heartbeats, retry/cancel APIs, item diagnostics, provider diagnostics, and system diagnostics APIs.
- Watched text and audio ingestion through Tauri commands, upload/finalize/archive result APIs, exact duplicate handling, managed artifacts, audio playback, transcription retry, and manual transcript recovery.
- AI expansion boundary with local-dev LLM provider, structured output validation, suggestions, accept/dismiss flows, provider settings, and audit records.
- Projects, Settings, and Audit UI refinements through prior navigation work: Projects is a primary page, watched-folder settings live under Settings, and Audit is a top-level page to the right of Settings.

The app is still not feature-complete. The most important remaining gaps are a direct create-memo UI, project/contributor suggestion in extraction, workflow Operations UI, global Jobs/System Diagnostics UI, fuller settings/tag management, production provider integrations, production desktop auth, S3-compatible object storage, Tauri packaging readiness, and planned image/PDF/OCR ingestion.

Safe to continue from this state if the next session treats `401438e` as the committed baseline plus the dirty feature-group removal implementation.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: continue turning the implemented vertical slices into a complete V1 app without losing workflow-owned lifecycle behavior, backend-owned canonical state, explicit user intent, and provider/storage/auth boundaries.

Intended finished V1 state:

- Users can create memos directly, import text/audio from watched folders, review/edit/classify work items, move them through runtime-defined workflow actions, accept/export snapshots, inspect jobs/diagnostics/audit, and configure canonical settings without relying on raw API calls.
- Backend remains authoritative for canonical records, auth, workflow runtime, settings, jobs, artifacts, exports, AI/transcription orchestration, and audit.
- Desktop owns local watched-folder paths, archive paths, staging/cache behavior, machine identity, folder scanning, local file reads, and archive moves.
- External AI/transcription providers, S3-compatible storage, and production OIDC auth are explicit opt-in/configured integrations, not hidden defaults.

Definition of done for the next completion push:

- Every current MVP gate in `docs/design/memo-capture-design-learnings.md` and `docs/specs/mvp-implementation-plan.md` is either implemented, deliberately out of scope, or listed as a known deferred item.
- Root verification passes with Node `22.14.0`/npm `10.9.x`, or exact blockers are documented.
- Chrome verification covers changed UI surfaces.
- Tauri/Rust build/package readiness is checked or exact blockers are recorded.
- `docs/completed-tasks.md` and this handoff stay aligned with actual `HEAD`.

## 4. Current State

### Working

- Root verification passed for this dirty feature-group removal tree.
- Primary navigation order is now Work queue, Projects, Exports, Settings, Audit.
- Projects page has dense project create/edit/deactivate controls and a Synopsis field backed by project description storage.
- Settings contains provider, prompt, watched-folder, file type, and export contract details.
- Watched-folder settings and scanned watched-file candidates moved under Settings; Watched folders is no longer a primary nav item.
- Audit page renders compact user-facing audit rows and the runtime event-journal debugger.
- Work queue, accepted export flow, watched text/audio ingestion, audio playback/manual transcript recovery, local-dev AI expansion, and backend debugger controls have implementation coverage from prior vertical slices.
- Work-item rows/detail/search, accepted snapshots, and exports now use tags instead of feature groups for below-project grouping.
- Keyword extraction jobs now generate normalized tags and refresh derived tag statistics/co-occurrence metadata.
- Local Postgres has applied `0010_remove_feature_groups_for_tag_grouping`; a second migration run skipped `0001` through `0010`.
- The native macOS app bundle was rebuilt at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app` after the feature-group removal changes.
- Current app-level workflow state contract remains `needs_review`, `memo`, `parked`, `accepted`, `rejected`, `ignored`, `failed`; terminality/reopen behavior stays workflow-definition-owned.

### Partially Working

- Form memo creation exists as `POST /api/source-memos/form`, but the desktop does not yet expose a direct create-memo form/workflow.
- Watched-folder import exists under Settings and has recent navigation-level Chrome verification, but full watched text/audio import, archive move, duplicate, transcription recovery, and restart-survival flows need fresh end-to-end verification after the latest UI changes.
- Jobs and diagnostics APIs exist, and item-level transcription retry is exposed, but there is no complete global Jobs/System Diagnostics workspace.
- Workflow import/activation APIs and backend runtime debugger controls exist, but a dedicated Operations UI for importing/staging/activating workflow bundles is still missing.
- AI expansion works through the local-dev provider boundary; real provider integrations and production provider configuration are not implemented.
- Audit event display is readable and compact, but old/sparse audit events may still fall back to generic labels and date/time only.
- Settings exposes projects and provider toggles, and displays prompts/file types/export contract, but many canonical settings are not editable in UI yet.
- Object storage is backend-mediated, but the current adapter is local filesystem-backed rather than S3/MinIO-backed.
- Backend OIDC token validation exists, but desktop production sign-in/token storage/refresh is not complete.

### Not Working Yet / Still To Build

#### Core Product Flow

- Build the direct create-memo UI for form ingestion:
  - title/body/project/contributor/tag entry
  - explicit submit through `POST /api/source-memos/form`
  - clear required-field validation and error handling
  - refresh/select the created work item in the workflow queue
  - optional future photo attachment support from `docs/design/Photo-ingestion-plan.md`
- Complete extraction/classification processing:
  - `extract_memo_metadata` and `generate_keywords` now run deterministic tag generation, but project/contributor suggestion remains incomplete
  - apply confidence thresholds from backend settings
  - produce candidate project, title, body, contributor, tags, and confidence metadata
  - keep low-confidence/incomplete items in `needs_review`
  - ensure user-supplied required fields can promote from ingestion review without confidence scores blocking promotion
- Finish list filtering/sorting from the V1 design:
  - project filter
  - contributor filter
  - tag/keyword filter
  - date range filter
  - export status filter for accepted items
  - workflow state/bucket filter beyond active bucket selection
  - predictable sort options
- Implement possible-duplicate detection and review:
  - exact duplicate handling exists
  - possible/similar duplicates need creation logic, surfaced diagnostics, and a review decision path if they remain in V1 scope

#### Workflow Operations

- Build the Operations workflow import/activation UI:
  - upload/paste workflow bundle
  - validate and show errors/warnings
  - show staged import status
  - require explicit activation confirmation
  - show activation notes/changelog input
  - warn that the app stores only the active workflow bundle and operators must preserve external bundle copies
  - show blocked activation reasons such as active jobs, unsupported capabilities, unsupported hooks, app-code migration requirements, and content-hash/version conflicts
- Re-smoke full in-flight workflow stepping from the Audit debugger against real workflow actions.
- Decide whether Audit needs a row detail/inspector view for technical identifiers that are intentionally hidden from default rows.

#### Jobs And Diagnostics

- Build a global Jobs page or diagnostics workspace:
  - list queued/running/retry-scheduled/failed/exhausted/cancelled/succeeded jobs
  - filter by status, kind, work item, source memo, export batch, provider/model, and time
  - show sanitized error plus expandable internal diagnostic detail
  - expose retry/cancel where allowed
  - audit retry/cancel actions
- Build System Diagnostics UI:
  - API health/version
  - Postgres status
  - object storage status
  - worker heartbeat/support matrix
  - auth/OIDC status
  - provider status
  - app version, commit SHA, DB schema, active workflow version, export schema
- Add diagnostic bundle export:
  - redacts secrets/tokens
  - avoids raw memo/audio content by default
  - includes enough IDs/statuses/log pointers for support/debugging
- Add abandoned upload session and orphaned object-key reconciliation.

#### Settings And Admin

- Complete tag and keyword grouping management:
  - review generated tags and grouping paths
  - tune keyword extraction thresholds
  - expose tag statistics/co-occurrence metadata where useful
- Complete contributor management:
  - create/edit/deactivate in UI
  - aliases for matching
  - optional merge flow if still in V1 scope
  - preserve free-text contributor attribution and optional canonical contributor link
- Add settings forms for:
  - extraction confidence thresholds
  - transcription retry count
  - active/inactive/not-supported file type entries
  - prompt version creation/editing/activation
  - export templates/options where configurable in V1
  - auth/OIDC metadata visibility
  - object storage configuration/health visibility
- Finish desktop-local settings:
  - staging/cache path
  - local artifact cache size cap
  - clear local cache action that does not affect managed artifacts
  - upload behavior
  - local notification preferences if kept in V1
  - machine identity diagnostics

#### Providers And AI/Transcription

- Implement production transcription provider adapters:
  - actual external or local/NAS transcription provider support
  - model selection/configuration
  - secret handling via environment or secure configuration
  - provider/model snapshot on job creation
  - retry behavior that respects fixed provider snapshots where applicable
  - latency/cost/token metadata where available
- Implement production LLM provider adapters:
  - actual external or local/NAS LLM provider support
  - strict structured JSON output validation remains mandatory
  - prompt version/provenance recorded for every run
  - invalid output creates diagnostics and no suggestion/work-item records
  - provider failures mark provider unhealthy without auto-disabling
- Keep local-dev providers deterministic for tests and smoke runs.

#### Auth And Security

- Finish production desktop auth:
  - system-browser OIDC with PKCE
  - no embedded sign-in
  - token storage in OS keychain/credential storage
  - silent refresh where possible
  - clear re-auth prompt when refresh fails
  - expired sessions allow local staging but block upload/canonical backend actions
- Add/verify OIDC user lifecycle:
  - lazy app user creation on first valid OIDC login
  - `first_seen_at`/`last_seen_at` updates
  - issuer/subject uniqueness
  - user email/display-name snapshot in audit
- Add security verification around protected routes, redaction, provider secret omission, and raw authorization header avoidance.

#### Storage, Deployment, And Ops

- Replace or extend the local filesystem object storage adapter with real S3-compatible storage:
  - endpoint/region/bucket/access-key/secret support
  - MinIO/NAS profile
  - managed cloud profile
  - backend-authorized download or signed access where appropriate
  - storage health checks
  - integration verification behind explicit commands
- Write operator docs for:
  - backup/restore responsibility for Postgres and object storage
  - NAS/self-hosted profile
  - provider configuration
  - workflow bundle preservation outside the app
  - troubleshooting jobs/imports/storage/auth
- Add release/package readiness only when explicitly moving out of Build Mode.

#### Desktop/Tauri

- Continue native verification as a required part of UI/runtime changes:
  - rebuild the native `.app` with `npm run tauri:build -w @memo-capture/desktop -- --bundles app` before handing testing back to the user
  - run full package behavior only when moving beyond Build Mode or when packaging is explicitly in scope
- Add watcher verification:
  - automated path/state tests where feasible
  - manual scripted OS watcher verification
  - restart-survival for local failed import/upload state
  - archive move failure warnings
  - unsupported-file local diagnostics

#### Planned Image/PDF/OCR Ingestion

- `docs/design/Photo-ingestion-plan.md` is planned but not implemented:
  - watched-folder image import
  - watched-folder PDF import
  - form photo attachments
  - artifact kinds for original images/PDFs, extracted PDF images, form image attachments, and derived OCR text
  - job kinds `extract_document_images` and `run_ocr`
  - PDF embedded-image extraction worker
  - explicit Send to OCR action
  - OCR provider boundary with disabled/local-dev/real providers
  - OCR result apply/append behavior
  - work-item diagnostics for image/PDF/OCR artifacts and jobs
  - tests for watched image/PDF import, duplicates, PDF extraction success/failure, disabled OCR failure, local-dev OCR success, and worker dispatch

#### Verification And Hardening

- Add focused tests for audit display enrichment and frontend summary mapping.
- Re-smoke project create/save/deactivate through Chrome after the navigation reorg.
- Re-smoke watched text import, watched audio import, duplicate handling, archive warnings, transcription recovery, export download, and local-dev AI expansion after the navigation reorg.
- Add or document integration checks for real Postgres and S3-compatible storage.
- Add mobile/narrow viewport verification for Projects, Settings watched-folder content, Audit, Work queue, and Exports.
- Validate large audit histories with real scrolling beyond computed CSS checks.
- Review `README.md` and older specs for stale scaffold/placeholder wording after current implementation progress.

### Intentionally Out Of Scope For V1 Unless Scope Changes

- CSV/tabular export.
- User-facing delete/purge for canonical records or managed artifacts.
- Workflow migrations for incompatible workflow upgrades; V1 blocks incompatible activations.
- Manual file import outside watched folders, except planned form photo attachments if accepted.
- Multi-tenant isolation or role differentiation; V1 treats all signed-in users as admins.
- Multiple desktop clients watching the same folder.
- Built-in backup/restore; operators own Postgres/object-storage backups.
- Export batch deletion.

### Not Yet Verified

- Full Tauri default package build including optional DMG packaging after the latest feature-group removal changes.
- Full watched-folder text/audio import paths after the latest navigation reorg.
- Audio transcription recovery after the latest navigation reorg.
- Export download after the latest navigation reorg.
- Non-local-dev AI/transcription provider flows because real providers are not implemented.
- Large audit histories and narrow viewport behavior.
- Workflow debugger stepping during a real in-flight workflow action.
- Production OIDC desktop sign-in because desktop PKCE/keychain flow is not complete.
- S3/MinIO storage behavior because the current storage adapter is local filesystem-backed.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, deploy, delete files, install dependencies, or weaken project instructions unless explicitly asked.
- Never use `latest`; always use numbered versions.
- Use Node `22.14.0` and npm `10.9.x` for normal repo commands.
- Apply `engineering-project-standard` for setup, maintenance, versioning, stack, documentation, and verification work.
- Apply `web-app-design-standard` for frontend UI work.
- Use Chrome for browser automation unless the user explicitly asks for another browser or Chrome is unavailable.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export is out of scope for V1.

## 6. Commands and Verification

Use the repo's expected Node/npm versions:

```bash
nvm use 22.14.0
npm install
```

Primary dev commands:

```bash
npm run dev:api
npm run dev:worker
npm run dev:desktop
```

Primary verification commands:

```bash
npm run typecheck
npm test
npm run build
npm run verify
git diff --check
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Notes:

- API route tests that bind `127.0.0.1` may need to run outside the sandbox if sandbox networking blocks local binds with `listen EPERM`.
- The repo does not currently contain `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py`; handoff freshness is checked manually with `git status`, `HEAD`, dirty file inventory, canonical file existence, and verification results.
- Use Chrome for UI verification.
- Rebuild the native `.app` before telling the user the native app is ready to test.
- Use full Tauri/Rust packaging verification explicitly before claiming distributable desktop package readiness.

## 7. Files to Open First

- `AGENTS.md`: repo-local instructions and constraints.
- `handoff.md`: hot-context continuity source.
- `docs/completed-tasks.md`: append-only completed work ledger.
- `docs/design/memo-capture-design-learnings.md`: resolved V1 product decisions; read before architecture, schema, workflow, ingestion, AI, or export work.
- `docs/design/Photo-ingestion-plan.md`: planned image/PDF/OCR ingestion scope.
- `docs/specs/mvp-implementation-plan.md`: milestone and MVP gate inventory.
- `docs/specs/settings-and-audit.md`: current Settings/Audit contract and navigation notes.
- `apps/desktop/src/App.tsx`: primary UI, Projects/Settings/Audit/Work queue/Exports, watched-folder settings, AI controls, audio recovery.
- `apps/desktop/src/styles.css`: current layout and UI styling.
- `apps/api/src/server.ts`: protected API route map.
- `apps/api/db/migrations/0010_remove_feature_groups_for_tag_grouping.sql`: feature-group-to-tag migration and derived tag metadata tables.
- `apps/api/src/repositories/tags.ts`: normal tag creation/assignment boundary.
- `apps/api/src/services/keywords.ts`: deterministic keyword/tag extraction and derived grouping metadata refresh.
- `apps/api/src/services/imports.ts`: watched import finalize/archive/duplicate behavior.
- `apps/api/src/services/workflows.ts`: workflow import/activation/action/debugger service behavior.
- `apps/api/src/services/settings.ts`: settings summary/update surfaces.
- `apps/api/src/services/object-storage.ts`: current local filesystem object storage adapter.
- `apps/api/src/services/llm.ts`: current local-dev-only LLM provider boundary.
- `apps/api/src/services/transcription.ts`: current disabled/local-dev transcription provider boundary.
- `apps/worker/src/index.ts`: worker-supported job kinds and job dispatch.
- `apps/desktop/src-tauri/src/lib.rs`: Tauri watched-folder commands, local file reads, folder picker, archive move.
- `apps/desktop/src-tauri/tauri.conf.json`: desktop bundle/package config.

## 8. Suggested Next Steps

1. Build the direct create-memo UI and wire it to `POST /api/source-memos/form`.
2. Extend `extract_memo_metadata` beyond deterministic tag generation to project/contributor suggestion and confidence review.
3. Add a global Jobs/System Diagnostics workspace using the existing `/api/jobs`, `/api/diagnostics/system`, and `/api/diagnostics/providers` APIs.
4. Add Operations UI for workflow import, validation, staging, activation, and activation-blocker visibility.
5. Complete Settings management for tag/keyword grouping, contributors, extraction/transcription settings, prompts, file types, export templates, and desktop-local cache/staging settings.
6. Add real provider adapters for transcription and LLM, keeping local-dev providers deterministic.
7. Add S3-compatible object storage support and explicit integration verification for MinIO/S3.
8. Finish production desktop OIDC PKCE/keychain auth.
9. Verify full Tauri/Rust package readiness when packaging moves into scope.
10. Re-smoke watched import, transcription recovery, export download, AI expansion, project management, and workflow debugger stepping in Chrome/Tauri as appropriate.
