import type { Database } from "../db/types.js";
import { ArtifactRepository } from "../repositories/artifacts.js";
import { HttpError } from "./errors.js";
import { ObjectStorageService } from "./object-storage.js";

export class ArtifactService {
  constructor(
    private readonly db: Database,
    private readonly objectStorage: ObjectStorageService
  ) {}

  async download(artifactId: string): Promise<{
    filename: string;
    contentType: string;
    body: Buffer;
  }> {
    const artifact = await new ArtifactRepository(this.db).findById(artifactId);
    if (artifact === null) {
      throw new HttpError(404, "not_found", "artifact was not found.");
    }

    return {
      filename: artifact.originalFilename ?? `${artifact.id}.bin`,
      contentType: artifact.mimeType,
      body: await this.objectStorage.getObject(artifact.objectKey)
    };
  }
}
