import { randomUUID } from "node:crypto";
import type { WorkflowStagedImportStatus } from "@memo-capture/domain";
import type { Queryable } from "../db/types.js";

export interface ActiveWorkflowRow extends Record<string, unknown> {
  workflow_id: string;
  workflow_version: string;
  state_machine_version: string;
  required_app_capabilities: unknown;
  content_hash: string;
  bundle: unknown;
  activated_by: string | null;
  activated_at: Date | string;
}

export interface StagedWorkflowRow extends Record<string, unknown> {
  id: string;
  workflow_id: string;
  workflow_version: string;
  state_machine_version: string;
  content_hash: string;
  bundle: unknown;
  validation_result: unknown;
  status: WorkflowStagedImportStatus;
  imported_by: string | null;
  created_at: Date | string;
  activated_at: Date | string | null;
}

export interface WorkflowActivationHistoryInput {
  workflowId: string;
  previousWorkflowVersion: string | null;
  previousStateMachineVersion: string | null;
  previousContentHash: string | null;
  newWorkflowVersion: string;
  newStateMachineVersion: string;
  newContentHash: string;
  activationNotes: string;
  compatibilityResult: Record<string, unknown>;
  activatedBy: string | null;
}

export interface WorkflowImportInput {
  workflowId: string;
  workflowVersion: string;
  stateMachineVersion: string;
  contentHash: string;
  bundle: unknown;
  validationResult: unknown;
  status: WorkflowStagedImportStatus;
  importedBy: string | null;
}

export class WorkflowRepository {
  constructor(private readonly db: Queryable) {}

  async getActive(): Promise<ActiveWorkflowRow | null> {
    const result = await this.db.query<ActiveWorkflowRow>(
      `select *
       from workflow_active_definition
       where singleton_id = true`
    );
    return result.rows[0] ?? null;
  }

  async findStagedImport(stagedImportId: string): Promise<StagedWorkflowRow | null> {
    const result = await this.db.query<StagedWorkflowRow>(
      `select *
       from workflow_staged_imports
       where id = $1`,
      [stagedImportId]
    );
    return result.rows[0] ?? null;
  }

  async findActivationByVersion(
    workflowId: string,
    workflowVersion: string
  ): Promise<{ new_content_hash: string } | null> {
    const result = await this.db.query<{ new_content_hash: string }>(
      `select new_content_hash
       from workflow_activation_history
       where workflow_id = $1 and new_workflow_version = $2
       order by activated_at desc
       limit 1`,
      [workflowId, workflowVersion]
    );
    return result.rows[0] ?? null;
  }

  async countActiveWorkflowDependentJobs(): Promise<number> {
    const result = await this.db.query<{ active_count: number | string }>(
      `select count(*) as active_count
       from processing_jobs
       where status in ('queued', 'claimed', 'running', 'retry_scheduled')
         and (
           work_item_id is not null
           or job_kind in ('extract_memo_metadata', 'expand_work_item', 'generate_export_batch')
         )`
    );
    const count = result.rows[0]?.active_count ?? 0;
    return typeof count === "number" ? count : Number.parseInt(count, 10);
  }

  async createStagedImport(input: WorkflowImportInput): Promise<StagedWorkflowRow> {
    const result = await this.db.query<StagedWorkflowRow>(
      `insert into workflow_staged_imports (
         id,
         workflow_id,
         workflow_version,
         state_machine_version,
         content_hash,
         bundle,
         validation_result,
         status,
         imported_by,
         created_at
       )
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, now())
       returning *`,
      [
        randomUUID(),
        input.workflowId,
        input.workflowVersion,
        input.stateMachineVersion,
        input.contentHash,
        JSON.stringify(input.bundle),
        JSON.stringify(input.validationResult),
        input.status,
        input.importedBy
      ]
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("Failed to create staged workflow import.");
    }
    return row;
  }

  async replaceActive(input: {
    workflowId: string;
    workflowVersion: string;
    stateMachineVersion: string;
    contentHash: string;
    requiredAppCapabilities: string[];
    bundle: unknown;
    activatedBy: string | null;
  }): Promise<ActiveWorkflowRow> {
    const result = await this.db.query<ActiveWorkflowRow>(
      `insert into workflow_active_definition (
         singleton_id,
         workflow_id,
         workflow_version,
         state_machine_version,
         required_app_capabilities,
         content_hash,
         bundle,
         activated_by,
         activated_at
       )
       values (true, $1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, now())
       on conflict (singleton_id) do update
       set
         workflow_id = excluded.workflow_id,
         workflow_version = excluded.workflow_version,
         state_machine_version = excluded.state_machine_version,
         required_app_capabilities = excluded.required_app_capabilities,
         content_hash = excluded.content_hash,
         bundle = excluded.bundle,
         activated_by = excluded.activated_by,
         activated_at = excluded.activated_at
       returning *`,
      [
        input.workflowId,
        input.workflowVersion,
        input.stateMachineVersion,
        JSON.stringify(input.requiredAppCapabilities),
        input.contentHash,
        JSON.stringify(input.bundle),
        input.activatedBy
      ]
    );

    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("Failed to replace active workflow definition.");
    }
    return row;
  }

  async recordActivation(input: WorkflowActivationHistoryInput): Promise<void> {
    await this.db.query(
      `insert into workflow_activation_history (
         id,
         workflow_id,
         previous_workflow_version,
         previous_state_machine_version,
         previous_content_hash,
         new_workflow_version,
         new_state_machine_version,
         new_content_hash,
         activation_notes,
         compatibility_result,
         activated_by,
         activated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, now())`,
      [
        randomUUID(),
        input.workflowId,
        input.previousWorkflowVersion,
        input.previousStateMachineVersion,
        input.previousContentHash,
        input.newWorkflowVersion,
        input.newStateMachineVersion,
        input.newContentHash,
        input.activationNotes,
        JSON.stringify(input.compatibilityResult),
        input.activatedBy
      ]
    );
  }

  async markStagedImportActivated(stagedImportId: string): Promise<void> {
    await this.db.query(
      `update workflow_staged_imports
       set status = 'activated', activated_at = now()
       where id = $1`,
      [stagedImportId]
    );
  }
}
