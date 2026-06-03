# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-03T21:26:58Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: development LLM provider setup in Settings, runtime-matched provider selection, completed-task ledger update, native app rebuild, and handoff refresh.

### Checkpoint Status

- Git HEAD: `9fc5f92`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/settings-and-audit.md`
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
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/settings-and-audit.md`
- Last verification:
  - command: `npm run test -w @memo-capture/desktop`; `node --test --import tsx apps/api/tests/llm-prompt.test.ts`; `npm run typecheck`; `npm run verify`; `git diff --check`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-03T21:26Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, in-scope dirty implementation/docs/scripts files, completed-task ledger entry, rebuilt native app, and full verification are recorded here. This repo currently has no `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py`, so freshness was checked manually with Git facts and file state.
- Next checkpoint action: review the dirty diff and commit only if explicitly requested.

## 2. Executive Summary

The current focus is a completed development LLM provider Settings refinement. The committed checkpoint `9fc5f92` already contains the local-dev provider runtime mismatch fix; the dirty tree now adds a compact Providers section setup row for the deterministic `local-dev` work-item expander and adjusts AI expansion provider selection to prefer the enabled provider matching the active runtime.

The new Settings row can enable/reset the repo's deterministic model config (`memo-capture-local-dev-expander-v1`) for dev work. Runtime activation still comes from launching the API/app with `LLM_PROVIDER=local-dev`.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: continue from the Settings-based development LLM provider setup without reopening settled AI review-gated suggestion decisions.

Definition of done for this workstream:

- Providers section shows a development LLM setup row for `local-dev`.
- The setup row enables/resets the deterministic dev expander model config.
- AI expansion provider selection prefers an enabled provider matching the active runtime.
- Docs record that multiple local/cloud LLM providers may coexist and routing should be explicit.
- Native `.app` bundle is rebuilt.

## 4. Current State

### Working

- Settings > Providers includes a `Development LLM` row for the seeded `local-dev` LLM provider.
- The setup row displays readiness, current model, runtime provider, and the `LLM_PROVIDER=local-dev` launch value.
- `Enable dev expander` patches the provider row to `enabled: true` with model `memo-capture-local-dev-expander-v1`.
- AI expansion asks `SettingsRepository.findEnabledProvider` for the enabled provider matching `config.llm.provider` when the runtime is not disabled.
- Provider docs now state multiple providers of the same kind may coexist and app-owned jobs should route by explicit purpose/runtime provider where available.
- Native app bundle exists at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.

### Partially Working

- None known for the development LLM provider Settings path.

### Not Working Yet

- No known blocker in the development LLM provider Settings path.

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

Passed for the current development LLM provider Settings work:

```bash
npm run test -w @memo-capture/desktop
node --test --import tsx apps/api/tests/llm-prompt.test.ts
npm run typecheck
npm run verify
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
