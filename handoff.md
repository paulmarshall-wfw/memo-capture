# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-04T09:40:24Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: simplify provider and task settings.

### Checkpoint Status

- Git HEAD: `501789e`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `.env.example`
  - `apps/api/src/config.ts`
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/server.ts`
  - `apps/api/src/services/app.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/env.md`
  - `docs/specs/settings-and-audit.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`
  - `"docs/plans/Simplify Providers And Tasks Settings.md"`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/plans/Simplify Providers And Tasks Settings.md`
  - `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`
  - `apps/api/src/config.ts`
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/server.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/specs/settings-and-audit.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/env.md`
- Last verification:
  - command: `npm run typecheck`; `npm test`; `npm run test:postgres`; `npm run build`; `npm run verify`; `git diff --check`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-04T09:40:24Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty/untracked files, completed-task entry, docs, migration, passed verification, and rebuilt native app are recorded here.
- Next checkpoint action: review the dirty diff and commit only if explicitly requested.

## 2. Executive Summary

Providers and Tasks settings have been simplified per `docs/plans/Simplify Providers And Tasks Settings.md`.

Complete now:

- Providers can be created and edited from Settings with non-secret fields: name/key, kind, enabled, external send, endpoint/base URL, model, and required secret env.
- The Tasks Settings UI is one task configuration list; task-kind and capability-key controls are no longer user-facing.
- App-owned hook registry exposes `memo-expansion` as implemented and `revise-memo`, `suggest-new-memos`, and `suggest-tags` as no-op/not implemented choices.
- Task enablement is still server-gated; unimplemented hooks cannot be enabled.
- Task prompt edits update the current prompt configuration in place instead of creating new prompt versions.
- Migration `0024_simplify_provider_task_settings` applies cleanly in the isolated Postgres lane.
- Native `.app` bundle was rebuilt at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: leave simplified Providers and Tasks settings ready for review.

Intended finished state:

- Provider/task configuration is direct.
- There is no user-facing capability-key/task-kind split.
- Prompt edits are in-place.
- Docs, tests, and migration match the new behavior.

Definition of done: met.

## 4. Current State

### Working

- `POST /api/settings/providers` creates provider rows with derived stable provider keys.
- `PATCH /api/settings/providers/{providerConfigId}` edits provider non-secret config.
- `POST /api/settings/ai-tasks` creates tasks from task name, hook key, selected provider, prompts, and enabled state.
- `PATCH /api/settings/ai-tasks/{taskDefinitionId}` edits task metadata, provider route, prompt attachment, and enabled state.
- `PATCH /api/settings/prompts/{promptDefinitionId}/current` updates current prompt content/context without creating a prompt version.
- Settings UI has provider create/edit controls and one consolidated Tasks list.
- `suggest-tags` runtime env docs/config replaced the old selected-tags name for current config.

### Partially Working

- Legacy task-kind/provider-capability tables remain as compatibility storage and internal mapping.
- Only `memo-expansion` has implemented task logic. Other registered hooks are selectable no-ops and cannot be enabled.

### Not Working Yet

- No new `revise-memo`, `suggest-new-memos`, `suggest-tags`, OCR, STT, TTS, or script execution logic was added.

### Not Yet Verified

- No live browser/native click-through was run after the rebuild; automated tests/builds and native bundle rebuild passed.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Backend settings are canonical; watched-folder/archive paths remain desktop-local.
- Desktop clients must not connect directly to Postgres or object storage.
- Secrets must not be stored in Memo Capture DB or AppLauncher runtime options.
- Workflow hooks and workflow runtime behavior are out of scope for this slice.
- Task hooks are app-owned registry entries; no-op hooks must not call providers.
- Task prompt edits in Settings update the current prompt configuration in place.
- For native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Passed in this session:

```bash
npm run typecheck
npm test
npm run test:postgres
npm run build
npm run verify
git diff --check
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Verification notes:

- Sandboxed `npm test` first failed only on API route tests needing local bind access; rerun outside sandbox passed.
- Sandboxed `npm run test:postgres` first failed on Docker socket access; rerun outside sandbox passed.
- `npm run test:postgres` reset and migrated isolated database `memo_capture_test`, including migration `0024`.
- Native app build output: `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

Useful next commands:

```bash
git status --short --branch
git diff --check
npm run verify
npm run test:postgres
```

## 7. Files to Open First

- `docs/plans/Simplify Providers And Tasks Settings.md`: source plan for the implemented slice.
- `docs/completed-tasks.md`: newest completed-task entry.
- `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`: seed/rename migration for simplified task hooks.
- `apps/api/src/services/settings.ts`: provider/task parsing, validation, hook registry, current-prompt update.
- `apps/api/src/repositories/settings.ts`: provider/task/prompt persistence changes.
- `apps/api/src/server.ts`: new provider/task/prompt route wiring.
- `apps/desktop/src/App.tsx`: simplified Providers and Tasks Settings UI.
- `docs/specs/settings-and-audit.md`: canonical updated API/UI behavior.
- `docs/env.md` and `.env.example`: current `SUGGEST_TAGS_*` runtime env names.

## 8. Next Actions

Next:

- Review the dirty diff.
- Commit only if explicitly requested.

Later:

- Implement real app logic for `revise-memo`, `suggest-new-memos`, `suggest-tags`, OCR, STT, TTS, or script tasks when product behavior is defined.
- Run a live UI smoke if another Settings interaction change is made.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `501789e` with a dirty tree implementing simplified Providers and Tasks settings. Open `docs/plans/Simplify Providers And Tasks Settings.md`, `docs/completed-tasks.md`, `apps/api/db/migrations/0024_simplify_provider_task_settings.sql`, `apps/api/src/services/settings.ts`, `apps/api/src/repositories/settings.ts`, `apps/api/src/server.ts`, `apps/desktop/src/App.tsx`, and `docs/specs/settings-and-audit.md` first. Preserve the boundaries: no user-facing capability-key/task-kind split, prompt edits update the current prompt in place, and unimplemented task hooks remain disabled no-ops. Do not commit unless the user explicitly asks.
