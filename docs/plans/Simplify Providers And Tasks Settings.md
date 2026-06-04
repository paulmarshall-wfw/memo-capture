# Simplify Providers And Tasks Settings

## Summary

- Merge `Task Kinds` and `Tasks` into one Settings subsection called `Tasks`.
- Remove Capability keys from the user-facing configuration.
- Make providers user-configurable instead of migration-only/hard-coded rows.
- Keep workflow hooks completely out of scope; task hooks are app-owned registry entries only.

## Key Changes

- Providers:
  - Add create/edit UI and API for provider rows.
  - Fields: Provider Name, derived read-only Provider Key, Provider Kind (`llm`, `stt`, `tts`, `ocr`, `script`), enabled flag, external-send flag, endpoint/base URL, model ID/name, required secret env name.
  - For LLM providers, treat endpoint/model as OpenAI-compatible runtime config.
  - Secrets remain environment/AppLauncher-secret backed and are never stored in the DB.

- Tasks:
  - Replace task-kind/task-route split with one task configuration list.
  - Fields: Task Name, derived read-only Task Key, Provider Key dropdown, read-only Provider Kind, Task Description, Hook Key dropdown, Prompts checkbox, Enabled checkbox.
  - A task can be created even when its selected hook is not implemented.
  - A task cannot be enabled unless its selected hook is implemented with real app logic.

- Task hook registry:
  - Add app-owned registry entries for:
    - `memo-expansion` implemented
    - `revise-memo` no-op / not implemented
    - `suggest-new-memos` no-op / not implemented
    - `suggest-tags` no-op / not implemented
  - No-op entries appear in the Hook Key dropdown but do not call providers and cannot be enabled.

- Prompts:
  - When `Prompts` is checked, show editable prompt fields for that task.
  - Prompt edits update the task’s current prompt configuration in place.
  - Do not create new prompt versions when saving prompt edits.
  - Existing prompt options remain: prompt text, Project synopsis, Memo metadata, Memo text/transcript.

## Test Plan

- API tests for provider create/edit, task create/edit, derived keys, provider compatibility, and enablement rejection for no-op hooks.
- Desktop tests for the merged Tasks UI, provider dropdown, provider-kind display, prompt panel visibility, and no Capability-key copy.
- Verify with `npm run typecheck`, desktop tests, `npm run test:postgres`, and rebuild the native `.app`.

## Assumptions

- Provider Key and Task Key are stable after creation.
- No-op hooks are registered for configuration only; they are not treated as executable.
- This change does not alter workflow definitions, workflow hook handlers, or workflow runtime behavior.
