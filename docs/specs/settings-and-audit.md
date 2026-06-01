# Settings And Audit

Status: Draft implementation specification
Last updated: 2026-05-29

## Purpose

Define V1 settings ownership, settings data model, audit event model, redaction rules, and API contracts.

## Ownership Model

Backend settings are canonical.

Desktop-local settings stay local unless a diagnostic or import event needs to report a sanitized result to the backend.

Keeping canonical classification, prompt, provider, and export settings in the backend prevents different machines from classifying the same memo differently.

## Backend-Owned Settings

- projects
- project descriptions/synopses
- tag and keyword grouping thresholds
- contributors and contributor aliases
- supported file type entries and capability state
- extraction confidence thresholds
- transcription retry count
- prompt definitions, prompt versions, and prompt context controls
- export settings/templates
- provider enablement and non-secret provider config
- workflow activation metadata
- auth/OIDC config visibility metadata

## Desktop-Local Settings

- watched folder paths
- archive folder paths
- local staging/cache path
- upload behavior
- local notification preferences
- machine identity
- local cache size cap
- watched-folder recursion setting

Desktop-local settings do not need backend audit in V1.

## Settings Tables

### file_type_settings

Required columns:

- `id uuid primary key`
- `extension text not null`
- `media_kind text not null`
- `capability_state text not null`
- `parser_key text`
- `created_by uuid references app_users(id)`
- `updated_by uuid references app_users(id)`
- timestamps

Capability states:

- `active`
- `inactive`
- `not_supported_yet`

Rules:

- V1 media kinds are `text` and `audio`.
- Implemented text parser keys: `plain-text`, `markdown`.
- Implemented audio parser key: `audio`.
- Default active text: `.txt`, `.md`, `.markdown`.
- Default active audio: `.m4a`, `.mp3`, `.wav`.
- File type capability state is authoritative for watched-folder scanning and watched import upload-session validation.
- Inactive file types are not scanned, uploaded, finalized, or accepted by watched-folder import paths.
- Active file types without an implemented parser are stored as managed artifacts and create `needs_review` work items that prompt parser support; they do not enqueue extraction or transcription jobs.

### prompt_versions

Prompt versions include editable freeform prompt text plus structured context controls.

Context controls:

- `freeformText`
- `includeProjectSynopsis`
- `includeMemoMetadata`
- `includeMemoTranscriptText`

The backend composes the model prompt with freeform text first. Raw audio or video content is never eligible LLM context; audio/video sources may contribute only stored transcripts or extracted text.

### extraction_settings

Required columns:

- `singleton_id boolean primary key default true`
- `project_confidence_threshold numeric not null`
- `contributor_confidence_threshold numeric not null`
- `tag_confidence_threshold numeric not null`
- `updated_by uuid references app_users(id)`
- `updated_at timestamptz not null`

### transcription_settings

Required columns:

- `singleton_id boolean primary key default true`
- `max_retry_attempts integer not null`
- `updated_by uuid references app_users(id)`
- `updated_at timestamptz not null`

### provider_configs

Required columns:

- `id uuid primary key`
- `provider_kind text not null`
- `provider_name text not null`
- `enabled boolean not null default false`
- `endpoint text`
- `model_name text`
- `secret_source text not null`
- `health_status text not null default 'unknown'`
- `last_health_check_at timestamptz`
- `created_by uuid references app_users(id)`
- `updated_by uuid references app_users(id)`
- timestamps

Provider kinds:

- `llm`
- `transcription`

Rules:

- Transcription providers and LLM providers are configured independently.
- Disabled providers never receive jobs.
- Provider secrets come from environment/config in MVP.
- UI displays redacted provider status and non-secret settings.
- Provider/model changes affect only new jobs.
- Jobs snapshot intended provider/model at creation where predictability matters.
- Provider failures mark the provider unhealthy and show diagnostics; they do not auto-disable providers.

### prompt_definitions

Required columns:

- `id uuid primary key`
- `name text not null unique`
- `purpose text not null`
- `active_version integer not null`
- `retention_policy text not null default 'retain_active_and_referenced'`
- timestamps and actor columns

### prompt_versions

Required columns:

- `id uuid primary key`
- `prompt_definition_id uuid not null references prompt_definitions(id)`
- `version integer not null`
- `body text not null`
- `output_schema jsonb not null`
- `created_by uuid references app_users(id)`
- `created_at timestamptz not null`
- unique `(prompt_definition_id, version)`

Rules:

- Editing a prompt creates a new version.
- Previous prompt versions are not mutated.
- Prompt bodies are not retained forever.
- AI run provenance must retain enough prompt/version reference or snapshot metadata to explain historical runs after old prompt bodies expire.

### export_templates

Required columns:

- `id uuid primary key`
- `name text not null unique`
- `schema_version text not null`
- `include_contributor_default boolean not null default true`
- `markdown_template text not null`
- `frontmatter_template jsonb not null`
- `is_active boolean not null default true`
- timestamps and actor columns

## Audit Requirements

Backend audit is required for changes to:

- projects
- tags and keyword grouping metadata
- contributors
- file type support
- confidence thresholds
- prompts
- export templates
- provider configs
- transcription retry count
- workflow import/activation
- auth/OIDC config visibility metadata
- lifecycle actions
- retry/cancel actions
- export batch creation

Audit history is recorded in the database/API for later diagnostics. It does not require a full V1 UI, but diagnostic views should expose enough audit references to debug operations.

## audit_events Table

Required columns:

