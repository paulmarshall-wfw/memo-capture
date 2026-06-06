# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-06T04:07:37Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: refresh hot continuity state after the ephemeral AI review modal and prompt-default implementation.

### Checkpoint Status

- Git HEAD: `2323968`
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
  - `apps/api/db/migrations/0030_ephemeral_ai_review_prompt_defaults.sql`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/api/src/services/llm.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/server.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
- Last verification:
  - command: `git diff --check`
  - result: passed
  - timestamp UTC: 2026-06-06T04:09:24Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is recorded, the completed implementation is committed at `2323968`, and the only intended dirty file is this handoff refresh.
- Next checkpoint action: review `git diff -- handoff.md`; commit only if explicitly requested.

## 2. Executive Summary

The repo is on `main` at `2323968 Refine memo capture workflow settings and prompt editing`.

Complete now:

- Work-item task output is split into modal-reviewed expanded memo candidates and modal-reviewed suggested work item candidates.
- `memo-expansion` returns an ephemeral expanded memo candidate; accepting it stages generated title/body into the current draft and still requires Save.
- `suggest-new-memos` returns ephemeral suggested work item candidates; task runs no longer create `ai_suggestions` rows for these candidates.
- Accepting a suggested work item creates a normal `memo` work item backed by an `ai_generated` source memo and audit metadata.
- Task prompt controls include hook-aware default System messages and explicit restore-default controls in Settings.
- Migration `0030_ephemeral_ai_review_prompt_defaults` updates prompt defaults and schema expectations for the new AI review behavior.

Incomplete now:

- No product implementation work is currently dirty in this checkout.
- Handoff helper scripts referenced by the handoff skill are absent, so freshness is grounded manually from Git state and file inspection.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: leave the next session with an accurate current checkpoint for the AI review modal and task prompt-default work.

Intended finished state:

- `handoff.md` describes `HEAD` `2323968`.
- The dirty tree is limited to this handoff refresh.
- The completed-task ledger remains the concise history source.

Definition of done: update this handoff, keep the ledger append-only, and verify the resulting diff is mechanically clean.

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
- Latest implementation checkpoint is `2323968 Refine memo capture workflow settings and prompt editing`.
- Processing Hooks are persisted Settings-managed registry records. `memo-expansion` and `suggest-new-memos` are implemented; `revise-memo` and `suggest-tags` remain seeded no-op hooks until backend app code implements them.
- Tasks own routing, render placement, prompt text, prompt System message, readiness, and user-facing button labels.
- Providers remain catalog/configuration records, not the place for task routing or prompts.
- Work-item detail task buttons invoke a specific task definition by id and dispatch through that task's `hook_key`.
- AI output consumed by code is structured JSON and validated before being returned as an ephemeral candidate or accepted into normal records.
- The native `.app` bundle was rebuilt after the latest user-facing changes:
  - `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`

### Partially Working

- The legacy `ai_suggestions` endpoints still exist for pending suggestion records, but the new `suggest-new-memos` task path uses ephemeral modal candidates instead of creating those rows during task runs.
- Local shared development database state was not rechecked during this handoff refresh. Use `npm run db:migrate` only when explicitly validating the local dev database; use `npm run test:postgres` for resettable automated database verification.

### Not Working Yet

- Handoff helper scripts referenced by the handoff skill are not present in this repo:
  - `scripts/handoff_status.py`
  - `scripts/verify_handoff_freshness.py`

### Not Yet Verified

- No new broad test, browser smoke, native launch, or local shared-database migration run was performed for this handoff-only refresh.
- The latest completed-task entry records `npm run verify`, `npm run build`, focused API/desktop tests, broad `npm test` outside sandbox after sandbox bind denial, and native `.app` rebuild as passed.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, install dependencies, or mutate app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Read `docs/design/memo-capture-design-learnings.md` before architecture, schema, workflow, ingestion, AI, or export work.
- Providers are catalog/configuration records. Routing, prompt, readiness, hook choices, and render placement belong under Tasks/Processing Hooks, not Providers.
- Task `taskKey` is derived from display name and should not be foregrounded as editable Settings UI.
- AppLauncher runtime options are non-secret selectors only. API keys stay in AppLauncher secrets or process environment values.
- AI-generated expanded memo and suggested work item content must stay ephemeral until the user accepts it in the review modal.
- Use `npm run test:postgres` for database-sensitive automated checks; it resets `memo_capture_test`, not shared local dev database `memo_capture`.
- For native-testable changes, rebuild the runnable `.app` bundle before handoff; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Most recent implementation verification recorded in `docs/completed-tasks.md` for the current implementation checkpoint:

```bash
npm run typecheck
node --test --import tsx apps/api/tests/llm-prompt.test.ts
npm test
npm run build
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Notes:

- `npm test` passed outside the sandbox after sandboxed route tests hit unrelated `listen EPERM` bind failures.
- `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt the native `.app` bundle.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent, so handoff freshness must be checked manually.

Useful next commands:

```bash
git status --short --branch
git diff -- handoff.md
git diff --check
npm run verify
npm run test:postgres
```

## 7. Files to Open First

- `handoff.md`: hot current-state context.
- `docs/completed-tasks.md`: completed work ledger; latest entry covers ephemeral AI review modals and prompt schema defaults.
- `docs/design/memo-capture-design-learnings.md`: active product/design rules for workflow, AI tasks, providers, tags, and ingestion.
- `docs/specs/settings-and-audit.md`: Settings/API contract for task prompts, processing hooks, AI task routes, and ephemeral review candidates.
- `apps/api/db/migrations/0030_ephemeral_ai_review_prompt_defaults.sql`: prompt default and schema migration.
- `apps/api/src/services/ai-expansion.ts`: implemented task dispatch and ephemeral AI result shaping.
- `apps/api/src/services/llm.ts`: prompt/system-message request construction and structured provider response handling.
- `apps/api/src/services/settings.ts`: task defaults, readiness, hook status, and prompt config rules.
- `apps/api/src/server.ts`: work-item task run and suggested-work-item accept routes.
- `apps/desktop/src/App.tsx`: review modals, task button execution, accept flows, and Settings prompt defaults UI.
- `apps/desktop/src/styles.css`: modal and Settings control styling.

## 8. Next Actions

Next:

- Review `git diff -- handoff.md`.
- If continuing AI task work, start with the files listed above and keep generated candidates ephemeral until explicit user acceptance.

Later:

- Run `npm run verify` before any code commit after additional implementation work.
- Run `npm run test:postgres` for any migration, SQL, locking, Settings persistence, prompt persistence, or route-readiness change.
- Rebuild `Memo Capture.app` after user-facing or native-testable changes.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `2323968`, with only `handoff.md` intentionally dirty unless Git says otherwise. Check `docs/completed-tasks.md` only for completed work history; do not duplicate it. Open `docs/design/memo-capture-design-learnings.md`, `docs/specs/settings-and-audit.md`, `apps/api/src/services/ai-expansion.ts`, `apps/api/src/services/llm.ts`, `apps/api/src/services/settings.ts`, `apps/api/src/server.ts`, `apps/desktop/src/App.tsx`, and `apps/api/db/migrations/0030_ephemeral_ai_review_prompt_defaults.sql` first. Preserve active constraints: Providers stay catalog-only, Tasks own routing/prompt/readiness/render placement, Processing Hooks are Settings-managed registry entries, AppLauncher runtime options are generic non-secret selectors, generated AI review candidates stay ephemeral until explicit user acceptance, and custom hooks are no-op until backend app code implements them. Execute next actions in order, distinguish confirmed state from new recommendations, and do not commit unless explicitly asked.
