# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-04T02:26:55Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: split Settings into provider-instance catalog plus task-owned routing/prompt configuration.

### Checkpoint Status

- Git HEAD: `cc7c611`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/postgres/integration.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/settings-and-audit.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0022_split_provider_catalog_and_task_settings.sql`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `apps/api/db/migrations/0022_split_provider_catalog_and_task_settings.sql`
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/postgres/integration.test.ts`
  - `apps/desktop/tests/app-copy.test.ts`
- Last verification:
  - command: `node --test --import tsx --test-name-pattern "settings summary|AI task" apps/api/tests/backend-foundation.test.ts`; `npm run test -w @memo-capture/desktop`; `npm run typecheck`; `npm test`; `npm run test:postgres`; `npm run verify`; `git diff --check`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-04T02:26:55Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty/untracked files, changed docs, passed full repo verification, passed isolated Postgres migration lane, and rebuilt native app are all recorded here.
- Next checkpoint action: review the dirty diff and commit only if explicitly requested.

## 2. Executive Summary

Memo Capture Settings now separates provider instances from task configuration.

Complete now:

- Providers page is catalog-only: named provider instances, kind, adapter, enabled state, health/secret/runtime status, and capability labels.
- New Tasks page owns task kinds, derived task-key creation, registered/custom hook selection, route provider filtering, route enablement, readiness reasons, and prompt editing for prompt-backed task kinds.
- Backend settings now return task kinds, provider capabilities, registered task hook metadata, and task-owned prompt summaries.
- `ai_task_routes.enabled` is enforced server-side: enabling a route requires implemented hook logic, compatible enabled provider/capability, required secret readiness, and runtime provider match.
- Existing prompt history is preserved by linking the memo-expansion task to the existing `work_item_expansion` prompt definition.
- Native `.app` bundle was rebuilt at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: finish the provider/task Settings split and leave the repo ready for review or commit.

Intended finished state:

- Provider catalog rows represent provider instances.
- Task kinds define routing compatibility and prompt support.
- Task routes filter compatible providers and cannot be enabled unless executable.
- Prompt controls live on task rows, not a standalone AI Prompts page.
- Verification covers API behavior, migration/Postgres preservation, desktop copy expectations, full repo build/test, and native app rebuild.

Definition of done: met.

## 4. Current State

### Working

- Migration `0022_split_provider_catalog_and_task_settings` adds `task_kinds`, `provider_capabilities`, `ai_task_definitions.task_kind_id`, and `ai_task_definitions.prompt_definition_id`.
- Seeded task kinds include `llm`, `ocr`, `stt`, and `tts`; only active/enabled kinds are selectable in the UI.
- Provider capability backfill marks LLM providers as `structured-generation`, transcription providers as `speech-to-text`, OCR providers as `ocr`, and TTS providers as `text-to-speech`.
- Settings summary serializes provider capabilities, task kinds, registered task hooks, and task-owned prompt summaries.
- `POST /api/settings/ai-tasks` derives `taskKey` from `displayName`, rejects duplicate derived keys with conflict details, and creates a task-owned prompt for prompt-backed task kinds.
- `PATCH /api/settings/ai-tasks/{taskDefinitionId}/route` rejects enabled routes when the hook is unimplemented, the selected provider is incompatible or disabled, a required secret is absent, or runtime provider selection does not match Settings.
- Desktop Settings nav is now: Watched folders, File types, Suppressed Tags, Providers, Tasks, Export contract, Operations, Diagnostics.
- Providers page no longer contains task routing or prompt controls.
- Tasks page shows task kinds, add-task form with read-only derived key preview, compatible provider selectors, route readiness, and per-task prompt editor.

### Partially Working

- Only `memo-expansion` is treated as an implemented app-owned AI task hook.
- Custom task hooks can be created and shown, but remain disabled/not implemented until app code registers real logic.
- OCR/STT/TTS task-kind rows exist for routing compatibility, but new task handlers still need separate implementation.

### Not Working Yet

- No new OCR or TTS processing handler was added in this slice.
- No live Chrome/native visual smoke was run after the Settings UI rewrite; static desktop tests and native build passed.

### Not Yet Verified

- Handoff helper scripts `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent from this checkout, so helper-based freshness verification could not be run.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Backend settings are canonical; watched-folder/archive paths remain desktop-local.
- Desktop clients must not connect directly to Postgres or object storage.
- AI output consumed by code must be structured JSON and validated before storage.
- Secrets must not be stored in Memo Capture DB or AppLauncher runtime options.
- Provider catalog rows are named provider instances and may coexist by kind.
- Task kinds own provider kind/capability compatibility and whether prompt fields apply.
- User-created/custom hooks remain `Not implemented` and cannot enable routes until app logic exists.
- For native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Passed in this session:

```bash
node --test --import tsx --test-name-pattern "settings summary|AI task" apps/api/tests/backend-foundation.test.ts
npm run test -w @memo-capture/desktop
npm run typecheck
npm test
npm run test:postgres
npm run verify
git diff --check
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Verification notes:

- A broader sandboxed API test attempt initially hit expected route-test `listen EPERM`; rerunning `npm test` with local bind permission passed.
- `npm run test:postgres` reset and migrated only isolated database `memo_capture_test`, including migration `0022`.
- Native app build output: `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are not present, so handoff freshness is manually grounded from Git status and verification output.

Useful next commands:

```bash
git status --short --branch
git diff --check
npm run verify
npm run test:postgres
```

## 7. Files to Open First

- `docs/plans/Split Providers and Task Settings.md`: accepted implementation scope.
- `apps/api/db/migrations/0022_split_provider_catalog_and_task_settings.sql`: schema and seed changes for task kinds/provider capabilities/prompt links.
- `apps/api/src/repositories/settings.ts`: task-kind, provider-capability, task-route, and prompt repository queries.
- `apps/api/src/services/settings.ts`: settings serialization, derived task-key creation, route readiness enforcement, and task-owned prompt creation.
- `apps/desktop/src/App.tsx`: Settings nav, Providers catalog page, Tasks page, compatible provider filtering, and task prompt editor.
- `apps/api/tests/backend-foundation.test.ts`: focused API/service coverage for task settings behavior.
- `apps/api/tests/postgres/integration.test.ts`: migration/Postgres coverage for multiple providers and prompt preservation.
- `apps/desktop/tests/app-copy.test.ts`: static desktop expectations for the new Settings split.
- `docs/specs/settings-and-audit.md`: canonical settings/provider/task contract.
- `docs/design/memo-capture-design-learnings.md`: design-level provider/task/prompt decisions.

## 8. Next Actions

Next:

- Review the dirty diff.
- Commit only if explicitly requested.

Later:

- Add actual handlers for non-`memo-expansion` task hooks when their product behavior is defined.
- Add live Chrome or native UI smoke coverage if further Settings interaction behavior changes.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `cc7c611` with a dirty tree implementing the Split Providers and Task Settings plan. Open `docs/plans/Split Providers and Task Settings.md`, `apps/api/db/migrations/0022_split_provider_catalog_and_task_settings.sql`, `apps/api/src/repositories/settings.ts`, `apps/api/src/services/settings.ts`, `apps/desktop/src/App.tsx`, and `docs/specs/settings-and-audit.md` first. Preserve the key boundary: Providers is a provider-instance catalog; Tasks owns task kinds, hook readiness, provider routing, route enablement, and prompt editing. Do not commit unless the user explicitly asks.
