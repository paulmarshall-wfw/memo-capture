import { MEMO_CAPTURE_EXPORT_SCHEMA_VERSION } from "@memo-capture/domain";
import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { ArtifactRepository } from "../repositories/artifacts.js";
import { AuditRepository } from "../repositories/audit.js";
import { ExportRepository, type ExportBatchRecord } from "../repositories/exports.js";
import { ProcessingJobRepository } from "../repositories/jobs.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { UserRepository } from "../repositories/users.js";
import { assertNonEmptyString, HttpError } from "./errors.js";
import { renderExportArtifacts } from "./export-renderer.js";
import { ObjectStorageService } from "./object-storage.js";

export class ExportService {
  private readonly storage: ObjectStorageService;

  constructor(private readonly db: Database, private readonly config: ApiConfig) {
    this.storage = new ObjectStorageService(config.objectStorage);
  }

  async listAcceptedSnapshots(query: URLSearchParams) {
    return {
      snapshots: await new ExportRepository(this.db).listExportableSnapshots({
        projectId: query.get("project_id"),
        featureGroupId: query.get("feature_group_id"),
        contributorId: query.get("contributor_id"),
        tag: query.get("tag"),
        dateFrom: query.get("date_from"),
        dateTo: query.get("date_to"),
        exportStatus: query.get("export_status"),
        q: query.get("q")
      })
    };
  }

  async listBatches() {
    return {
      batches: await new ExportRepository(this.db).listBatches()
    };
  }

  async createBatch(
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ exportBatchId: string; schemaVersion: string; status: string; jobId: string }> {
    const input = parseCreateBatchBody(requestBody);
    return this.db.transaction(async (client) => {
      const exports = new ExportRepository(client);
      const jobs = new ProcessingJobRepository(client);
      const audit = new AuditRepository(client);
      const batch = await exports.createBatch({
        acceptedSnapshotIds: input.acceptedSnapshotIds,
        filterContext: input.filterContext,
        options: input.options,
        createdBy: actor.id
      });

      if (batch.itemCount !== input.acceptedSnapshotIds.length) {
        throw new HttpError(400, "invalid_snapshot_selection", "One or more accepted snapshots were not found.");
      }

      const job = await jobs.create({
        jobKind: "generate_export_batch",
        exportBatchId: batch.id,
        maxAttempts: 1,
        initiatedBy: actor.id
      });

      await audit.record({
        eventName: "export_batch.created",
        actor,
        subjectType: "export_batch",
        subjectId: batch.id,
        requestId,
        jobId: job.id,
        metadata: {
          schemaVersion: batch.schemaVersion,
          itemCount: batch.itemCount,
          filterContext: batch.filterContext,
          options: batch.options
        }
      });

      return {
        exportBatchId: batch.id,
        schemaVersion: batch.schemaVersion,
        status: batch.status,
        jobId: job.id
      };
    });
  }

  async getBatch(exportBatchId: string) {
    const exports = new ExportRepository(this.db);
    const batch = await exports.findBatch(exportBatchId);
    if (batch === null) {
      throw new HttpError(404, "not_found", "export_batch was not found.");
    }
    return {
      batch,
      items: await exports.listBatchItems(exportBatchId)
    };
  }

  async downloadBundle(exportBatchId: string, actor: AppUserRecord, requestId: string): Promise<{
    filename: string;
    contentType: string;
    body: Buffer;
  }> {
    const exports = new ExportRepository(this.db);
    const artifacts = new ArtifactRepository(this.db);
    const batch = await exports.findBatch(exportBatchId);
    if (batch === null) {
      throw new HttpError(404, "not_found", "export_batch was not found.");
    }
    if (batch.status !== "succeeded" || batch.bundleArtifactId === null) {
      throw new HttpError(409, "export_batch_not_ready", "Export batch is not ready to download.");
    }

    const artifact = await artifacts.findById(batch.bundleArtifactId);
    if (artifact === null) {
      throw new HttpError(404, "not_found", "export bundle artifact was not found.");
    }

    const body = await this.storage.getObject(artifact.objectKey);
    await new AuditRepository(this.db).record({
      eventName: "export_batch.downloaded",
      actor,
      subjectType: "export_batch",
      subjectId: batch.id,
      requestId,
      metadata: {
        bundleArtifactId: artifact.id,
        objectKey: artifact.objectKey
      }
    });

    return {
      filename: artifact.originalFilename ?? `export-${batch.id}.zip`,
      contentType: artifact.mimeType,
      body
    };
  }

