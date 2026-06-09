# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-09T18:24:42Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: checkpoint after implementing `docs/plans/06 AppLauncher Provider Decoupling Plan.md`.

### Checkpoint Status

- Git HEAD: `77dcafd`
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
  - `docs/plans/06 AppLauncher Provider Decoupling Plan.md`
  - `.env.example`
  - `apps/api/src/services/invoke-providers/adapters.ts`
  - `apps/api/src/services/invoke-providers/secrets.ts`
  - `apps/api/src/services/llm.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/env.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/specs/settings-and-audit.md`
- Last verification:
  - command: `npm run verify`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-09T18:24:42Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: tracked implementation is committed at `77dcafd`, verification passed, and the only tracked dirty file after this refresh is `handoff.md`.
- Next checkpoint action: commit or intentionally leave the handoff refresh dirty.

Notes:

- `scripts/handoff_status.py` and `scripts/verify_handoff_freshness.py` are not present in this repo, so freshness was checked manually with Git status and HEAD.
- Ignored local artifacts under `dist/applauncher-manifests/**` currently scan provider-blind for `providerSlots`, `providerRegistry`, `runtimeOptions`, and `LLM_*`, but `dist/` is gitignored and is not part of the tracked checkpoint.

## 2. Executive Summary

Memo Capture is now decoupled from AppLauncher provider configuration. AppLauncher launches Memo Capture only; provider profile selection, provider catalog/readiness, adapter configuration, secrets, and model metadata remain owned by Memo Capture and the shared provider registry.

Complete now:

- Tracked code and docs for `docs/plans/06 AppLauncher Provider Decoupling Plan.md` are committed at `77dcafd`.
- OpenAI-compatible registry provider readiness no longer requires legacy `LLM_PROVIDER=openai-compatible`.
- OpenAI-compatible adapter diagnostics use registry provider metadata, endpoint presence, adapter availability, and secret readiness rather than an AppLauncher runtime selector.
- Desktop/API copy now says to restart Memo Capture or the API after runtime environment changes.
- `.env.example`, `docs/env.md`, the design learnings, and the settings/audit spec describe `LLM_*` as legacy/fallback Memo Capture runtime values, not AppLauncher inputs.
- Focused regression tests cover provider-blind AppLauncher manifests and OpenAI-compatible registry readiness with `LLM_PROVIDER=disabled`.

Incomplete now:

- Schema cleanup remains separate: do not remove `provider_config_id`, `provider_capabilities`, or historical compatibility joins in this slice.
- The ignored `dist/applauncher-manifests/**` artifacts are locally updated but not tracked by Git.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: resume safely from the committed AppLauncher provider-decoupling checkpoint.

Intended finished state for this workstream: Memo Capture stays provider-registry-owned, AppLauncher remains launch-only for Memo Capture, and future cleanup work can proceed without reintroducing AppLauncher provider/runtime selectors.

Definition of done for the next slice depends on scope:

- If closing this slice: review and optionally commit `handoff.md`.
- If continuing implementation: start the dedicated Postgres-backed schema cleanup slice and run `npm run test:postgres`.

## 4. Current State

### Working

- Memo Capture Settings keeps `providerRegistry`, `providerCatalog`, registry profile selection, and registry readiness in the app/API.
- Registry-selected OpenAI-compatible local providers can be runtime-ready without setting legacy `LLM_PROVIDER=openai-compatible`.
- AppLauncher provider/runtime wording has been removed from current user-facing Settings save copy and current environment/design/spec docs.
- Focused and full verification passed.
- Native `.app` bundle was rebuilt successfully.

### Partially Working

- Legacy `LLM_PROVIDER`, `LLM_MODEL`, and `LLM_ENDPOINT` remain in config as Memo Capture fallback/default env values.
- Historical provider columns and compatibility joins still exist intentionally.
- AppLauncher manifest test reads ignored local `dist/applauncher-manifests/**` artifacts; those artifacts are not tracked.

### Not Working Yet

- Dedicated migration/code cleanup for old provider-config compatibility storage has not been done.
- No tracked source-owned manifest generator was identified for the ignored `dist/applauncher-manifests/**` artifacts.

### Not Yet Verified

- Real Postgres cleanup path for removing old provider columns was not attempted.
- Live LM Studio/shared registry end-to-end smoke was not rerun in this handoff refresh.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, install, delete, or mutate unrelated app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- AppLauncher must remain provider-blind for Memo Capture: no provider slots, provider registry settings, runtime options, provider secrets, or model selectors.
- Memo Capture continues to consume the shared provider registry directly.
- Providers page remains Memo Capture/shared-registry owned; do not move profile selection back into AppLauncher.
- Raw provider secrets stay out of docs, manifests, database rows, and task-run records.
- Schema cleanup is a later slice and should use `npm run test:postgres`.

## 6. Commands and Verification

Most recent passed commands:

```bash
npm run typecheck
node --test apps/desktop/tests/app-copy.test.ts
node --test --import tsx apps/api/tests/backend-foundation.test.ts
npm test
npm run verify
npm run tauri:build -w @memo-capture/desktop -- --bundles app
git diff --check
```

Notes:

- Sandboxed API tests that bind `127.0.0.1` may fail with `listen EPERM`; rerun those tests outside the sandbox when needed.
- `npm run verify` passed after the final implementation diff and includes doctor, typecheck, full tests, and build.

## 7. Files to Open First

- `docs/plans/06 AppLauncher Provider Decoupling Plan.md`: source scope and explicit out-of-scope schema cleanup.
- `apps/api/src/services/invoke-providers/adapters.ts`: OpenAI-compatible adapter diagnostics no longer use legacy `LLM_PROVIDER`.
- `apps/api/src/services/invoke-providers/secrets.ts`: local OpenAI-compatible secret readiness behavior.
- `apps/api/tests/backend-foundation.test.ts`: regression test for OpenAI-compatible registry readiness with `LLM_PROVIDER=disabled`.
- `apps/desktop/tests/app-copy.test.ts`: provider-blind AppLauncher manifest assertions.
- `docs/env.md`: current runtime/provider setup wording.
- `docs/specs/settings-and-audit.md`: current provider/task readiness contract wording.

## 8. Next Actions

Next:

- Review and optionally commit `handoff.md`.
- If continuing implementation, plan the dedicated Postgres-backed cleanup for legacy provider columns and compatibility joins.

Blocked:

- None for the committed provider-decoupling checkpoint.

Later:

- Identify or add a tracked manifest generation path if AppLauncher manifest artifacts need to be reproducible from source rather than maintained as ignored local artifacts.
- Run a live shared-registry/LM Studio smoke when provider runtime behavior, not just readiness, is back in scope.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source of current state. Treat HEAD `77dcafd` as the committed provider-decoupling checkpoint, and note that only `handoff.md` should be dirty if this refresh is uncommitted. Review `docs/plans/06 AppLauncher Provider Decoupling Plan.md`, `apps/api/src/services/invoke-providers/adapters.ts`, `apps/api/tests/backend-foundation.test.ts`, `apps/desktop/tests/app-copy.test.ts`, `docs/env.md`, and `docs/specs/settings-and-audit.md` before acting. Do not reopen AppLauncher provider/runtime-selector decisions unless new repo evidence requires it. If continuing work, start with the separate Postgres-backed cleanup slice and distinguish confirmed committed state from new recommendations.
