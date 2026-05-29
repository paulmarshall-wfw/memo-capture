# Memo Capture Specification Index

Status: Draft implementation specification
Last updated: 2026-05-30
Source records:

- `docs/design/memo-capture-design-learnings.md`
- `docs/architecture.md`
- `docs/schema-baseline.md`
- `apps/api/db/migrations/0001_initial.sql`
- `packages/domain/src/index.ts`
- `docs/specs/schema-alignment.md`

## Purpose

This specification set converts the current Memo Capture design decisions into implementation-ready technical specs. It is not a PRD and it is not a release plan.

Memo Capture V1 is a cross-platform Tauri desktop app backed by a TypeScript API, a TypeScript worker, Postgres, S3-compatible object storage, OIDC authentication, and State Workflow Runtime integration.

## Reading Order

1. [Domain Model And Schema](domain-model-and-schema.md)
2. [Schema Alignment](schema-alignment.md)
3. [Workflow Runtime Integration](workflow-runtime-integration.md)
4. [Ingestion And Artifacts](ingestion-and-artifacts.md)
5. [Processing Jobs And Diagnostics](processing-jobs-and-diagnostics.md)
6. [Settings And Audit](settings-and-audit.md)
7. [Auth And Security](auth-and-security.md)
8. [Exports](exports.md)
9. [MVP Implementation Plan](mvp-implementation-plan.md)
10. [Decision Log](decision-log.md)

## V1 Product Shape

Memo Capture captures ideas from:

- app form submissions
- watched-folder text files
- watched-folder audio files

Captured material becomes source provenance first, then reviewable work items. Work items are organized by project, optional feature group, tags, and optional contributor attribution, then moved through a workflow-driven lifecycle.

## Runtime Surfaces

Desktop app:

- Tauri + React + TypeScript.
- Owns local watched-folder monitoring, local staging/cache, archive moves, local warnings, token storage, and review UI.
- Never connects directly to Postgres or object storage.

API service:

- TypeScript backend authority.
- Owns canonical domain records, settings, auth, authorization, workflow runtime integration, artifact access, import finalization, exports, audit, and diagnostics.

Worker:

- TypeScript background process.
- Claims Postgres-backed processing jobs.
- Runs transcription, extraction, keyword generation, AI expansion, export generation, and retry/cancel handling.

Storage:

- Postgres stores canonical metadata, workflow state, settings, jobs, audit, and export records.
- S3-compatible object storage stores original artifacts, derived transcripts, export bundles, and large managed files.

## Core Invariants

- Desktop clients do not connect directly to Postgres or object storage.
- Every successful import creates a `source_memo` and a `work_item`.
- Source provenance and editable work item lifecycle are separate.
- Workflow lifecycle changes only happen through runtime-backed actions.
- The frontend must render allowed workflow actions from backend/runtime state, not hardcoded action availability.
- Backend settings are canonical; watched folder and archive paths are desktop-local settings.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export is out of scope for V1.
- V1 has no delete or privacy purge behavior for canonical records or managed artifacts.
- All signed-in users are admins in V1, but authentication is still required.
- Git-derived and runtime-derived version traceability should appear in diagnostics.

## Current Implementation Baseline

The repo is scaffolded, not feature-complete. Current implementation includes:

- npm workspace at version `0.1.0`
- `apps/desktop` placeholder Tauri + React UI
- `apps/api` health, readiness, and version endpoints
- `apps/worker` placeholder startup process
- `packages/domain` constants for workflow states, job kinds, job statuses, file types, and export schema
- `apps/api/db/migrations/0001_initial.sql` bootstrap migration
- `npm run verify` root verification command

The specs describe the target V1 behavior. Some target schema decisions intentionally refine the current bootstrap migration.

## Required Screen Inventory

The first screen is the work queue, not a dashboard.

- Work queue: three-pane layout with workflow buckets, filtered item list, and detail panel.
- Ingestion review bucket: required-field recovery for low-confidence imports.
- Detail panel: edit/save, provenance, diagnostics, audio playback when applicable, workflow actions, and AI expansion controls.
- Export view: accepted snapshots, filters, selection, batch creation, and download links.
- Settings: projects, feature groups, contributors, file type support, confidence thresholds, provider status, prompts, export templates, and desktop-local watched/archive paths.
- Operations: workflow import, validation, staging, explicit activation, active workflow status.
- Jobs diagnostics: global processing job list, retry/cancel actions, sanitized details.
- System diagnostics: auth, API, object storage, Postgres, worker, app version, commit SHA, DB schema, active workflow version, export schema.

## Verification Expectations

Use `npm run verify` as the default repo check after dependencies are installed.

Additional checks will be required as implementation grows:

- Postgres repository/service integration tests for schema behavior.
- Local S3-compatible object storage integration tests for artifacts and exports.
- Workflow bundle validation fixture tests.
- Export golden/structure tests with normalized timestamps and IDs.
- Desktop watched-folder path/state tests plus manual scripted OS watcher verification.
- Chrome verification for UI behavior/layout changes unless a different browser is explicitly requested.
