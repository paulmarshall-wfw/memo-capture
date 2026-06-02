# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: debugging handoff
- Created timestamp UTC: 2026-06-02T04:49:08Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: workflow runtime bundle compatibility, work queue row-action resilience, and native worker/API crash recovery.

### Checkpoint Status

- Git HEAD: `f40b3b1`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/package.json`
  - `apps/api/src/repositories/work-items.ts`
  - `apps/api/src/services/transcription.ts`
  - `apps/api/src/services/workflow-runtime.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/workflow-runtime.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/worker/src/index.ts`
  - `docs/completed-tasks.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `handoff.md`
  - `package-lock.json`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - `docs/memo-capture-synopsis.md`
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/specs/workflow-runtime-integration.md`
- Last verification:
  - command: `npm run verify`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`; `curl -sS http://127.0.0.1:4788/health`; focused workflow, classify-item, and worker tests; `git diff --check`
  - result: passed
  - timestamp UTC: 2026-06-02T04:49Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty file list, unrelated untracked file, updated docs, verification evidence, native launch log, and live API health are recorded here. This repo has no `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py`, so freshness was checked manually.
- Next checkpoint action: retry the Settings Operations import/action flow in the running native app, then review the dirty diff and commit only if explicitly requested.

## 2. Executive Summary

The workflow JSON file is not the root problem. `docs/design/memo-capture-0.2.3-workflow-definition-bundled.json` validates against `state-workflow-runtime` `1.0.4`. The failure path was a combination of Memo Capture using an app-owned workflow parser that did not understand the runtime nested bundle shape, row-action metadata fetches being allowed to hide otherwise-loaded work queue rows, and worker crashes that took down the native-launched API during recoverable audio processing.

The API now depends on the local numbered `state-workflow-runtime` package and uses runtime normalization for both editor-exported top-level bundles and runtime nested bundles. Memo Capture-specific capability, hook-handler, and migration checks remain app-owned. The work queue now preserves loaded rows if per-item action metadata fails. Worker SQL casts and error-class initialization are fixed so recoverable audio job paths no longer shut down the API.

The native app stack is running from `node scripts/applauncher-native-dev.mjs`; an unsandboxed local health check returned healthy at `2026-06-02T04:49:08Z`. Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: stabilize workflow `0.2.3` activation and Review bucket rendering after importing the new runtime-shaped workflow bundle.

Definition of done:

- Workflow bundle validation accepts both current editor and runtime bundle JSON shapes.
- Review bucket counts and visible work-item rows stay consistent when row-action metadata has errors.
- Native worker recoverable audio paths do not crash API/worker startup.
- Verification, app build, and live native API health pass.
- Handoff and completed-task ledger reflect the current dirty tree.

## 4. Current State

### Working

- `apps/api/src/services/workflow-runtime.ts` normalizes workflow bundles through `state-workflow-runtime` and supports nested `workflowDefinition` plus `embeddedStateMachineDefinition`.
- `apps/api/package.json` and `package-lock.json` point Memo Capture API at the local `state-workflow-runtime` dependency; lockfile records runtime version `1.0.4`.
- Workflow tests cover runtime nested bundle imports while preserving app-specific unsupported capability and hook checks.
- `docs/specs/workflow-runtime-integration.md` now states runtime-owned bundle validation/projection and app-owned compatibility checks.
- `apps/desktop/src/App.tsx` degrades row-action loading per item, so item rows stay visible if allowed-action metadata fails.
- `apps/api/src/services/transcription.ts` and `apps/api/src/repositories/work-items.ts` now cast optional SQL parameters, avoiding Postgres "could not determine data type" crashes.
- `apps/worker/src/index.ts` initializes worker error classes before the top-level worker loop can reference them.
- Native launch log shows recent `/api/work-items` and per-item action requests after the fixes, not the earlier worker-exit/API-shutdown pattern.
- `http://127.0.0.1:4788/health` returned healthy outside the sandbox while the launcher-managed stack was running.

### Partially Working

- The native bootstrap process is still attached to the current Codex exec session. If the desktop app window is closed, the launcher-managed API/worker may stop by design.
- Tests importing the runtime root still emit Node experimental SQLite warnings, but the verification commands pass.

