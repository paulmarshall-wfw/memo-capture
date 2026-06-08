import type { ApiConfig } from "../../config.js";
import type { Database } from "../../db/types.js";
import { diagnoseAdapterRegistration, listConfiguredAdapters } from "./adapters.js";
import { runtimeKeysForConfig } from "./mapping.js";
import { MemoCaptureRuntimeRepositories } from "./repositories.js";
import { fetchRegistryProviders, type RegistryProviderSnapshot } from "./registry.js";
import { isSecretAvailable } from "./secrets.js";
import type {
  SharedProviderConfig,
  SharedReadinessReason,
  SharedTaskDefinition,
  SharedTaskReadiness,
  SharedTaskRun
} from "./types.js";

export class TargetAppRuntimeService {
  private readonly repositories: MemoCaptureRuntimeRepositories;

  constructor(
    private readonly db: Database,
    private readonly config: ApiConfig
  ) {
    this.repositories = new MemoCaptureRuntimeRepositories(db, config);
  }

  async getProviderCatalog(): Promise<RegistryProviderSnapshot & { fallbackUsed: boolean }> {
    const registry = await fetchRegistryProviders(this.config);
    return { ...registry, fallbackUsed: false };
  }

  async listTaskSettings(): Promise<SharedTaskDefinition[]> {
    return await this.repositories.listTasks();
  }

  async getHookRegistryState() {
    const [hooks, tasks] = await Promise.all([
      this.repositories.listHooks(),
      this.repositories.listTasks()
    ]);
    const usedHookKeys = new Set(tasks.map((task) => task.hookKey));
    return {
      hooks: hooks.map((hook) => ({
        ...hook,
        deletable: hook.usageCount === 0,
        deleteBlockedReason:
          hook.usageCount === 0
            ? null
            : `Hook is used by ${hook.usageCount} configured task${hook.usageCount === 1 ? "" : "s"}.`
      })),
      orphanImplementations: hooks
        .filter((hook) => hook.implementationStatus === "implemented" && !usedHookKeys.has(hook.hookKey))
        .map((hook) => hook.hookKey)
    };
  }

  async getReadinessDiagnostics() {
    const [{ providers, registry, fallbackUsed }, tasks, hooks] = await Promise.all([
      this.getProviderCatalog(),
      this.repositories.listTasks(),
      this.repositories.listHooks()
    ]);
    const runtimeKeys = runtimeKeysForConfig(this.config);
    const taskReadiness = tasks.map((task) => resolveTaskReadiness(task, providers, hooks, runtimeKeys, this.config));
    const blockers = taskReadiness.flatMap((entry) => entry.reasons);
    return {
      registry: {
        ...registry,
        fallbackUsed,
        providerCount: providers.length
      },
      adapters: listConfiguredAdapters(providers, this.config),
      tasks: taskReadiness,
      readyTaskCount: taskReadiness.filter((entry) => entry.ready).length,
      blockedTaskCount: taskReadiness.filter((entry) => !entry.ready).length,
      providers: providers.map((provider) => ({
        providerKey: provider.providerKey,
        displayName: provider.displayName,
        enabled: provider.enabled,
        healthStatus: provider.health?.status ?? "unknown",
        selectedByTaskKeys: tasks
          .filter((task) => task.selectedProviderKey === provider.providerKey)
          .map((task) => task.taskKey),
        missingSecretRef:
          provider.requiredSecretRef !== undefined && !isSecretAvailable(provider.requiredSecretRef, this.config)
            ? provider.requiredSecretRef
            : null
      })),
      hooks,
      runtimeKeys: runtimeKeys.map((key) => ({
        key,
        available: true,
        taskKeys: tasks.filter((task) => task.requiredRuntimeKeys?.includes(key) === true).map((task) => task.taskKey)
      })),
      blockers
    };
  }

  async diagnoseAdapter(input: { providerKey: string; taskKey: string; input?: unknown }) {
    const [{ providers }, tasks, hooks] = await Promise.all([
      this.getProviderCatalog(),
      this.repositories.listTasks(),
      this.repositories.listHooks()
    ]);
    const task = tasks.find((entry) => entry.taskKey === input.taskKey);
    const provider = providers.find((entry) => entry.providerKey === input.providerKey);
    if (task === undefined) {
      return {
        ok: false,
        providerKey: input.providerKey,
        taskKey: input.taskKey,
        errorClass: "missing_task",
        errorMessage: `Task ${input.taskKey} is not configured.`
      };
    }
    if (provider === undefined) {
      return {
        ok: false,
        providerKey: input.providerKey,
        taskKey: input.taskKey,
        errorClass: "missing_provider",
        errorMessage: `Provider ${input.providerKey} is not configured.`
      };
    }
    const readiness = resolveTaskReadiness(
      { ...task, selectedProviderKey: provider.providerKey, enabled: true },
      providers,
      hooks,
      runtimeKeysForConfig(this.config),
      this.config
    );
    if (!readiness.ready) {
      return {
        ok: false,
        providerKey: provider.providerKey,
        taskKey: task.taskKey,
        adapterKey: provider.adapterKey,
        readinessReasons: readiness.reasons,
        errorClass: readiness.reasons[0]?.code ?? "adapter_failure",
        errorMessage: readiness.reasons[0]?.message ?? "Task is not ready."
      };
    }
    const adapter = diagnoseAdapterRegistration(provider.adapterKey, this.config);
    return {
      ok: adapter.configured,
      providerKey: provider.providerKey,
      taskKey: task.taskKey,
      adapterKey: provider.adapterKey,
      errorClass: adapter.configured ? undefined : "missing_adapter",
      errorMessage: adapter.reason
    };
  }

