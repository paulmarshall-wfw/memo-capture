# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-06T10:39:29Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: refresh hot continuity state after workflow definition enforcement hardening and native `.app` rebuild.

### Checkpoint Status

- Git HEAD: `1f574e1`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `docs/completed-tasks.md`
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
  - `docs/specs/workflow-runtime-integration.md`
  - `apps/api/src/services/workflow-runtime.ts`
  - `apps/api/tests/workflow-runtime.test.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`
- Last verification:
  - command: `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-06T10:39:29Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD` is recorded, workflow hardening is committed at `1f574e1`, the native `.app` bundle was rebuilt after that checkpoint, and only continuity docs are intentionally dirty.
- Next checkpoint action: review `git diff -- docs/completed-tasks.md handoff.md`; commit only if explicitly requested.

## 2. Executive Summary

The repo is on `main` at `1f574e1 Harden workflow action visibility and hook validation`.

Complete now:

- Backend workflow action projection and execution share one public-executable predicate.
- Public work-item action execution accepts only actions that are `trigger: "user"`, `visible: true`, no-input, and valid from the current workflow state.
- Hidden user actions and automatic actions are not listed and are rejected even if posted directly by action ID.
- Workflow bundle validation is phase-aware for the V1 executable hook matrix.
- V1 rejects workflow bundles that expose input-required actions until a real input form and handler contract exists.
- The current bundled workflow `0.2.5` validates, stages, activates, executes `failed.review`, `review.memo`, and `memo.accepted`, and supports scheduled `nominate_tags`.
- The macOS Tauri `.app` bundle was rebuilt after the hardening slice.

Incomplete now:

- Only continuity docs are dirty after this refresh.
- Handoff helper scripts referenced by the handoff skill are absent in this repo, so freshness is grounded manually from Git state and file inspection.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: leave the next session with an accurate checkpoint for workflow definition enforcement hardening.

Intended finished state:

- `handoff.md` describes `HEAD` `1f574e1`.
- `docs/completed-tasks.md` has one concise append-only entry for the hardening work.
- The dirty tree is limited to the two continuity docs.

Definition of done: update the ledger and handoff, keep both mechanically clean, and report verification performed.

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
- Workflow runtime hardening is committed at `1f574e1`.
- `apps/api/src/services/workflow-runtime.ts` now validates supported hook handlers by phase and schedule:
  - `on_state_entry`: `create_accepted_snapshot`, `classify_item`
  - `while_in_state`: `nominate_tags` with a valid positive schedule
- The public action surface rejects hidden, automatic, input-required, and wrong-state actions through the same predicate used for action listing.
- `docs/specs/workflow-runtime-integration.md` documents the backend-enforced public action predicate and V1 hook matrix.
- Native bundle exists at:
  - `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`

### Partially Working

- Workflow input-required actions are intentionally unsupported in V1. A future implementation must add form schema rendering, backend handler validation, audit behavior, and tests before import/activation can allow them.
- Automatic workflow actions remain rejected from the public endpoint. A dedicated internal automatic-action runner would be a separate future feature.

### Not Working Yet

- Handoff helper scripts referenced by the handoff skill are not present in this repo:
  - `scripts/handoff_status.py`
  - `scripts/verify_handoff_freshness.py`

### Not Yet Verified

- No browser or live local API smoke was run for this backend/runtime-focused slice.
- No `npm run test:postgres` was run for this slice because no schema or real Postgres behavior changed.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, install dependencies, or mutate app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Read `docs/design/memo-capture-design-learnings.md` before architecture, schema, workflow, ingestion, AI, or export work.
- The backend is authoritative for durable workflow state and action execution.
- The frontend must render workflow lifecycle actions from backend/runtime allowed actions, not hardcoded action availability.
- Workflow bundles should fail fast at import/activation when they require unsupported app behavior.
- Keep workflow definition JSON user-owned unless explicitly asked to edit it.
- For native-testable changes, rebuild the runnable `.app` bundle before handoff; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Verification passed for the hardening slice:

```bash
npm run verify
npm run typecheck
node --test --import tsx apps/api/tests/workflow-runtime.test.ts
node --test --import tsx --test-name-pattern "public workflow action surface|current bundled workflow|manual workflow action from failed to review|manual workflow action into memo" apps/api/tests/backend-foundation.test.ts
git diff --check
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Useful next commands:

```bash
git status --short --branch
git diff -- docs/completed-tasks.md handoff.md
git diff --check
npm run verify
npm run test:postgres
```

Notes:

- `npm run verify` passed in the current environment.
- The app-only Tauri build produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent, so handoff freshness must be checked manually.

## 7. Files to Open First

- `handoff.md`: hot current-state context.
- `docs/completed-tasks.md`: append-only completed work ledger.
- `docs/design/memo-capture-design-learnings.md`: active workflow/product design constraints.
- `docs/specs/workflow-runtime-integration.md`: current workflow runtime contract and V1 enforcement rules.
- `apps/api/src/services/workflow-runtime.ts`: validation, action projection, execution predicate, and hook projection.
- `apps/api/tests/workflow-runtime.test.ts`: focused runtime validation/projection regressions.
- `apps/api/tests/backend-foundation.test.ts`: service-level public action rejection and current bundle import/activation smoke.

## 8. Next Actions

Next:

- Review `git diff -- docs/completed-tasks.md handoff.md`.
- If continuing workflow runtime work, start with the files listed above and preserve the backend-enforced action predicate.

Later:

- Run `npm run verify` before any code commit after additional implementation work.
- Run `npm run test:postgres` for any migration, SQL, accepted-snapshot persistence, workflow activation storage, or database-sensitive behavior.
- Rebuild `Memo Capture.app` after user-facing or native-testable changes.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `1f574e1`, with only `docs/completed-tasks.md` and `handoff.md` intentionally dirty unless Git says otherwise. Check `docs/completed-tasks.md` only for completed work history; do not duplicate it. Open `docs/design/memo-capture-design-learnings.md`, `docs/specs/workflow-runtime-integration.md`, `apps/api/src/services/workflow-runtime.ts`, `apps/api/tests/workflow-runtime.test.ts`, and `apps/api/tests/backend-foundation.test.ts` first. Preserve active constraints: backend owns workflow action enforcement, public lifecycle actions must be visible no-input user actions from the current state, unsupported workflow shapes should fail import/activation, and workflow JSON should not be edited unless explicitly requested. Execute next actions in order, distinguish confirmed state from new recommendations, and do not commit unless explicitly asked.
