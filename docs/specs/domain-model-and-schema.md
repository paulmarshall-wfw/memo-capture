# Domain Model And Schema

Status: Draft implementation specification
Last updated: 2026-05-30

## Purpose

Define the target V1 domain model, Postgres schema, and API contracts for canonical Memo Capture records.

The current migration at `apps/api/db/migrations/0001_initial.sql` is a bootstrap baseline. This spec is the target implementation contract and includes refinements discovered after the migration was created.

See [Schema Alignment](schema-alignment.md) for the concrete delta from
`0001_initial.sql` to the target V1 schema and the selected migration path.

## Entity Model

Primary entities:

- `source_memo`: immutable-ish provenance record for captured material and its evidence.
- `work_item`: current editable review object governed by workflow state.
- `accepted_snapshot`: immutable exportable snapshot created at acceptance and after accepted edits.
- `project`: required controlled classification for normal work items.
- `feature_group`: optional reusable classification label.
- `contributor`: optional attribution record, separate from authenticated user identity.
- `tag`: normalized flexible keyword.
- `artifact`: backend-managed object storage metadata.
- `import_event`: observed import attempt/history.
- `possible_duplicate`: non-exact duplicate signal for review.
- `processing_job`: Postgres-backed worker job.
- `audit_event`: canonical audit trail for settings, workflow, lifecycle actions, retries, cancels, and exports.

## Core Lifecycle

1. Input arrives from form, watched text file, watched audio file, or accepted AI suggestion.
2. Backend creates or reuses `source_memo` according to duplicate rules.
3. Backend creates a `work_item` immediately for successful non-duplicate captures.
4. The active workflow definition determines the initial state:
   - `needs_ingestion_review` for low-confidence or incomplete imports.
   - `new_idea` for form submissions and high-confidence imports.
5. Users edit current `work_item` fields directly.
6. Accepting a work item creates an immutable accepted snapshot.
7. Editing an accepted work item creates a new accepted snapshot and marks prior export state as stale where applicable.
8. Exports reference accepted snapshots, not mutable work item rows.

## Workflow States

V1 known states:

- `needs_ingestion_review`
- `new_idea`
- `parked`
- `accepted`
- `rejected`
- `ignored`
- `failed`

Valid initial states:

- `needs_ingestion_review`
- `new_idea`

Active states:

- `needs_ingestion_review`
- `new_idea`
- `parked`
- `accepted`

Terminal states:

- `rejected`
- `ignored`
- `failed`

`accepted` is not terminal. Accepted items can still be edited, exported again, and accumulate unexported accepted changes.

## Required Tables

### app_users

Application user records created from OIDC identity.

Required columns:

