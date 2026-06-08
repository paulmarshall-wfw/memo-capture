import { randomUUID } from "node:crypto";
import exifr from "exifr";
import sharp from "sharp";
import type { Database } from "../db/types.js";
import { ArtifactRepository } from "../repositories/artifacts.js";
import { PhotoImportRepository } from "../repositories/photo-imports.js";
import { SourceMemoArtifactRepository } from "../repositories/source-memos.js";
import type { ObjectStorageService } from "./object-storage.js";

export class PhotoPreprocessingJobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

export class PhotoPreprocessingService {
  constructor(
    private readonly db: Database,
    private readonly objectStorage: ObjectStorageService
  ) {}

  async runPreprocessJob(input: { sourceMemoId: string; jobId: string; actorUserId: string | null }): Promise<void> {
    const photoImports = new PhotoImportRepository(this.db);
    let photoImport = await photoImports.markPreprocessing(input.sourceMemoId);
    if (photoImport === null) {
      photoImport = await photoImports.findBySourceMemoId(input.sourceMemoId);
    }
    if (photoImport === null || photoImport.status !== "preprocessing") {
      throw new PhotoPreprocessingJobError(
        "photo_import_not_available",
        "Photo import is not available for preprocessing.",
        false
      );
    }

    const originalArtifact = await new ArtifactRepository(this.db).findById(photoImport.originalArtifactId);
    if (originalArtifact === null) {
      await photoImports.markPreprocessingFailed({
        sourceMemoId: input.sourceMemoId,
        errorCode: "original_photo_artifact_missing",
        errorMessage: "Original photo artifact was not found."
      });
      throw new PhotoPreprocessingJobError(
        "original_photo_artifact_missing",
        "Original photo artifact was not found.",
        false
      );
    }

    try {
      const originalBody = await this.objectStorage.getObject(originalArtifact.objectKey);
      const [metadata, thumbnail] = await Promise.all([
        extractPhotoMetadata(originalBody),
        sharp(originalBody, { failOn: "none" })
          .rotate()
          .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer()
      ]);

      const thumbnailArtifactId = randomUUID();
      const objectKey = `artifacts/v1/source-memos/${input.sourceMemoId}/derived/photo-thumbnail/${thumbnailArtifactId}.jpg`;
      const stored = await this.objectStorage.putObject({ objectKey, body: thumbnail });

      await this.db.transaction(async (client) => {
        await new ArtifactRepository(client).create({
          id: thumbnailArtifactId,
          artifactKind: "derived_photo_thumbnail",
          objectKey,
          bucket: stored.bucket,
          originalFilename: `${stripExtension(photoImport.originalFilename)}-thumbnail.jpg`,
          mimeType: "image/jpeg",
          byteSize: stored.byteSize,
          contentHash: stored.contentHash,
          layoutVersion: "v1",
          createdBy: input.actorUserId
        });
        await new SourceMemoArtifactRepository(client).link({
          sourceMemoId: input.sourceMemoId,
          artifactId: thumbnailArtifactId,
          relationship: "derived_photo_thumbnail"
        });
        await new PhotoImportRepository(client).markPreprocessed({
          sourceMemoId: input.sourceMemoId,
          thumbnailArtifactId,
          capturedAt: metadata.capturedAt,
          cameraMake: metadata.cameraMake,
          cameraModel: metadata.cameraModel,
          gpsLatitude: metadata.gpsLatitude,
          gpsLongitude: metadata.gpsLongitude
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Photo preprocessing failed.";
      await photoImports.markPreprocessingFailed({
        sourceMemoId: input.sourceMemoId,
        errorCode: "photo_preprocessing_failed",
        errorMessage: message
      });
      throw new PhotoPreprocessingJobError("photo_preprocessing_failed", message, true);
    }
  }
}

interface PhotoMetadata {
  capturedAt: string | null;
  cameraMake: string | null;
  cameraModel: string | null;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
}

async function extractPhotoMetadata(body: Buffer): Promise<PhotoMetadata> {
  const metadata = await exifr.parse(body, {
    tiff: true,
    exif: true,
    gps: true,
    translateKeys: true,
    translateValues: true,
    reviveValues: true
  });
  const record = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return {
    capturedAt: readDate(record.DateTimeOriginal) ?? readDate(record.CreateDate) ?? readDate(record.ModifyDate),
    cameraMake: readString(record.Make),
    cameraModel: readString(record.Model),
    gpsLatitude: readNumber(record.latitude) ?? readNumber(record.GPSLatitude),
    gpsLongitude: readNumber(record.longitude) ?? readNumber(record.GPSLongitude)
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  return null;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "") || "photo";
}
