# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-05T10:42:23Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: refresh hot continuity state after the task-rendered work-item buttons, AppLauncher native LLM setup, and task prompt system-message work.

### Checkpoint Status

- Git HEAD: `0e204be`
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
  - `docs/specs/index.md`
  - `apps/api/db/migrations/0027_processing_hooks_registry.sql`
  - `apps/api/db/migrations/0028_task_render_locations.sql`
  - `apps/api/db/migrations/0029_prompt_system_message.sql`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/api/src/services/llm.ts`
  - `apps/api/src/server.ts`
  - `apps/desktop/src/App.tsx`
  - `scripts/applauncher-dev.mjs`
  - `scripts/applauncher-native-dev.mjs`
- Last verification:
  - command: `not run in this handoff-only session`
  - result: not run
  - timestamp UTC: unknown
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is recorded, the working tree was clean before this refresh, and the only intentional dirty file is this refreshed handoff.
- Next checkpoint action: review `git diff -- handoff.md`; commit only if explicitly requested.

## 2. Executive Summary

The repo is on `main` at `0e204be Expose task prompt system messages`.

Complete now:

- Processing Hooks are persisted Settings-managed registry records used by Tasks hook selection.
- Tasks can render work-item detail buttons by task metadata, and work-item task execution can dispatch memo expansion by task ID.
- AppLauncher web/native manifests use the generic `llm-runtime` selector; the native saved setup was repaired to use `LLM_PROVIDER=local-dev`.
- Task-owned prompts now expose editable System message fields, persist the value in prompt context config, and use it for OpenAI-compatible requests.
- Migration `0029_prompt_system_message` backfills prompt system-message config.

Incomplete now:

- No product implementation work is currently dirty in this checkout.
- Broad `npm test` was not cleanly rerun for the latest prompt-system-message slice because sandboxed protected-route tests still hit unrelated `listen EPERM 127.0.0.1`; focused changed tests passed.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent, so freshness is grounded manually from Git state.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: leave a fresh session with an accurate current checkpoint for the latest Settings/task prompt work.

Intended finished state:

- `handoff.md` describes `HEAD` `0e204be`.
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
- Latest implementation checkpoint is `0e204be Expose task prompt system messages`.
- `0028_task_render_locations` adds task placement/display-order metadata for detail-panel actions.
- `0029_prompt_system_message` adds task prompt system-message persistence/backfill.
- Tasks Settings owns routing, render placement, prompt text, and prompt System message.
- Providers remain catalog/configuration records, not the place for task routing or prompts.
- Processing Hooks remain app-owned registry entries; unimplemented custom hooks are no-op until backend app code implements them.
- AppLauncher runtime options remain generic non-secret selectors, with runtime values/secrets supplied outside the app repo.

### Partially Working

- Latest AppLauncher setup work includes local artifacts outside this repo: installed manifests/profile state under AppLauncher storage and an AppLauncher code patch. Recheck that repo if the next task depends on launcher behavior.
- Local shared development database state was not rechecked during this handoff-only refresh. `npm run test:postgres` verified isolated Postgres behavior for the latest prompt work.

### Not Working Yet

- Handoff helper scripts referenced by the handoff skill are not present in this repo:
  - `scripts/handoff_status.py`
  - `scripts/verify_handoff_freshness.py`

### Not Yet Verified

- No fresh `npm run verify`, browser smoke, native launch, or local shared-database migration run was performed during this handoff-only refresh.
- Latest ledger entry records changed prompt tests, `npm run typecheck`, `npm run test:postgres`, native `.app` rebuild, and `git diff --check` passed; broad sandboxed `npm test` still hit unrelated protected-route bind failures.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, install dependencies, or mutate app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Read `docs/design/memo-capture-design-learnings.md` before architecture, schema, workflow, ingestion, AI, or export work.
- Providers are catalog/configuration records. Routing, prompt, readiness, hook choices, and render placement belong under Tasks/Processing Hooks, not Providers.
- Task `taskKey` is derived from display name and should not be foregrounded as editable Settings UI.
- AppLauncher runtime options are non-secret selectors only. API keys stay in AppLauncher secrets or process environment values.
- AI output consumed by code must be structured JSON and validated before storage.
- Use `npm run test:postgres` for database-sensitive automated checks; it resets `memo_capture_test`, not shared local dev database `memo_capture`.
- For native-testable changes, rebuild the runnable `.app` bundle before handoff; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Most recent implementation verification recorded in `docs/completed-tasks.md` for `0e204be`:

```bash
node --test --import tsx apps/api/tests/llm-prompt.test.ts
npm run typecheck
npm run test:postgres
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
```

Additional focused API task prompt tests and focused desktop Settings copy tests passed for the latest slice. Broad sandboxed `npm test` still hit unrelated protected-route `listen EPERM 127.0.0.1` failures while changed tests passed.

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
- `docs/completed-tasks.md`: completed work ledger; newest entries cover task-rendered buttons, AppLauncher native LLM setup, and prompt System messages.
- `docs/design/memo-capture-design-learnings.md`: active product/design rules for workflow, AI tasks, providers, tags, and ingestion.
- `docs/specs/settings-and-audit.md`: Settings contract documentation for providers, tasks, hooks, prompts, and audit.
- `docs/specs/index.md`: spec index updated by the task-rendered button work.
- `apps/api/db/migrations/0028_task_render_locations.sql`: task render metadata schema.
- `apps/api/db/migrations/0029_prompt_system_message.sql`: prompt System message schema/backfill.
- `apps/api/src/services/settings.ts`: Settings business rules for tasks, hooks, prompts, render placement, and readiness.
- `apps/api/src/services/ai-expansion.ts`: task dispatch and memo-expansion routing.
- `apps/api/src/services/llm.ts`: prompt/system-message request construction for LLM providers.
- `apps/api/src/server.ts`: task execution and Settings API routes.
- `apps/desktop/src/App.tsx`: Settings UI and work-item detail task button rendering.
- `scripts/applauncher-dev.mjs`: web AppLauncher/dev API reuse contract checks.
- `scripts/applauncher-native-dev.mjs`: native AppLauncher/dev API reuse contract checks.

## 8. Next Actions

Next:

- Review `git diff -- handoff.md`.
- If continuing Settings/task work, start with the files listed above and keep Providers catalog-only.
- If validating the latest prompt work more broadly, rerun broad tests outside sandbox constraints.

Later:

- Run `npm run verify` before any code commit after additional implementation work.
- Run `npm run test:postgres` for any migration, SQL, locking, Settings persistence, prompt persistence, or route-readiness change.
- Rebuild `Memo Capture.app` after user-facing or native-testable changes.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `0e204be`, with only `handoff.md` intentionally dirty unless Git says otherwise. Check `docs/completed-tasks.md` only for completed work history; do not duplicate it. Open `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, `apps/api/src/services/settings.ts`, `apps/api/src/services/ai-expansion.ts`, `apps/api/src/services/llm.ts`, `apps/api/src/server.ts`, `apps/desktop/src/App.tsx`, and the latest Settings/task migrations first. Preserve active constraints: Providers stay catalog-only, Tasks own routing/prompt/readiness/render placement, Processing Hooks are app-owned registry entries, AppLauncher runtime options are generic non-secret selectors, and custom hooks are no-op until backend app code implements them. Execute next actions in order, distinguish confirmed state from new recommendations, and do not commit unless explicitly asked.
