# MVP Implementation Plan

Status: Draft implementation plan
Last updated: 2026-05-30

## Purpose

Define the build sequence for the Memo Capture MVP. This plan keeps implementation ordered around vertical slices and preserves the V1 architecture decisions.

## Build Mode Boundary

This plan is Build Mode only.

Do not:

- publish images
- tag releases
- create GitHub releases
- deploy infrastructure
- use unnumbered floating versions
- add unnumbered versions
- weaken project instructions

## Milestone 0: Spec And Schema Alignment

Goals:

- Generate this spec set.
- Compare bootstrap migration with target V1 schema.
- Create migration plan from current `0001_initial.sql` to target schema.
- Add missing domain constants and shared TypeScript types.

Acceptance:

- Specs exist under `docs/specs/`.
- Target schema differences are explicit in `docs/specs/schema-alignment.md`.
- Shared domain constants/types cover the first backend schema/API contract.
- Root `npm run verify` passes or blockers are documented.

## Milestone 1: Backend Foundation

Goals:

- Add database client and migration runner.
- Add repository/service structure for users, projects, feature groups, contributors, source memos, work items, artifacts, audit events, and jobs.
- Add request IDs and protected API route skeleton.
- Add local-dev auth mode and OIDC validation boundary.

API:

- health/version remain available
- current session
- project/feature group/contributor CRUD
- work item list/detail
- form memo creation

Acceptance:

- Local-dev auth creates fixed development app user.
- Form submission creates `source_memo` and `work_item` in `memo`.
- Audit events are written for create/update operations.
- Tests cover repository/service basics.

## Milestone 2: Workflow Runtime Operations

Goals:

- Implement workflow active/staged tables.
- Implement workflow runtime adapter boundary.
- Add Operations API for import, validation, staging, and activation.
- Add bucket metadata endpoint.
- Add allowed actions and execute action endpoints.

Acceptance:

- Operations can import, validate, stage, and explicitly activate workflow bundle.
- Invalid bundles are rejected with actionable errors.
- Work queue buckets come from active workflow metadata.
- Lifecycle actions execute through generic backend endpoint.
- Accepting an item creates immutable accepted snapshot.

## Milestone 3: Work Queue UI Vertical Slice

Goals:

- Replace placeholder UI with API-backed work queue.
- Three-pane layout: buckets, item list, detail panel.
- Explicit edit/save with optimistic concurrency.
- Runtime-backed actions.
- Ingestion review required-field recovery.

Acceptance:

- Work item appears in workflow-defined queue/bucket UI.
- Detail panel supports save.
- Stale save shows conflict and does not overwrite newer data.
- Visible actions come from backend/runtime.
- Chrome verification covers desktop viewport behavior.

## Milestone 4: Export Vertical Slice

Goals:

- Implement accepted snapshot listing.
- Implement export batch creation.
- Implement export job generation for Markdown and JSON Lines.
- Store durable export artifacts.
- Add Export view.

Acceptance:

- Export view lists accepted snapshots with default checked state.
- User can create export batch from selected snapshots.
- Worker writes manifest, JSONL, per-item Markdown, combined Markdown, and bundle.
- Download requires authentication.
- Export golden/structure tests pass.

## Milestone 5: Processing Jobs And Diagnostics

Goals:

- Implement worker job claim/lease/retry/cancel.
- Add global Jobs diagnostics view.
- Add item-level diagnostics.
- Add provider health/status visibility.

Acceptance:

- Jobs are claimed without double-processing.
- Retry and cancel are audited.
- Failed recoverable jobs show sanitized error and internal detail.
- System diagnostics shows API, worker, DB, object storage, auth, app version, commit SHA, active workflow, and export schema.

## Milestone 6: Watched Text Ingestion

Goals:

- Implement desktop watched-folder settings and local persistence.
- Implement file stability checks.
- Implement upload session/finalize API.
- Implement managed artifact metadata and archive move.
- Implement text extraction/classification path.

Acceptance:

- Supported text files become source memos and work items.
- Unsupported files appear only in local diagnostics.
- Exact duplicate file import creates duplicate import event and no new work item.
- Archive happens only after managed artifact confirmation.
- Archive move failure records warning and preserves successful import.

## Milestone 7: Watched Audio Ingestion And Transcription Recovery

Goals:

- Add audio watched-folder support.
- Add transcription job provider boundary.
- Store transcript text and derived transcript artifact.
- Add audio playback in detail panel.
- Add manual transcript/body recovery for failed transcription.

Acceptance:

- Supported audio files become source memos and work items.
- Transcription jobs retry according to settings.
- Failed transcription remains recoverable in ingestion review.
- User can play source audio and manually enter transcript/body.

## Milestone 8: AI Expansion

Goals:

- Add prompt definitions/versions UI or backend-configured seed path.
- Add LLM provider abstraction.
- Add structured output validation.
- Add `ai_suggestions`.
- Add accept/dismiss suggestion flows.

Acceptance:

- AI expansion creates validated pending suggestions.
- Invalid output creates diagnostics and no suggestion/work-item records.
- Accepting suggestion creates `source_memo` with `source_type = ai_generated` and work item in `memo`.
- Dismissing suggestion does not create a work item or mutate workflow state.

## Milestone 9: Hardening And V1 Readiness

Goals:

- Finish settings surfaces.
- Add audit list/filter API.
- Add operational docs for backups, restores, provider config, and NAS/self-hosted profile.
- Add integration verification commands for Postgres and S3-compatible storage.
- Complete scripted manual verification for desktop watchers.

Acceptance:

- `npm run verify` is fast and deterministic.
- Integration checks are separately runnable.
- Operator responsibilities are documented.
- All V1 destructive actions remain absent.
- Decision log has no open blocker for MVP.

## Low-Fidelity UI Inventory

Work queue:

- Sidebar buckets from workflow metadata.
- List filters for project, feature group, contributor, tags, date range, export status, workflow state, and search.
- Detail panel with editable title/body/project/feature group/contributor/tags.
- Source/provenance block.
- Runtime-backed workflow action area.
- AI expansion area where allowed.
- Audio playback when source memo has audio artifact.

Settings:

- Projects.
- Feature groups.
- Contributors.
- File types.
- Providers.
- Prompts.
- Export templates.
- Desktop local paths.

Operations:

- Workflow import.
- Validation result.
- Staged bundle status.
- Explicit activation.
- Active workflow status.

Diagnostics:

- Global Jobs.
- Item diagnostics.
- System diagnostics.

Export:

- Accepted snapshot filters.
- Checkbox selection.
- Select all current filtered result set.
- Batch status.
- Download links.

## Verification Strategy

Default:

```bash
npm run verify
```

Additional explicit commands to add later:

- Postgres integration tests.
- S3-compatible object storage integration tests.
- Desktop watcher verification script.
- Export golden tests.
- Workflow fixture validation tests.

Report any script that cannot run because dependencies, Rust/Tauri tooling, Postgres, or object storage are unavailable.
