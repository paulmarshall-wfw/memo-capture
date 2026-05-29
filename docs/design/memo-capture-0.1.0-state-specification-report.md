# State Machine Generation Report

- Target: `editor-state-machine`
- Project: `memo-capture`
- Project path: `/Users/paulmarshall/Software Development/memo-capture`
- Selector mode: `repo`
- Output JSON: `docs/design/memo-capture-0.1.0-state-specification.json`
- State machine ID: `memo_capture_state`
- Definition version: `0.1.0`
- Generation note: the bundled deterministic generator was run first, but did not recognize the current TypeScript tuple constants as strong state evidence. The JSON was completed manually from the repo evidence listed below and validated against the same editor-state-machine contract.

## Emitted States

- `accepted` - `/Users/paulmarshall/Software Development/memo-capture/packages/domain/src/index.ts:10` (work item state constant); `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:125` (known V1 state)
- `failed` - `/Users/paulmarshall/Software Development/memo-capture/packages/domain/src/index.ts:13` (work item state constant); `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:128` (known V1 state)
- `ignored` - `/Users/paulmarshall/Software Development/memo-capture/packages/domain/src/index.ts:12` (work item state constant); `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:127` (known V1 state)
- `needs_ingestion_review` - `/Users/paulmarshall/Software Development/memo-capture/packages/domain/src/index.ts:7` (work item state constant); `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:122` (known V1 state)
- `new_idea` - `/Users/paulmarshall/Software Development/memo-capture/packages/domain/src/index.ts:8` (work item state constant); `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:123` (known V1 state)
- `parked` - `/Users/paulmarshall/Software Development/memo-capture/packages/domain/src/index.ts:9` (work item state constant); `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:124` (known V1 state)
- `rejected` - `/Users/paulmarshall/Software Development/memo-capture/packages/domain/src/index.ts:11` (work item state constant); `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:126` (known V1 state)

## Terminal States

- `failed`
- `ignored`
- `rejected`

## Emitted Transitions

- `accepted` -> `new_idea` - reopen path owned by workflow definition; accepted is explicitly non-terminal in `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:148` and reopen behavior is workflow-definition-owned at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:167`
- `needs_ingestion_review` -> `failed` - unrecoverable failure outcome described at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:270`
- `needs_ingestion_review` -> `ignored` - closed lifecycle outcome preserved as distinct terminal state at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:150`
- `needs_ingestion_review` -> `new_idea` - promotion described at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:55`
- `new_idea` -> `accepted` - idea review outcome described at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-concept.txt:49`
- `new_idea` -> `failed` - explicit failure lifecycle outcome described at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:270`
- `new_idea` -> `ignored` - closed lifecycle outcome preserved as distinct terminal state at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:150`
- `new_idea` -> `parked` - idea review outcome described at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-concept.txt:49`
- `new_idea` -> `rejected` - idea review outcome described at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-concept.txt:49`
- `parked` -> `accepted` - parked is an active state in `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:139`; active parked work can return to review outcomes
- `parked` -> `failed` - explicit failure lifecycle outcome described at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:270`
- `parked` -> `ignored` - closed lifecycle outcome preserved as distinct terminal state at `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:150`
- `parked` -> `new_idea` - parked is an active non-terminal review state in `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:139`
- `parked` -> `rejected` - parked is an active state in `/Users/paulmarshall/Software Development/memo-capture/docs/design/memo-capture-design-learnings.md:139`; active parked work can return to review outcomes

## Normalized Values

- None

## Ambiguous Candidates Not Emitted

- `closed` - bucket grouping only, not a durable lifecycle state.
- `ingestion` - UI bucket ID only, not a durable lifecycle state.
- `new` - UI bucket ID only, not a durable lifecycle state.
- `ai_suggestion`, `pending`, `applied`, `dismissed` - AI suggestion status values, not work-item lifecycle states.
- `ready_to_export` - explicitly excluded as a V1 workflow state.
- `work_item` - entity name, not a lifecycle state.

## Rejected Invalid Candidates

- None

## Validation

- Valid
