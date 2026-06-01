# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-01T19:48:37Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: original watched-file timestamp provenance and work item display.

### Checkpoint Status

- Git HEAD: `3e4a827`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/db/migrations/0015_original_file_modified_at.sql`
  - `apps/api/src/repositories/import-upload-sessions.ts`
  - `apps/api/src/repositories/rows.ts`
  - `apps/api/src/repositories/source-memos.ts`
  - `apps/api/src/repositories/work-items.ts`
  - `apps/api/src/services/diagnostics.ts`
  - `apps/api/src/services/imports.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/tag-suggestions.test.ts`
  - `apps/desktop/src/App.tsx`
  - `packages/domain/src/index.ts`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/completed-tasks.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `AGENTS.md`
  - `package.json`
  - `apps/api/db/migrations/0015_original_file_modified_at.sql`
  - `apps/api/src/services/imports.ts`
  - `apps/api/src/repositories/work-items.ts`
  - `apps/desktop/src/App.tsx`
  - `docs/completed-tasks.md`
  - `handoff.md`
- Last verification:
  - command: `npm run typecheck`; `npm test`; `npm run build`; `npm run verify`; `npm run db:migrate`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-01T19:44Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty files, source/API/UI changes, docs updates, tests, full verification, and app-only native rebuild are recorded here. No handoff freshness helper scripts exist in this repo, so freshness was checked manually.
- Next checkpoint action: review the dirty timestamp slice, run live native smoke if desired, then commit if acceptable.

## 2. Executive Summary

Memo Capture now captures the source file modified timestamp for watched-folder imports and displays that original memo time in the work queue and detail header instead of workflow `updated_at`. Existing filename-stamped watched imports have a follow-up migration that recovers original memo times from `YYYYMMDD HHMMSS` filename prefixes.

The API still keeps `createdAt` and `updatedAt` for concurrency, audit, diagnostics, and workflow processing. Processing timestamps remain in diagnostics/audit/log surfaces, while user-facing work item rows prioritize the original source memo time.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: finish and checkpoint the original memo timestamp implementation.

Intended finished state:

- Watched import upload sessions require `originalFileModifiedAt`.
- Source memo provenance stores `original_file_modified_at`.
- Work item API responses include `originalFileModifiedAt`.
- Work item lists sort by original source time first, then work item creation time.
- Work queue rows and the detail panel show the original memo time, not workflow update time.
- Native `.app` is rebuilt after the user-facing desktop change.

Definition of done:

- Migration, backend propagation, frontend display, focused tests, docs, and handoff are reviewed.
- Local databases are migrated before live smoke or app use.
- Commit is made only if explicitly requested.

## 4. Current State

### Working

- Migration `0015_original_file_modified_at.sql` adds nullable `original_file_modified_at` to `source_memos`, `import_upload_sessions`, and `import_events`, backfills existing source memos from `created_at`, and indexes source memo original file time.
- Migration `0016_backfill_original_file_time_from_filename.sql` corrects existing watched imports whose filenames start with `YYYYMMDD HHMMSS`, such as `20230726 205704-C846C071.m4a`, so pre-provenance rows no longer show ingestion time when the filename contains the original memo time.
- `ImportService.createUploadSession` validates `originalFileModifiedAt` as a date-time string and stores it in upload sessions and duplicate import events.
- Watched text, watched audio, and unsupported-parser finalization store the timestamp on source memos and import events.
- `WorkItemRepository.list` and `findById` join source memos and expose `originalFileModifiedAt` on work item responses.
- Work item list ordering is now `source_memos.original_file_modified_at desc nulls last`, then `work_items.created_at desc`.
- The desktop app normalizes `candidate.modifiedAt` to an ISO date-time before sending it as `originalFileModifiedAt`, because the native scanner currently returns epoch milliseconds.
- The work queue row date and detail header now display `originalFileModifiedAt ?? createdAt`; the detail metadata section includes `Original file time`.
- The rebuilt app bundle exists at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

### Partially Working

- Local Postgres has been migrated through `0015_original_file_modified_at`; other databases still need `npm run db:migrate` before the running API can use the new columns.
- Existing source memos backfill to their source memo `created_at`, not the historical filesystem timestamp, because that old metadata was not previously persisted.
- Form-created source memos and future non-file sources can keep `originalFileModifiedAt` null; UI falls back to work item creation time.

### Not Working Yet

- Filename timestamp parsing is intentionally out of scope.
- Embedded media metadata, EXIF-style extraction, and source-created-time extraction are intentionally out of scope.
- The implementation does not move workflow processing timestamps into a new UI log surface; it preserves existing audit/diagnostic/log surfaces.

### Not Yet Verified

- Live native watched-folder smoke against a migrated local Postgres database after this exact change.
- Visual confirmation in the running native app that a newly imported file row shows its filesystem modified time.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Apply `engineering-project-standard` for repo maintenance, schema, docs, and verification work.
- Apply `web-app-design-standard` for browser-rendered UI changes.
- Use Chrome for browser automation unless the user asks otherwise.
- For Memo Capture user-facing/native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- AI output consumed by code must be structured JSON and validated before storage.
- CSV export remains out of scope for V1.

## 6. Commands and Verification

Use Node `22.14.0` and npm `10.9.x` for project commands.

Passed in this timestamp slice:

```bash
npm run typecheck
npm test
npm run build
npm run verify
npm run db:migrate
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Verification notes:

- The first sandboxed `npm test` failed only because API route tests could not bind `127.0.0.1` (`listen EPERM`).
- Unsandboxed `npm test` passed.
- Unsandboxed `npm run verify` passed.
- Sandboxed `npm run db:migrate` failed because `tsx` could not create its IPC pipe; unsandboxed `npm run db:migrate` applied `0015_original_file_modified_at` and skipped `0001` through `0014`.
- App-only Tauri build passed and produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

Recommended before live app smoke:

```bash
./scripts/applauncher-native-dev.sh
```

Handoff helper status:

- `scripts/handoff_status.py` is absent.
- `scripts/verify_handoff_freshness.py` is absent.
- Freshness was checked manually with Git status, short HEAD, dirty file list, and claimed canonical file existence.

## 7. Files to Open First

- `AGENTS.md`: repo-local constraints and runtime notes.
- `handoff.md`: this hot-context checkpoint.
- `apps/api/db/migrations/0015_original_file_modified_at.sql`: schema change and backfill.
- `apps/api/src/services/imports.ts`: upload-session request validation and timestamp propagation.
- `apps/api/src/repositories/work-items.ts`: API join, response mapping, and ordering.
- `apps/desktop/src/App.tsx`: watched import payload and work queue/detail display.
- `docs/completed-tasks.md`: append-only completed work ledger.

## 8. Next Actions

Next:

- Review the dirty timestamp diff.
- Start the native runtime and import one watched file with a known modified timestamp to visually confirm queue/detail display.
- Commit the timestamp slice if accepted.

Blocked:

- Live app smoke is blocked until the native app/API/worker are running.

Later:

- Decide whether future sources need richer original timestamp extraction from filenames or embedded media metadata.
- Consider a diagnostics UI enhancement if workflow processing timestamps need a more prominent non-primary surface.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Review `AGENTS.md`, `apps/api/db/migrations/0015_original_file_modified_at.sql`, `apps/api/src/services/imports.ts`, `apps/api/src/repositories/work-items.ts`, `apps/desktop/src/App.tsx`, and `docs/completed-tasks.md` first. Treat the original-file timestamp implementation as complete but dirty at HEAD `3e4a827`; local Postgres has migration `0015` applied, and do not commit unless explicitly asked.
