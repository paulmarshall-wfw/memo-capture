# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-02T11:33:57Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: move generated tag nomination to workflow-owned `nominate_tags`, verify, rebuild native Tauri `.app`, update continuity docs.

### Checkpoint Status

- Git HEAD: `50dd7b5`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/jobs.ts`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/api/src/services/classification.ts`
  - `apps/api/src/services/form-memos.ts`
  - `apps/api/src/services/imports.ts`
  - `apps/api/src/services/keywords.ts`
  - `apps/api/src/services/metadata-extraction.ts`
  - `apps/api/src/services/transcription.ts`
  - `apps/api/src/services/workflow-runtime.ts`
  - `apps/api/src/services/workflows.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/workflow-runtime.test.ts`
  - `apps/worker/src/index.ts`
  - `apps/worker/tests/job-kinds.test.ts`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `handoff.md`
  - `packages/domain/src/index.ts`
  - `packages/domain/tests/states.test.ts`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/src/services/workflow-hooks.ts`
  - `docs/design/memo-capture-0.2.5-workflow-definition-bundled.json`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-0.2.5-workflow-definition-bundled.json`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `docs/specs/workflow-runtime-integration.md`
- Last verification:
  - command: `npm run typecheck`; `npm test`; `npm run verify`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`; `git diff --check`; `python3 -m json.tool docs/design/memo-capture-0.2.5-workflow-definition-bundled.json`
  - result: passed
  - timestamp UTC: 2026-06-02T11:33Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty/untracked file list, completed-task ledger entry, verification results, and native `.app` rebuild are recorded here. This repo currently has no `scripts/handoff_status.py` or `scripts/verify_handoff_freshness.py`, so freshness was checked manually with Git facts and file state.
- Next checkpoint action: import/activate workflow `0.2.5` in local app runtime and smoke-test scheduled tag nomination; commit only if explicitly requested.

## 2. Executive Summary

Generated tag nomination is now workflow-owned. Automatic tag assignment no longer runs directly during watched text import, post-transcription audio handling, or metadata extraction. Work items entering `memo` schedule the active workflow's `while_in_state` hook with handler key `nominate_tags`; the worker assigns generated tags only when that scheduled job becomes due and the item is still in a state whose active workflow defines that hook.

The app supports `nominate_tags` as a workflow hook handler, app capability, and processing job kind. The workflow runtime projection preserves hook phase, target state, handler key, and schedule. The schedule interval is read from the active workflow bundle, not hardcoded.

Native app rebuild completed. The rebuilt bundle is `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`, timestamp `Jun 2 21:12 2026`, size `8.4M`.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: continue from the completed hook-driven tag nomination implementation and validate it against the active/local workflow bundle.

Definition of done for the current workstream:

- Workflow bundle `0.2.5` with `while_in_state` / `nominate_tags` can be imported and activated.
- Imports and manual transitions into `memo` schedule tag nomination from the workflow hook.
- Generated tags are assigned only by due `nominate_tags` jobs while the work item remains in the hook target state.
- Native app can run from the rebuilt `.app` bundle.
- Any remaining dirty-tree changes are reviewed and committed only when explicitly requested.

## 4. Current State

### Working

- `packages/domain/src/index.ts` now includes `nominate_tags` in supported workflow hook handlers, app capabilities, and processing job kinds.
- `apps/api/src/services/workflow-runtime.ts` projects state-resident hooks and preserves schedule metadata.
- `apps/api/src/services/workflow-hooks.ts` schedules delayed `nominate_tags` jobs from the active workflow bundle and cancels pending nomination jobs on state exit.
- `apps/api/src/services/classification.ts`, `workflows.ts`, `form-memos.ts`, and `ai-expansion.ts` schedule memo-state hooks when work items enter `memo`.
- `apps/api/src/services/imports.ts` no longer creates eager `generate_keywords` jobs for watched text imports.
- `apps/api/src/services/transcription.ts` no longer creates eager keyword jobs after audio transcription.
- `apps/api/src/services/metadata-extraction.ts` no longer persists generated tags.
- `apps/api/src/services/keywords.ts` keeps the existing keyword extraction/assignment logic and exposes it through guarded `runNominateTagsJob`.
- `apps/worker/src/index.ts` claims `nominate_tags`; legacy `generate_keywords` jobs route through the same guarded nomination path.
- Tests cover workflow `nominate_tags` validation/projection, memo-entry scheduling, ambiguous review no-scheduling, manual action scheduling, nomination assignment, state-exit skip/cancel, and worker job-kind support.
- Docs updated:
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/processing-jobs-and-diagnostics.md`
  - `docs/specs/workflow-runtime-integration.md`
  - `docs/completed-tasks.md`