- `id uuid primary key`
- `event_name text not null`
- `actor_user_id uuid references app_users(id)`
- `actor_email_snapshot text`
- `actor_display_name_snapshot text`
- `subject_type text not null`
- `subject_id text`
- `request_id text`
- `job_id uuid references processing_jobs(id)`
- `source_memo_id uuid references source_memos(id)`
- `work_item_id uuid references work_items(id)`
- `metadata jsonb not null default '{}'`
- `redaction_applied boolean not null default false`
- `created_at timestamptz not null`

Indexes:

- `(event_name, created_at)`
- `(actor_user_id, created_at)`
- `(subject_type, subject_id)`
- `(work_item_id, created_at)`
- `(job_id, created_at)`

## Audit Event Names

Settings:

- `source_memo.created`
- `work_item.created`
- `work_item.updated`
- `project.created`
- `project.updated`
- `project.deactivated`
- `contributor.created`
- `contributor.updated`
- `contributor.alias_added`
- `contributor.merged`
- `contributor.deactivated`
- `file_type_setting.updated`
- `extraction_settings.updated`
- `transcription_settings.updated`
- `provider_config.updated`
- `prompt_version.created`
- `prompt_definition.activated_version`
- `export_template.created`
- `export_template.updated`

Workflow:

- `workflow.imported`
- `workflow.import_failed`
- `workflow.activated`
- `workflow.activation_blocked`
- `workflow.staged_import_discarded`
- `work_item.workflow_action_executed`
- `work_item.workflow_action_rejected`

Jobs:

- `processing_job.retry_requested`
- `processing_job.cancel_requested`
- `processing_job.failed`
- `processing_job.exhausted`

Exports:

- `export_batch.created`
- `export_batch.generation_succeeded`
- `export_batch.generation_failed`
- `export_batch.downloaded`

Auth/system:

- `auth.user_first_seen`
- `auth.user_seen`
- `auth.config_metadata_updated`

## Redaction Rules

Sensitive values must be redacted in audit logs:

- secrets
- tokens
- provider API keys
- OIDC secrets
- storage credentials
- passwords
- raw authorization headers
- raw LLM responses by default
- unnecessary raw memo/audio content

Use structured redaction:

```json
{
  "field": "OBJECT_STORAGE_SECRET_ACCESS_KEY",
  "value": "[REDACTED]",
  "wasPresent": true
}
```

## API Contracts

### Get settings summary

`GET /api/settings`

Response includes backend settings, prompt metadata, file type settings, redacted provider/auth status, and runtime provider availability. It never returns provider secrets.

### Update extraction settings

`PATCH /api/settings/extraction`

### Update transcription settings

`PATCH /api/settings/transcription`

### List file type settings

`GET /api/settings/file-types`

### Create file type setting

`POST /api/settings/file-types`

Creates a configured extension with media kind, capability state, and optional parser key. New extensions are normalized to lowercase with a leading dot.

### Update file type setting

`PATCH /api/settings/file-types/{fileTypeSettingId}`

### List provider configs

`GET /api/settings/providers`

The implemented V1 settings summary currently returns provider configs through `GET /api/settings`; a dedicated provider list route can be added when the UI needs it.

### Update provider config

`PATCH /api/settings/providers/{providerConfigId}`

Request:

```json
{
  "enabled": true,
  "endpoint": "https://provider.example",
  "modelName": "model-1"
}
```

### List audit events

`GET /api/audit-events`

Filters:

- `event_name`
- `actor_user_id`
- `subject_type`
- `subject_id`
- `work_item_id`
- `job_id`
- `created_from`
- `created_to`

### AI expansion suggestions

`POST /api/work-items/{workItemId}/ai-expansions`

Creates an AI expansion run for a work item using the active prompt and an enabled LLM provider config. The provider response must be strict JSON matching the configured output schema shape. Invalid output creates a failed `expand_work_item` processing job and an `ai_expansion.validation_failed` audit event, and does not create suggestions.

`GET /api/work-items/{workItemId}/ai-suggestions`

Lists pending, applied, and dismissed AI suggestions for a work item.

`POST /api/ai-suggestions/{suggestionId}/accept`

Accepts one pending suggestion by creating a `source_memo` with `source_type = ai_generated` and a normal `work_item` in `memo`. The parent work item's lifecycle state is not changed.

`POST /api/ai-suggestions/{suggestionId}/dismiss`

Dismisses one pending suggestion without creating a work item or changing workflow state.

## Settings UI Inventory

Primary navigation pages:

- Work queue
- Projects
- Exports
- Settings
- Audit

The Projects page owns project create/edit/deactivate controls. Each project exposes name, slug, Synopsis, active state, and updated timestamp. Synopsis is stored on the existing project description field.

Settings sections:

- Tag and keyword grouping
- Contributors
- File types
- Providers
- Prompts
- Exports
- Watched folders and desktop-local paths
- System diagnostics

Settings must not expose a manual per-file import queue. Watched folders own standalone file ingestion, with a Check now action allowed only when it processes eligible enabled file types automatically.

Operations section:

- Workflow import
- Workflow staged validation
- Workflow activation

## Acceptance Tests

- Updating backend settings writes audit events.
- Provider config response redacts secret presence and never returns secret values.
- Disabled providers never receive new jobs.
- AI expansion with invalid structured JSON creates a failed diagnostics job and no suggestion records.
- Accepting an AI suggestion creates a normal memo work item without changing the parent lifecycle state.
- File type marked `not_supported_yet` is ignored by watched-folder ingestion.
- Active file type without an implemented parser creates a `needs_review` work item and no processing jobs.
- Prompt edit creates a new version and does not mutate old version.
- Contributor merge does not rewrite existing work items.
- Audit metadata redacts configured sensitive fields.
