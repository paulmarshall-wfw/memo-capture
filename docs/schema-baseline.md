# Schema Baseline

Status: Bootstrap planning baseline

The initial SQL migration in `apps/api/db/migrations/0001_initial.sql` is a starting point for the accepted design decisions. It is not yet a full production schema.

Core entities:

- `app_users`
- `projects`
- `feature_groups`
- `contributors`
- `source_memos`
- `work_items`
- `work_item_snapshots`
- `tags`
- `work_item_tags`
- `artifacts`
- `import_events`
- `processing_jobs`
- `ai_suggestions`
- `prompt_definitions`
- `prompt_versions`
- `workflow_active_definition`
- `workflow_activation_history`
- `export_batches`
- `export_batch_items`

Design rules:

- Source memo provenance is separate from editable work item lifecycle.
- Workflow lifecycle belongs to the workflow runtime and active workflow definition.
- Accepted snapshots start at the acceptance/export boundary.
- Artifact blobs live in S3-compatible object storage, not in Postgres.
- Processing jobs are Postgres-backed in V1.