  async listRenderSlots() {
    const diagnostics = await this.getReadinessDiagnostics();
    const tasks = await this.repositories.listTasks();
    const readinessByTask = new Map(diagnostics.tasks.map((entry) => [entry.taskKey, entry]));
    const slotNames = [...new Set(tasks.map((task) => task.renderSlot))].sort();
    return {
      renderSlots: slotNames.map((slot) => {
        const slotTasks = tasks.filter((task) => task.renderSlot === slot);
        return {
          slot,
          taskCount: slotTasks.length,
          readyTaskCount: slotTasks.filter((task) => readinessByTask.get(task.taskKey)?.ready === true).length
        };
      })
    };
  }

  async getRenderSlotActions(slot: string) {
    const diagnostics = await this.getReadinessDiagnostics();
    const tasks = await this.repositories.listTasks();
    const readinessByTask = new Map(diagnostics.tasks.map((entry) => [entry.taskKey, entry]));
    return {
      slot,
      actions: tasks
        .filter((task) => task.renderSlot === slot)
        .sort((left, right) => left.displayOrder - right.displayOrder || left.displayName.localeCompare(right.displayName))
        .map((task) => {
          const readiness = readinessByTask.get(task.taskKey);
          return {
            taskKey: task.taskKey,
            displayName: task.displayName,
            slot: task.renderSlot,
            displayOrder: task.displayOrder,
            enabled: task.enabled,
            ready: readiness?.ready === true,
            reasons: readiness?.reasons ?? []
          };
        })
    };
  }

  async listTaskRuns(input: {
    taskKey?: string | null;
    hookKey?: string | null;
    providerKey?: string | null;
    status?: string | null;
    workItemId?: string | null;
    limit?: number;
  }): Promise<{ taskRuns: SharedTaskRun[] }> {
    return { taskRuns: await this.repositories.listTaskRuns(input) };
  }

  async groupTaskRuns(groupBy: "taskKey" | "hookKey" | "providerKey" | "status") {
    const runs = await this.repositories.listTaskRuns({});
    const groups = new Map<string, SharedTaskRun[]>();
    for (const run of runs) {
      const key = String(run[groupBy] ?? "none");
      groups.set(key, [...(groups.get(key) ?? []), run]);
    }
    return {
      groupBy,
      groups: [...groups.entries()].map(([groupKey, taskRuns]) => ({ groupKey, taskRuns }))
    };
  }
}

function resolveTaskReadiness(
  task: SharedTaskDefinition,
  providers: SharedProviderConfig[],
  hooks: Array<{ hookKey: string; implementationStatus: "implemented" | "unimplemented" }>,
  runtimeKeys: string[],
  config: ApiConfig
): SharedTaskReadiness {
  const reasons: SharedReadinessReason[] = [];
  const provider =
    task.selectedProviderKey === undefined
      ? undefined
      : providers.find((candidate) => candidate.providerKey === task.selectedProviderKey);
  const hook = hooks.find((candidate) => candidate.hookKey === task.hookKey);

  if (!task.enabled) {
    reasons.push({ code: "disabled", message: "Task route is disabled." });
  }
  if (hook === undefined || hook.implementationStatus !== "implemented") {
    reasons.push({ code: "unimplemented_hook", message: "No app logic is registered for this hook." });
  }
  if (task.selectedProviderKey === undefined) {
    reasons.push({ code: "missing_provider", message: "No provider is selected." });
  } else if (provider === undefined) {
    reasons.push({ code: "missing_provider", message: `Provider ${task.selectedProviderKey} is not in the registry profile.` });
  } else {
    if (!provider.enabled) {
      reasons.push({ code: "disabled_provider", message: "Selected provider is disabled." });
    }
    if (
      task.requiredCapability !== undefined &&
      !provider.capabilities.some((capability) => capability.key === task.requiredCapability)
    ) {
      reasons.push({
        code: "incompatible_capability",
        message: `Selected provider does not advertise ${task.requiredCapability}.`
      });
    }
    if (!isSecretAvailable(provider.requiredSecretRef, config)) {
      reasons.push({
        code: "missing_secret",
        message: `Required secret ${provider.requiredSecretRef ?? "provider secret"} is not configured.`
      });
    }
  }
  for (const key of task.requiredRuntimeKeys ?? []) {
    if (!runtimeKeys.includes(key) && key !== "llm-runtime") {
      reasons.push({ code: "runtime_mismatch", message: `Runtime key ${key} is not available in this API process.` });
    }
  }
  return {
    taskKey: task.taskKey,
    ready: reasons.length === 0,
    reasons
  };
}

export function createTargetAppRuntimeService(db: Database, config: ApiConfig): TargetAppRuntimeService {
  return new TargetAppRuntimeService(db, config);
}
