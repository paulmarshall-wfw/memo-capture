import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { createPgDatabase } from "../db/postgres.js";
import type { Logger } from "../logger.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { UserRepository } from "../repositories/users.js";
import type { WorkItemRecord } from "../repositories/work-items.js";
import { AuthService } from "./auth.js";
import { CatalogService } from "./catalog.js";
import { ExportService } from "./exports.js";
import { FormMemoService } from "./form-memos.js";
import { WorkItemService } from "./work-items.js";
import { WorkflowService } from "./workflows.js";

export interface AppServices {
  auth: AuthService;
  catalog: CatalogService;
  exports: ExportOperations;
  formMemos: FormMemoService;
  workflows: WorkflowService;
  workItems: WorkItemOperations;
  close(): Promise<void>;
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

export interface WorkItemOperations {
  list(input?: { bucketId?: string | null }): Promise<WorkItemRecord[]>;
  findById(workItemId: string): Promise<WorkItemRecord | null>;
  update(
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
  return {
    auth: new AuthService(config, new UserRepository(db)),
    catalog: new CatalogService(db),
    exports: new ExportService(db, config),
    formMemos: new FormMemoService(db),
    workflows: new WorkflowService(db, config.authMode),
    workItems: new WorkItemService(db),
    close: () => db.close()
  };
}
