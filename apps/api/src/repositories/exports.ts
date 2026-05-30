import { randomUUID } from "node:crypto";
import {
  MEMO_CAPTURE_EXPORT_SCHEMA_VERSION,
  type ExportBatchStatus
} from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";

export interface ExportableSnapshotFilters {
  projectId?: string | null;
  featureGroupId?: string | null;
  contributorId?: string | null;
  tag?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  exportStatus?: string | null;
  q?: string | null;
}

export interface ExportableSnapshotRecord {
  acceptedSnapshotId: string;
  workItemId: string;
  title: string;
  project: {
    id: string;
    slug: string;
    name: string;
  };
  featureGroup: {
    id: string;
    name: string;
  } | null;
  contributor: {
    id: string | null;
    text: string;
  } | null;
  alreadyExported: boolean;
  defaultChecked: boolean;
  currentForWorkItem: boolean;
  snapshotCreatedAt: string;
}

export interface ExportBatchRecord {
  id: string;
  schemaVersion: string;
  status: ExportBatchStatus;
  createdBy: string | null;
  filterContext: Record<string, unknown>;
  options: Record<string, unknown>;
  manifestArtifactId: string | null;
  jsonlArtifactId: string | null;
  combinedMarkdownArtifactId: string | null;
  bundleArtifactId: string | null;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  itemCount: number;
}

export interface ExportBatchItemRecord {
  exportBatchId: string;
  acceptedSnapshotId: string;
  workItemId: string;
  projectSlug: string;
  itemMarkdownArtifactId: string | null;
  createdAt: string;
}

export interface ExportSnapshotForGeneration {
  acceptedSnapshotId: string;
  workItemId: string;
  sourceMemoId: string;
  title: string;
  body: string;
  bodyFormat: string;
  project: {
    id: string;
    slug: string;
    name: string;
  };
  featureGroup: {
    id: string;
    name: string;
  } | null;
  contributor: {
    id: string | null;
    text: string;
  } | null;
  tags: string[];
  source: {
    contentHash: string | null;
    sourceType: string;
    createdAt: string;
  };
  snapshotCreatedAt: string;
}

interface ExportableSnapshotRow extends Record<string, unknown> {
  accepted_snapshot_id: string;
  work_item_id: string;
  title: string;
  project_id: string;
  project_slug: string;
  project_name: string;
  feature_group_id: string | null;
  feature_group_name: string | null;
  contributor_id: string | null;
  contributor_text: string | null;
  already_exported: boolean;
  current_for_work_item: boolean;
  snapshot_created_at: Date | string;
}

interface ExportBatchRow extends Record<string, unknown> {
  id: string;
  schema_version: string;
  status: ExportBatchStatus;
  created_by: string | null;
  filter_context: Record<string, unknown> | null;
  options: Record<string, unknown> | null;
  manifest_artifact_id: string | null;
  jsonl_artifact_id: string | null;
  combined_markdown_artifact_id: string | null;
  bundle_artifact_id: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
  failed_at: Date | string | null;
  error_code: string | null;
  error_message: string | null;
  item_count: string | number;
}

interface ExportBatchItemRow extends Record<string, unknown> {
  export_batch_id: string;
  accepted_snapshot_id: string;
  work_item_id: string;
  project_slug: string;
  item_markdown_artifact_id: string | null;
  created_at: Date | string;
}

interface ExportSnapshotGenerationRow extends Record<string, unknown> {
  accepted_snapshot_id: string;
  work_item_id: string;
  source_memo_id: string;
  title: string;
  body: string;
  body_format: string;
  project_id: string;
  project_slug: string;
  project_name: string;
  feature_group_id: string | null;
  feature_group_name: string | null;
  contributor_id: string | null;
  contributor_text: string | null;
  source_content_hash: string | null;
  source_type: string;
  source_created_at: Date | string;
  snapshot_created_at: Date | string;
  tags: string[] | null;
}

export class ExportRepository {
  constructor(private readonly db: Queryable) {}

