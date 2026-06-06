# Ephemeral AI Review Modals For Memo Expansion And New Work Item Suggestions

## Summary

Split the current combined AI task behavior into two task outcomes:

- `expand memo`: generates one expanded memo candidate, opens a modal, and does not touch the detail draft until the user accepts it.
- `suggest new work items`: generates ephemeral suggested work item candidates, opens a modal, and creates real work items only for candidates the user accepts.

Generated expanded memo content and generated new work item suggestions are both session/modal-local. Rejecting a card or closing the modal discards unaccepted generated content.

## Key Changes

- Update task dispatch so `memo-expansion` and `suggest-new-memos` are both implemented hooks.
- Change task-run responses to be typed by result:
  - `expanded_memo`: returns one `expandedWorkItem`.
  - `suggested_work_items`: returns an array of candidate suggestions that are not inserted into `ai_suggestions`.
- Add an accept endpoint for ephemeral suggested work items that creates:
  - `source_memo` with `source_type = ai_generated`
  - normal `work_item` in `memo`
  - tags on the created item, with tag readiness marked when project-backed
  - audit metadata linking back to the parent work item and task run context
- Keep legacy AI suggestion routes available for compatibility, but stop using inline `aiSuggestions` rows for task-rendered detail buttons.
- Update docs to state that task-generated modal candidates are ephemeral and separate from persisted accepted work items.

## Desktop UI

- Remove the inline “Suggested new work item” list from the work item detail panel.
- Add an accessible scrollable modal component in `apps/desktop/src/App.tsx` / CSS:
  - `role="dialog"`, `aria-modal="true"`, labelled title
  - fixed max height with scrollable body
  - Escape and close button discard remaining unaccepted content
  - background content visually de-emphasized
- For `expand memo`:
  - task completion opens an “Expanded memo suggestion” modal.
  - modal shows generated title/body and provider/model metadata.
  - Accept copies generated title/body into the existing draft only; it does not call Save.
  - Reject or close discards the generated content.
  - Existing project, contributor, and tags remain unchanged.
- For `suggest new work items`:
  - task completion opens a “New work item suggestions” modal.
  - each candidate is shown as its own review card with title, body, tags, rationale, Accept, and Reject.
  - Accept creates the work item, removes that card, and keeps the modal open on the parent memo.
  - Reject removes only that card.
  - Close discards all remaining unaccepted cards.
  - After accepting one or more cards, refresh the bucket/list without switching selection away from the parent item.

## API And Service Behavior

- Refactor `AiExpansionService.runWorkItemTask(...)` to dispatch by `hook_key`:
  - `memo-expansion`: validate and return expanded memo only.
  - `suggest-new-memos`: validate and return ephemeral suggestions only.
- Refactor the LLM provider boundary so local-dev has separate deterministic methods for expansion and suggestions.
- For local-dev:
  - `expand memo` no longer returns acceptance-criteria/new-work suggestions.
  - `suggest new work items` may return deterministic candidate suggestions, but only when that explicit task is run.
- Add request validation for accepting an ephemeral suggestion:
  - required non-empty `title` and `body`
  - `tags` as string array
  - optional `rationale`
  - parent work item must exist
- Do not persist rejected or closed ephemeral candidates.

## Test Plan

- API tests:
  - `memo-expansion` task returns `resultType: "expanded_memo"` and creates no `ai_suggestions`.
  - `suggest-new-memos` task returns `resultType: "suggested_work_items"` and creates no `ai_suggestions`.
  - accepting an ephemeral suggestion creates an `ai_generated` source memo and a `memo` work item under the parent project.
  - unimplemented hooks still cannot be enabled except for newly implemented `suggest-new-memos`.
- Desktop tests:
  - running `expand memo` does not mutate `draft` before modal Accept.
  - accepting expanded memo stages title/body and leaves Save as the persistence step.
  - rejecting or closing expanded memo leaves the draft unchanged.
  - suggested work item modal accepts/rejects individual cards and stays on the parent item.
  - closing the suggestions modal discards remaining candidates.
- Verification:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
  - `npm run verify`
  - note any sandbox-only failures and rerun with approved escalation if local bind or Docker access blocks the normal suite.

## Assumptions

- “Stage Draft” means accepting expanded content replaces the current editable draft title/body, but does not save to the backend.
- New work item suggestions are ephemeral: no pending suggestion records survive modal close, app reload, or item switch.
- Accepted new work item suggestions still create durable normal work items immediately.
- The user will configure separate Tasks/buttons for `expand memo` and `suggest new work items`; the implementation only makes both hooks runnable and renders their results correctly.
