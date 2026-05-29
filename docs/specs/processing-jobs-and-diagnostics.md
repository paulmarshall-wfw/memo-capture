# Processing Jobs And Diagnostics

Status: Draft implementation specification
Last updated: 2026-05-29

## Purpose

Define V1 background job processing, Postgres-backed queue semantics, retry/cancel behavior, diagnostics, provider observability, and worker/API boundaries.

## Scope

V1 uses Postgres as the job queue. Redis and external queue systems are out of scope.

The API process and worker process are separate commands in the same codebase. The worker calls shared service code directly, not HTTP endpoints.

## Job Kinds

V1 job kinds:

- `transcribe_audio`
- `extract_memo_metadata`
- `generate_keywords`
- `expand_work_item`
- `generate_export_batch`

## Job Statuses

Canonical statuses:

- `queued`
- `claimed`
- `running`
- `succeeded`
- `retry_scheduled`
- `failed`
- `exhausted`
- `cancelled`

User-facing status labels:

- queued
- running
- retry scheduled
- failed recoverable
- failed terminal
- completed
- cancelled

## processing_jobs Table

Required columns:

- `id uuid primary key`
- `job_kind text not null`
- `status text not null`
- `source_memo_id uuid references source_memos(id)`
- `work_item_id uuid references work_items(id)`
- `export_batch_id uuid references export_batches(id)`
- `attempt_count integer not null default 0`
- `max_attempts integer not null default 1`
- `run_after timestamptz not null default now()`
- `claimed_by text`
- `claim_expires_at timestamptz`
- `cancel_requested_at timestamptz`
- `cancel_requested_by uuid references app_users(id)`
- `error_code text`
- `user_safe_error_message text`
- `internal_error_detail text`
- `provider_name text`
- `model_name text`
- `input_tokens integer`
- `output_tokens integer`
- `estimated_cost_minor_units integer`
- `estimated_cost_currency text`
- `latency_ms integer`
- `initiated_by uuid references app_users(id)`
- `created_at timestamptz not null`
- `started_at timestamptz`
- `completed_at timestamptz`

Indexes:

- `(status, run_after, claim_expires_at)`
- `(job_kind, status)`
- `(source_memo_id)`
- `(work_item_id)`
- `(export_batch_id)`
- `(created_at)`

## Job Claiming

Worker claim behavior:

1. Select due jobs with status `queued` or `retry_scheduled`.
2. Include jobs whose prior claim expired.
3. Lock rows with `FOR UPDATE SKIP LOCKED`.
4. Set status `claimed`, `claimed_by`, and `claim_expires_at`.
5. Move to `running` when execution starts.
6. Extend lease for long-running work where practical.

Lease expiry:

- Stuck claimed/running jobs become reclaimable after `claim_expires_at`.
- Reclaimed jobs increment attempt count only when actual execution starts.

## Retry Semantics

Retryable failures:

- provider timeout
- provider rate limit
- transient network error
- temporary object storage read/write error
- invalid structured AI output where retry budget remains
- recoverable extraction failure

Non-retryable failures:

- unsupported file type after validation
- missing required source artifact
- invalid workflow side-effect contract
- malformed prompt schema
- authorization/configuration errors that require operator action

Retry scheduling:

- bounded by `max_attempts`
- uses increasing delay
- stores last error code and user-safe message
- records provider/model snapshot where available

Automatic transcription retry count is configurable.

## Cancel Semantics

Queued job:

- Can be cancelled immediately.
- Status becomes `cancelled`.
- Audit event is written.

Running job:

- Records `cancel_requested_at`.
- Worker checks cancellation between steps.
- Provider cancellation is attempted only where cheap and reliable.
- If cancellation succeeds, status becomes `cancelled`.
- If work completes first, status may become `succeeded`.

Cancel actions must be audited.

## Manual Retry

Manual retry:

- Allowed for failed recoverable jobs and exhausted jobs where inputs still exist.
- Creates a new attempt on the same job or a replacement job with linkage.
- Uses current configured provider unless the job has a fixed provider snapshot.
- Is audited.

## Job Kind Behavior

### transcribe_audio

Input:

- source memo with audio artifact

Behavior:

- call configured transcription provider or local/NAS service
- store current transcript text
- store versioned derived transcript artifact
- enqueue extraction/classification from transcript