  async listExportableSnapshots(filters: ExportableSnapshotFilters): Promise<ExportableSnapshotRecord[]> {
    const result = await this.db.query<ExportableSnapshotRow>(
      `with current_snapshots as (
         select distinct on (work_items.id)
           accepted_snapshots.id,
           accepted_snapshots.work_item_id,
           accepted_snapshots.title,
           accepted_snapshots.project_id,
           accepted_snapshots.project_slug,
           accepted_snapshots.project_name,
           accepted_snapshots.feature_group_id,
           accepted_snapshots.feature_group_name,
           accepted_snapshots.contributor_id,
           accepted_snapshots.contributor_text,
           accepted_snapshots.created_at,
           work_items.accepted_snapshot_id
         from work_items
         join accepted_snapshots on accepted_snapshots.work_item_id = work_items.id
         where work_items.workflow_state = 'accepted'
         order by
           work_items.id,
           case when accepted_snapshots.id = work_items.accepted_snapshot_id then 0 else 1 end,
           accepted_snapshots.snapshot_number desc
       ),
       snapshot_export_status as (
         select distinct export_batch_items.accepted_snapshot_id
         from export_batch_items
         join export_batches on export_batches.id = export_batch_items.export_batch_id
         where export_batches.status = 'succeeded'
       )
       select
         current_snapshots.id as accepted_snapshot_id,
         current_snapshots.work_item_id,
         current_snapshots.title,
         current_snapshots.project_id,
         current_snapshots.project_slug,
         current_snapshots.project_name,
         current_snapshots.feature_group_id,
         current_snapshots.feature_group_name,
         current_snapshots.contributor_id,
         current_snapshots.contributor_text,
         snapshot_export_status.accepted_snapshot_id is not null as already_exported,
         coalesce(current_snapshots.id = current_snapshots.accepted_snapshot_id, false) as current_for_work_item,
         current_snapshots.created_at as snapshot_created_at
       from current_snapshots
       left join snapshot_export_status on snapshot_export_status.accepted_snapshot_id = current_snapshots.id
       where ($1::uuid is null or current_snapshots.project_id = $1::uuid)
         and ($2::uuid is null or current_snapshots.feature_group_id = $2::uuid)
         and ($3::uuid is null or current_snapshots.contributor_id = $3::uuid)
         and ($4::text is null or exists (
           select 1
           from work_item_tags
           join tags on tags.id = work_item_tags.tag_id
           where work_item_tags.work_item_id = current_snapshots.work_item_id
             and tags.normalized_name = lower($4::text)
         ))
         and ($5::timestamptz is null or current_snapshots.created_at >= $5::timestamptz)
         and ($6::timestamptz is null or current_snapshots.created_at <= $6::timestamptz)
         and (
           $7::text is null
           or $7::text = 'all'
           or ($7::text = 'already_exported' and snapshot_export_status.accepted_snapshot_id is not null)
           or ($7::text = 'unexported' and snapshot_export_status.accepted_snapshot_id is null)
         )
         and (
           $8::text is null
           or current_snapshots.title ilike '%' || $8::text || '%'
         )
       order by current_snapshots.created_at desc`,
      [
        nullIfEmpty(filters.projectId),
        nullIfEmpty(filters.featureGroupId),
        nullIfEmpty(filters.contributorId),
        nullIfEmpty(filters.tag),
        nullIfEmpty(filters.dateFrom),
        nullIfEmpty(filters.dateTo),
        nullIfEmpty(filters.exportStatus),
        nullIfEmpty(filters.q)
      ]
    );

    return result.rows.map(mapExportableSnapshot);
  }

  async createBatch(input: {
    acceptedSnapshotIds: string[];
    filterContext: Record<string, unknown>;
    options: Record<string, unknown>;
    createdBy: string;
  }): Promise<ExportBatchRecord> {
    const id = randomUUID();
    await this.db.query(
      `insert into export_batches (
         id,
         schema_version,
         status,
         created_by,
         filter_context,
         options,
         created_at
       )
       values ($1, $2, 'pending', $3, $4::jsonb, $5::jsonb, now())`,
      [
        id,
        MEMO_CAPTURE_EXPORT_SCHEMA_VERSION,
        input.createdBy,
        JSON.stringify(input.filterContext),
        JSON.stringify(input.options)
      ]
    );

    await this.db.query(
      `insert into export_batch_items (
         export_batch_id,
         accepted_snapshot_id,
         work_item_id,
         project_slug,
         created_at
       )
       select $1, accepted_snapshots.id, accepted_snapshots.work_item_id, accepted_snapshots.project_slug, now()
       from accepted_snapshots
       where accepted_snapshots.id = any($2::uuid[])
       on conflict do nothing`,
      [id, input.acceptedSnapshotIds]
    );

    const batch = await this.findBatch(id);
    if (batch === null) {
      throw new Error("Failed to create export batch.");
    }
    return batch;
  }

