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
}
