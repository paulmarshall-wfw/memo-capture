import { randomUUID } from "node:crypto";
import type { SourceMemoType } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";

export interface SourceMemoCreateInput {
  id?: string;
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
  sourceType?: SourceMemoType;
  primaryArtifactId?: string | null;
  contentHash: string | null;
  currentTranscriptText?: string | null;
}

interface SourceMemoRow extends Record<string, unknown> {
  id: string;
  source_type: SourceMemoType;
  primary_artifact_id: string | null;
  content_hash: string | null;
  current_transcript_text: string | null;
}

export class SourceMemoRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: SourceMemoCreateInput): Promise<SourceMemoRecord> {
    const id = input.id ?? randomUUID();
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

    return { id, contentHash: input.contentHash ?? null };
  }

  async findById(sourceMemoId: string): Promise<SourceMemoRecord | null> {
    const result = await this.db.query<SourceMemoRow>(
      `select id, source_type, primary_artifact_id, content_hash, current_transcript_text
       from source_memos
       where id = $1`,
      [sourceMemoId]
    );

    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          sourceType: row.source_type,
          primaryArtifactId: row.primary_artifact_id,
          contentHash: row.content_hash,
          currentTranscriptText: row.current_transcript_text
        };
  }

  async findByContentHash(contentHash: string): Promise<SourceMemoRecord | null> {
    const result = await this.db.query<{ id: string; content_hash: string | null }>(
      `select id, content_hash
       from source_memos
       where content_hash = $1
       order by created_at asc
       limit 1`,
      [contentHash]
    );

    const row = result.rows[0];
    return row === undefined ? null : { id: row.id, contentHash: row.content_hash };
  }

  async updateArchivePath(input: { sourceMemoId: string; archivePath: string | null }): Promise<void> {
    await this.db.query(
      `update source_memos
       set archive_path = $2, updated_at = now()
       where id = $1`,
      [input.sourceMemoId, input.archivePath]
    );
  }

  async updateTranscript(input: {
    sourceMemoId: string;
    transcriptText: string;
    extractedText?: string | null;
  }): Promise<void> {
    await this.db.query(
      `update source_memos
       set
         current_transcript_text = $2,
         extracted_text = coalesce($3, extracted_text),
         updated_at = now()
       where id = $1`,
      [input.sourceMemoId, input.transcriptText, input.extractedText ?? input.transcriptText]
    );
  }
}

export class SourceMemoArtifactRepository {
  constructor(private readonly db: Queryable) {}

  async link(input: {
    sourceMemoId: string;
    artifactId: string;
    relationship: string;
  }): Promise<void> {
    await this.db.query(
      `insert into source_memo_artifacts (
         source_memo_id,
         artifact_id,
         relationship,
         created_at
       )
       values ($1, $2, $3, now())
       on conflict do nothing`,
      [input.sourceMemoId, input.artifactId, input.relationship]
    );
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

  async create(input: ImportEventInput): Promise<{ id: string }> {
    const id = randomUUID();
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
        id,
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
    return { id };
  }

  async findById(importEventId: string): Promise<{
    id: string;
    sourceMemoId: string | null;
    machineId: string | null;
    status: string;
  } | null> {
    const result = await this.db.query<{
      id: string;
      source_memo_id: string | null;
      machine_id: string | null;
      status: string;
    }>(
      `select id, source_memo_id, machine_id, status
       from import_events
       where id = $1`,
      [importEventId]
    );

    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          sourceMemoId: row.source_memo_id,
          machineId: row.machine_id,
          status: row.status
        };
  }

  async updateArchiveResult(input: {
    importEventId: string;
    archivePath: string | null;
    status?: string | null;
    warningCode?: string | null;
    warningMessage?: string | null;
  }): Promise<{ sourceMemoId: string | null; status: string } | null> {
    const result = await this.db.query<{ source_memo_id: string | null; status: string }>(
      `update import_events
       set
         archive_path = $2,
         status = coalesce($3, status),
         warning_code = $4,
         warning_message = $5
       where id = $1
       returning source_memo_id, status`,
      [
        input.importEventId,
        input.archivePath,
        input.status ?? null,
        input.warningCode ?? null,
        input.warningMessage ?? null
      ]
    );

    const row = result.rows[0];
    return row === undefined ? null : { sourceMemoId: row.source_memo_id, status: row.status };
  }
}
