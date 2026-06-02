# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-02T00:37:00Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: shared `classify_item` flow for watched text and audio imports.

### Checkpoint Status

- Git HEAD: `11dfd33`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/work-items.ts`
  - `apps/api/src/services/imports.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/services/transcription.ts`
  - `apps/api/src/services/workflow-runtime.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/worker/src/index.ts`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `handoff.md`
  - `packages/domain/src/index.ts`
  - `packages/domain/tests/states.test.ts`
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0017_project_classification_threshold.sql`
  - `apps/api/src/services/classification.ts`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Last verification:
  - command: `npm run verify`; `npm run db:migrate`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`; Chrome smoke on `http://127.0.0.1:5173/`
  - result: passed
  - timestamp UTC: 2026-06-02T00:36Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty file list, new untracked files, migration application, tests, build, Chrome smoke, and native `.app` rebuild are recorded here. No handoff freshness helper scripts exist in this repo, so freshness was checked manually.
- Next checkpoint action: review the dirty classifier/import/settings diff, then commit only if explicitly requested.

## 2. Executive Summary

Memo Capture now has a shared `classify_item` workflow-hook path for watched text and watched audio imports. Text imports create a `needs_review` work item immediately, run `classify_item`, and then queue keyword generation. Audio imports create the source memo and transcription job first; a `needs_review` work item is created only after transcription succeeds or after transcription reaches a recoverable final failure.

Automatic promotion from `needs_review` to `memo` now happens through workflow action `review.memo` only when exactly one active project name matches the item text and the match confidence meets the backend Project Config threshold. That threshold defaults to `0.65`, is persisted in `extraction_settings.project_confidence_threshold`, and is editable from the Projects page.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: finish and checkpoint the shared text/audio classification implementation from `docs/plans/Shared_classify_item_Flow_For_Text_And_Audio.txt`.

Definition of done:

- `classify_item` is registered as a supported workflow hook handler.
- Initial-state hooks run for work items created directly in `needs_review`.
- Text and audio use one classifier path.
- Confident single-project matches promote via `review.memo`; ambiguous, low-confidence, or incomplete items remain in `needs_review`.
- Audio finalization does not create a work item before transcription completes.
- Repeated transcription/classifier paths are idempotent against duplicate work items and duplicate promotion attempts.
- Project threshold is configurable in the Project Config UI.
- Docs, tests, migration, and native app bundle are current.

## 4. Current State

### Working

- `SUPPORTED_WORKFLOW_HOOK_HANDLERS` and app capabilities now include `classify_item`.
- `WorkflowRuntimeAdapter.getStateEntryHooks()` exposes active state-entry hooks.
- `apps/api/src/services/classification.ts` contains the shared classifier.
- `classify_item` uses deterministic metadata extraction, requires exactly one active project match, applies the configured project confidence threshold, and executes `review.memo` through workflow runtime action semantics.
- `WorkItemRepository.findFirstBySourceMemoId()` and idempotent `applyClassification()` support retries without duplicate work items or unnecessary updates.
- Watched text import creates `needs_review`, runs `classify_item`, then queues `generate_keywords`.
- Watched audio import creates source memo/artifact/import event plus `transcribe_audio` only; `workItemId` and `initialWorkflowState` are `null` in the finalize response.
- Transcription success creates or updates one audio work item, runs `classify_item`, then queues `generate_keywords`.
- Transcription final `failed` or `exhausted` states create one blank recoverable `needs_review` audio work item and run `classify_item`, which stays not-ready.
- Project Config on the Projects page exposes a slider and number input for auto-promotion confidence.
- Migration `0017_project_classification_threshold.sql` sets the default project threshold to `0.65` and updates existing default `0.7` singleton rows to `0.65`.
- Local database has migration `0017_project_classification_threshold` applied.
- Rebuilt native app bundle exists at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

### Partially Working

- The active workflow must be a bundle that includes the `needs_review` state-entry hook with `handlerKey: "classify_item"` for hook-driven classification to run.
- Existing databases need `npm run db:migrate` before they pick up the new `0.65` default.
- The generic metadata extraction job kind still exists for compatibility, but watched text/audio import now uses `classify_item` plus keyword generation for this flow.

### Not Working Yet

- No new external LLM classifier was added; this is the existing deterministic project-name matcher with stricter promotion semantics.
- Image/PDF ingestion remains future work.

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

Passed in this classifier slice:

```bash
npm run typecheck
npm run test -w @memo-capture/api
npm run test -w @memo-capture/worker
npm run test -w @memo-capture/desktop
npm test
npm run build
npm run db:migrate
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
```

Verification notes:

- Sandboxed API route tests hit expected `listen EPERM` on `127.0.0.1`; unsandboxed `npm run test -w @memo-capture/api`, `npm test`, and `npm run verify` passed.
- Sandboxed `npm run db:migrate` hit expected `tsx` IPC `listen EPERM`; unsandboxed migration applied `0017_project_classification_threshold`.
- Chrome smoke used temporary API and Vite dev servers, opened `http://127.0.0.1:5173/`, navigated to Projects, and confirmed Project Config threshold controls render at `0.65` with no console errors.
- Temporary API/Vite dev servers started for Chrome smoke were stopped before handoff.
- App-only Tauri build passed and produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

Handoff helper status:

- `scripts/handoff_status.py` is absent.
- `scripts/verify_handoff_freshness.py` is absent.
- Freshness was checked manually with Git status, short HEAD, dirty file list, and verification evidence.

## 7. Files to Open First

- `AGENTS.md`: repo-local constraints and runtime notes.
- `handoff.md`: this hot-context checkpoint.
- `docs/plans/Shared_classify_item_Flow_For_Text_And_Audio.txt`: source plan.
- `apps/api/src/services/classification.ts`: shared classifier and promotion gate.
- `apps/api/src/services/imports.ts`: watched text/audio finalization timing.
- `apps/api/src/services/transcription.ts`: audio success/failure work-item creation.
- `apps/api/db/migrations/0017_project_classification_threshold.sql`: threshold migration.
- `apps/desktop/src/App.tsx`: Project Config control.
- `docs/completed-tasks.md`: append-only completed work ledger.

## 8. Next Actions

Next:

- Review the dirty shared-classifier diff.
- Commit the slice if accepted.

Later:

- Run a live watched text/audio file smoke with active workflow `0.2.3` if you want end-to-end runtime evidence against real imports.
- Consider whether the deterministic project matcher should evolve from substring matching to explicit aliases or a controlled keyword model.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Review `AGENTS.md`, `docs/plans/Shared_classify_item_Flow_For_Text_And_Audio.txt`, `apps/api/src/services/classification.ts`, `apps/api/src/services/imports.ts`, `apps/api/src/services/transcription.ts`, `apps/api/db/migrations/0017_project_classification_threshold.sql`, `apps/desktop/src/App.tsx`, and `docs/completed-tasks.md` first. Treat the shared `classify_item` flow as implemented and verified but dirty at HEAD `11dfd33`; local Postgres has migration `0017` applied, and do not commit unless explicitly asked.
