# Ephemeral AI Review Modals And Prompt Schema Defaults

## Summary

Split AI task outputs into clear modal-reviewed results and make external LLM prompts self-describing. Each task’s System message will include the exact JSON shape the model must return, and Settings will provide a restore-default control beside the System message label.

## Key Changes

- Implement two task outcomes:
  - `expand memo`: returns one expanded memo candidate, opens a modal, and never changes the detail draft until accepted.
  - `suggest new work items`: returns ephemeral candidate work items, opens a modal, and creates real work items only when a candidate is accepted.
- Update task-run JSON contracts:
  - `expanded_memo`: `{ "expanded_work_item": { "title": "string", "body": "string", "tags": ["string"] } }`
  - `suggested_work_items`: `{ "suggested_work_items": [{ "title": "string", "body": "string", "tags": ["string"], "rationale": "string" }] }`
- Put the expected JSON shape directly in the task-owned System message sent to external LLM providers.
- Keep backend validation as authoritative; invalid or wrong-shaped JSON creates a failed AI run and no draft/work-item changes.

## Settings UI

- Add hook-aware default System messages:
  - `memo-expansion` default instructs the model to return only `expanded_work_item`.
  - `suggest-new-memos` default instructs the model to return only `suggested_work_items`.
- Add a small icon button to the right of the `System message` label in the Tasks prompt editor.
  - Use a restore/undo-style icon.
  - Tooltip/title: `Restore default system message`.
  - Clicking it replaces only the System message field with the default for the selected task hook.
  - It does not save immediately; the user still saves the task/prompt settings.
- When the task hook changes, do not overwrite a user-edited System message automatically. The restore button is the explicit action.

## Desktop Review UI

- Remove inline suggested-work-item rows from the work item detail panel.
- Add scrollable modal review surfaces:
  - Expanded memo modal: Accept stages generated title/body into the current draft; Reject or close discards it.
  - New work item suggestions modal: Accept creates a durable work item and removes that card; Reject removes that card; close discards all remaining candidates.
- Keep the selected parent memo active while reviewing and accepting suggestions.
- Refresh the work queue after accepted suggested work items, without navigating away from the parent memo.

## API And Service Behavior

- Dispatch task runs by `hook_key`:
  - `memo-expansion` returns only an expanded memo candidate.
  - `suggest-new-memos` returns only ephemeral suggested work item candidates.
- Mark `suggest-new-memos` as an implemented hook.
- Stop creating `ai_suggestions` rows during task runs.
- Add an accept endpoint for ephemeral suggested work item candidates that creates:
  - `source_memo` with `source_type = ai_generated`
  - normal `work_item` in `memo`
  - tags and tag-readiness where project-backed
  - audit metadata linking the created item to the parent work item/task run context

## Test Plan

- Verify external-provider request bodies include the task System message with the expected JSON shape.
- Verify restore-default System message updates only the local prompt draft until Save.
- Verify `expand memo` does not mutate the draft before modal Accept.
- Verify accepting expanded memo stages draft changes but does not persist until Save.
- Verify suggested work item candidates are not persisted unless accepted.
- Verify closing either modal discards unaccepted generated content.
- Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run verify`.

## Assumptions

- “Stage Draft” means accepted expanded memo content replaces the editable draft title/body only; backend persistence still requires Save.
- New work item suggestions are ephemeral unless individually accepted.
- The System message is the right prompt field for schema instructions because it is already sent to external OpenAI-compatible providers.
