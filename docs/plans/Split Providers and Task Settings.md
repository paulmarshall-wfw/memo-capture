# Split Providers and Task Settings

## Summary

Move Settings toward a provider-instance catalog plus task-owned routing/prompt configuration.

- `Providers` page shows only configured provider instances and whether each is enabled.
- New `Tasks` settings page owns task kinds, task definitions, hook readiness, provider routing, route enablement, and prompt fields.
- Remove the standalone `AI prompts` page by attaching the same prompt fields/versioning to each AI-backed task.
- Derive `taskKey` from display name; do not expose manual task-key entry.

## Key Changes

- Add configurable task-kind records with routing compatibility metadata: kind key, display name, provider kind/capability target, whether prompt fields apply, and active/enabled state.
- Treat provider catalog rows as named provider instances, supporting multiple `llm`, `stt`, `ocr`, `tts`, etc. providers side by side.
- Add provider capability metadata so task routes can filter compatible providers instead of assuming all AI tasks use LLM providers.
- Change task creation/editing so:
  - display name is user-entered
  - task key is derived and previewed read-only
  - hook key is selected from registered app hooks when implemented
  - custom/unregistered hooks may exist but remain `Not implemented` and cannot be enabled
  - route enablement is blocked unless hook logic exists
- Move prompt editing into task rows/details for prompt-using task kinds, preserving current fields: prompt text, project synopsis toggle, memo metadata toggle, memo text/transcript toggle, output schema, active version, and prompt provenance.

## API And Data Model

- Add/migrate tables for `task_kinds` and provider capabilities; update `ai_task_definitions` to reference configured task kinds.
- Keep existing `ai_task_routes.enabled`, but enforce enablement server-side: implemented hook, compatible enabled provider, required secret/runtime readiness.
- Replace `POST /api/settings/ai-tasks` manual `taskKey` with server-side derivation from `displayName`; return conflict details if the derived key already exists.
- Keep prompt version history, but associate prompt definitions/versions with task definitions rather than exposing a global prompts settings page.
- Update `GET /api/settings` to return `taskKinds`, task-owned prompt summaries, registered hook metadata, and provider capability metadata.

## UI Plan

- Settings nav becomes: Watched folders, File types, Suppressed Tags, Providers, Tasks, Export contract, Operations, Diagnostics.
- `Providers` page:
  - dense catalog list/table
  - provider display name, provider kind, adapter, enabled checkbox, health/secret/runtime status where needed
  - no task routing, no Add task hook, no prompt controls
- `Tasks` page:
  - top configuration area for task kinds
  - task list grouped/filterable by kind
  - task detail rows with derived task key, hook selector/status, provider selector, model override, enabled checkbox, readiness reason
  - prompt editor shown only for prompt-using task kinds
- Use existing settings row/table patterns and keep the page dense and operational, not marketing-style.

## Test Plan

- Add API tests for task-key derivation, duplicate derived keys, task-kind compatibility, blocked enablement for unimplemented hooks, and provider capability filtering.
- Add migration/Postgres tests for multiple providers of the same kind and task prompt version preservation.
- Update desktop tests for Settings nav changes, removed AI Prompts page, Providers-only catalog, and Tasks route/prompt controls.
- Run `npm run typecheck`, focused API tests, `npm run test:postgres`, `npm run verify`, and rebuild the native `.app` bundle for user-facing settings changes.

## Assumptions

- Provider catalog rows are provider instances.
- Hook keys are selected from registered app hooks; custom hooks stay disabled until code exists.
- Task kinds control routing compatibility and whether prompt fields apply.
- Existing prompt history should be migrated, not discarded.