- `id uuid primary key`
- `oidc_issuer text not null`
- `oidc_subject text not null`
- `email text`
- `display_name text`
- `first_seen_at timestamptz not null`
- `last_seen_at timestamptz not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints and indexes:

- unique `(oidc_issuer, oidc_subject)`
- index on normalized email where useful

### projects

Controlled project classification.

Required columns:

- `id uuid primary key`
- `slug text not null`
- `name text not null`
- `description text not null default ''`
- `context text not null default ''`
- `is_active boolean not null default true`
- `created_by uuid references app_users(id)`
- `updated_by uuid references app_users(id)`
- timestamps

Constraints:

- unique `slug`
- unique `name`

Rules:

- Projects are required for normal work items after ingestion review.
- Projects are never deleted in V1; they can be deactivated.
- Project slug is a stable identifier separate from display name.
- Display name changes affect historical work item display.

### feature_groups

Optional reusable labels. Target V1 treats feature groups as global labels that can be reused across projects.

Required columns:

- `id uuid primary key`
- `slug text not null`
- `name text not null`
- `description text not null default ''`
- `is_active boolean not null default true`
- `merged_into_feature_group_id uuid references feature_groups(id)`
- timestamps and actor columns

Constraints:

- unique `slug`
- unique `name`

Rules:

- Feature group is optional on work items.
- Users can create feature groups during ingestion review and detail editing.
- Merge affects future classification only; existing work items are not rewritten.
- AI/extraction can suggest new feature groups, but cannot create them without user confirmation.

Migration note:

- The bootstrap migration currently scopes feature groups to `project_id`. V1 target schema should remove that requirement and make feature groups reusable globally unless a later explicit decision reverses this.

### contributors

Optional attribution separate from app users.

Required columns:

- `id uuid primary key`
- `display_name text not null`
- `is_active boolean not null default true`
- `merged_into_contributor_id uuid references contributors(id)`
- timestamps and actor columns

Related table:

- `contributor_aliases(id, contributor_id, alias, created_at, created_by)`

Rules:

- Work items can store free-text contributor attribution.
- A matched contributor reference is optional.
- One contributor per work item in V1.
- Contributor attribution is visible to all signed-in users.
- Merge affects future matching only; existing work items are not rewritten.

### artifacts

Object storage metadata. Raw file blobs do not belong in Postgres.

Required columns:

- `id uuid primary key`
- `artifact_kind text not null`
- `object_key text not null unique`
- `bucket text not null`
- `original_filename text`
- `mime_type text not null`
- `byte_size bigint not null`
- `content_hash text not null`
- `layout_version text not null`
- `created_by uuid references app_users(id)`
- `created_at timestamptz not null`

Artifact kinds:

- `original_text_file`
- `original_audio_file`
- `derived_transcript`
- `export_manifest`
- `export_jsonl`
- `export_markdown_combined`
- `export_markdown_item`
- `export_bundle`

Indexes:

- unique object key
- index on `content_hash`
- index on `artifact_kind, created_at`

### source_memos

Source provenance record.

Required columns:

- `id uuid primary key`
- `source_type text not null`
- `primary_artifact_id uuid references artifacts(id)`
- `original_text text`
- `extracted_text text`
- `current_transcript_text text`
- `content_hash text`
- `original_path text`
- `archive_path text`
- `contributor_text text`
- `contributor_id uuid references contributors(id)`
- `created_by uuid references app_users(id)`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Source types:

- `form`
- `watched_text_file`
- `watched_audio_file`
- `ai_generated`

Rules:

- A source memo can link to multiple work items.
- Form submissions do not require artifacts in V1.
- Watched-file imports require managed artifact storage.
- Audio transcript is stored as current queryable/reviewable text and as a versioned derived artifact.

Related table:

- `source_memo_artifacts(source_memo_id, artifact_id, relationship, created_at)`

Relationships:

- `primary_original`
- `derived_transcript`
- `export_source_reference`

### work_items

Editable review object.

Required columns:

- `id uuid primary key`
- `source_memo_id uuid not null references source_memos(id)`
- `project_id uuid references projects(id)`
- `feature_group_id uuid references feature_groups(id)`
- `contributor_text text`
- `contributor_id uuid references contributors(id)`
- `title text not null default ''`
- `body text not null default ''`
- `body_format text not null default 'markdown'`
- `workflow_state text not null`
- `workflow_item_version integer not null default 1`
- `accepted_snapshot_id uuid`
- `accepted_unexported_changes boolean not null default false`
- `created_by uuid references app_users(id)`
- `updated_by uuid references app_users(id)`
- timestamps

Rules:

- Current editable fields live directly on `work_items`.
- Body is Markdown in V1.
- Project, title, body/transcript, and source memo are required to promote from ingestion review to normal idea review.
- Editing never changes lifecycle state.
- API uses optimistic concurrency through version or ETag.

Indexes:

- `workflow_state`
- `project_id`
- `feature_group_id`
- `contributor_id`
- `updated_at`
- full text index on title/body/extracted text where supported

### accepted_snapshots

Immutable exportable versions. This replaces the bootstrap name `work_item_snapshots` as the target domain term.

Required columns:

- `id uuid primary key`
- `work_item_id uuid not null references work_items(id)`
- `snapshot_number integer not null`
- `title text not null`
- `body text not null`
- `body_format text not null default 'markdown'`
- `project_id uuid not null references projects(id)`
- `project_slug text not null`
- `project_name text not null`
- `feature_group_id uuid references feature_groups(id)`
- `feature_group_name text`
- `contributor_text text`
- `contributor_id uuid references contributors(id)`
- `source_memo_id uuid not null references source_memos(id)`
- `source_content_hash text`
- `created_by uuid references app_users(id)`
- `created_at timestamptz not null`

Constraints:

- unique `(work_item_id, snapshot_number)`

Rules:

- Created when item enters `accepted`.
- Created again whenever an accepted item is edited and saved.
- Export batches reference accepted snapshots.
- Previous exports remain immutable.

### tags and work_item_tags

Normalized flexible grouping.

Required columns:

- `tags(id, name, normalized_name, created_at, created_by)`
- `work_item_tags(work_item_id, tag_id, created_at, created_by)`

Constraints:

- unique normalized tag name
- primary key `(work_item_id, tag_id)`

### import_events

Import attempt and duplicate history.

Required columns:

- `id uuid primary key`
- `source_memo_id uuid references source_memos(id)`
- `artifact_id uuid references artifacts(id)`
- `machine_id text`
- `watch_folder_id text`
- `original_path text`
- `archive_path text`
- `content_hash text not null`
- `duplicate_of_source_memo_id uuid references source_memos(id)`
- `status text not null`
- `warning_code text`
- `warning_message text`
- `created_at timestamptz not null`

Statuses:

- `staged`
- `uploaded`
- `imported`
- `duplicate_exact`
- `failed_recoverable`
- `failed_terminal`
- `archived_with_warning`

Rules:

- Exact duplicate file imports create import events against the existing source memo.
- Same/similar text with different file hashes creates a separate source memo and may create a possible duplicate record.

### possible_duplicates

First-class possible duplicate signals.

Required columns:

- `id uuid primary key`
- `source_memo_id uuid references source_memos(id)`
- `work_item_id uuid references work_items(id)`
- `possible_duplicate_source_memo_id uuid references source_memos(id)`
- `possible_duplicate_work_item_id uuid references work_items(id)`
- `reason text not null`
- `score numeric`
- `status text not null default 'open'`
- `created_at timestamptz not null`
- `resolved_by uuid references app_users(id)`
- `resolved_at timestamptz`

Statuses:

- `open`
- `confirmed_duplicate`
- `dismissed`

### settings tables

See [Settings And Audit](settings-and-audit.md).

### workflow tables

See [Workflow Runtime Integration](workflow-runtime-integration.md).

### processing job tables

See [Processing Jobs And Diagnostics](processing-jobs-and-diagnostics.md).

### export tables

See [Exports](exports.md).

### audit_events

See [Settings And Audit](settings-and-audit.md).

## API Contracts

All protected routes require a valid bearer token except local-dev auth routes and health/version endpoints.

Response envelope for errors:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

### Health and version

- `GET /health`
- `GET /ready`
- `GET /version`

Current implementation already exposes these baseline routes.

### Projects

- `GET /api/projects`
- `POST /api/projects`
- `PATCH /api/projects/{projectId}`
- `POST /api/projects/{projectId}/deactivate`

Create request:

```json
{
  "name": "Memo Capture",
  "slug": "memo-capture",
  "description": "string",
  "context": "string"
}
```

### Feature groups

- `GET /api/feature-groups`
- `POST /api/feature-groups`
- `PATCH /api/feature-groups/{featureGroupId}`
- `POST /api/feature-groups/{featureGroupId}/deactivate`
- `POST /api/feature-groups/{featureGroupId}/merge`

### Contributors

- `GET /api/contributors`
- `POST /api/contributors`
- `PATCH /api/contributors/{contributorId}`
- `POST /api/contributors/{contributorId}/aliases`
- `POST /api/contributors/{contributorId}/merge`
- `POST /api/contributors/{contributorId}/deactivate`

### Work items

- `GET /api/work-items`
- `GET /api/work-items/{workItemId}`
- `PATCH /api/work-items/{workItemId}`
- `POST /api/work-items/{workItemId}/actions/{actionId}`
- `POST /api/work-items/{workItemId}/ai-expansions`
- `GET /api/work-items/{workItemId}/diagnostics`

List filters:

- `bucket`
- `workflow_state`
- `project_id`
- `feature_group_id`
- `contributor_id`
- `tag`
- `date_from`
- `date_to`
- `export_status`
- `q`

Patch request:

```json
{
  "expectedVersion": 4,
  "title": "string",
  "body": "string",
  "projectId": "uuid",
  "featureGroupId": "uuid | null",
  "contributorText": "string | null",
  "contributorId": "uuid | null",
  "tags": ["string"]
}
```

Patch behavior:

- Reject stale `expectedVersion` with `409 conflict`.
- Validate required fields when promoting from ingestion review.
- Saving an accepted item creates a new accepted snapshot.
- Saving content does not change workflow state.

### Form ingestion

- `POST /api/source-memos/form`

Request:

```json
{
  "projectId": "uuid",
  "featureGroupId": "uuid | null",
  "title": "string",
  "body": "string",
  "contributorText": "string | null",
  "tags": ["string"]
}
```

Behavior:

- Creates `source_memo` with `source_type = form`.
- Creates `work_item` in `new_idea`.
- Writes audit and import/provenance records.

## Acceptance Tests

- Form submission creates one source memo and one work item in `new_idea`.
- Low-confidence import creates a source memo and work item in `needs_ingestion_review`.
- Exact duplicate file import creates an import event and no new work item.
- Possible duplicate import creates a new source memo/work item and an open possible duplicate record.
- Editing a non-accepted item mutates the current work item only.
- Accepting an item creates accepted snapshot number 1.
- Editing an accepted item creates the next accepted snapshot.
- Project/title/body/source memo requirements block promotion out of ingestion review.
- Stale edit version returns `409 conflict`.
