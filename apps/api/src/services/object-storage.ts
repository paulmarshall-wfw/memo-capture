import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorageConfig } from "../config.js";
import { HttpError } from "./errors.js";

export interface StoredObject {
  objectKey: string;
  bucket: string;
  byteSize: number;
  contentHash: string;
}

export class ObjectStorageService {
  private readonly root: string;

  constructor(private readonly config: ObjectStorageConfig) {
    this.root = path.resolve(config.localRoot);
  }

  async putObject(input: { objectKey: string; body: Buffer | string }): Promise<StoredObject> {
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body, "utf8");
    const target = this.resolveObjectPath(input.objectKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return {
      objectKey: input.objectKey,
      bucket: this.config.bucket,
      byteSize: body.byteLength,
      contentHash: `sha256:${createHash("sha256").update(body).digest("hex")}`
    };
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const target = this.resolveObjectPath(objectKey);
    try {
      return await readFile(target);
    } catch {
      throw new HttpError(404, "artifact_object_not_found", "Artifact object was not found in storage.");
    }
  }

  private resolveObjectPath(objectKey: string): string {
    if (objectKey.trim() === "" || objectKey.includes("\0")) {
      throw new HttpError(400, "invalid_object_key", "Object key is invalid.");
    }

    const bucketRoot = path.join(this.root, this.config.bucket);
    const target = path.resolve(bucketRoot, objectKey);
    if (target !== bucketRoot && !target.startsWith(`${bucketRoot}${path.sep}`)) {
      throw new HttpError(400, "invalid_object_key", "Object key must stay inside the storage bucket.");
    }
    return target;
  }
}
