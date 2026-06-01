import type { SourceMemoType } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";

export interface ImportUploadSessionInput {
  id: string;
  status: "upload_required" | "uploaded" | "finalized" | "duplicate_exact";
  machineId: string;
  watchFolderId: string;
  sourceType: SourceMemoType;
  originalFilename: string;
  originalPath: string;
  originalFileModifiedAt: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  objectKey: string | null;
  bucket: string | null;
  artifactId: string | null;
  reservedSourceMemoId: string | null;
  duplicateOfSourceMemoId: string | null;
  createdBy: string;
}

export interface ImportUploadSessionRecord extends ImportUploadSessionInput {
  createdAt: string;
  updatedAt: string;
  uploadedAt: string | null;
  finalizedAt: string | null;
}

interface ImportUploadSessionRow extends Record<string, unknown> {
  id: string;
  status: ImportUploadSessionRecord["status"];
  machine_id: string;
  watch_folder_id: string;
  source_type: SourceMemoType;
  original_filename: string;
  original_path: string;
  original_file_modified_at: Date | string;
  mime_type: string;
  byte_size: string | number;
  content_hash: string;
  object_key: string | null;
  bucket: string | null;
  artifact_id: string | null;
  reserved_source_memo_id: string | null;
  duplicate_of_source_memo_id: string | null;
  created_by: string;
  created_at: Date | string;
  updated_at: Date | string;
  uploaded_at: Date | string | null;
  finalized_at: Date | string | null;
}

export class ImportUploadSessionRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: ImportUploadSessionInput): Promise<ImportUploadSessionRecord> {
    const result = await this.db.query<ImportUploadSessionRow>(
      `insert into import_upload_sessions (
         id,
         status,
         machine_id,
         watch_folder_id,
         source_type,
         original_filename,
         original_path,
         original_file_modified_at,
         mime_type,
         byte_size,
         content_hash,
         object_key,
         bucket,
         artifact_id,
         reserved_source_memo_id,
         duplicate_of_source_memo_id,
         created_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())
       returning *`,
      [
        input.id,
        input.status,
        input.machineId,
        input.watchFolderId,
        input.sourceType,
        input.originalFilename,
        input.originalPath,
        input.originalFileModifiedAt,
        input.mimeType,
        input.byteSize,
        input.contentHash,
        input.objectKey,
        input.bucket,
        input.artifactId,
        input.reservedSourceMemoId,
        input.duplicateOfSourceMemoId,
        input.createdBy
      ]
    );

    return mapSession(requiredRow(result.rows[0]));
  }

  async findById(sessionId: string): Promise<ImportUploadSessionRecord | null> {
    const result = await this.db.query<ImportUploadSessionRow>(
      `select *
       from import_upload_sessions
       where id = $1`,
      [sessionId]
    );

    const row = result.rows[0];
    return row === undefined ? null : mapSession(row);
  }

  async markUploaded(sessionId: string): Promise<ImportUploadSessionRecord> {
    const result = await this.db.query<ImportUploadSessionRow>(
      `update import_upload_sessions
       set status = 'uploaded', uploaded_at = now(), updated_at = now()
       where id = $1 and status = 'upload_required'
       returning *`,
      [sessionId]
    );

    return mapSession(requiredRow(result.rows[0]));
  }

  async markFinalized(sessionId: string): Promise<void> {
    await this.db.query(
      `update import_upload_sessions
       set status = 'finalized', finalized_at = now(), updated_at = now()
       where id = $1`,
      [sessionId]
    );
  }
}

function requiredRow<Row>(row: Row | undefined): Row {
  if (row === undefined) {
    throw new Error("Import upload session update did not return a row.");
  }
  return row;
}

function mapSession(row: ImportUploadSessionRow): ImportUploadSessionRecord {
  return {
    id: row.id,
    status: row.status,
    machineId: row.machine_id,
    watchFolderId: row.watch_folder_id,
    sourceType: row.source_type,
    originalFilename: row.original_filename,
    originalPath: row.original_path,
    originalFileModifiedAt: toIso(row.original_file_modified_at),
    mimeType: row.mime_type,
    byteSize: typeof row.byte_size === "number" ? row.byte_size : Number.parseInt(row.byte_size, 10),
    contentHash: row.content_hash,
    objectKey: row.object_key,
    bucket: row.bucket,
    artifactId: row.artifact_id,
    reservedSourceMemoId: row.reserved_source_memo_id,
    duplicateOfSourceMemoId: row.duplicate_of_source_memo_id,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    uploadedAt: row.uploaded_at === null ? null : toIso(row.uploaded_at),
    finalizedAt: row.finalized_at === null ? null : toIso(row.finalized_at)
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
