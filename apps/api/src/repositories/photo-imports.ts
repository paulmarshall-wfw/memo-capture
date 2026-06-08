import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/types.js";

export type PhotoImportStatus = "available" | "preprocessing" | "preprocessing_failed" | "attached";

export interface PhotoImportInput {
  sourceMemoId: string;
  originalArtifactId: string;
  importEventId: string;
  originalFilename: string;
  contentHash: string;
  contributorText: string | null;
  contributorId: string | null;
  createdBy: string | null;
}

export interface PhotoImportRecord {
  id: string;
  sourceMemoId: string;
  originalArtifactId: string;
  thumbnailArtifactId: string | null;
  importEventId: string | null;
  status: PhotoImportStatus;
  originalFilename: string;
  contentHash: string;
  contributorText: string | null;
  contributorId: string | null;
  capturedAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  preprocessingErrorCode: string | null;
  preprocessingErrorMessage: string | null;
  attachedWorkItemId: string | null;
  attachedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkItemPhotoAttachmentRecord {
  originalArtifactId: string;
  thumbnailArtifactId: string | null;
  originalFilename: string | null;
  mimeType: string;
  byteSize: number;
  capturedAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
}

interface PhotoImportRow extends Record<string, unknown> {
  id: string;
  source_memo_id: string;
  original_artifact_id: string;
  thumbnail_artifact_id: string | null;
  import_event_id: string | null;
  status: PhotoImportStatus;
  original_filename: string;
  content_hash: string;
  contributor_text: string | null;
  contributor_id: string | null;
  captured_at: Date | string | null;
  camera_make: string | null;
  camera_model: string | null;
  gps_latitude: number | string | null;
  gps_longitude: number | string | null;
  preprocessing_error_code: string | null;
  preprocessing_error_message: string | null;
  attached_work_item_id: string | null;
  attached_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class PhotoImportRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: PhotoImportInput): Promise<PhotoImportRecord> {
    const result = await this.db.query<PhotoImportRow>(
      `insert into photo_imports (
         id,
         source_memo_id,
         original_artifact_id,
         import_event_id,
         status,
         original_filename,
         content_hash,
         contributor_text,
         contributor_id,
         created_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, 'available', $5, $6, $7, $8, $9, now(), now())
       returning *`,
      [
        randomUUID(),
        input.sourceMemoId,
        input.originalArtifactId,
        input.importEventId,
        input.originalFilename,
        input.contentHash,
        input.contributorText,
        input.contributorId,
        input.createdBy
      ]
    );
    return mapPhotoImport(requiredRow(result.rows[0]));
  }

  async listVisible(): Promise<PhotoImportRecord[]> {
    const result = await this.db.query<PhotoImportRow>(
      `select *
       from photo_imports
       where status in ('available', 'preprocessing', 'preprocessing_failed')
       order by captured_at desc nulls last, created_at desc`
    );
    return result.rows.map(mapPhotoImport);
  }

  async countVisible(): Promise<number> {
    const result = await this.db.query<{ count: number | string }>(
      `select count(*) as count
       from photo_imports
       where status in ('available', 'preprocessing', 'preprocessing_failed')`
    );
    const count = result.rows[0]?.count ?? 0;
    return typeof count === "number" ? count : Number.parseInt(count, 10);
  }

  async findBySourceMemoId(sourceMemoId: string): Promise<PhotoImportRecord | null> {
    const result = await this.db.query<PhotoImportRow>(
      `select *
       from photo_imports
       where source_memo_id = $1
       limit 1`,
      [sourceMemoId]
    );
    return result.rows[0] === undefined ? null : mapPhotoImport(result.rows[0]);
  }

  async markPreprocessing(sourceMemoId: string): Promise<PhotoImportRecord | null> {
    const result = await this.db.query<PhotoImportRow>(
      `update photo_imports
       set
         status = 'preprocessing',
         preprocessing_error_code = null,
         preprocessing_error_message = null,
         updated_at = now()
       where source_memo_id = $1
         and status in ('available', 'preprocessing_failed')
       returning *`,
      [sourceMemoId]
    );
    return result.rows[0] === undefined ? null : mapPhotoImport(result.rows[0]);
  }

  async markPreprocessed(input: {
    sourceMemoId: string;
    thumbnailArtifactId: string;
    capturedAt: string | null;
    cameraMake: string | null;
    cameraModel: string | null;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
  }): Promise<PhotoImportRecord | null> {
    const result = await this.db.query<PhotoImportRow>(
      `update photo_imports
       set
         status = 'available',
         thumbnail_artifact_id = $2,
         captured_at = $3::timestamptz,
         camera_make = $4,
         camera_model = $5,
         gps_latitude = $6,
         gps_longitude = $7,
         preprocessing_error_code = null,
         preprocessing_error_message = null,
         updated_at = now()
       where source_memo_id = $1
       returning *`,
      [
        input.sourceMemoId,
        input.thumbnailArtifactId,
        input.capturedAt,
        input.cameraMake,
        input.cameraModel,
        input.gpsLatitude,
        input.gpsLongitude
      ]
    );
    return result.rows[0] === undefined ? null : mapPhotoImport(result.rows[0]);
  }

