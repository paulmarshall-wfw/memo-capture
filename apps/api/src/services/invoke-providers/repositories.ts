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
import type { TargetAppProviderProfileSettings, TargetAppProviderProfileSettingsRepository } from "@invoke-providers/client";
import type { TaskRun } from "@invoke-providers/core";

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

  async saveTaskRun(input: TaskRun): Promise<void> {
    const snapshot = normalizeInputSnapshot(input.inputSnapshot);
    await new SettingsRepository(this.db).createInvokeTaskRun({
      taskRunId: input.taskRunId || randomUUID(),
      taskKey: input.taskKey,
      hookKey: input.hookKey,
      providerKey: input.providerKey ?? null,
      adapterKey: input.adapterKey ?? null,
      model: input.model ?? null,
      promptVersion: parsePromptVersion(input.promptVersion),
      promptSnapshotId: input.promptSnapshotId ?? null,
      status: input.status,
      errorClass: input.errorClass ?? null,
      errorMessage: input.errorMessage ?? null,
      readinessReasons: input.readinessReasons ?? [],
      validationMetadata: normalizeMetadata(input.outputValidation),
      latencyMs: input.latencyMs ?? null,
      usageMetadata: normalizeMetadata(input.usage),
      commitSha: this.config.invokeProviders.commitSha,
      requestId: snapshot.requestId,
      correlationId: input.correlationId ?? snapshot.requestId,
      actorUserId: snapshot.actorUserId,
      workItemId: snapshot.workItemId,
      sourceMemoId: snapshot.sourceMemoId,
      processingJobId: snapshot.processingJobId,
      inputSnapshot: snapshot.inputSnapshot,
      outputSnapshot: {}
    });
  }

  async listTaskRuns(input: {
    taskKey?: string | null;
    hookKey?: string | null;
    providerKey?: string | null;
    status?: string | null;
    workItemId?: string | null;
    limit?: number;
  } = {}): Promise<SharedTaskRun[]> {
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

export class MemoCaptureProviderProfileSettingsRepository implements TargetAppProviderProfileSettingsRepository {
  constructor(private readonly db: Database) {}

  async getProviderProfileSettings(): Promise<TargetAppProviderProfileSettings> {
    const row = await new SettingsRepository(this.db).getProviderRegistrySettings();
    return row?.selected_provider_profile_key === null || row?.selected_provider_profile_key === undefined
      ? {}
      : { selectedProviderProfileKey: row.selected_provider_profile_key };
  }

  async saveProviderProfileSettings(settings: TargetAppProviderProfileSettings): Promise<void> {
    await new SettingsRepository(this.db).updateProviderRegistrySettings({
      selectedProviderProfileKey: settings.selectedProviderProfileKey ?? null,
      actorUserId: "shared-runtime"
    });
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
  if (isOutputValidation(row.validation_metadata)) {
    taskRun.outputValidation = row.validation_metadata;
  }
  if (row.latency_ms !== null) {
    taskRun.latencyMs = row.latency_ms;
  }
  if (isTokenCostMetadata(row.usage_metadata)) {
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

function parsePromptVersion(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeInputSnapshot(inputSnapshot: unknown): {
  inputSnapshot: Record<string, unknown>;
  requestId: string | null;
  actorUserId: string | null;
  workItemId: string | null;
  sourceMemoId: string | null;
  processingJobId: string | null;
} {
  const input = normalizeMetadata(inputSnapshot);
  return {
    inputSnapshot: input,
    requestId: optionalString(input.requestId),
    actorUserId: optionalString(input.actorUserId),
    workItemId: optionalString(input.workItemId),
    sourceMemoId: optionalString(input.sourceMemoId),
    processingJobId: optionalString(input.processingJobId)
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isOutputValidation(value: unknown): value is NonNullable<SharedTaskRun["outputValidation"]> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "valid" in value;
}

function isTokenCostMetadata(value: unknown): value is NonNullable<SharedTaskRun["usage"]> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