- Native Tauri app rebuilt successfully.

### Partially Working

- The code path is verified by automated tests/build, but local runtime activation of `docs/design/memo-capture-0.2.5-workflow-definition-bundled.json` has not yet been smoke-tested in the app.
- The untracked workflow bundle `0.2.5` defines `nominate_tags` on `memo` with `intervalMs: 10000`. Treat that value as workflow data, not app code.

### Not Working Yet

- No known code blocker remains.

### Not Yet Verified

- Live import/activation of workflow bundle `0.2.5` through the Operations UI or API.
- Native app smoke test proving a work item entering `memo` schedules `nominate_tags` and receives generated tags after the due interval.
- Browser/native screenshot verification for this backend-focused change was not run.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Apply `engineering-project-standard` for repo maintenance and verification work.
- Use Chrome for browser automation unless the user asks otherwise.
- For Memo Capture user-facing/native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.
- Desktop clients must not connect directly to Postgres or object storage.
- Workflow actions, buckets, reopen behavior, and lifecycle hooks should be driven by the active workflow definition wherever possible.
- AI/code-consumed generated output must remain structured and validated before storage.
- Tag editing remains flat in V1; generated tags and user tags should not create hierarchy/provenance UI.
- `nominate_tags` timing is owned by workflow schedule data. Do not hardcode the interval in app code.

## 6. Commands and Verification

Passed in this slice:

```bash
npm run typecheck
npm test
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
python3 -m json.tool docs/design/memo-capture-0.2.5-workflow-definition-bundled.json
```

Verification notes:

- Sandboxed `npm test` initially failed only because protected-route tests could not bind `127.0.0.1` (`listen EPERM`); the approved unsandboxed rerun passed.
- `npm run verify` passed outside the sandbox and included doctor, typecheck, tests, and build.
- Tauri build produced `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`.
- Bundle check after build: `ls -ld` timestamp `Jun 2 21:12`; `du -sh` size `8.4M`.
- `docs/design/memo-capture-0.2.5-workflow-definition-bundled.json` is valid JSON.
- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are absent in this repo; handoff freshness was checked manually.

Useful next commands:

```bash
git status --short
git diff --check
npm run dev:api
npm run dev:desktop
npm run dev:worker
npm run tauri:dev
```

## 7. Files to Open First

- `AGENTS.md`: repo-local constraints and verification expectations.
- `docs/design/memo-capture-0.2.5-workflow-definition-bundled.json`: workflow bundle with scheduled `nominate_tags`.
- `apps/api/src/services/workflow-hooks.ts`: scheduling/cancel behavior for state-resident hooks.
- `apps/api/src/services/workflow-runtime.ts`: hook projection and schedule metadata.
- `apps/api/src/services/keywords.ts`: guarded `nominate_tags` execution and existing tag assignment logic.
- `apps/api/src/services/classification.ts`: classify-item promotion and memo hook scheduling.
- `apps/api/src/services/workflows.ts`: manual workflow action entry/exit scheduling and cancellation.
- `apps/api/tests/backend-foundation.test.ts`: behavioral coverage for scheduling, skipping, cancellation, and nomination.
- `docs/completed-tasks.md`: append-only completed work ledger.

## 8. Next Actions

Next:

- Review the dirty diff and untracked files.
- Import/stage/activate `docs/design/memo-capture-0.2.5-workflow-definition-bundled.json` in a local runtime.
- Launch API, worker, and native app; verify a work item entering `memo` schedules `nominate_tags` and receives generated tags after the workflow-defined due interval.
- Confirm a work item moved out of `memo` before the due time does not receive generated tags.
- Commit only if explicitly requested.

Blocked:

- None.

Later:

- Consider whether old queued `generate_keywords` jobs need an operator note; current worker routes legacy jobs through the same guarded nomination path.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Review `AGENTS.md`, `docs/design/memo-capture-0.2.5-workflow-definition-bundled.json`, `apps/api/src/services/workflow-hooks.ts`, `apps/api/src/services/workflow-runtime.ts`, `apps/api/src/services/keywords.ts`, `apps/api/src/services/classification.ts`, `apps/api/src/services/workflows.ts`, `apps/api/tests/backend-foundation.test.ts`, and `docs/completed-tasks.md` first. Treat hook-driven `nominate_tags` scheduling as implemented and verified in the dirty tree at HEAD `50dd7b5`. Continue by validating local workflow `0.2.5` activation and native/worker runtime behavior, and distinguish confirmed runtime behavior from any new recommendations.
