# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-01T06:54:00Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: finish watched-folder parser routing, add the Whisper.cpp transcription provider path, and replace `extract_memo_metadata` shortcut handling with a deterministic metadata extraction boundary.

### Checkpoint Status

- Git HEAD: `24a5200`
- Working tree before this implementation: clean
- Working tree after this handoff refresh: dirty
- Dirty files intentionally in scope:
  - `.env.example`
  - `apps/api/src/config.ts`
  - `apps/api/src/repositories/work-items.ts`
  - `apps/api/src/services/diagnostics.ts`
  - `apps/api/src/services/imports.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/services/transcription.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/worker/src/index.ts`
  - `docs/completed-tasks.md`
  - `docs/env.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0014_whisper_cpp_transcription_provider.sql`
  - `apps/api/src/services/import-parser-registry.ts`
  - `apps/api/src/services/metadata-extraction.ts`
  - `apps/api/tests/import-parser-registry.test.ts`
  - `apps/api/tests/metadata-extraction.test.ts`
  - `apps/api/tests/transcription-provider.test.ts`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `README.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/design/Photo-ingestion-plan.md`
  - `docs/specs/mvp-implementation-plan.md`
  - `docs/specs/domain-model-and-schema.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `apps/api/src/server.ts`
  - `apps/api/src/services/keywords.ts`
  - `apps/api/src/services/work-items.ts`
  - `apps/api/src/services/imports.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/services/transcription.ts`
  - `apps/api/src/services/metadata-extraction.ts`
  - `apps/api/src/services/workflow-runtime.ts`
  - `apps/api/src/services/workflow-debugger.ts`
  - `apps/worker/src/index.ts`
  - `apps/desktop/src/App.tsx`
  - `handoff.md`
- Last verification recorded by completed-task ledger:
  - command: `npm run typecheck`; `npm test`; `npm run build`; `npm run verify`; `npm run db:migrate`; `git diff --check`
  - result: passed for parser routing, Whisper.cpp provider boundary, deterministic metadata extraction, docs, and migration `0014`; route tests and verification that bind `127.0.0.1` were run outside the sandbox after sandbox `EPERM` bind failures
  - scope: watched import parser registry, Whisper.cpp runtime config/provider execution, metadata extraction service, Settings/diagnostics provider readiness, tests, docs
- Verification for this handoff refresh:
  - command: `git status --short --branch`; `git rev-parse --short HEAD`; completed-task ledger update; handoff update
  - result: passed for checkpoint/documentation inspection
  - note: no native Tauri smoke was run in this refresh.
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: the repo was clean at `HEAD 24a5200` before the implementation; all dirty files listed above are intentional outputs from this slice and are grounded in current Git status, verification, completed-task entries, source/docs changes, and migration evidence.
- Next checkpoint action: review this implementation and commit it if acceptable.

## 2. Executive Summary

Memo Capture is a Tauri desktop app with a TypeScript API, TypeScript worker, Postgres, and backend-managed artifact storage. It is past scaffold stage and has many V1 vertical slices implemented:

- Backend foundation, protected API skeleton, local-dev auth, OIDC validation boundary, migrations through `0011`, and root verification readiness.
- Workflow runtime integration with staged imports, activation, runtime buckets, allowed actions, action execution, accepted snapshot hook, and backend debugger controls.
- Work queue UI with workflow buckets, item list/detail, explicit save, optimistic concurrency, runtime-backed row actions, resizable detail panel, tag chips, and ranked tag suggestions.
- Accepted snapshots and export flow with Markdown/JSONL/ZIP generation, durable export batches, authenticated downloads, and Export view.
- Processing jobs repository/service support, worker heartbeats, retry/cancel APIs, item diagnostics, provider diagnostics, and system diagnostics APIs.
- Watched text and audio ingestion through Tauri commands, upload/finalize/archive result APIs, exact duplicate handling, managed artifacts, audio playback, transcription retry, and manual transcript recovery.
- AI expansion boundary with local-dev LLM provider, strict structured output validation, suggestions, accept/dismiss flows, provider settings, and audit records.
- Settings, Projects, and Audit UI refinements: Projects is a primary page, watched-folder settings live under Settings, Audit is a top-level page to the right of Settings, project rows are compact list rows, and Media type / Parser type registries are user-configurable from Settings.
- Extensible media/parser settings are now backend-owned. File extensions map to configurable media and parser records; media, parser, and file type rows can be removed from Settings when dependency rules allow it; future image/PDF/transcription-parser options can be listed with `not_supported_yet` status without code changes just to appear in Settings.
- Watched import parser routing is centralized in the backend parser registry. Audio file types still map to the generic `audio-transcription` parser, while Whisper.cpp is selected as a transcription provider through runtime/provider configuration.
- Whisper.cpp CLI transcription support is implemented behind `TRANSCRIPTION_PROVIDER=whisper-cpp`; it normalizes audio through `ffmpeg`, runs `whisper-cli`, stores derived transcript artifacts, and records provider/model/latency metadata through the existing job path.
- `extract_memo_metadata` now has a deterministic metadata extraction boundary instead of being handled as keyword generation directly; it normalizes title/body, suggests contributor/project metadata for review, and writes generated tags.
- Feature groups and durable project Context have been removed from the V1 domain/API/export/UI contract. Below-project grouping is now flat tags/keywords plus derived tag statistics/co-occurrence metadata.

The app is still not feature-complete. The most important remaining gaps are a direct create-memo UI, stronger extraction/classification suggestions for projects/contributors, workflow Operations UI, global Jobs/System Diagnostics UI, fuller tag/contributor/admin management, production transcription/LLM provider integrations, production desktop auth, S3-compatible object storage, packaging/release hardening, and actual image/PDF/OCR processing.

Safe to continue from this state if the next session treats `97d32d8` as the committed baseline plus the dirty media/parser settings implementation listed in this handoff.

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
- Chrome verification covers changed browser-testable UI surfaces.
- Native Tauri verification covers watched-folder, archive move, machine identity, folder picker, and OS-dialog behavior when those areas change.
- `docs/completed-tasks.md` and this handoff stay aligned with actual `HEAD`.

## 4. Current State

### Working

- Root package scripts are defined: `npm run dev:desktop`, `npm run dev:api`, `npm run dev:worker`, `npm test`, `npm run typecheck`, `npm run build`, and `npm run verify`.
- Product shell navigation is Work queue, Projects, Exports, Settings, Audit.
- Work queue rows/details support workflow bucket loading, item selection, editing, runtime actions, tag chips, ranked tag suggestions, and improved row/detail layout from the latest UI pass.
- Projects page is a dense primary page with project create/edit/deactivate behavior, inline draft-row creation, compact project rows, no visible slugs, and Synopsis backed by project description storage.
- Settings contains provider, prompt, watched-folder, media type, parser type, file type, and export contract details. Watched-folder settings and scanned watched-file candidates live under Settings.
- Media types and parser types are backend-owned user-configurable registries with support status `active`, `inactive`, or `not_supported_yet`; seeded records include media `text`, `audio`, `image`, `pdf` and parsers `plain-text`, `markdown`, `audio-transcription`, plus deprecated provider-marker rows for `whisper-cpp` and `faster-whisper`.
- File type settings map extensions to configurable Media type and Parser type records. Existing audio mappings migrate from parser key `audio` to visible parser key `audio-transcription`.
- Media type delete is blocked while parser or file type rows reference that media key. Parser type delete is blocked while file type rows reference that parser key. File type rows can be deleted directly.
- Audit page renders compact user-facing audit rows and the runtime event-journal debugger.
- Accepted snapshots and exports work through backend-owned artifacts and export batches.
- Watched text/audio ingestion exists through native Tauri commands and backend upload/finalize/archive-result APIs.
- Watched import finalization uses the backend parser registry plus media/parser setting status: active text parsers keep the current text extraction path, active audio plus `audio-transcription` queues `transcribe_audio`, unsupported parsers import the artifact and create a `needs_review` parser-support work item with no processing job, and unsupported media blocks watched-folder import for that extension.
- `TRANSCRIPTION_PROVIDER=whisper-cpp` is implemented in CLI mode. It writes source audio to a temp directory outside the repo, converts it to 16 kHz mono WAV with `ffmpeg`, runs `whisper-cli`, reads JSON/text transcript output, stores a derived transcript artifact, updates the source memo transcript/body if appropriate, and queues metadata extraction.
- `extract_memo_metadata` is handled by `MetadataExtractionService`, which deterministically normalizes title/body, suggests contributor and project metadata for review, and stores generated tags.
- Audio playback, failed-transcription retry, and manual transcript recovery are implemented.
- Backend workflow runtime operations, workflow debugger controls, and runtime journal events are implemented.
- Local-dev AI expansion works through a deterministic provider boundary with structured JSON validation.
- Feature group fields have been removed from domain/API/export/UI contracts. Existing feature-group assignments were migrated to tags through `0010`.
- Project `context` has been removed from durable project records and UI through `0011`; prompt `context_config` and export `filterContext` remain separate concepts.
- Keyword extraction now filters generic terms and uses corpus-aware distinctiveness scoring before saving generated tags.
- Current app-level workflow state contract remains `needs_review`, `memo`, `parked`, `accepted`, `rejected`, `ignored`, `failed`; terminality/reopen behavior stays workflow-definition-owned.

### Partially Working

- Form memo creation exists as `POST /api/source-memos/form`, but the desktop does not yet expose a direct create-memo workflow.
- Watched-folder import exists under Settings and has prior native verification, but full watched text/audio import, archive move, duplicate, transcription recovery, and restart-survival flows should be re-smoked after future ingestion/UI changes.
- Jobs and diagnostics APIs exist, and item-level transcription retry is exposed, but there is no complete global Jobs/System Diagnostics workspace.
- Workflow import/activation APIs and backend runtime debugger controls exist, but a dedicated Operations UI for importing/staging/activating workflow bundles is still missing.
- AI expansion works through the local-dev provider boundary; production LLM provider adapters and full provider configuration are not implemented.
- Audit event display is readable and compact, but old/sparse audit events may still fall back to generic labels and date/time only.
- Settings exposes several configuration summaries and some editors, but many canonical settings are not editable in UI yet.
- Parser/provider separation is explicit in the data model: `audio-transcription` is the file parser type retained for audio mappings; Whisper.cpp is now a transcription provider selected through runtime config and Settings diagnostics; Faster-Whisper remains a future optional provider.
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
  - project suggestion
  - contributor suggestion
  - candidate title/body cleanup
  - confidence metadata
  - confidence thresholds from backend settings
  - low-confidence/incomplete routing to `needs_review`
  - promotion rules for user-supplied required fields that should not be blocked by missing confidence scores
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
  - review generated tags
  - tune keyword extraction thresholds
  - expose tag statistics/co-occurrence metadata where useful
  - keep tags flat unless the user explicitly chooses a hierarchy later
- Complete contributor management:
  - create/edit/deactivate in UI
  - aliases for matching
  - optional merge flow if still in V1 scope
  - preserve free-text contributor attribution and optional canonical contributor link
- Add settings forms for:
  - extraction confidence thresholds
  - transcription retry count
  - prompt version creation/editing/activation
  - export templates/options where configurable in V1
  - auth/OIDC metadata visibility
  - object storage configuration/health visibility
- Extend settings management beyond the new media/parser/file-type registry editors where needed:
  - richer validation/help for compatibility choices
  - production provider configuration for audio transcription implementations
  - clearer operational diagnostics for unsupported media/parser choices
- Finish desktop-local settings:
  - staging/cache path
  - local artifact cache size cap
  - clear local cache action that does not affect managed artifacts
  - upload behavior
  - local notification preferences if kept in V1
  - machine identity diagnostics

#### Providers And AI/Transcription

- Extend production transcription provider support:
  - install/configure a real local `whisper-cli` binary and numbered model file on target machines
  - optional future `whisper-server` mode for local/NAS transcription
  - optional Faster-Whisper provider for GPU/NAS workloads
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

#### Storage, Packaging, And Deployment

- Implement S3-compatible object storage:
  - bucket/key layout
  - signed/backend-mediated downloads only
  - no direct desktop credentials
  - local MinIO or equivalent smoke path if used
  - migration/backfill plan for local filesystem artifacts if needed
- Harden packaging and release readiness:
  - native icon/signing/notarization expectations
  - reproducible build notes
  - artifact/version traceability
  - clear distinction between local Build Mode and release behavior
  - no unnumbered or `latest` release artifacts
- Add deployment/run documentation for production-like dependencies:
  - Postgres
  - object storage
  - API
  - worker
  - auth provider
  - provider secrets
  - backup/restore expectations

#### Future Ingestion Types

- Implement planned image/PDF/OCR ingestion only after the current text/audio V1 path stays stable:
  - media/parser registry records are now configurable and can already be marked `not_supported_yet`
  - managed original artifacts
  - OCR/transcription/provider job shape
  - review workflow for unsupported parser output
  - export behavior for derived text and provenance

### Verification Completed For This Slice

- `npm run typecheck`: passed.
- `npm test`: passed outside the sandbox after route tests needed local bind access.
- `npm run build`: passed.
- `npm run verify`: passed outside the sandbox.
- `npm run db:migrate`: applied `0014_whisper_cpp_transcription_provider` after a sandbox IPC `EPERM`; final rerun outside the sandbox succeeded and skipped `0001` through `0014`.
- `git diff --check`: passed.
- Tests added for parser routing, deterministic metadata extraction, and the Whisper.cpp CLI provider success/configuration/timeout/empty-output paths.

### Not Yet Verified In This Handoff Refresh

- Native Tauri smoke or rebuild after the Whisper.cpp/provider diagnostics changes.
- Real Whisper.cpp transcription against an actual installed `whisper-cli` binary and model file. This machine appears capable of running it locally (`arm64`, macOS `26.5`, Xcode Metal compiler and `ffmpeg` present), but `whisper-cli`, `whisper-server`, and `cmake` are not installed on PATH.
- Full watched-folder text/audio import through the native app after this provider/routing refactor.

## 5. Constraints To Preserve

- Prefer explicit user intent over defaults. Do not publish, commit, tag, install dependencies, delete files, navigate/change browser state, or activate features unless the user explicitly requests it.
- Default to Build Mode unless release behavior is explicitly requested.
- Never use `latest`; always use numbered versions for versions/releases/artifacts.
- Use Git-derived traceability by default.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Media type and Parser type options are user-configurable registries; unsupported future options should remain visible with status instead of being hidden.
- Parser/provider separation must be preserved: `audio-transcription` is the current generic audio parser type, while Whisper.cpp/Faster-Whisper are transcription providers selected outside file-extension parser mapping.
- Workflow actions, buckets, visibility, terminality, and reopen behavior should come from the active workflow definition wherever possible.
- The app stores only the active workflow definition bundle; rollback requires re-importing a known-good external bundle.
- V1 blocks workflow activations that require app-code migrations.
- All signed-in users are admins in V1, but authentication is still required.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export is out of scope for V1.
- Use Chrome for browser validation unless the user asks for another browser.
- Treat the native Tauri app as the primary debugging/refinement surface for user-facing Memo Capture behavior, especially watched-folder and OS-integration paths.
- Keep watched-folder configuration in Settings unless the user asks to move it.
- Watched folders are not typed as voice-memo vs text folders; import routing is by candidate file extension/source type.
- Feature groups are removed from V1. Do not reintroduce `feature_group` fields or UI. Use flat tags/keywords and derived grouping support.
- Durable project `context` is removed. Use `description`/Synopsis for project text and keep prompt `context_config` separate.

## 6. Key Files For Next Session

- `AGENTS.md`: project instructions, ports, stack, and verification notes.
- `docs/completed-tasks.md`: append-only completed-work ledger.
- `docs/design/memo-capture-design-learnings.md`: current V1 design decisions and constraints.
- `docs/specs/mvp-implementation-plan.md`: intended MVP gates.
- `docs/specs/domain-model-and-schema.md`: canonical domain/schema notes.
- `docs/specs/ingestion-and-artifacts.md`: ingestion/artifact behavior.
- `docs/specs/settings-and-audit.md`: settings/audit behavior.
- `docs/specs/workflow-runtime-integration.md`: runtime/workflow/debugger behavior.
- `apps/api/db/migrations/0012_media_parser_type_settings.sql`: media/parser registry schema and seed migration.
- `apps/api/db/migrations/0013_audio_parser_implementation_labels.sql`: post-`0012` parser wording migration; keep because `0012` was already applied locally and its checksum must remain stable.
- `apps/api/src/server.ts`: protected route dispatcher.
- `apps/api/src/services/work-items.ts`: work-item/detail/update/snapshot behavior.
- `apps/api/src/services/keywords.ts`: deterministic keyword/tag generation and tag suggestions.
- `apps/api/src/services/imports.ts`: watched import upload/finalize/archive behavior.
- `apps/api/src/services/settings.ts`: backend-owned settings summaries/editors.
- `apps/api/src/repositories/settings.ts`: media/parser/file-type settings persistence.
- `apps/api/src/services/workflow-runtime.ts`: workflow import/activation/action execution.
- `apps/api/src/services/workflow-debugger.ts`: backend debugger controls/snapshots.
- `apps/worker/src/index.ts`: background job execution.
- `apps/desktop/src/App.tsx`: desktop UI shell/pages.
- `apps/desktop/src/styles.css`: desktop UI layout/theme.
- `apps/desktop/src-tauri/tauri.conf.json`: strict native dev URL and Tauri config.

## 7. Commands

Use Node `22.14.0` and npm `10.9.x`.

- Install dependencies when needed: `npm install`
- Full verification: `npm run verify`
- Typecheck: `npm run typecheck`
- Tests: `npm test`
- Build: `npm run build`
- DB migrations: `npm run db:migrate`
- Desktop web dev: `npm run dev:desktop`
- API dev: `npm run dev:api`
- Worker dev: `npm run dev:worker`
- Native Tauri dev: `npm run tauri:dev -w @memo-capture/desktop`
- Native `.app` build: `npm run tauri:build -w @memo-capture/desktop -- --bundles app`

Known local ports:

- Browser-only desktop dev URL: Vite default `http://localhost:5173` unless Vite prints another port.
- AppLauncher local web URL: `http://127.0.0.1:5177`.
- Tauri desktop dev URL: strict `http://127.0.0.1:5178`.
- API port: `MEMO_CAPTURE_API_PORT`, default `4788`.

Before adding or changing local ports, check `/Users/paulmarshall/Software Development/All Standards/local-port-registry.md` and run:

```bash
python3 "/Users/paulmarshall/Software Development/All Standards/scripts/check-local-port-registry.py"
```

## 8. Suggested Next Steps

1. Review and commit the media/parser settings implementation and delete-control refinement if acceptable.
2. Run a native Tauri smoke of Settings and watched-folder import if the next step touches OS-integrated ingestion.
3. Pick the next V1 vertical slice. The most useful next implementation target is likely the direct create-memo UI because the backend route exists and it closes a visible product gap.
4. For create-memo UI, inspect `apps/api/src/server.ts`, `apps/api/src/services/form-memos.ts`, `apps/desktop/src/App.tsx`, and `docs/specs/mvp-implementation-plan.md` before editing.
5. Run focused desktop typecheck/build during UI work, then `npm run verify` when the slice is complete.
6. Use Chrome for browser-testable surfaces and native Tauri validation for watched-folder or OS-integrated behavior.
