import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { createPgDatabase } from "../db/postgres.js";
import type { Logger } from "../logger.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { UserRepository } from "../repositories/users.js";
import { ArtifactService } from "./artifacts.js";
import type { WorkItemRecord } from "../repositories/work-items.js";
import { AuthService } from "./auth.js";
import { CatalogService } from "./catalog.js";
import { DiagnosticsService } from "./diagnostics.js";
import { ExportService } from "./exports.js";
import { FormMemoService } from "./form-memos.js";
import { ImportService, type FinalizeUploadSessionResponse, type UploadSessionResponse } from "./imports.js";
import { JobService } from "./jobs.js";
import { ObjectStorageService } from "./object-storage.js";
import { WorkItemService } from "./work-items.js";
import { WorkflowService } from "./workflows.js";

export interface AppServices {
  artifacts: ArtifactOperations;
  auth: AuthService;
  catalog: CatalogService;
  diagnostics: DiagnosticsOperations;
  exports: ExportOperations;
  formMemos: FormMemoService;
  imports: ImportOperations;
  jobs: JobOperations;
  workflows: WorkflowService;
  workItems: WorkItemOperations;
  close(): Promise<void>;
}

export interface ArtifactOperations {
  download(artifactId: string): Promise<{ filename: string; contentType: string; body: Buffer }>;
}

export interface ExportOperations {
  listAcceptedSnapshots(query: URLSearchParams): Promise<unknown>;
  listBatches(): Promise<unknown>;
  createBatch(
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ exportBatchId: string; schemaVersion: string; status: string; jobId: string }>;
  getBatch(exportBatchId: string): Promise<unknown>;
  downloadBundle(
    exportBatchId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ filename: string; contentType: string; body: Buffer }>;
  generateBatch(exportBatchId: string, requestId?: string | null): Promise<unknown>;
}

export interface JobOperations {
  list(query: URLSearchParams): Promise<unknown>;
  get(jobId: string): Promise<unknown>;
  retry(jobId: string, requestBody: unknown, actor: AppUserRecord, requestId: string): Promise<unknown>;
  cancel(jobId: string, requestBody: unknown, actor: AppUserRecord, requestId: string): Promise<unknown>;
}

export interface ImportOperations {
  createUploadSession(
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<UploadSessionResponse>;
  uploadSessionArtifact(sessionId: string, body: Buffer): Promise<{ sessionId: string; status: "uploaded" }>;
  finalizeUploadSession(
    sessionId: string,
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<FinalizeUploadSessionResponse>;
  reportArchiveResult(
    importEventId: string,
    requestBody: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ importEventId: string; status: string; archivePath: string | null }>;
}

export interface DiagnosticsOperations {
  getWorkItemDiagnostics(workItemId: string): Promise<unknown>;
  listProviderHealth(): Promise<unknown>;
  getSystemDiagnostics(): Promise<unknown>;
}

export interface WorkItemOperations {
  list(input?: { bucketId?: string | null }): Promise<WorkItemRecord[]>;
  findById(workItemId: string): Promise<WorkItemRecord | null>;
  update(
    workItemId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<WorkItemRecord>;
  recoverTranscript(
    workItemId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<WorkItemRecord>;
}

export function createAppServices(config: ApiConfig, logger: Logger): AppServices {
  const db = createPgDatabase(config.databaseUrl, logger);
  return createAppServicesFromDatabase(config, db);
}

export function createAppServicesFromDatabase(config: ApiConfig, db: Database): AppServices {
  const objectStorage = new ObjectStorageService(config.objectStorage);
  return {
    auth: new AuthService(config, new UserRepository(db)),
    artifacts: new ArtifactService(db, objectStorage),
    catalog: new CatalogService(db),
    diagnostics: new DiagnosticsService(db, config),
    exports: new ExportService(db, config),
    formMemos: new FormMemoService(db),
    imports: new ImportService(db, objectStorage),
    jobs: new JobService(db),
    workflows: new WorkflowService(db, config.authMode),
    workItems: new WorkItemService(db, objectStorage),
    close: () => db.close()
  };
}
