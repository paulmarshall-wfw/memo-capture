import { randomUUID } from "node:crypto";
import type { SourceMemoType } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";

export interface SourceMemoCreateInput {
  sourceType: SourceMemoType;
  primaryArtifactId?: string | null;
  originalText?: string | null;
  extractedText?: string | null;
  currentTranscriptText?: string | null;
  contentHash?: string | null;
  originalPath?: string | null;
  archivePath?: string | null;
  contributorText?: string | null;
  contributorId?: string | null;
  createdBy: string;
}

export interface SourceMemoRecord {
  id: string;
}

export class SourceMemoRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: SourceMemoCreateInput): Promise<SourceMemoRecord> {
    const id = randomUUID();
    await this.db.query(
      `insert into source_memos (
         id,
         source_type,
         primary_artifact_id,
         original_text,
         extracted_text,
         current_transcript_text,
         content_hash,
         original_path,
         archive_path,
         contributor_text,
         contributor_id,
         created_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now())`,
      [
        id,
        input.sourceType,
        input.primaryArtifactId ?? null,
        input.originalText ?? null,
        input.extractedText ?? null,
        input.currentTranscriptText ?? null,
        input.contentHash ?? null,
        input.originalPath ?? null,
        input.archivePath ?? null,
        input.contributorText ?? null,
        input.contributorId ?? null,
        input.createdBy
      ]
    );

    return { id };
  }
}

export interface ImportEventInput {
  sourceMemoId: string | null;
  artifactId?: string | null;
  machineId?: string | null;
  watchFolderId?: string | null;
  originalPath?: string | null;
  archivePath?: string | null;
  contentHash: string;
  duplicateOfSourceMemoId?: string | null;
  status: string;
  warningCode?: string | null;
  warningMessage?: string | null;
}

export class ImportEventRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: ImportEventInput): Promise<void> {
    await this.db.query(
      `insert into import_events (
         id,
         source_memo_id,
         artifact_id,
         machine_id,
         watch_folder_id,
         original_path,
         archive_path,
         content_hash,
         duplicate_of_source_memo_id,
         status,
         warning_code,
         warning_message,
         created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
      [
        randomUUID(),
        input.sourceMemoId,
        input.artifactId ?? null,
        input.machineId ?? null,
        input.watchFolderId ?? null,
        input.originalPath ?? null,
        input.archivePath ?? null,
        input.contentHash,
        input.duplicateOfSourceMemoId ?? null,
        input.status,
        input.warningCode ?? null,
        input.warningMessage ?? null
      ]
    );
  }
}
