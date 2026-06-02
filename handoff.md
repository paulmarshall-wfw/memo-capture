# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-02T06:42:15Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: watched-folder contributor attribution, dense watched-folder Settings layout, verification, native app rebuild, completed-task ledger update.

### Checkpoint Status

- Git HEAD: `955f0d1`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/catalog.ts`
  - `apps/api/src/repositories/import-upload-sessions.ts`
  - `apps/api/src/repositories/source-memos.ts`
  - `apps/api/src/services/imports.ts`
  - `apps/api/src/services/transcription.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/completed-tasks.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/settings-and-audit.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0019_watched_folder_contributor_key.sql`
  - `docs/plans/Watched-Folder_Contributor_Attribution.md`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/plans/Watched-Folder_Contributor_Attribution.md`
- Last verification:
  - command: `npm run typecheck`; `npm test`; `npm run build`; `npm run verify`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`; `git diff --check`; `curl -sSI http://127.0.0.1:5173/`
  - result: passed
  - timestamp UTC: 2026-06-02T06:39Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty/untracked file list, completed-task ledger entry, verification commands, Vite availability check, and native `.app` rebuild are recorded here. This repo lacks `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py`, so freshness was checked manually with Git facts and file state.
- Next checkpoint action: apply migration `0019` to the target local database, then native-smoke a watched-folder import with contributor attribution; commit only if explicitly requested.

## 2. Executive Summary

Watched-folder contributor attribution is implemented in the dirty tree. Each desktop-local watched-folder row now has a `Contributor name` field, and watched imports pass that value to the backend upload-session contract as `contributorText`.

The backend now maintains a hidden normalized `contributors.contributor_key` for watched-folder attribution. The visible contributor name remains the user-facing value, while the normalized key is internal and derived by trimming, lowercasing, and removing non-alphanumeric characters. Watched import finalization finds or creates a contributor by that key, stores contributor text and UUID linkage on source memos, and stores the same contributor data on created work items. Audio imports carry the contributor on the source memo and post-transcription/recoverable audio work items inherit it.

The Settings watched-folder section was tightened into a dense table-like grid with a compact status strip, contributor field, watched path, archive path, recursive/enabled toggles, stability field, and icon actions.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: preserve a current handoff for the completed watched-folder contributor attribution implementation so the next session can apply the migration and smoke-test the native import path without reopening settled design choices.

Definition of done for this workstream:

- Each watched folder has one contributor name field.
- Imported files use the watched folder contributor name as work-item contributor text.
- A hidden normalized contributor key links punctuation/case variants to one contributor record.
- Existing UUID `contributor_id` columns remain canonical links.
- Audio-created work items inherit contributor data from their source memo.
- Watched-folder Settings information is denser and still accessible.
- Automated verification and native `.app` rebuild pass.

## 4. Current State

### Working

- `apps/api/db/migrations/0019_watched_folder_contributor_key.sql` adds `contributors.contributor_key`, backfills it from display names, creates a partial unique index, and adds `import_upload_sessions.contributor_text`.
- `apps/api/src/repositories/catalog.ts` normalizes contributor keys and upserts watched-folder contributors without exposing the key in the UI/API response.
- `apps/api/src/repositories/import-upload-sessions.ts` persists contributor text through upload sessions.
- `apps/api/src/services/imports.ts` parses optional `contributorText`, resolves contributors during watched import finalization, and writes contributor text/ID to source memos and work items.
- `apps/api/src/repositories/source-memos.ts` now reads source memo contributor text/ID so downstream services can inherit it.
- `apps/api/src/services/transcription.ts` passes source memo contributor data into audio recovery/transcription-created work items.
- `apps/desktop/src/App.tsx` adds `contributorName` to watched-folder settings, defaults old localStorage rows to `""`, and sends trimmed contributor text during upload-session creation.
- `apps/desktop/src/App.tsx` and `apps/desktop/src/styles.css` render watched folders as a dense table-like grid with compact metadata.
- `apps/api/tests/backend-foundation.test.ts` covers text contributor attribution, empty contributor names, punctuation/case normalization reuse, audio source memo attribution, and audio work-item inheritance.
- `apps/desktop/tests/app-copy.test.ts` asserts the contributor field and dense watched-folder UI hooks.
- Specs updated:
  - `docs/specs/ingestion-and-artifacts.md`
  - `docs/specs/settings-and-audit.md`