  async generateBatch(exportBatchId: string, requestId: string | null = null): Promise<ExportBatchRecord> {
    const exports = new ExportRepository(this.db);
    const batch = await exports.findBatch(exportBatchId);
    if (batch === null) {
      throw new HttpError(404, "not_found", "export_batch was not found.");
    }

    await exports.markGenerating(exportBatchId);
    try {
      const generatingBatch = (await exports.findBatch(exportBatchId)) ?? batch;
      const snapshots = await exports.getSnapshotsForGeneration(exportBatchId);
      const createdBy =
        generatingBatch.createdBy === null
          ? null
          : await new UserRepository(this.db).findById(generatingBatch.createdBy);
      const rendered = renderExportArtifacts({
        batch: generatingBatch,
        snapshots,
        createdBy
      });

      const artifactInputs = [
        {
          kind: "export_manifest" as const,
          key: `exports/v1/${exportBatchId}/manifest.json`,
          filename: "manifest.json",
          mimeType: "application/json",
          body: rendered.manifestJson
        },
        {
          kind: "export_jsonl" as const,
          key: `exports/v1/${exportBatchId}/items.jsonl`,
          filename: "items.jsonl",
          mimeType: "application/x-ndjson",
          body: rendered.itemsJsonl
        },
        {
          kind: "export_markdown_combined" as const,
          key: `exports/v1/${exportBatchId}/combined.md`,
          filename: "combined.md",
          mimeType: "text/markdown; charset=utf-8",
          body: rendered.combinedMarkdown
        },
        {
          kind: "export_bundle" as const,
          key: `exports/v1/${exportBatchId}/export-${exportBatchId}.zip`,
          filename: `export-${exportBatchId}.zip`,
          mimeType: "application/zip",
          body: rendered.bundleZip
        }
      ];
      const [manifestArtifact, jsonlArtifact, combinedArtifact, bundleArtifact] = await Promise.all(
        artifactInputs.map((artifact) => this.createStoredArtifact(artifact, generatingBatch.createdBy))
      );

      if (
        manifestArtifact === undefined ||
        jsonlArtifact === undefined ||
        combinedArtifact === undefined ||
        bundleArtifact === undefined
      ) {
        throw new Error("Export artifact creation failed.");
      }

      const itemArtifacts = [];
      for (const itemFile of rendered.itemMarkdownFiles) {
        const artifact = await this.createStoredArtifact(
          {
            kind: "export_markdown_item",
            key: `exports/v1/${exportBatchId}/${itemFile.relativePath}`,
            filename: itemFile.relativePath.split("/").at(-1) ?? "item.md",
            mimeType: "text/markdown; charset=utf-8",
            body: itemFile.body
          },
          generatingBatch.createdBy
        );
        itemArtifacts.push({
          acceptedSnapshotId: itemFile.acceptedSnapshotId,
          artifactId: artifact.id
        });
      }

      await this.db.transaction(async (client) => {
        const transactionExports = new ExportRepository(client);
        const audit = new AuditRepository(client);
        await transactionExports.attachArtifacts({
          exportBatchId,
          manifestArtifactId: manifestArtifact.id,
          jsonlArtifactId: jsonlArtifact.id,
          combinedMarkdownArtifactId: combinedArtifact.id,
          bundleArtifactId: bundleArtifact.id,
          itemArtifacts
        });
        await audit.record({
          eventName: "export_batch.generation_succeeded",
          actor: createdBy,
          subjectType: "export_batch",
          subjectId: exportBatchId,
          requestId,
          metadata: {
            itemCount: snapshots.length,
            schemaVersion: MEMO_CAPTURE_EXPORT_SCHEMA_VERSION,
            bundleArtifactId: bundleArtifact.id
          }
        });
      });

      const completed = await exports.findBatch(exportBatchId);
      if (completed === null) {
        throw new Error("Generated export batch disappeared.");
      }
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export generation failed.";
      await this.db.transaction(async (client) => {
        const transactionExports = new ExportRepository(client);
        const audit = new AuditRepository(client);
        await transactionExports.markFailed({
          exportBatchId,
          errorCode: "export_generation_failed",
          errorMessage: message
        });
        await audit.record({
          eventName: "export_batch.generation_failed",
          actor: null,
          subjectType: "export_batch",
          subjectId: exportBatchId,
          requestId,
          metadata: {
            errorCode: "export_generation_failed",
            errorMessage: message
          },
          redactionApplied: true
        });
      });
      throw error;
    }
  }

  private async createStoredArtifact(input: {
    kind:
      | "export_manifest"
      | "export_jsonl"
      | "export_markdown_combined"
      | "export_markdown_item"
      | "export_bundle";
    key: string;
    filename: string;
    mimeType: string;
    body: string | Buffer;
  }, createdBy: string | null): Promise<{ id: string }> {
    const stored = await this.storage.putObject({ objectKey: input.key, body: input.body });
    return new ArtifactRepository(this.db).create({
      artifactKind: input.kind,
      objectKey: stored.objectKey,
      bucket: stored.bucket,
      originalFilename: input.filename,
      mimeType: input.mimeType,
      byteSize: stored.byteSize,
      contentHash: stored.contentHash,
      layoutVersion: "v1",
      createdBy
    });
  }
}

function parseCreateBatchBody(body: unknown): {
  acceptedSnapshotIds: string[];
  filterContext: Record<string, unknown>;
  options: Record<string, unknown>;
} {
  const record = parseObject(body);
  if (!Array.isArray(record.acceptedSnapshotIds)) {
    throw new HttpError(400, "invalid_request", "acceptedSnapshotIds must be an array.");
  }

  const acceptedSnapshotIds = [...new Set(record.acceptedSnapshotIds.map((value) => assertNonEmptyString(value, "acceptedSnapshotIds")))];
  if (acceptedSnapshotIds.length === 0) {
    throw new HttpError(400, "invalid_request", "At least one accepted snapshot must be selected.");
  }

  return {
    acceptedSnapshotIds,
    filterContext: parseRecordOrEmpty(record.filterContext, "filterContext"),
    options: {
      includeContributor: true,
      includeSourceProvenance: true,
      ...parseRecordOrEmpty(record.options, "options")
    }
  };
}

function parseRecordOrEmpty(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_request", `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be an object.");
  }
  return body as Record<string, unknown>;
}
