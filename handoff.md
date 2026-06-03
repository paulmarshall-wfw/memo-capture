# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-03T20:59:13Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: AI provider runtime mismatch fix, launcher environment override support, completed-task ledger update, native app rebuild, and handoff refresh.

### Checkpoint Status

- Git HEAD: `ce538b3`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/services/app.ts`
  - `apps/api/src/services/llm.ts`
  - `apps/api/tests/llm-prompt.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/env.md`
  - `docs/completed-tasks.md`
  - `handoff.md`
  - `scripts/applauncher-dev.mjs`
  - `scripts/applauncher-native-dev.mjs`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `apps/api/src/services/llm.ts`
  - `apps/api/src/services/app.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/api/tests/llm-prompt.test.ts`
  - `apps/desktop/tests/app-copy.test.ts`
  - `scripts/applauncher-dev.mjs`
  - `scripts/applauncher-native-dev.mjs`
  - `docs/env.md`
- Last verification:
  - command: `node --test --import tsx apps/api/tests/llm-prompt.test.ts`; `npm run test -w @memo-capture/desktop`; `npm run typecheck`; `npm run verify`; `git diff --check`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-03T20:59Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, in-scope dirty implementation/docs/scripts files, completed-task ledger entry, rebuilt native app, and full verification are recorded here. This repo currently has no `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py`, so freshness was checked manually with Git facts and file state.
- Next checkpoint action: review the dirty diff and commit only if explicitly requested.

## 2. Executive Summary

The current focus is a completed local-dev LLM provider activation fix. The committed checkpoint `ce538b3` already contains the manual, review-gated AI suggestion flow; the dirty tree now makes the provider/runtime contract clearer and prevents a doomed Generate request when Settings has an enabled LLM row but the running API still has `LLM_PROVIDER=disabled`.

Launcher scripts now preserve explicit `LLM_PROVIDER` and `LLM_MODEL` environment values instead of overwriting them with disabled defaults. To use the local dev expander, restart the app/API with `LLM_PROVIDER=local-dev` and keep the LLM provider row enabled in Settings.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: continue from the clarified local-dev LLM activation path without reopening settled AI review-gated suggestion decisions.

Definition of done for this workstream:

- Settings-enabled LLM provider plus disabled API runtime reports a specific actionable message.
- Detail-panel Generate is disabled for the known-bad runtime/provider mismatch.
- AppLauncher dev/native scripts honor explicit `LLM_PROVIDER` and `LLM_MODEL` environment values.
- Runtime requirement is documented in `docs/env.md`.
- Native `.app` bundle is rebuilt.

## 4. Current State

### Working

- `createLlmProvider` reports `LLM provider is enabled in Settings, but this API runtime is disabled. Restart the API with LLM_PROVIDER=local-dev.` for the Settings/runtime mismatch.
- The Work queue AI expansion section finds the configured LLM provider from loaded Settings, shows the same mismatch message inline, and disables `Generate` until the runtime is compatible.
- `scripts/applauncher-dev.mjs` and `scripts/applauncher-native-dev.mjs` default to disabled but honor explicit `LLM_PROVIDER` and `LLM_MODEL` values from the calling environment.
- `docs/env.md` states that Settings must enable the matching provider row and the API runtime must use a supported LLM provider.
- `AiOperations` now uses concrete AI suggestion return types instead of `Promise<unknown>`, allowing repo typecheck to cover AI accept/expand call sites.
- Native app bundle exists at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

### Partially Working

- None known for the local-dev LLM provider activation path.

### Not Working Yet

- No known blocker in the local-dev LLM provider activation path.

### Not Yet Verified

- No fresh Chrome/native smoke was run after the rebuild.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- AI output consumed by code must be strict structured JSON and validated before storage.
- AI expansion is app-owned, not a workflow transition.
- Suggested new work items must remain visually distinct from real work items until accepted.
- Rejected AI suggestions should not remain in the active review UI; V1 retains audit/status metadata only.
- Browser automation should use Chrome unless explicitly told otherwise.
- For Memo Capture user-facing/native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Passed for the current AI flow:

```bash
node --test --import tsx apps/api/tests/ai-suggestions.test.ts
npm run test -w @memo-capture/desktop
npm run typecheck
git diff --check
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Verification notes:

- `npm run tauri:build -w @memo-capture/desktop -- --bundles app` produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.
- The full sandboxed `npm run test -w @memo-capture/api` attempt ran the new AI suggestion test successfully but failed two HTTP route tests with `listen EPERM`; that is an environment limitation rather than an AI-suggestion assertion failure.

Useful next commands:

```bash
git status --short --branch
git diff --check
node --test --import tsx apps/api/tests/ai-suggestions.test.ts
npm run test -w @memo-capture/desktop
npm run verify
```

## 7. Files to Open First

- `apps/desktop/src/App.tsx`: AI expansion, suggested-work-item review rows, accept/reject handlers.
- `apps/desktop/src/styles.css`: distinct dashed AI suggestion row styling.
- `apps/api/src/repositories/ai-suggestions.ts`: pending-only active suggestion list query.
- `apps/api/src/services/ai-expansion.ts`: accept/reject service behavior and user-facing error copy.
- `apps/api/tests/ai-suggestions.test.ts`: focused pending-only API contract test.
- `apps/desktop/tests/app-copy.test.ts`: UI copy guard for suggested-work-item rows.
- `docs/design/memo-capture-design-learnings.md`: product rule for rejected suggestions.
- `docs/specs/settings-and-audit.md`: API behavior notes for active suggestion listing and rejection.

## 8. Next Actions

Next:

- Review the documentation-only dirty diff in `docs/completed-tasks.md` and `handoff.md`.
- Commit only if explicitly requested.
- If further UI changes are made, run desktop tests and rebuild the native `.app` again.

Blocked:

- None.

Later:

- Run a live Chrome or native app smoke if the next task changes detail-panel behavior.
- Run `npm run verify` outside the sandbox if a full checkpoint verification is required.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `6767510` with a dirty tree containing only `docs/completed-tasks.md` and `handoff.md` in scope. The completed work is the AI work item review and suggestion flow: open `apps/desktop/src/App.tsx`, `apps/desktop/src/styles.css`, `apps/api/src/repositories/ai-suggestions.ts`, `apps/api/src/services/ai-expansion.ts`, `apps/api/tests/ai-suggestions.test.ts`, and `apps/desktop/tests/app-copy.test.ts` first. Preserve manual review-gated AI behavior: Save/Reset for current-item drafts, Accept/Reject for suggested new work items, pending-only active suggestion lists, and audit/status-only retention for rejected suggestions. Distinguish confirmed repo state from any new recommendations.
