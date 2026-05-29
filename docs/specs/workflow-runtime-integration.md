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

- `needs_ingestion_review`
- `new_idea`
- `parked`
- `accepted`
- `rejected`
- `ignored`
- `failed`

The active workflow definition may define labels, buckets, display order, visible actions, guards, and reopen behavior. The app requires semantic compatibility, not hardcoded visual labels.

## Required Bucket Roles

Every activatable workflow bundle must define bucket metadata for:

- `ingestion_review`
- `new_ideas`
- `accepted`
- `closed`

The `closed` bucket visually groups `rejected`, `ignored`, and `failed`, but those states remain semantically distinct, filterable, and auditable.

## Runtime Capabilities

The backend workflow adapter must provide these operations:

- load active definition
- validate bundle structure
- validate app compatibility
- resolve bucket metadata
- get item state
- get allowed actions for caller and work item
- execute action
- return transition result and side-effect instructions

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
- `variant_key text not null`
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
- `variant_key text not null`
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
- `variant_key text not null`
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
4. UI shows validation result, identity, version, variant, content hash, changelog, warnings, and activation implications.
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
- `variant`
- state machine version
- required bucket roles
- known V1 state semantics
- initial states include `needs_ingestion_review` and `new_idea`
- app-supported handlers and guards
- app-supported side-effect bindings
- required app capability set
- export or action compatibility when applicable
- bundle content hash

V1 blocks activation if:

- app-code migrations are required
- required guards or handlers are missing
- required bucket roles are missing
- initial state semantics are incompatible
- active processing jobs depend on workflow actions or states that the activation would invalidate
- normal mode sees a previously activated version/variant with different content

Local-dev mode may allow workflow version/variant reuse with different content.

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
    "variantKey": "default",
    "workflowVersion": "0.1.0",
    "stateMachineVersion": "0.1.0",
    "contentHash": "sha256:...",
    "activatedAt": "2026-05-29T00:00:00.000Z"
  },
  "bucketRoles": ["ingestion_review", "new_ideas", "accepted", "closed"]
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
    "variantKey": "default",
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
      "role": "new_ideas",
      "label": "New ideas",
      "order": 20,
      "states": ["new_idea"]
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
  "workflowState": "new_idea",
  "actions": [
    {
      "id": "accept",
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
  "previousState": "new_idea",
  "newState": "accepted",
  "newVersion": 4,
  "createdSnapshotId": "uuid | null",
  "allowedActions": []
}
```

## Transition Side Effects

Accepting an item:

- executes runtime action
- creates accepted snapshot if transition lands in `accepted`
- clears `accepted_unexported_changes` on the new snapshot baseline
- writes audit event

Rejecting, ignoring, or failing:

- executes runtime action
- preserves source memo, work item, artifacts, and audit
- remains filterable by terminal state

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

Audit payloads must include actor, workflow identity, work item ID where relevant, previous/new states, action ID, and sanitized validation details.

## Acceptance Tests

- Bundle without required bucket roles is rejected.
- Bundle requiring missing app capability is rejected.
- Import validates and stages without changing active workflow.
- Activation requires explicit confirmation.
- Activation replaces active bundle transactionally.
- Activation blocks when incompatible active jobs exist.
- Work item action availability comes from backend/runtime.
- Illegal action returns a safe 409 or 422 response and does not mutate state.
- Accept action creates an accepted snapshot exactly once for the transition.
- Reopen action appears only when supplied by the active workflow.

