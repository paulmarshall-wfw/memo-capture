# Workflow Definition Enforcement Hardening

## Summary
Fix the remaining workflow-definition honor gaps without changing the active workflow JSON. The implementation should make the backend the authority for action visibility, validate only the workflow features Memo Capture can actually execute, and fail unsupported future workflow shapes at import/activation time instead of at user-click time.

## Key Changes
- Enforce action visibility server-side:
  - Change workflow action projection/execution so public `POST /api/work-items/:id/actions/:actionId` rejects `visible: false` actions, even if a caller knows the action ID.
  - Keep automatic actions rejected from the public endpoint unless a dedicated internal automatic-action runner is added later.
  - Add regression coverage proving hidden user actions are absent from allowed actions and cannot be posted directly.

- Make hook validation phase-aware:
  - Define the V1 executable hook matrix:
    - `on_state_entry` supports `create_accepted_snapshot` and `classify_item`.
    - `while_in_state` supports `nominate_tags` only when a valid schedule exists.
  - Update workflow bundle validation to reject supported handler keys used in unsupported phases, rather than accepting them and failing during execution.
  - Keep the existing `failed.review -> needs_review -> classify_item` behavior working.

- Treat input-required actions as unsupported for the generic V1 action surface:
  - Keep frontend behavior filtering `requiresInput` actions out of generic row buttons.
  - Add backend validation that rejects workflow bundles exposing user-visible `requiresInput` actions until a real input form/handler contract exists.
  - Leave non-visible input actions unsupported as well unless there is an explicit internal handler path.

- Tighten runtime projection consistency:
  - `getAllowedActions()` should return only public executable actions: `trigger: "user"`, `visible: true`, no unsupported input requirements, and valid source state.
  - `executeAction()` should use the same executable-action predicate as `getAllowedActions()` so display and execution cannot drift.
  - Preserve bucket projection behavior: hidden buckets stay hidden; visible buckets remain definition-driven.

## Tests
- Add focused API/runtime tests for:
  - hidden user action is not listed and direct POST is rejected.
  - automatic action is not listed and direct POST is rejected.
  - `on_state_entry` with `nominate_tags` fails bundle validation.
  - `while_in_state` with `classify_item` or `create_accepted_snapshot` fails bundle validation.
  - `while_in_state` `nominate_tags` without valid schedule fails validation.
  - visible `requiresInput` user action fails validation in V1.
  - current bundled workflow still validates, stages, activates, and executes `failed.review`, `review.memo`, `memo.accepted`, and `nominate_tags`.
- Run verification:
  - focused workflow runtime tests.
  - focused backend workflow/action tests.
  - `npm run typecheck`.
  - `npm run verify`.

## Assumptions
- Do not modify the workflow definition JSON.
- Prefer fail-fast validation over implementing generic input-required actions or automatic transition execution in this slice.
- Keep V1 scoped to visible, no-input, user-triggered workflow actions plus the three known app-owned hook handlers.