  async markPreprocessingFailed(input: {
    sourceMemoId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    await this.db.query(
      `update photo_imports
       set
         status = 'preprocessing_failed',
         preprocessing_error_code = $2,
         preprocessing_error_message = $3,
         updated_at = now()
       where source_memo_id = $1
         and status <> 'attached'`,
      [input.sourceMemoId, input.errorCode, input.errorMessage]
    );
  }

  async lockAvailableForAttachment(photoImportIds: string[]): Promise<PhotoImportRecord[]> {
    if (photoImportIds.length === 0) {
      return [];
    }
    const result = await this.db.query<PhotoImportRow>(
      `select *
       from photo_imports
       where id = any($1::uuid[])
         and status = 'available'
       order by created_at asc
       for update`,
      [photoImportIds]
    );
    return result.rows.map(mapPhotoImport);
  }

  async markAttached(input: { photoImportIds: string[]; workItemId: string }): Promise<void> {
    if (input.photoImportIds.length === 0) {
      return;
    }
    await this.db.query(
      `update photo_imports
       set
         status = 'attached',
         attached_work_item_id = $2,
         attached_at = now(),
         updated_at = now()
       where id = any($1::uuid[])`,
      [input.photoImportIds, input.workItemId]
    );
  }
}

export class WorkItemArtifactRepository {
  constructor(private readonly db: Queryable) {}

  async link(input: { workItemId: string; artifactId: string; relationship: string }): Promise<void> {
    await this.db.query(
      `insert into work_item_artifacts (
         work_item_id,
         artifact_id,
         relationship,
         created_at
       )
       values ($1, $2, $3, now())
       on conflict do nothing`,
      [input.workItemId, input.artifactId, input.relationship]
    );
  }

  async countPhotoAttachmentsForWorkItems(workItemIds: string[]): Promise<Map<string, number>> {
    if (workItemIds.length === 0) {
      return new Map();
    }

    const result = await this.db.query<{ work_item_id: string; count: number | string }>(
      `select work_item_id, count(*) as count
       from work_item_artifacts
       where work_item_id = any($1::uuid[])
         and relationship = 'photo_attachment'
       group by work_item_id`,
      [workItemIds]
    );
    return new Map(
      result.rows.map((row) => [
        row.work_item_id,
        typeof row.count === "number" ? row.count : Number.parseInt(row.count, 10)
      ])
    );
  }

  async listPhotoAttachments(workItemId: string): Promise<WorkItemPhotoAttachmentRecord[]> {
    const result = await this.db.query<{
      original_artifact_id: string;
      thumbnail_artifact_id: string | null;
      original_filename: string | null;
      mime_type: string;
      byte_size: number | string;
      captured_at: Date | string | null;
      camera_make: string | null;
      camera_model: string | null;
    }>(
      `select
         artifacts.id as original_artifact_id,
         photo_imports.thumbnail_artifact_id,
         coalesce(photo_imports.original_filename, artifacts.original_filename) as original_filename,
         artifacts.mime_type,
         artifacts.byte_size,
         photo_imports.captured_at,
         photo_imports.camera_make,
         photo_imports.camera_model
       from work_item_artifacts
       join artifacts on artifacts.id = work_item_artifacts.artifact_id
       left join photo_imports on photo_imports.original_artifact_id = artifacts.id
       where work_item_artifacts.work_item_id = $1
         and work_item_artifacts.relationship = 'photo_attachment'
       order by photo_imports.captured_at asc nulls last, artifacts.created_at asc`,
      [workItemId]
    );
    return result.rows.map((row) => ({
      originalArtifactId: row.original_artifact_id,
      thumbnailArtifactId: row.thumbnail_artifact_id,
      originalFilename: row.original_filename,
      mimeType: row.mime_type,
      byteSize: typeof row.byte_size === "number" ? row.byte_size : Number.parseInt(row.byte_size, 10),
      capturedAt: row.captured_at == null ? null : toIso(row.captured_at),
      cameraMake: row.camera_make,
      cameraModel: row.camera_model
    }));
  }
}

function requiredRow<Row>(row: Row | undefined): Row {
  if (row === undefined) {
    throw new Error("Photo import query did not return a row.");
  }
  return row;
}

function mapPhotoImport(row: PhotoImportRow): PhotoImportRecord {
  return {
    id: row.id,
    sourceMemoId: row.source_memo_id,
    originalArtifactId: row.original_artifact_id,
    thumbnailArtifactId: row.thumbnail_artifact_id,
    importEventId: row.import_event_id,
    status: row.status,
    originalFilename: row.original_filename,
    contentHash: row.content_hash,
    contributorText: row.contributor_text,
    contributorId: row.contributor_id,
    capturedAt: row.captured_at === null ? null : toIso(row.captured_at),
    cameraMake: row.camera_make,
    cameraModel: row.camera_model,
    gpsLatitude: row.gps_latitude === null ? null : Number(row.gps_latitude),
    gpsLongitude: row.gps_longitude === null ? null : Number(row.gps_longitude),
    preprocessingErrorCode: row.preprocessing_error_code,
    preprocessingErrorMessage: row.preprocessing_error_message,
    attachedWorkItemId: row.attached_work_item_id,
    attachedAt: row.attached_at === null ? null : toIso(row.attached_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
