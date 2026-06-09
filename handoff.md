# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-09T04:44:00Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: implement `docs/plans/05 Invoke Providers Runtime Alignment Plan.md` for the shared invoke-providers runtime alignment.

### Checkpoint Status

- Git HEAD: `8140bc9`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/api/src/services/invoke-providers/adapters.ts`
  - `apps/api/src/services/invoke-providers/hooks.ts`
  - `apps/api/src/services/invoke-providers/mapping.ts`
  - `apps/api/src/services/invoke-providers/registry.ts`
  - `apps/api/src/services/invoke-providers/repositories.ts`
  - `apps/api/src/services/invoke-providers/runtime.ts`
  - `apps/api/src/services/invoke-providers/secrets.ts`
  - `apps/api/src/services/invoke-providers/types.ts`
  - `apps/api/src/services/settings.ts`
  - `docs/completed-tasks.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `docs/plans/05 Invoke Providers Runtime Alignment Plan.md`
- Untracked files intentionally out of scope:
  - None
- Last verification:
  - command: `npm run verify` outside the sandbox
  - result: passed
  - timestamp UTC: 2026-06-09T04:44:00Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: `npm run verify` passed after the shared-runtime alignment changes. The only notable environment issue was that sandboxed tests could not bind `127.0.0.1`, so listener tests were rerun outside the sandbox.

## 2. Executive Summary

Memo Capture now uses the shared `@invoke-providers/*` runtime boundary for provider-backed task mechanics while retaining app-owned storage, prompts, hooks, jobs, audit, review staging, and domain mutations.

Complete now:

- The local `TargetAppRuntimeService` class was removed; `apps/api/src/services/invoke-providers/runtime.ts` now builds `@invoke-providers/client`'s shared target-app runtime.
- Local shared provider/task/run types now alias `@invoke-providers/core` and `@invoke-providers/client` types.
- Registry provider/profile reads use the shared remote registry client wrapper.
- Memo Capture repository adapters expose tasks, hooks, task runs, and selected registry profile settings to the shared runtime.
- Shared provider adapters are registered for local deterministic, OpenAI-compatible, Codex CLI, Whisper.cpp, and deterministic STT/OCR/TTS paths, with Memo Capture prompt/context glue where needed.
- `AiExpansionService` now invokes work-item AI tasks through shared `invokeTask`; Memo Capture still validates output and stages review candidates before any domain mutation.
- New registry-backed task routes no longer write or require `provider_config_id`.
- Existing compatibility columns and joins remain for old rows.

Deferred:

- A dedicated cleanup migration is still needed before removing `ai_task_routes.provider_config_id`, `provider_capabilities.provider_config_id`, old provider-config execution joins, and historical tests that seed local provider rows only for execution compatibility.

## 3. Verification

Passed:

```bash
npm run typecheck
npm test
npm run verify
```

Notes:

- `npm install` was run because linked `@invoke-providers/*` packages were missing from `node_modules`.
- `npm install` reported the current Node/npm runtime is newer than the repo engine range: repo expects Node `>=22.14.0 <23` and npm `>=10.9.0 <11`, while the current environment used Node `24.14.0` and npm `11.9.0`.
- Sandboxed `npm test` failed only on `listen EPERM 127.0.0.1`; rerunning outside the sandbox passed.

## 4. Files to Open First

- `apps/api/src/services/invoke-providers/runtime.ts`: shared runtime factory.
- `apps/api/src/services/invoke-providers/repositories.ts`: Memo Capture adapters for shared task, hook, task-run, and profile settings repositories.
- `apps/api/src/services/invoke-providers/adapters.ts`: shared adapter construction plus Memo Capture prompt/context glue.
- `apps/api/src/services/ai-expansion.ts`: work-item task invocation through shared `invokeTask`.
- `apps/api/src/services/settings.ts`: registry-backed route persistence and compatibility API wrappers.
- `docs/plans/05 Invoke Providers Runtime Alignment Plan.md`: source plan for this slice.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or mutate unrelated app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Provider setup remains outside Memo Capture.
- Providers page remains registry-backed and read-only.
- Tasks own route, prompt, render, and enabled state.
- Hooks remain Memo Capture-owned and are the only layer that can turn provider output into domain behavior.
- Domain records must not be mutated before user review/acceptance.

## 6. Next Actions

Next:

- Review the diff and commit if acceptable.
- Run a native UI smoke only if visual confirmation is wanted; no desktop UI code changed in this slice.

Later:

- Implement the dedicated schema/code cleanup for historical provider columns and run `npm run test:postgres`.
- Consider adding focused tests for shared adapter diagnostic invocation if provider diagnostics become a primary workflow.
