import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { createPgDatabase } from "../db/postgres.js";
import type { Logger } from "../logger.js";
import { UserRepository } from "../repositories/users.js";
import { WorkItemRepository } from "../repositories/work-items.js";
import { AuthService } from "./auth.js";
import { CatalogService } from "./catalog.js";
import { FormMemoService } from "./form-memos.js";
import { WorkflowService } from "./workflows.js";

export interface AppServices {
  auth: AuthService;
  catalog: CatalogService;
  formMemos: FormMemoService;
  workflows: WorkflowService;
  workItems: WorkItemRepository;
  close(): Promise<void>;
}

export function createAppServices(config: ApiConfig, logger: Logger): AppServices {
  const db = createPgDatabase(config.databaseUrl, logger);
  return createAppServicesFromDatabase(config, db);
}

export function createAppServicesFromDatabase(config: ApiConfig, db: Database): AppServices {
  return {
    auth: new AuthService(config, new UserRepository(db)),
    catalog: new CatalogService(db),
    formMemos: new FormMemoService(db),
    workflows: new WorkflowService(db, config.authMode),
    workItems: new WorkItemRepository(db),
    close: () => db.close()
  };
}
