# Workflow Runtime Integration

Status: Draft implementation specification
Last updated: 2026-05-29

## Purpose

Define how Memo Capture integrates with State Workflow Runtime for durable work item lifecycle state, bucket metadata, allowed actions, workflow import, validation, activation, and audit.

## Ownership Rule

The backend owns durable business state. The frontend owns transient interaction state.

Workflow actions must be executed through backend/runtime integration. The frontend may display and initiate actions, but it must not be the authority for action availability or lifecycle transitions.

## Known V1 State Contract

Memo Capture expects the active workflow definition to support these state semantics:

- `needs_review`
- `memo`
- `parked`
- `accepted`
- `rejected`
- `ignored`
- `failed`

The active workflow definition owns state IDs, labels, buckets, display order, visible actions, guards, terminality, and reopen behavior.

Memo Capture owns only app-side compatibility:

- successful captures start in `memo`
- incomplete or low-confidence captures start in `needs_review`
- workflow hook handlers must be implemented by the app before activation
- app-owned side effects remain backend-enforced

The workflow definition may group `rejected`, `ignored`, and `failed` however the definition author chooses. The app must not hardcode a closed bucket.

## App Capabilities

`requiredAppCapabilities` is app-owned compatibility metadata. State-workflow definitions do not need it to describe states, actions, buckets, or hooks, but a bundle can declare capabilities when activation needs app support for side effects.

Current supported capability:

```json
{
  "requiredAppCapabilities": [
    "memo-capture.workflow-hooks.create_accepted_snapshot.v1"
  ]
}
```

The app also validates hook `handlerKey` values. V1 supports:

```json
["create_accepted_snapshot", "classify_item"]
```

## Runtime Capabilities

The backend workflow adapter must provide these operations:

- load active definition
- validate bundle structure with `state-workflow-runtime` package normalization
- validate app compatibility
- resolve bucket metadata
- get item state
- get allowed actions for caller and work item
- execute action
- return transition result and side-effect instructions

The adapter accepts both editor-exported top-level workflow bundles and normalized runtime bundles with
`workflowDefinition` plus `embeddedStateMachineDefinition`, using the numbered runtime package family that supports the
bundle schema version. App-owned capability, migration, and hook-handler checks remain Memo Capture responsibility.

Adapter interface shape:

```ts
interface WorkflowRuntimeAdapter {
  validateBundle(bundle: unknown): Promise<WorkflowValidationResult>;
  getBuckets(activeDefinition: ActiveWorkflowDefinition): WorkflowBucket[];
  getAllowedActions(input: AllowedActionsInput): Promise<AllowedWorkflowAction[]>;
  executeAction(input: ExecuteWorkflowActionInput): Promise<WorkflowActionResult>;
}
```

## Generic Action Rendering

The frontend renders visible no-input actions generically from `getAllowedActions`.

Custom UI is allowed only when an action requires:

- user input
- confirmation
- app-owned side effects
- specialized preview or validation

The frontend must not hardcode:

- action availability
- reopen behavior
- bucket labels
- bucket state membership
- lifecycle transition guards

## App-Owned Side Effects

These are not workflow transitions by themselves:

- AI expansion
- export generation
- artifact upload/finalization
- settings changes
- workflow import/staging/activation

They may create records or jobs and may later make workflow actions available, but they do not directly mutate lifecycle state unless they call a workflow action.

## Workflow Tables

### workflow_active_definition

Stores only the active workflow bundle body.

Required columns:

- `singleton_id boolean primary key default true`
- `workflow_id text not null`
- `workflow_version text not null`
- `state_machine_version text not null`
- `required_app_capabilities jsonb not null`
- `content_hash text not null`
- `bundle jsonb not null`
- `activated_by uuid references app_users(id)`
- `activated_at timestamptz not null`

Rules:

- Exactly one active definition exists.
- Activation replaces the previous active bundle body.
- The app does not retain old workflow bundle bodies.
- Rollback requires re-importing a known-good external bundle.

### workflow_activation_history

Records activation metadata without retaining old bundle bodies.

Required columns:

- `id uuid primary key`
- `workflow_id text not null`
- `previous_workflow_version text`
- `previous_state_machine_version text`
- `previous_content_hash text`
- `new_workflow_version text not null`
- `new_state_machine_version text not null`
- `new_content_hash text not null`
- `activation_notes text not null`
- `compatibility_result jsonb not null`
- `activated_by uuid references app_users(id)`
- `activated_at timestamptz not null`

### workflow_staged_imports

Stores a validated staged workflow bundle before activation.

Required columns:

- `id uuid primary key`
- `workflow_id text not null`
- `workflow_version text not null`
- `state_machine_version text not null`
- `content_hash text not null`
- `bundle jsonb not null`
- `validation_result jsonb not null`
- `status text not null`
- `imported_by uuid references app_users(id)`
- `created_at timestamptz not null`
- `activated_at timestamptz`

Statuses:

- `staged`
- `activated`
- `discarded`
- `invalid`

## Import And Activation Flow

1. User opens Operations.
2. User imports workflow bundle.
3. Backend validates bundle and stores a staged import.
4. UI shows validation result, identity, version, content hash, changelog, warnings, and activation implications.
5. User explicitly activates a staged bundle.
6. Backend revalidates the staged bundle transactionally.
7. Backend checks active processing job compatibility.
8. Backend rejects incompatible activation or activates atomically.
9. Backend writes workflow activation history and audit event.

Activation requires explicit confirmation because it affects all work items.

## Validation Rules

Bundle validation must verify:

