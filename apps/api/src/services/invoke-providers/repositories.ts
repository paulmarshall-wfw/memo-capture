import { randomUUID } from "node:crypto";
import type { ApiConfig } from "../../config.js";
import type { Database } from "../../db/types.js";
import {
  SettingsRepository,
  type InvokeTaskRunRow
} from "../../repositories/settings.js";
import { isTaskHookImplemented } from "./hooks.js";
import { mapProcessingHookRow, mapProviderConfigRow, mapTaskRouteRow } from "./mapping.js";
import type { SharedProcessingHook, SharedProviderConfig, SharedTaskDefinition, SharedTaskRun } from "./types.js";

export class MemoCaptureRuntimeRepositories {
  constructor(
    private readonly db: Database,
    private readonly config: ApiConfig
  ) {}

  async listLocalProviders(): Promise<SharedProviderConfig[]> {
    const settings = new SettingsRepository(this.db);
    const [providers, capabilities] = await Promise.all([
      settings.listProviders(),
      settings.listProviderCapabilities()
    ]);
    return providers.map((provider) => mapProviderConfigRow(provider, capabilities));
  }

  async listTasks(): Promise<SharedTaskDefinition[]> {
    const settings = new SettingsRepository(this.db);
    const tasks = await settings.listAiTaskRoutes();
    return tasks.map(mapTaskRouteRow);
  }

  async listHooks(): Promise<SharedProcessingHook[]> {
    const settings = new SettingsRepository(this.db);
    const hooks = await settings.listProcessingHooks();
    return hooks.map((hook) => mapProcessingHookRow(hook, isTaskHookImplemented));
  }

  async saveTaskRun(input: {
    taskKey: string;
    hookKey: string;
    providerKey: string | null;
    adapterKey: string | null;
    model: string | null;
    promptVersion: number | null;
    promptSnapshotId: string | null;
    status: "succeeded" | "failed" | "skipped";
    errorClass: string | null;
    errorMessage: string | null;
    readinessReasons?: unknown[];
    validationMetadata?: Record<string, unknown>;
    latencyMs: number | null;
    usageMetadata?: Record<string, unknown>;
    requestId: string | null;
    correlationId?: string | null;
    actorUserId: string | null;
    workItemId: string | null;
    sourceMemoId: string | null;
    processingJobId: string | null;
    inputSnapshot?: Record<string, unknown>;
    outputSnapshot?: Record<string, unknown>;
  }): Promise<InvokeTaskRunRow> {
    return await new SettingsRepository(this.db).createInvokeTaskRun({
      taskRunId: randomUUID(),
      taskKey: input.taskKey,
      hookKey: input.hookKey,
      providerKey: input.providerKey,
      adapterKey: input.adapterKey,
      model: input.model,
      promptVersion: input.promptVersion,
      promptSnapshotId: input.promptSnapshotId,
      status: input.status,
      errorClass: input.errorClass,
      errorMessage: input.errorMessage,
      readinessReasons: input.readinessReasons ?? [],
      validationMetadata: input.validationMetadata ?? {},
      latencyMs: input.latencyMs,
      usageMetadata: input.usageMetadata ?? {},
      commitSha: this.config.invokeProviders.commitSha,
      requestId: input.requestId,
      correlationId: input.correlationId ?? input.requestId,
      actorUserId: input.actorUserId,
      workItemId: input.workItemId,
      sourceMemoId: input.sourceMemoId,
      processingJobId: input.processingJobId,
      inputSnapshot: input.inputSnapshot ?? {},
      outputSnapshot: input.outputSnapshot ?? {}
    });
  }

  async listTaskRuns(input: {
    taskKey?: string | null;
    hookKey?: string | null;
    providerKey?: string | null;
    status?: string | null;
    workItemId?: string | null;
    limit?: number;
  }): Promise<SharedTaskRun[]> {
    const filters: Parameters<SettingsRepository["listInvokeTaskRuns"]>[0] = {
      limit: clampLimit(input.limit)
    };
    if (input.taskKey !== undefined) {
      filters.taskKey = input.taskKey;
    }
    if (input.hookKey !== undefined) {
      filters.hookKey = input.hookKey;
    }
    if (input.providerKey !== undefined) {
      filters.providerKey = input.providerKey;
    }
    if (input.status !== undefined) {
      filters.status = input.status;
    }
    if (input.workItemId !== undefined) {
      filters.workItemId = input.workItemId;
    }
    const rows = await new SettingsRepository(this.db).listInvokeTaskRuns(filters);
    return rows.map(mapTaskRunRow);
  }
}

function mapTaskRunRow(row: InvokeTaskRunRow): SharedTaskRun {
  const taskRun: SharedTaskRun = {
    taskRunId: row.id,
    taskKey: row.task_key,
    hookKey: row.hook_key,
    inputSnapshot: row.input_snapshot,
    status: row.status === "failed" || row.status === "skipped" ? row.status : "succeeded",
    createdAt: new Date(row.created_at).toISOString()
  };
  if (row.provider_key !== null) {
    taskRun.providerKey = row.provider_key;
  }
  if (row.adapter_key !== null) {
    taskRun.adapterKey = row.adapter_key;
  }
  if (row.model !== null) {
    taskRun.model = row.model;
  }
  if (row.prompt_version !== null) {
    taskRun.promptVersion = String(row.prompt_version);
  }
  if (row.prompt_snapshot_id !== null) {
    taskRun.promptSnapshotId = row.prompt_snapshot_id;
  }
  if (row.readiness_reasons !== null && Array.isArray(row.readiness_reasons)) {
    taskRun.readinessReasons = row.readiness_reasons as NonNullable<SharedTaskRun["readinessReasons"]>;
  }
  if (row.validation_metadata !== null) {
    taskRun.outputValidation = row.validation_metadata;
  }
  if (row.latency_ms !== null) {
    taskRun.latencyMs = row.latency_ms;
  }
  if (row.usage_metadata !== null) {
    taskRun.usage = row.usage_metadata;
  }
  if (row.error_class !== null) {
    taskRun.errorClass = row.error_class as NonNullable<SharedTaskRun["errorClass"]>;
  }
  if (row.error_message !== null) {
    taskRun.errorMessage = row.error_message;
  }
  if (row.correlation_id !== null) {
    taskRun.correlationId = row.correlation_id;
  }
  if (row.commit_sha !== null) {
    taskRun.commitSha = row.commit_sha;
  }
  return taskRun;
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isInteger(limit)) {
    return 50;
  }
  return Math.min(Math.max(limit, 1), 200);
}
