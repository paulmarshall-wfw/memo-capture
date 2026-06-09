# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-09T04:11:07Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: checkpoint registry-only provider source-of-truth work for Settings Tasks provider selection and task routing.

### Checkpoint Status

- Git HEAD: `4ff14e4`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/services/invoke-providers/runtime.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/tests/app-copy.test.ts`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - None
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `docs/completed-tasks.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `handoff.md`
- Last verification:
  - command: `npm run typecheck`; `npm test` with local-listener permission; `git diff --check`
  - result: passed
  - timestamp UTC: 2026-06-09T04:11:07Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: `HEAD 4ff14e4` is current; all dirty files are intentionally in scope for the registry-only provider routing update, and typecheck/tests/diff whitespace checks passed.
- Next checkpoint action: review diff, then commit or continue with the deferred schema cleanup plan.

## 2. Executive Summary

Memo Capture Settings now treats the provider registry as the provider source of truth for task routing.

Complete now:

- The Tasks provider dropdown is populated from `providerCatalog.providers`, not local `provider_configs` rows.
- Task create/save sends `registryProfileKey` and `providerKey`, not local provider IDs.
- `/api/settings` no longer exposes the old local `providers`, `providerCapabilities`, or `fallbackUsed` settings shape.
- Task route validation resolves the selected provider from the active provider registry profile and checks provider kind, required capability, enabled state, and required secret.
- Runtime diagnostics no longer carries the always-false `fallbackUsed` flag.
- Tests now enforce that the desktop Tasks path does not reference `providerConfigId`, `selectedProviderId`, or `fallbackUsed`.

Incomplete now:

- Historical `provider_config_id` database columns and related compatibility repository/test paths still exist. They should be removed in a future schema cleanup migration once the registry-only path has settled.

Safe to continue: yes, from `HEAD 4ff14e4` plus the intentionally dirty registry-only provider changes.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

Immediate goal: finish and review the registry-only provider routing slice so Tasks configuration shows all enabled registry providers and no longer depends on local provider rows.

Intended finished state:

- Provider registry records are the only source of provider options in Settings.
- Task routing persists registry profile/provider keys.
- Local provider config rows are not part of user-facing Tasks configuration.
- Automated tests guard the registry-only behavior.

Definition of done:

- `npm run typecheck` passes.
- `npm test` passes.
- `git diff --check` passes.
- Handoff records the remaining historical-column cleanup.

## 4. Current State

### Working

- Desktop Tasks provider selectors use registry provider options built from `settingsSummary.providerCatalog.providers`.
- Task draft state tracks `registryProviderKey`.
- Task create/update requests include `registryProfileKey` and `providerKey`.
- API task route parsing no longer accepts `providerConfigId` as a request field.
- API settings summary omits local `providers`, `providerCapabilities`, `appLauncher` runtime-option summary, and `fallbackUsed`.
- API route validation uses provider registry snapshots and no longer requires legacy AppLauncher runtime provider equality for enabling registry-backed tasks.
- Backend and desktop tests pass after updates.

### Partially Working

- The repository still retains legacy local provider table plumbing for compatibility and historical migrations:
  - `ai_task_routes.provider_config_id`
  - `provider_capabilities.provider_config_id`
  - repository methods such as `findProviderById` and `providerHasCapability`
  - fake database rows and tests that seed historical provider data
- These are no longer the intended source of truth for Tasks provider selection, but removing them requires a dedicated schema cleanup.

### Not Working Yet

- Historical `provider_config_id` columns have not been removed from the database schema or compatibility code.

### Not Yet Verified

- Real Postgres migration cleanup for dropping historical provider columns has not been designed or run.
- Native UI visual smoke was not rerun after the registry-only UI change; automated desktop copy/type tests passed.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, install dependencies, delete files, or mutate unrelated app/browser state unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Read `docs/design/memo-capture-design-learnings.md` before architecture, schema, workflow, ingestion, AI, or export work.
- Providers catalog is registry-only for user-facing configuration.
- Tasks own routing/prompt configuration and must use registry provider keys, not local provider IDs.
- Preserve app-owned task hooks and workflow behavior while changing provider plumbing.
- Deleting historical `provider_config_id` columns is deferred; do it as a deliberate migration/code cleanup, not as an incidental edit.

## 6. Commands and Verification

Passed in this session:

```bash
npm run typecheck
npm test
git diff --check
```

Notes:

- `npm test` needs permission to bind local `127.0.0.1` test servers for API and provider-registry tests.
- A sandboxed `npm test` run failed only because those local listeners were blocked with `listen EPERM`; the elevated rerun passed.
- Handoff helper scripts were not present under `scripts/`, so freshness was updated manually from Git/status facts.

Useful next checks:

```bash
git status --short
git diff --check
npm run typecheck
npm test
```

For future database cleanup:

```bash
npm run test:postgres
npm run verify
```

## 7. Files to Open First

- `apps/desktop/src/App.tsx`: registry-only Tasks provider dropdowns, draft state, task create/save payloads.
- `apps/api/src/services/settings.ts`: settings summary shape, task route parsing, registry provider validation.
- `apps/api/src/repositories/settings.ts`: current compatibility writes for `ai_task_routes.provider_config_id`, and future cleanup target.
- `apps/api/src/services/invoke-providers/runtime.ts`: provider catalog/readiness diagnostics without `fallbackUsed`.
- `apps/api/tests/backend-foundation.test.ts`: registry-backed task route tests and fake database compatibility harness.
- `apps/desktop/tests/app-copy.test.ts`: source checks that block local provider fallback vocabulary in the desktop Tasks path.

## 8. Next Actions

Next:

- Review the registry-only provider diff for accidental removal of still-needed compatibility behavior.
- Commit the current registry-only provider routing slice if acceptable.
- Launch or smoke the app UI if visual confirmation of the Tasks dropdown is required.

Blocked:

- None known for the six-provider dropdown issue.

Later:

- Create a deliberate schema/code cleanup to remove historical `provider_config_id` columns and related local-provider compatibility paths.
- Include Postgres migration tests for that cleanup before merging it.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `4ff14e4` with intentional dirty files for the registry-only provider routing slice. Review `apps/desktop/src/App.tsx`, `apps/api/src/services/settings.ts`, `apps/api/src/repositories/settings.ts`, `apps/api/src/services/invoke-providers/runtime.ts`, `apps/api/tests/backend-foundation.test.ts`, and `apps/desktop/tests/app-copy.test.ts` before editing. Continue by reviewing or committing the registry-only provider source-of-truth changes. Do not reintroduce local provider fallback in Settings Tasks. Remember that deleting historical `provider_config_id` database columns is deferred and must be handled as a deliberate migration/code cleanup with Postgres verification.
