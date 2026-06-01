# Schema Alignment

Status: Draft implementation specification
Last updated: 2026-05-30

## Purpose

Compare the bootstrap migration at `apps/api/db/migrations/0001_initial.sql`
with the target V1 schema and define the migration path for the next backend
build step.

This document does not replace `domain-model-and-schema.md`. It records the
delta from the committed bootstrap schema to the target contract.

## Inputs

- `apps/api/db/migrations/0001_initial.sql`
- `docs/specs/domain-model-and-schema.md`
- `docs/specs/workflow-runtime-integration.md`
- `docs/specs/processing-jobs-and-diagnostics.md`
- `docs/specs/settings-and-audit.md`
- `docs/specs/exports.md`
- `packages/domain/src/index.ts`

## Migration Decision

Keep `0001_initial.sql` as the committed bootstrap baseline. The next schema
work should be a forward-only migration named:

```text
0002_align_target_v1_schema.sql
```

The migration should be written to run after `0001_initial.sql`, and should be
idempotent where Postgres supports safe `if exists` or `if not exists` forms.
It should not depend on a destructive reset.

The app has no production data yet. If data exists in a developer database, the
migration should preserve it where the target contract makes the conversion
unambiguous and should fail fast with a clear preflight error where conversion
would require a product decision.

## Preflight Checks

Run these checks before applying `0002_align_target_v1_schema.sql` to a
non-empty database:

- `feature_groups`: existing assignments should be convertible into normalized
  tags before feature-group columns and tables are removed.
- `work_item_snapshots`: every row to be converted to `accepted_snapshots` must
  have a non-null project, work item, title, and body.
- `work_items`: existing `workflow_state` values must be one of the V1 known
  states.
- `processing_jobs`: existing `status` and `job_kind` values must match shared
  domain constants.
- `export_batch_items`: existing rows must be remapped from
  `work_item_snapshot_id` to `accepted_snapshot_id`.

## Gap Matrix

| Area | Bootstrap state | Target migration action |
| --- | --- | --- |
| `app_users` | `oidc_subject` is globally unique; issuer and seen timestamps are absent. | Add `oidc_issuer`, `first_seen_at`, `last_seen_at`; replace global subject uniqueness with unique `(oidc_issuer, oidc_subject)`; preserve current rows with a local-dev issuer value. |
| `projects` | No slug or actor columns. | Add `slug`, `created_by`, `updated_by`; backfill slug from name; enforce unique slug and name. |
| `feature_groups` | Present as a below-project grouping table. | Convert assignments into normal tags, then remove the table and feature-group columns from the V1 contract. |
| `contributors` | Display name only, no aliases or merge path. | Add merge/actor columns and create `contributor_aliases`; do not require global display-name uniqueness as the only identity mechanism. |
| `artifacts` | No artifact kind, bucket, layout version, or actor; original filename is required. | Add `artifact_kind`, `bucket`, `layout_version`, `created_by`; allow original filename to be nullable for generated artifacts; add content-hash and kind/date indexes. |
| `source_memos` | Uses `artifact_id`; lacks transcript, paths, contributor text, and update timestamp. | Rename or replace with `primary_artifact_id`; add transcript/path/contributor/update columns; create `source_memo_artifacts`. |
| `work_items` | Lacks contributor text, body format, and current accepted snapshot pointer. | Add `contributor_text`, `body_format`, `accepted_snapshot_id`; keep `project_id` nullable so ingestion review can exist before required-field recovery. |
| snapshots | Table is named `work_item_snapshots` and lacks export denormalization. | Rename to `accepted_snapshots`; add snapshot number, body format, project slug/name, contributor text, source memo/hash, and unique `(work_item_id, snapshot_number)`. |
| tags | Only raw `name`; join table lacks audit columns. | Add `normalized_name`, `created_by`, join-table metadata, tag statistics, and co-occurrence metadata; enforce unique normalized tag name. |
| `import_events` | Missing watched-folder and warning fields. | Add `watch_folder_id`, `warning_code`, and `warning_message`; keep exact duplicate linkage. |
| possible duplicates | Missing. | Create `possible_duplicates` with open/confirmed/dismissed statuses and resolution columns. |
| settings | Most backend settings tables are missing. | Create `file_type_settings`, `extraction_settings`, `transcription_settings`, `provider_configs`, and `export_templates`; extend prompt tables with retention and actor columns. |
| processing jobs | Missing export linkage, cancel fields, sanitized/internal errors, cost, token, and latency fields. | Add the target job columns and indexes from `processing-jobs-and-diagnostics.md`. |
| workflow | Active/history tables are partial; staged import table is missing. | Add required app capabilities, activation notes, compatibility result, workflow identity fields, and `workflow_staged_imports`. |
| exports | Batch status/options/bundle artifact are missing; items point at `work_item_snapshots`. | Add target export batch columns; change item membership to `accepted_snapshot_id`, `work_item_id`, `project_slug`, item artifact, and `created_at`. |
| audit | Missing. | Create `audit_events` before protected settings, workflow actions, retry/cancel, or export APIs are implemented. |

## Migration Order

1. Add shared lookup-safe columns and indexes to `app_users`, `projects`,
   `contributors`, `artifacts`, and `source_memos`.
2. Backfill slugs, timestamps, body formats, and local-dev OIDC issuer data.
3. Create new relationship/support tables:
   `contributor_aliases`, `source_memo_artifacts`, `possible_duplicates`,
   settings tables, `workflow_staged_imports`, and `audit_events`.
4. Convert `work_item_snapshots` into `accepted_snapshots`, add snapshot numbers,
   and update export foreign keys.
5. Add job, workflow, export, prompt, tag, and import-event target columns.
6. Apply uniqueness, foreign key, and check constraints after backfills pass.
7. Add target indexes, including job-claim, lookup, and export membership indexes.
8. Seed default backend settings for active V1 file types only:
   `.txt`, `.md`, `.markdown`, `.m4a`, `.mp3`, and `.wav`.

## Shared Domain Alignment

`packages/domain/src/index.ts` now carries the first shared constants for the
schema/API contract:

- source memo types
- artifact kinds and source memo artifact relationships
- import event statuses
- possible duplicate statuses
- processing job kinds and statuses
- file type capability states
- provider kinds and health statuses
- workflow staged import statuses
- export batch statuses
- audit event names
- accepted snapshot and expanded source/work item TypeScript shapes

These constants should be used by repository/service code before hardcoded
string literals are added to API or worker implementation.

## Deferred From Milestone 0

The following work belongs in later milestones, not this alignment pass:

- implementing the database client and migration runner
- applying the migration to a live Postgres database
- writing repository/service methods
- selecting the exact State Workflow Runtime package/API
- selecting transcription or LLM providers
- adding full text/trigram search indexes beyond the target migration plan