  async findBatch(exportBatchId: string): Promise<ExportBatchRecord | null> {
    const result = await this.db.query<ExportBatchRow>(
      `select
         export_batches.*,
         count(export_batch_items.accepted_snapshot_id) as item_count
       from export_batches
       left join export_batch_items on export_batch_items.export_batch_id = export_batches.id
       where export_batches.id = $1
       group by export_batches.id`,
      [exportBatchId]
    );

    const row = result.rows[0];
    return row === undefined ? null : mapExportBatch(row);
  }

  async listBatches(limit = 20): Promise<ExportBatchRecord[]> {
    const result = await this.db.query<ExportBatchRow>(
      `select
         export_batches.*,
         count(export_batch_items.accepted_snapshot_id) as item_count
       from export_batches
       left join export_batch_items on export_batch_items.export_batch_id = export_batches.id
       group by export_batches.id
       order by export_batches.created_at desc
       limit $1`,
      [limit]
    );
    return result.rows.map(mapExportBatch);
  }

  async listBatchItems(exportBatchId: string): Promise<ExportBatchItemRecord[]> {
    const result = await this.db.query<ExportBatchItemRow>(
      `select *
       from export_batch_items
       where export_batch_id = $1
       order by created_at asc, accepted_snapshot_id asc`,
      [exportBatchId]
    );
    return result.rows.map(mapExportBatchItem);
  }

  async getSnapshotsForGeneration(exportBatchId: string): Promise<ExportSnapshotForGeneration[]> {
    const result = await this.db.query<ExportSnapshotGenerationRow>(
      `select
         accepted_snapshots.id as accepted_snapshot_id,
         accepted_snapshots.work_item_id,
         accepted_snapshots.source_memo_id,
         accepted_snapshots.title,
         accepted_snapshots.body,
         accepted_snapshots.body_format,
         accepted_snapshots.project_id,
         accepted_snapshots.project_slug,
         accepted_snapshots.project_name,
         accepted_snapshots.feature_group_id,
         accepted_snapshots.feature_group_name,
         accepted_snapshots.contributor_id,
         accepted_snapshots.contributor_text,
         accepted_snapshots.source_content_hash,
         source_memos.source_type,
         source_memos.created_at as source_created_at,
         accepted_snapshots.created_at as snapshot_created_at,
         coalesce(array_agg(tags.name order by tags.name) filter (where tags.id is not null), '{}') as tags
       from export_batch_items
       join accepted_snapshots on accepted_snapshots.id = export_batch_items.accepted_snapshot_id
       join source_memos on source_memos.id = accepted_snapshots.source_memo_id
       left join work_item_tags on work_item_tags.work_item_id = accepted_snapshots.work_item_id
       left join tags on tags.id = work_item_tags.tag_id
       where export_batch_items.export_batch_id = $1
       group by accepted_snapshots.id, source_memos.id, export_batch_items.created_at
       order by export_batch_items.created_at asc, accepted_snapshots.created_at asc`,
      [exportBatchId]
    );
    return result.rows.map(mapGenerationSnapshot);
  }

  async markGenerating(exportBatchId: string): Promise<void> {
    await this.db.query(
      `update export_batches
       set status = 'generating', failed_at = null, error_code = null, error_message = null
       where id = $1 and status in ('pending', 'failed')`,
      [exportBatchId]
    );
  }

