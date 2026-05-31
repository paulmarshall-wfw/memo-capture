# Exports

Status: Draft implementation specification
Last updated: 2026-05-29

## Purpose

Define V1 export semantics, schema version, accepted snapshot behavior, batch creation, artifact layout, API contracts, and verification.

## Scope

V1 exports accepted work items only.

Supported formats:

- Markdown bundle with YAML frontmatter
- JSON Lines mirror

CSV/tabular export is explicitly out of scope for V1.

## Export Schema Version

V1 export schema:

```text
memo-capture-export.v1
```

`manifest.json`, `items.jsonl`, and Markdown frontmatter must include the schema version.

## Snapshot Semantics

Exports reference immutable accepted snapshots, not mutable work items.

Rules:

- Transitioning a work item to `accepted` creates an accepted snapshot.
- Editing an accepted item creates a new accepted snapshot.
- Previous exports continue referencing older snapshots.
- Accepted items can be exported multiple times.
- Unchanged accepted snapshots that were already exported are not blocked, but are shown as already exported and default unchecked.
- Edited accepted items export the most recent accepted snapshot automatically, with prior export status visible.
- No separate `ready_to_export` workflow state exists in V1.
- Export status is separate from workflow state.

## Export Selection Flow

1. User opens Export view.
2. User filters accepted items.
3. UI shows most recent accepted snapshot for each accepted item.
4. Previously exported unchanged snapshots default unchecked.
5. New or changed accepted snapshots default checked.
6. User can check individual items.
7. User can select all items in current filtered result set.
8. Backend records exact included snapshot IDs and useful active filter context.
9. Backend creates export batch and `generate_export_batch` job.
10. Worker writes artifacts.
11. UI provides durable download links when complete.

## export_batches Table

Required columns:

- `id uuid primary key`
- `schema_version text not null`
- `status text not null`
- `created_by uuid references app_users(id)`
- `filter_context jsonb`
- `options jsonb not null default '{}'`
- `manifest_artifact_id uuid references artifacts(id)`
- `jsonl_artifact_id uuid references artifacts(id)`
- `combined_markdown_artifact_id uuid references artifacts(id)`
- `bundle_artifact_id uuid references artifacts(id)`
- `created_at timestamptz not null`
- `completed_at timestamptz`
- `failed_at timestamptz`
- `error_code text`
- `error_message text`

Statuses:

- `pending`
- `generating`
- `succeeded`
- `failed`
- `cancelled`

## export_batch_items Table

Required columns:

- `export_batch_id uuid not null references export_batches(id)`
- `accepted_snapshot_id uuid not null references accepted_snapshots(id)`
- `work_item_id uuid not null references work_items(id)`
- `project_slug text not null`
- `item_markdown_artifact_id uuid references artifacts(id)`
- `created_at timestamptz not null`
- primary key `(export_batch_id, accepted_snapshot_id)`

## Artifact Layout

```text
export-<batch-id>/
  manifest.json
  items.jsonl
  markdown/
    <project-slug>/
      <work-item-id>-<slug>.md
  combined.md
```

Object storage layout:

```text
exports/v1/<export-batch-id>/manifest.json
exports/v1/<export-batch-id>/items.jsonl
exports/v1/<export-batch-id>/markdown/<project-slug>/<work-item-id>-<slug>.md
exports/v1/<export-batch-id>/combined.md
exports/v1/<export-batch-id>/export-<export-batch-id>.zip
```

Markdown paths use:

```text
<project-slug>/<stable-id>-<sanitized-title>.md
```

## manifest.json Shape

```json
{
  "schemaVersion": "memo-capture-export.v1",
  "exportBatchId": "uuid",
  "createdAt": "2026-05-29T00:00:00.000Z",
  "createdBy": {
    "userId": "uuid",
    "email": "person@example.com",
    "displayName": "Person"
  },
  "itemCount": 2,
  "filterContext": {},
  "artifacts": {
    "itemsJsonl": "items.jsonl",
    "combinedMarkdown": "combined.md",
    "markdownDirectory": "markdown/"
  }
}
```

## JSON Lines Item Shape

Each line in `items.jsonl`:

```json
{
  "schemaVersion": "memo-capture-export.v1",
  "exportBatchId": "uuid",
  "acceptedSnapshotId": "uuid",
  "workItemId": "uuid",
  "sourceMemoId": "uuid",
  "title": "string",
  "body": "markdown string",
  "project": {
    "id": "uuid",
    "slug": "memo-capture",
    "name": "Memo Capture"
  },
  "contributor": {
    "text": "Paul Marshall",
    "id": "uuid"
  },
  "tags": ["ingestion", "archive"],
  "source": {
    "contentHash": "sha256:...",
    "sourceType": "watched_audio_file",
    "createdAt": "2026-05-29T00:00:00.000Z"
  },
  "snapshotCreatedAt": "2026-05-29T00:00:00.000Z"
}
```

`contributor` can be `null`.

## Markdown Item Shape

```markdown
---
schema_version: memo-capture-export.v1
export_batch_id: uuid
accepted_snapshot_id: uuid
work_item_id: uuid
source_memo_id: uuid
project_slug: memo-capture
project_name: Memo Capture
contributor: Paul Marshall
tags:
  - ingestion
  - archive
snapshot_created_at: "2026-05-29T00:00:00.000Z"
---

# Work item title

Markdown body.
```

Contributor inclusion is controlled by export option/template.

## API Contracts

### List exportable snapshots

`GET /api/exports/accepted-snapshots`

Filters:

- `project_id`
- `contributor_id`
- `tag`
- `date_from`
- `date_to`
- `export_status`
- `q`

Response:

```json
{
  "snapshots": [
    {
      "acceptedSnapshotId": "uuid",
      "workItemId": "uuid",
      "title": "string",
      "project": {
        "id": "uuid",
        "slug": "memo-capture",
        "name": "Memo Capture"
      },
      "alreadyExported": false,
      "defaultChecked": true,
      "currentForWorkItem": true,
      "snapshotCreatedAt": "2026-05-29T00:00:00.000Z"
    }
  ]
}
```

### Create export batch

`POST /api/exports/batches`

Request:

```json
{
  "acceptedSnapshotIds": ["uuid"],
  "filterContext": {},
  "options": {
    "includeContributor": true,
    "includeSourceProvenance": true
  }
}
```

Response:

```json
{
  "exportBatchId": "uuid",
  "schemaVersion": "memo-capture-export.v1",
  "status": "pending",
  "jobId": "uuid"
}
```

### Get export batch

`GET /api/exports/batches/{exportBatchId}`

### Download export artifact

`GET /api/exports/batches/{exportBatchId}/download`

Rules:

- Requires authentication.
- Returns backend-authorized download or short-lived signed URL.
- Writes audit event `export_batch.downloaded`.

## Generation Rules

- Export generation is a processing job.
- The included accepted snapshot IDs are fixed when the batch is created.
- Retrying failed generation must not change included snapshot IDs.
- Export batches cannot be deleted in V1.
- Export artifacts are durable managed artifacts.
- Exports include source/provenance IDs and timestamps by default.

## Acceptance Tests

- Accepted transition creates an exportable snapshot.
- Editing accepted item creates a newer snapshot.
- Export list shows already-exported unchanged snapshots as default unchecked.
- Batch creation stores exact snapshot IDs.
- Export job writes manifest, JSONL, per-item Markdown, combined Markdown, and bundle artifacts.
- Manifest, JSONL, and Markdown frontmatter all contain `memo-capture-export.v1`.
- Retrying export generation preserves snapshot membership.
- Export download requires authentication and writes audit event.
- CSV export is not available in UI or API.