- Native app bundle rebuilt at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

### Partially Working

- The feature is verified by automated tests/build and the app bundle is rebuilt, but migration `0019` has not yet been applied to a live local Postgres database in this session.

### Not Working Yet

- No known code blocker remains.

### Not Yet Verified

- Live native watched-folder import with a configured contributor name after applying migration `0019`.
- Visual screenshot automation of the dense watched-folder UI; Playwright was unavailable in the Node REPL environment. A Vite availability check returned `HTTP 200 OK`.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Apply `engineering-project-standard` for repo maintenance and verification work.
- Apply `web-app-design-standard` for browser-rendered/Tauri UI changes.
- Use Chrome for browser automation unless the user asks otherwise.
- For Memo Capture user-facing/native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings and canonical contributor records are backend-owned; watched-folder paths, archive paths, and watched-folder contributor names are desktop-local settings.
- V1 contributor attribution is memo metadata, separate from authenticated user identity.
- The normalized contributor key is internal only and must not be displayed in the UI.

## 6. Commands and Verification

Passed in this slice:

```bash
npm run typecheck
npm test
npm run build
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
curl -sSI http://127.0.0.1:5173/
```

Verification notes:

- Initial sandboxed `npm test` failed only because protected-route tests could not bind `127.0.0.1` (`listen EPERM`); the approved unsandboxed rerun passed.
- Initial sandboxed `npm run dev:desktop` failed with `listen EPERM`; the approved unsandboxed Vite run served `http://127.0.0.1:5173/` and `curl -sSI` returned `HTTP/1.1 200 OK`.
- Playwright was unavailable in the Node REPL environment, so no automated screenshot was captured.
- `npm run verify` passed and included doctor, typecheck, tests, and build.
- `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt the runnable `Memo Capture.app`.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent in this repo; handoff freshness was checked manually.

Useful next commands:

```bash
npm run db:migrate
npm run tauri:dev
git status --short
git diff --check
```

## 7. Files to Open First

- `AGENTS.md`: repo-local constraints and verification expectations.
- `docs/plans/Watched-Folder_Contributor_Attribution.md`: implementation plan for this workstream.
- `apps/api/db/migrations/0019_watched_folder_contributor_key.sql`: pending schema change to apply.
- `apps/api/src/repositories/catalog.ts`: contributor key normalization and watched-folder contributor upsert.
- `apps/api/src/services/imports.ts`: upload-session parsing and watched import contributor attribution.
- `apps/api/src/services/transcription.ts`: audio work-item contributor inheritance.
- `apps/desktop/src/App.tsx`: watched-folder contributor field, upload payload, and dense Settings markup.
- `apps/desktop/src/styles.css`: dense watched-folder layout and mobile fallback.
- `docs/completed-tasks.md`: append-only completed work ledger.

## 8. Next Actions

Next:

- Run `npm run db:migrate` against the intended local Postgres database to apply `0019_watched_folder_contributor_key.sql`.
- Launch the native app and smoke-test:
  - add or edit a watched folder with a contributor name
  - import a watched text file and confirm the resulting work item shows that contributor name
  - import/recover an audio file and confirm the audio-created work item inherits the same contributor
  - confirm punctuation/case variants reuse one contributor record internally
- Review the dirty diff, including the untracked plan file.
- Commit only if explicitly requested.

Blocked:

- None.

Later:

- Add visual/browser screenshot coverage once a browser automation path with Playwright or Chrome tooling is available in the environment.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Review `AGENTS.md`, `docs/plans/Watched-Folder_Contributor_Attribution.md`, `apps/api/db/migrations/0019_watched_folder_contributor_key.sql`, `apps/api/src/repositories/catalog.ts`, `apps/api/src/services/imports.ts`, `apps/api/src/services/transcription.ts`, `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, and `docs/completed-tasks.md` first. Treat watched-folder contributor attribution and the dense watched-folder Settings layout as implemented and verified in the dirty tree at HEAD `955f0d1`. Continue by applying migration `0019`, smoke-testing the native import path with configured contributor names, and distinguishing confirmed runtime behavior from any new recommendations.