### Not Working Yet

- No known active blocker remains for the workflow JSON import path.

### Not Yet Verified

- The Settings Operations "Validate and stage" button has not been manually re-clicked in the UI after the final worker SQL fixes.
- The currently visible Review list has not been re-screenshotted in Chrome after this documentation refresh.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Apply `engineering-project-standard` for repo maintenance, docs, versioning, and verification work.
- Use Chrome for browser automation unless the user asks otherwise.
- For Memo Capture user-facing/native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.
- Desktop clients must not connect directly to Postgres or object storage.
- Backend settings are canonical; watched-folder and archive paths are desktop-local settings.
- Workflow actions, buckets, and reopen behavior must be driven by the active workflow definition wherever possible.
- The app stores only the active workflow definition bundle; rollback requires re-importing a known-good external bundle.
- V1 blocks workflow activations that require app-code migrations.

## 6. Commands and Verification

Passed in this recovery slice:

```bash
node --test --import tsx apps/api/tests/workflow-runtime.test.ts
node --test --import tsx --test-name-pattern "text import classify_item" apps/api/tests/backend-foundation.test.ts
node --test --import tsx apps/worker/tests/*.test.ts
npm run typecheck
npm test
npm run build
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
curl -sS http://127.0.0.1:4788/health
```

Verification notes:

- The first sandboxed `npm test` hit expected local API route bind `listen EPERM`; the unsandboxed rerun passed.
- The live health check was run outside the sandbox and returned `{"ok":true,"service":"memo-capture-api","version":"0.1.0","commitSha":"dev"}`.
- `npm run tauri:build -w @memo-capture/desktop -- --bundles app` rebuilt `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app` during this slice; final worker/API-only fixes did not change desktop bundle inputs.
- Runtime validation of `docs/design/memo-capture-0.2.3-workflow-definition-bundled.json` passed against the local runtime.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent, so handoff freshness was checked manually with Git facts and file state.

## 7. Files to Open First

- `AGENTS.md`: repo-local constraints, ports, and native verification expectations.
- `handoff.md`: this hot-context checkpoint.
- `apps/api/src/services/workflow-runtime.ts`: runtime bundle normalization and Memo Capture compatibility checks.
- `apps/api/tests/workflow-runtime.test.ts`: nested runtime bundle regression coverage.
- `apps/desktop/src/App.tsx`: work queue row-action degradation behavior.
- `apps/api/src/repositories/work-items.ts`: classification update SQL casts.
- `apps/api/src/services/transcription.ts`: transcription metadata SQL cast.
- `apps/worker/src/index.ts`: worker error classes and top-level loop ordering.
- `docs/specs/workflow-runtime-integration.md`: updated workflow runtime integration contract.
- `docs/completed-tasks.md`: append-only completed work ledger.

## 8. Next Actions

Next:

- In the running native app, retry Settings Operations workflow validation/staging with `memo-capture-0.2.3-workflow-definition-bundled.json`.
- Return to Work queue and confirm the Review bucket shows the same items counted in the bucket badge.
- Review the dirty diff, including `docs/completed-tasks.md` and `handoff.md`.
- Commit the slice only if explicitly requested.

Blocked:

- None.

Later:

- Consider reducing the runtime-root SQLite experimental warning if `state-workflow-runtime` exposes a narrower import path.
- Add a Postgres-backed worker regression test for recoverable audio failure classification if this path keeps changing.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Review `AGENTS.md`, `apps/api/src/services/workflow-runtime.ts`, `apps/api/tests/workflow-runtime.test.ts`, `apps/desktop/src/App.tsx`, `apps/api/src/repositories/work-items.ts`, `apps/api/src/services/transcription.ts`, `apps/worker/src/index.ts`, `docs/specs/workflow-runtime-integration.md`, and `docs/completed-tasks.md` first. Treat the workflow runtime compatibility and worker crash fixes as implemented and verified but dirty at HEAD `f40b3b1`; `docs/memo-capture-synopsis.md` is an unrelated untracked file. Continue by retrying the workflow import and Review queue rendering in the running native app, then distinguish confirmed state from any new recommendations.
