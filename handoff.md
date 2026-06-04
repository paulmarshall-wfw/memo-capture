# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-04T05:52:15Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: task-kind creation and enablement readiness in Settings.

### Checkpoint Status

- Git HEAD: `d57dd16`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/server.ts`
  - `apps/api/src/services/app.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/settings-and-audit.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0023_task_kind_enablement_requires_implemented_route.sql`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `apps/api/db/migrations/0023_task_kind_enablement_requires_implemented_route.sql`
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/server.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/tests/app-copy.test.ts`
- Last verification:
  - command: `node --test --import tsx apps/api/tests/backend-foundation.test.ts`; `npm run typecheck -w @memo-capture/desktop`; `npm run test -w @memo-capture/desktop`; `npm run typecheck`; `npm run build -w @memo-capture/desktop`; `npm run test:postgres`; `git diff --check`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`; `python3 '/Users/paulmarshall/Software Development/All Skills/handoff/scripts/handoff_status.py' handoff.md --print-block`; `python3 '/Users/paulmarshall/Software Development/All Skills/handoff/scripts/verify_handoff_freshness.py' handoff.md`
  - result: passed
  - timestamp UTC: 2026-06-04T05:58:40Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty/untracked files, completed-task entry, current docs, passed API/desktop/type/build/Postgres checks, and rebuilt native app are recorded here.
- Next checkpoint action: review the dirty diff and commit only if explicitly requested.

## 2. Executive Summary

Task kinds can now be created before the protected app route exists, but they cannot be enabled until executable app logic exists for that task kind.

Complete now:

- Protected task-kind Settings API routes exist for create and update.
- New task kinds default to disabled.
- Backend rejects `enabled: true` for a task kind unless at least one implemented AI task definition exists for that `kind_key`.
- Existing enabled task kinds without implemented task logic are disabled by migration `0023`.
- Settings UI uses controlled selectors for Provider kind and Capability key rather than free text.
- Task definitions can be drafted against active task kinds, including disabled task kinds, while route/task-kind enablement remains guarded.
- Native `.app` bundle was rebuilt at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: leave the task-kind Settings behavior ready for review.

Intended finished state:

- Users can stage task-kind definitions before app route implementation.
- Users cannot enable task kinds that cannot execute.
- Provider kind and capability are selected from configured provider/task metadata.
- Docs explain the distinction between provider family and specific capability.

Definition of done: met.

## 4. Current State

### Working

- `POST /api/settings/task-kinds` creates task kinds with derived stable `kindKey` values.
- `PATCH /api/settings/task-kinds/{taskKindId}` updates task-kind metadata and availability.
- `task_kind_route_not_implemented` blocks task-kind enablement when no implemented task route exists.
- Migration `0023_task_kind_enablement_requires_implemented_route` disables existing enabled task kinds that lack implemented app logic.
- Provider kinds represented in docs/settings are `llm`, `transcription`, `ocr`, and `tts`.
- Capability keys represent narrower provider abilities such as `structured-generation`, `speech-to-text`, `ocr`, and `text-to-speech`.
- The Settings task-kind form and task-kind rows use selects for Provider kind and Capability key.
- `docs/specs/settings-and-audit.md` documents create/update task-kind API behavior and the enablement guard.

### Partially Working

- Only task kinds with implemented task definitions can be enabled. Today that effectively means the existing `llm`/memo-expansion path.
- OCR, transcription/STT, and TTS task kinds can exist as catalog/routing metadata, but their app-specific protected task logic still needs separate implementation.

### Not Working Yet

- No new OCR, STT, or TTS task execution handler was added in this slice.
- No live native UI interaction smoke was run after the rebuild; the native app bundle was built successfully.

### Not Yet Verified

- No live native UI interaction smoke was run after the rebuild; the native app bundle was built successfully.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Backend settings are canonical; watched-folder/archive paths remain desktop-local.
- Desktop clients must not connect directly to Postgres or object storage.
- AI output consumed by code must be structured JSON and validated before storage.
- Secrets must not be stored in Memo Capture DB or AppLauncher runtime options.
- Provider kind is a controlled provider family, not a free-text runtime string.
- Capability key is the specific provider ability required by the task kind.
- Task-kind creation is allowed before implementation; task-kind enablement is not.
- For native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Passed in this session:

```bash
node --test --import tsx apps/api/tests/backend-foundation.test.ts
npm run typecheck -w @memo-capture/desktop
npm run test -w @memo-capture/desktop
npm run typecheck
npm run build -w @memo-capture/desktop
npm run test:postgres
git diff --check
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Verification notes:

- The first sandboxed `npm run test:postgres` attempt failed because Docker socket access was denied; rerunning with Docker access passed.
- `npm run test:postgres` reset and migrated only isolated database `memo_capture_test`, including migration `0023`.
- Native app build output: `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.
- Native bundle timestamp observed: `2026-06-04T15:50:04+1000`.
- Global handoff verifier scripts ran from `/Users/paulmarshall/Software Development/All Skills/handoff/scripts/`; `verify_handoff_freshness.py handoff.md` reported `fresh-to-dirty-tree`.

Useful next commands:

```bash
git status --short --branch
git diff --check
npm run test:postgres
npm run verify
```

## 7. Files to Open First

- `docs/completed-tasks.md`: newest completed-task entry for this task-kind enablement slice.
- `apps/api/db/migrations/0023_task_kind_enablement_requires_implemented_route.sql`: data migration that disables unsupported enabled task kinds.
- `apps/api/src/services/settings.ts`: task-kind create/update parsing and enablement validation.
- `apps/api/src/repositories/settings.ts`: task-kind persistence and implemented-route readiness query.
- `apps/api/src/server.ts`: protected task-kind route wiring.
- `apps/desktop/src/App.tsx`: controlled Provider kind/Capability key selectors and client-side enablement gating.
- `apps/desktop/src/styles.css`: compact task-kind table/form layout.
- `docs/specs/settings-and-audit.md`: canonical provider kind, capability key, and task-kind API docs.
- `apps/api/tests/backend-foundation.test.ts`: focused service/API coverage for draft task kinds and enablement rejection.

## 8. Next Actions

Next:

- Review the dirty diff.
- Commit only if explicitly requested.

Later:

- Add real protected task logic for OCR, STT, or TTS when product behavior is defined.
- Add live native UI smoke coverage if further Settings interaction behavior changes.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `d57dd16` with a dirty tree implementing draft task-kind creation plus enablement gating. Open `docs/completed-tasks.md`, `apps/api/db/migrations/0023_task_kind_enablement_requires_implemented_route.sql`, `apps/api/src/services/settings.ts`, `apps/api/src/repositories/settings.ts`, `apps/desktop/src/App.tsx`, and `docs/specs/settings-and-audit.md` first. Preserve the key boundary: task kinds can be created before app logic exists, but cannot be enabled until a protected task route is implemented. Do not commit unless the user explicitly asks.