  async attachArtifacts(input: {
    exportBatchId: string;
    manifestArtifactId: string;
    jsonlArtifactId: string;
    combinedMarkdownArtifactId: string;
    bundleArtifactId: string;
    itemArtifacts: { acceptedSnapshotId: string; artifactId: string }[];
  }): Promise<void> {
    await this.db.query(
      `update export_batches
       set
         manifest_artifact_id = $2,
         jsonl_artifact_id = $3,
         combined_markdown_artifact_id = $4,
         bundle_artifact_id = $5,
         status = 'succeeded',
         completed_at = now(),
         failed_at = null,
         error_code = null,
         error_message = null
       where id = $1`,
      [
        input.exportBatchId,
        input.manifestArtifactId,
        input.jsonlArtifactId,
        input.combinedMarkdownArtifactId,
        input.bundleArtifactId
      ]
    );

    for (const item of input.itemArtifacts) {
      await this.db.query(
        `update export_batch_items
         set item_markdown_artifact_id = $3
         where export_batch_id = $1 and accepted_snapshot_id = $2`,
        [input.exportBatchId, item.acceptedSnapshotId, item.artifactId]
      );
    }
  }

  async markFailed(input: {
    exportBatchId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    await this.db.query(
      `update export_batches
       set status = 'failed', failed_at = now(), error_code = $2, error_message = $3
       where id = $1`,
      [input.exportBatchId, input.errorCode, input.errorMessage]
    );
  }
}

function mapExportableSnapshot(row: ExportableSnapshotRow): ExportableSnapshotRecord {
  return {
    acceptedSnapshotId: row.accepted_snapshot_id,
    workItemId: row.work_item_id,
    title: row.title,
    project: {
      id: row.project_id,
      slug: row.project_slug,
      name: row.project_name
    },
    featureGroup:
      row.feature_group_id === null || row.feature_group_name === null
        ? null
        : { id: row.feature_group_id, name: row.feature_group_name },
    contributor:
      row.contributor_text === null && row.contributor_id === null
        ? null
        : { id: row.contributor_id, text: row.contributor_text ?? "Linked contributor" },
    alreadyExported: row.already_exported,
    defaultChecked: !row.already_exported,
    currentForWorkItem: row.current_for_work_item,
    snapshotCreatedAt: toIso(row.snapshot_created_at)
  };
}

function mapExportBatch(row: ExportBatchRow): ExportBatchRecord {
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    status: row.status,
    createdBy: row.created_by,
    filterContext: row.filter_context ?? {},
    options: row.options ?? {},
    manifestArtifactId: row.manifest_artifact_id,
    jsonlArtifactId: row.jsonl_artifact_id,
    combinedMarkdownArtifactId: row.combined_markdown_artifact_id,
    bundleArtifactId: row.bundle_artifact_id,
    createdAt: toIso(row.created_at),
    completedAt: row.completed_at === null ? null : toIso(row.completed_at),
    failedAt: row.failed_at === null ? null : toIso(row.failed_at),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    itemCount: typeof row.item_count === "number" ? row.item_count : Number.parseInt(row.item_count, 10)
  };
}

function mapExportBatchItem(row: ExportBatchItemRow): ExportBatchItemRecord {
  return {
    exportBatchId: row.export_batch_id,
    acceptedSnapshotId: row.accepted_snapshot_id,
    workItemId: row.work_item_id,
    projectSlug: row.project_slug,
    itemMarkdownArtifactId: row.item_markdown_artifact_id,
    createdAt: toIso(row.created_at)
  };
}

function mapGenerationSnapshot(row: ExportSnapshotGenerationRow): ExportSnapshotForGeneration {
  return {
    acceptedSnapshotId: row.accepted_snapshot_id,
    workItemId: row.work_item_id,
    sourceMemoId: row.source_memo_id,
    title: row.title,
    body: row.body,
    bodyFormat: row.body_format,
    project: {
      id: row.project_id,
      slug: row.project_slug,
      name: row.project_name
    },
    featureGroup:
      row.feature_group_id === null || row.feature_group_name === null
        ? null
        : { id: row.feature_group_id, name: row.feature_group_name },
    contributor:
      row.contributor_text === null && row.contributor_id === null
        ? null
        : { id: row.contributor_id, text: row.contributor_text ?? "Linked contributor" },
    tags: row.tags ?? [],
    source: {
      contentHash: row.source_content_hash,
      sourceType: row.source_type,
      createdAt: toIso(row.source_created_at)
    },
    snapshotCreatedAt: toIso(row.snapshot_created_at)
  };
}

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
