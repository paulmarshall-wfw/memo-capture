# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-04T22:31:39Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: refresh hot continuity state after the Settings task/runtime/hook registry implementation work.

### Checkpoint Status

- Git HEAD: `2f78e9c`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/settings-and-audit.md`
  - `apps/api/db/migrations/0026_generic_llm_runtime_options.sql`
  - `apps/api/db/migrations/0027_processing_hooks_registry.sql`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/server.ts`
  - `apps/desktop/src/App.tsx`
  - `scripts/applauncher-dev.mjs`
  - `scripts/applauncher-native-dev.mjs`
- Last verification:
  - command: `not run in this handoff-only session`
  - result: not run
  - timestamp UTC: unknown
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is recorded, the completed-task ledger already contains the latest Processing Hooks registry entry, and the only intentional working-tree change is this refreshed handoff.
- Next checkpoint action: review `git diff -- handoff.md`; commit only if explicitly requested.

## 2. Executive Summary

The repo is now on `main` at `2f78e9c` after the Settings/runtime cleanup around generic LLM runtime options and configurable Processing Hooks.

Complete now:

- Task routing is separate from AppLauncher LLM runtime selection. AppLauncher exposes generic non-secret LLM runtime selectors rather than task-specific runtime options.
- Tasks dispatch by app-owned `hookKey`; multiple task definitions can share one hook.
- Tasks Settings hook controls use registered hook selections, while preserving existing custom hook values.
- Processing Hooks are persisted as Settings-managed registry records with create/delete APIs, status display, and task dropdown backing.
- The latest completed-task ledger entry for `Add configurable Processing Hooks registry` is present.

Incomplete now:

- No new product work is in progress in the working tree.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent, so handoff freshness is checked manually from Git state.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: leave a fresh session with an accurate current checkpoint after the latest Settings/hooks work.

Intended finished state:

- `handoff.md` describes `HEAD` `2f78e9c`.
- The current clean-code checkpoint and this handoff-only dirty tree are explicitly accounted for.
- The completed-task ledger remains the source for completed work history.

Definition of done: update this handoff and verify the resulting dirty tree contains only the handoff refresh.

## 4. Current State

### Working

- Root scripts remain:
  - `npm install`
  - `npm run dev:desktop`
  - `npm run dev:api`
  - `npm run dev:worker`
  - `npm test`
  - `npm run test:postgres`
  - `npm run typecheck`
  - `npm run build`
  - `npm run verify`
- Latest implementation checkpoint is `2f78e9c Add configurable processing hooks registry`.
- Migration `0026_generic_llm_runtime_options` normalizes AI task runtime metadata around generic LLM runtime options.
- Migration `0027_processing_hooks_registry` adds the persisted Processing Hooks registry.
- Settings now exposes Providers, Processing Hooks, and Tasks as separate surfaces.
- Processing Hooks can be created and deleted through Settings APIs/UI, with delete blocked while tasks reference the hook.
- Hook implementation status is derived from backend app code; unimplemented hooks remain default no-ops and must not call providers.
- Launcher scripts include current Settings contract checks to avoid reusing stale APIs.

### Partially Working

- Configurable hooks are registry-backed, but only hooks with backend handlers are implemented behavior. Custom hooks remain no-op until app code registers real logic.
- The local development database status was not rechecked during this handoff-only pass. The last handoff described migrations applied through `0025`; the completed ledger records verification for `0026` and `0027`.

### Not Working Yet

- Handoff helper scripts referenced by the handoff skill are not present in this repo:
  - `scripts/handoff_status.py`
  - `scripts/verify_handoff_freshness.py`

### Not Yet Verified

- No fresh `npm run verify`, `npm run test:postgres`, browser smoke, or native launch was run during this handoff-only refresh.
- The latest ledger entry records that `npm run verify`, `npm run test:postgres`, `npm run build`, and native `.app` rebuild passed for the Processing Hooks registry work.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, install dependencies, or mutate app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Read `docs/design/memo-capture-design-learnings.md` before architecture, schema, workflow, ingestion, AI, or export work.
- Providers are catalog/configuration records. Routing, prompt, readiness, and hook choices belong under Tasks/Processing Hooks, not Providers.
- AppLauncher runtime options are non-secret selectors only. API keys stay in AppLauncher secrets or process environment values.
- Task keys are derived from display names and should not be foregrounded as editable Settings UI.
- Use `npm run test:postgres` for database-sensitive automated checks; it resets `memo_capture_test`, not shared local dev database `memo_capture`.
- For native-testable changes, rebuild the runnable `.app` bundle before handoff; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Most recent implementation verification recorded in `docs/completed-tasks.md` for `2f78e9c`:

```bash
npm run typecheck
npm test
npm run test:postgres
npm run build
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
```

Verification not rerun in this session because this was a handoff-only documentation refresh.

Useful next commands:

```bash
git status --short --branch
git diff -- handoff.md
git diff --check
npm run verify
npm run test:postgres
```

Notes:

- If sandboxed API route tests fail with `listen EPERM`, rerun outside the sandbox before treating the slice as failed.
- If Docker-backed `npm run test:postgres` is denied by sandboxing, rerun outside the sandbox before treating Postgres behavior as unverified.

## 7. Files to Open First

- `handoff.md`: hot current-state context.
- `docs/completed-tasks.md`: completed work ledger; newest entries cover generic LLM runtime options, hook dropdown rationalization, and Processing Hooks registry.
- `docs/design/memo-capture-design-learnings.md`: active product/design rules for workflow, AI tasks, providers, tags, and ingestion.
- `docs/specs/settings-and-audit.md`: Settings contract documentation for providers, tasks, hooks, prompts, and audit.
- `apps/api/db/migrations/0026_generic_llm_runtime_options.sql`: task/runtime normalization checkpoint.
- `apps/api/db/migrations/0027_processing_hooks_registry.sql`: Processing Hooks registry schema.
- `apps/api/src/services/settings.ts`: Settings business rules, task readiness, hook registry behavior.
- `apps/api/src/repositories/settings.ts`: Settings persistence for providers, tasks, processing hooks, and prompts.
- `apps/api/src/services/ai-expansion.ts`: AI task dispatch and generic runtime readiness checks.
- `apps/desktop/src/App.tsx`: Settings UI for Providers, Processing Hooks, Tasks, and runtime status.
- `scripts/applauncher-dev.mjs`: web AppLauncher/dev API reuse contract checks.
- `scripts/applauncher-native-dev.mjs`: native AppLauncher/dev API reuse contract checks.

## 8. Next Actions

Next:

- Review `git diff -- handoff.md`.
- If doing more Settings/hooks work, start by opening the files listed above and keep Providers catalog-only.

Later:

- Run `npm run verify` before any code commit after additional implementation work.
- Run `npm run test:postgres` for any migration, SQL, locking, Settings persistence, or route-readiness change.
- Rebuild `Memo Capture.app` after user-facing or native-testable changes.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `2f78e9c`, with only `handoff.md` intentionally dirty unless Git says otherwise. Check `docs/completed-tasks.md` only for completed work history; do not duplicate it. Open `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, `apps/api/src/services/settings.ts`, `apps/api/src/repositories/settings.ts`, `apps/api/src/services/ai-expansion.ts`, `apps/desktop/src/App.tsx`, and the latest Settings migrations first. Preserve active constraints: Providers stay catalog-only, Tasks own routing/prompt/readiness, Processing Hooks are app-owned registry entries, AppLauncher runtime options are generic non-secret selectors, and custom hooks are no-op until backend app code implements them. Execute next actions in order, distinguish confirmed state from new recommendations, and do not commit unless explicitly asked.
