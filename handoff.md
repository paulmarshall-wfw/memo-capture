# Handoff

## 1. Metadata

- Project name: Memo Capture
- Handoff type: implementation handoff
- Created timestamp UTC: 2026-06-04T01:02:23Z
- Prepared by: Codex
- Repository: `/Users/paulmarshall/Software Development/memo-capture`
- Branch or working context: `main`
- Session scope: multiple LLM providers, task routing, AppLauncher `manifestVersion: "1.2.0"` runtime options, native app rebuild, and docs refresh.

### Checkpoint Status

- Git HEAD: `9b329f7`
- Working tree: dirty
- Dirty files intentionally in scope:
  - `.env.example`
  - `apps/api/src/config.ts`
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/server.ts`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/api/src/services/app.ts`
  - `apps/api/src/services/llm.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/tests/backend-foundation.test.ts`
  - `apps/api/tests/llm-prompt.test.ts`
  - `apps/desktop/src/App.tsx`
  - `apps/desktop/src/styles.css`
  - `apps/desktop/tests/app-copy.test.ts`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/env.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/completed-tasks.md`
  - `handoff.md`
- Dirty files intentionally out of scope:
  - None
- Untracked files intentionally in scope:
  - `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`
- Untracked files intentionally out of scope:
  - None
- Canonical files described:
  - `handoff.md`
  - `docs/completed-tasks.md`
  - `docs/specs/settings-and-audit.md`
  - `docs/design/memo-capture-design-learnings.md`
  - `docs/env.md`
  - `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`
  - `apps/api/src/config.ts`
  - `apps/api/src/repositories/settings.ts`
  - `apps/api/src/services/settings.ts`
  - `apps/api/src/services/ai-expansion.ts`
  - `apps/api/src/services/llm.ts`
  - `apps/desktop/src/App.tsx`
- Non-Git artifacts updated on disk:
  - `dist/applauncher-manifests/memo-capture/0.1.0/manifest.json`
  - `dist/applauncher-manifests/memo-capture-native/0.1.0/manifest.json`
  - `/Users/paulmarshall/Library/Application Support/AppLauncher/manifest-install/memo-capture/0.1.0/manifest.json`
  - `/Users/paulmarshall/Library/Application Support/AppLauncher/manifest-install/memo-capture-native/0.1.0/manifest.json`
- Last verification:
  - command: `node --test --import tsx apps/api/tests/llm-prompt.test.ts`; `node --test --import tsx apps/api/tests/backend-foundation.test.ts`; `node --test apps/desktop/tests/app-copy.test.ts`; AppLauncher manifest validation for repo and install-source web/native manifests; `npm run typecheck`; `npm test`; `npm run test:postgres`; `npm run verify`; `git diff --check`; `npm run tauri:build -w @memo-capture/desktop -- --bundles app`
  - result: passed
  - timestamp UTC: 2026-06-04T00:36Z
- Handoff freshness: fresh-to-dirty-tree
- Safe-to-continue basis: current `HEAD`, dirty tree, non-Git manifest artifacts, installed AppLauncher manifests, Postgres migration verification, full repo verification, and rebuilt native app are recorded here.
- Next checkpoint action: review the dirty diff and commit only if explicitly requested.

## 2. Executive Summary

Memo Capture now has task-aware LLM routing instead of a single global development LLM path. Backend settings include provider catalog metadata, seeded AI task definitions and global routes, and a user-created task path that starts new hooks as `Not implemented` no-ops until app logic exists.

The Providers screen now carries provider/task readiness: AppLauncher runtime option status, task routing, user-created task hooks, and provider catalog rows. The redundant top Settings banner for the development provider has been removed.

AppLauncher runtime selection is represented in the web and native manifests as `manifestVersion: "1.2.0"` runtime options. Runtime options contain only non-secret provider/model/endpoint selectors; OpenAI-compatible API keys are declared as AppLauncher secrets with env delivery. The native manifest keeps the `scripts/applauncher-native-dev.sh` `executablePath` wrapper so AppLauncher can inject runtime-option env vars.

Completed work history is tracked in `docs/completed-tasks.md`; do not duplicate it here.

## 3. Current Objective

The requested multi-provider/runtime-options implementation is complete.

Definition of done met:

- Provider catalog supports `local-dev` and `openai-compatible`.
- Seeded AI tasks: `memo-expansion`, `suggest-new-memos`, `suggest-selected-tags`, and `ocr`.
- Memo expansion resolves provider/model through the task route plus AppLauncher runtime env.
- User-created tasks can be added and show `Not implemented` until app logic exists.
- OCR is represented as a task and remains no-op/not implemented.
- AppLauncher web/native manifests use runtime options and secrets correctly.
- Native `.app` bundle was rebuilt.

## 4. Current State

### Working

- `GET /api/settings` returns provider catalog metadata, AI task routes, and AppLauncher runtime status.
- `PATCH /api/settings/providers/{providerConfigId}` updates provider enabled/model/endpoint settings without returning secrets.
- `POST /api/settings/ai-tasks` creates user-defined task hooks with disabled routes and `implemented = false`.
- `PATCH /api/settings/ai-tasks/{taskDefinitionId}/route` updates global task routes.
- Memo expansion requires route enabled, hook implemented, selected provider enabled, required secrets present, and runtime env selecting the same provider.
- Unknown/user-created hooks display `Not implemented` and are blocked from provider calls.
- OpenAI-compatible LLM adapter sends strict JSON chat-completions requests when configured.
- Settings > Providers shows AppLauncher status, Task routing, Add task hook, and Provider catalog.
- AppLauncher install-source manifests have been updated and validated.
- Native app bundle exists at `apps/desktop/src-tauri/target/release/bundle/macos/Memo Capture.app`; timestamp checked as `Jun 4 10:36:48 2026`.

### Partially Working

- Suggested new memos, suggested selected tags, and OCR are configured as task rows but do not yet have processing handlers.
- User-created task hooks are routable in settings but intentionally no-op until handler logic is added.

### Not Working Yet

- No OCR provider handler exists yet.
- No AppLauncher UI refresh/relaunch was performed in this thread; AppLauncher should refresh manifests and relaunch Memo Capture to inject new runtime env selections.

### Not Yet Verified

- No live Chrome/native UI smoke was run after the rebuild. Static desktop copy tests and full build verification passed.

## 5. Active Constraints

- Follow `AGENTS.md`; default to Build Mode.
- Do not commit, tag, release, publish, delete files, or install dependencies unless explicitly requested.
- Never use `latest`; always use numbered versions.
- Backend settings are canonical; watched-folder/archive paths remain desktop-local.
- Desktop clients must not connect directly to Postgres or object storage.
- AI output consumed by code must be strict structured JSON and validated before storage.
- Secrets must not be stored in Memo Capture DB or AppLauncher runtime options.
- AppLauncher owns launch-time runtime option selection; Memo Capture owns provider/task semantics.
- For native-testable changes, rebuild the runnable `.app`; do not create a DMG unless explicitly requested.

## 6. Commands and Verification

Passed:

```bash
node --test --import tsx apps/api/tests/llm-prompt.test.ts
node --test --import tsx apps/api/tests/backend-foundation.test.ts
node --test apps/desktop/tests/app-copy.test.ts
node "/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs" --manifest dist/applauncher-manifests/memo-capture/0.1.0/manifest.json
node "/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs" --manifest dist/applauncher-manifests/memo-capture-native/0.1.0/manifest.json --verify-native-launch-targets
node "/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs" --manifest "/Users/paulmarshall/Library/Application Support/AppLauncher/manifest-install/memo-capture/0.1.0/manifest.json"
node "/Users/paulmarshall/Software Development/All Skills/applauncher-manifest/scripts/validate_manifest.mjs" --manifest "/Users/paulmarshall/Library/Application Support/AppLauncher/manifest-install/memo-capture-native/0.1.0/manifest.json" --verify-native-launch-targets
npm run typecheck
npm test
npm run test:postgres
npm run verify
git diff --check
npm run tauri:build -w @memo-capture/desktop -- --bundles app
```

Verification notes:

- Initial sandboxed `npm test` failed only on route-test `listen EPERM`; rerun with local bind permission passed.
- Initial sandboxed `npm run test:postgres` failed on Docker socket permission; rerun with Docker access passed.
- The first Postgres rerun exposed a real duplicate seed UUID in migration `0021`; fixed by moving OpenAI-compatible provider to `00000000-0000-4000-8000-000000000303`, then `npm run test:postgres` passed.
- AppLauncher native manifest validation checked the `executablePath` target.

Useful next commands:

```bash
git status --short --branch
git diff --check
npm run verify
npm run test:postgres
```

## 7. Files to Open First

- `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`: provider catalog and task-route schema/seed data.
- `apps/api/src/config.ts`: global and task-specific LLM runtime env parsing.
- `apps/api/src/services/ai-expansion.ts`: memo-expansion route/runtime readiness checks.
- `apps/api/src/services/llm.ts`: local-dev and OpenAI-compatible adapter boundary.
- `apps/api/src/repositories/settings.ts`: provider catalog, AI task route, and user-created task persistence.
- `apps/api/src/services/settings.ts`: settings serialization, task readiness, redacted secret status.
- `apps/desktop/src/App.tsx`: Providers screen AppLauncher status, task routing, Add task hook, provider catalog.
- `docs/specs/settings-and-audit.md`: canonical settings/task/provider contract.
- `docs/design/memo-capture-design-learnings.md`: product/architecture notes for task routing and no-op hooks.

## 8. Next Actions

Next:

- Refresh AppLauncher manifests in the AppLauncher UI and relaunch Memo Capture so runtime-option env values are injected.
- Review the dirty diff and commit only if explicitly requested.

Later:

- Add real handlers for `suggest-new-memos`, `suggest-selected-tags`, and `ocr`.
- Add live native/Chrome smoke coverage if further UI behavior changes.

Blocked:

- None.

## 9. Ready-Made Prompt for Starting a New Thread

Read `/Users/paulmarshall/Software Development/memo-capture/handoff.md` as the hot-context source. Treat the current checkpoint as `main` at `9b329f7` with a dirty tree implementing multiple LLM providers and AppLauncher `manifestVersion: "1.2.0"` runtime options. Open `apps/api/db/migrations/0021_llm_task_routing_and_runtime_options.sql`, `apps/api/src/config.ts`, `apps/api/src/services/ai-expansion.ts`, `apps/api/src/services/llm.ts`, `apps/api/src/services/settings.ts`, `apps/api/src/repositories/settings.ts`, and `apps/desktop/src/App.tsx` first. Preserve the AppLauncher boundary: runtime options are non-secret provider/model/endpoint selectors, API keys are AppLauncher secrets/env, and the native manifest must keep `executablePath` so runtime env injection works.
