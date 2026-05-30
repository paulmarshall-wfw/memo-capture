import { randomUUID } from "node:crypto";
import type { ArtifactKind } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";

export interface ArtifactInput {
  artifactKind: ArtifactKind;
  objectKey: string;
  bucket: string;
  originalFilename: string | null;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  layoutVersion?: string;
  createdBy: string | null;
}

export interface ArtifactRecord {
  id: string;
  artifactKind: ArtifactKind;
  objectKey: string;
  bucket: string;
  originalFilename: string | null;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  layoutVersion: string;
  createdBy: string | null;
  createdAt: string;
}

interface ArtifactRow extends Record<string, unknown> {
  id: string;
  artifact_kind: ArtifactKind;
  object_key: string;
  bucket: string;
  original_filename: string | null;
  mime_type: string;
  byte_size: string | number;
  content_hash: string;
  layout_version: string;
  created_by: string | null;
  created_at: Date | string;
}

export class ArtifactRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: ArtifactInput): Promise<{ id: string }> {
    const id = randomUUID();
    await this.db.query(
      `insert into artifacts (
         id,
         artifact_kind,
         object_key,
         bucket,
         original_filename,
         mime_type,
         byte_size,
         content_hash,
         layout_version,
         created_by,
         created_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
      [
        id,
        input.artifactKind,
        input.objectKey,
        input.bucket,
        input.originalFilename,
        input.mimeType,
        input.byteSize,
        input.contentHash,
        input.layoutVersion ?? "v1",
        input.createdBy
      ]
    );
    return { id };
  }

  async findById(artifactId: string): Promise<ArtifactRecord | null> {
    const result = await this.db.query<ArtifactRow>(
      `select *
       from artifacts
       where id = $1`,
      [artifactId]
    );

    const row = result.rows[0];
    return row === undefined ? null : mapArtifact(row);
  }
}

function mapArtifact(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    artifactKind: row.artifact_kind,
    objectKey: row.object_key,
    bucket: row.bucket,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: typeof row.byte_size === "number" ? row.byte_size : Number.parseInt(row.byte_size, 10),
    contentHash: row.content_hash,
    layoutVersion: row.layout_version,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}