- `workflow_id`
- `version`
- state machine version
- known V1 state semantics
- app initial-state policy can map to `needs_review` and `memo`
- app-supported handlers and guards
- app-supported side-effect bindings
- required app capability set
- export or action compatibility when applicable
- bundle content hash

V1 blocks activation if:

- app-code migrations are required
- required guards or handlers are missing
- initial state semantics are incompatible
- active processing jobs depend on workflow actions or states that the activation would invalidate
- normal mode sees a previously activated workflow version with different content

Local-dev mode may allow workflow version reuse with different content.

## Processing Job Compatibility

Activation blocks when active jobs depend on current workflow actions or states.

Active job statuses for activation checks:

- `queued`
- `claimed`
- `running`
- `retry_scheduled`

Activation can warn and proceed only when:

- compatibility checks pass
- active jobs do not depend on workflow actions/states
- no app-code migration is required

## API Contracts

### Get workflow status

`GET /api/workflow/status`

Response:

```json
{
  "active": {
    "workflowId": "memo-capture-review",
    "workflowVersion": "0.1.0",
    "stateMachineVersion": "0.1.0",
    "contentHash": "sha256:...",
    "activatedAt": "2026-05-29T00:00:00.000Z"
  },
  "supportedHookHandlers": ["create_accepted_snapshot"]
}
```

### Import workflow bundle

`POST /api/workflow/imports`

Request:

```json
{
  "bundle": {},
  "notes": "Imported workflow generated from state machine 0.1.0."
}
```

Response:

```json
{
  "stagedImportId": "uuid",
  "status": "staged",
  "validation": {
    "ok": true,
    "warnings": [],
    "errors": []
  },
  "identity": {
    "workflowId": "memo-capture-review",
    "workflowVersion": "0.1.0",
    "stateMachineVersion": "0.1.0",
    "contentHash": "sha256:..."
  }
}
```

### Activate staged workflow

`POST /api/workflow/imports/{stagedImportId}/activate`

Request:

```json
{
  "confirmActivation": true,
  "activationNotes": "Enables V1 review lifecycle."
}
```

Response:

```json
{
  "activated": true,
  "activeWorkflowVersion": "0.1.0",
  "contentHash": "sha256:..."
}
```

### Get buckets

`GET /api/workflow/buckets`

Response:

```json
{
  "buckets": [
    {
      "id": "memos",
      "label": "Memos",
      "order": 20,
      "states": ["memo"]
    }
  ]
}
```

### Get allowed actions

`GET /api/work-items/{workItemId}/actions`

Response:

```json
{
  "workItemId": "uuid",
  "workflowState": "memo",
  "actions": [
    {
      "id": "memo.accept",
      "label": "Accept",
      "visible": true,
      "requiresInput": false,
      "confirmationRequired": false
    }
  ]
}
```

### Execute action

`POST /api/work-items/{workItemId}/actions/{actionId}`

Request:

```json
{
  "expectedVersion": 3,
  "input": {},
  "confirmation": true
}
```

Response:

```json
{
  "workItemId": "uuid",
  "actionId": "memo.accept",
  "previousState": "memo",
  "newState": "accepted",
  "newVersion": 4,
  "createdSnapshotId": "uuid | null",
  "allowedActions": []
}
```

## Transition Side Effects

Accepting an item:

- executes runtime action
- runs the `create_accepted_snapshot` hook supplied by the active workflow definition
- clears `accepted_unexported_changes` on the new snapshot baseline
- writes audit event

Rejecting, ignoring, or failing:

- executes runtime action
- preserves source memo, work item, artifacts, and audit
- remains filterable by workflow state

Reopening:

- only appears if the active workflow definition exposes a visible action
- is not hardcoded by the app

## Audit Events

Workflow events:

- `workflow.imported`
- `workflow.import_failed`
- `workflow.activated`
- `workflow.activation_blocked`
- `workflow.staged_import_discarded`
- `work_item.workflow_action_executed`
- `work_item.workflow_action_rejected`

Audit payloads must include actor, workflow identity, work item ID where relevant, workflow action ID, previous/new states, and sanitized validation details. UI labels are display text only and must not be used as durable audit meaning.

Stable action ID example:

```json
{
  "actionId": "memo.accept",
  "previousState": "memo",
  "newState": "accepted"
}
```

## Runtime Debugger

The Audit workspace debugger is backed by authenticated backend endpoints, not frontend-only state:

- `GET /api/workflow/debugger/snapshot`
- `POST /api/workflow/debugger/start`
- `POST /api/workflow/debugger/pause`
- `POST /api/workflow/debugger/resume`
- `POST /api/workflow/debugger/step`
- `POST /api/workflow/debugger/stop`

Workflow action execution records runtime journal events for action validation, transition commits, state-entry hooks, and audit recording. When the debugger is paused or started in step mode, action execution waits at runtime step boundaries until `resume`, `step`, or `stop` is commanded through the backend debugger API.

## Acceptance Tests

- Bundle requiring missing app capability is rejected.
- Bundle requiring an unsupported hook handler is rejected.
- Import validates and stages without changing active workflow.
- Activation requires explicit confirmation.
- Activation replaces active bundle transactionally.
- Activation blocks when incompatible active jobs exist.
- Work item action availability comes from backend/runtime.
- Illegal action returns a safe 409 or 422 response and does not mutate state.
- Accept action runs `create_accepted_snapshot` exactly once for the transition.
- Reopen action appears only when supplied by the active workflow.
- Debugger controls command backend runtime execution rather than only changing frontend display state.