Failure:

- recoverable failure keeps work item in `needs_ingestion_review`
- user can play audio and manually enter transcript/body
- terminal `failed` workflow state is reserved for explicit unrecoverable/system/user failure

### extract_memo_metadata

Input:

- source memo text or transcript

Output:

- candidate project
- candidate feature group
- title
- body
- contributor suggestion
- tags
- confidence metadata

Rules:

- Low confidence enters or remains in `needs_ingestion_review`.
- Confidence scores do not block promotion once a signed-in user supplies required fields.
- AI/extraction may suggest projects, feature groups, contributors, and tags, but creation/confirmation follows settings rules.

### generate_keywords

Input:

- work item body and source context

Output:

- normalized tag suggestions or assignments depending on confidence and user review policy

### expand_work_item

Input:

- work item fields
- source memo/body
- project context
- prompt version

Output:

- validated `ai_suggestions`

Rules:

- AI expansion is app-owned, not a workflow transition.
- Invalid structured output creates diagnostics and no normal suggestion/work-item records.

### generate_export_batch

Input:

- export batch ID
- exact accepted snapshot IDs
- export options/template

Output:

- manifest artifact
- JSON Lines artifact
- Markdown artifacts
- combined Markdown artifact

Failure:

- visible in export view and global jobs diagnostics
- retryable where artifacts can be safely regenerated

## Diagnostics Surfaces

Item-level diagnostics:

- source memo import history
- artifact upload/finalize status
- transcription/extraction jobs
- possible duplicates
- archive warnings
- source/provenance details

Global Jobs diagnostics:

- filters by status, job kind, date range, provider, source/work item
- shows queued/running/retry/failed/completed/cancelled
- retry and cancel actions
- provider/model details
- timing, token, and cost metadata where available
- sanitized user-safe message
- expandable internal diagnostic detail

System diagnostics:

- API health
- worker heartbeat or last seen
- Postgres connectivity
- object storage connectivity
- auth/OIDC status
- provider health
- app version
- commit SHA
- DB schema version
- active workflow version
- export schema version

V1 uses UI failure indicators only; no active failure notifications.

## API Contracts

### List jobs

`GET /api/jobs`

Filters:

- `status`
- `job_kind`
- `source_memo_id`
- `work_item_id`
- `export_batch_id`
- `provider_name`
- `created_from`
- `created_to`

Response:

```json
{
  "jobs": [
    {
      "id": "uuid",
      "jobKind": "transcribe_audio",
      "status": "retry_scheduled",
      "attemptCount": 1,
      "maxAttempts": 3,
      "runAfter": "2026-05-29T00:00:00.000Z",
      "sourceMemoId": "uuid",
      "workItemId": "uuid",
      "providerName": "provider",
      "modelName": "model",
      "userSafeErrorMessage": "Transcription timed out. It will retry automatically."
    }
  ]
}
```

### Get job

`GET /api/jobs/{jobId}`

### Retry job

`POST /api/jobs/{jobId}/retry`

Request:

```json
{
  "reason": "Manual retry after provider recovered."
}
```

### Cancel job

`POST /api/jobs/{jobId}/cancel`

Request:

```json
{
  "reason": "No longer needed."
}
```

### Get work item diagnostics

`GET /api/work-items/{workItemId}/diagnostics`

## Logging

Backend and worker logs should be structured JSON in production-like modes.

Required context:

- log level
- timestamp
- service
- version
- commit SHA
- request ID or job ID
- actor ID where applicable
- operation name
- sanitized error code/message

Never log:

- tokens
- API keys
- passwords
- raw provider secrets
- raw audio
- unnecessary memo body content
- raw LLM responses by default

## Acceptance Tests

- Worker claims one due job with row locking and does not double-claim under concurrency.
- Lease-expired jobs become reclaimable.
- Retryable failure schedules retry and preserves user-safe error.
- Exhausted retry budget marks job exhausted.
- Manual retry writes audit event.
- Cancel queued job marks cancelled.
- Cancel running job records cancellation request.
- Transcription failure leaves item recoverable in ingestion review.
- Invalid AI structured output creates failure diagnostics and no suggestions.
- Export generation failure can be retried without changing included snapshot IDs.

