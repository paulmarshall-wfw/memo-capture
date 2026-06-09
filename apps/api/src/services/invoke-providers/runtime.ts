import { randomUUID } from "node:crypto";
import { TargetAppRuntimeService as SharedTargetAppRuntimeService } from "@invoke-providers/client";
import type { HostHook, ProviderAdapter } from "@invoke-providers/core";
import type { ApiConfig } from "../../config.js";
import type { Database } from "../../db/types.js";
import { buildMemoCaptureProviderAdapters } from "./adapters.js";
import { createMemoCaptureHostHooks } from "./hooks.js";
import { runtimeKeysForConfig } from "./mapping.js";
import {
  MemoCaptureProviderProfileSettingsRepository,
  MemoCaptureRuntimeRepositories
} from "./repositories.js";
import { createMemoCaptureSecretResolver } from "./secrets.js";

export interface MemoCaptureInvokeRuntimeOptions {
  adapters?: ProviderAdapter[];
  hostHooks?: Record<string, HostHook>;
}

export function createMemoCaptureInvokeRuntime(
  db: Database,
  config: ApiConfig,
  options: MemoCaptureInvokeRuntimeOptions = {}
): SharedTargetAppRuntimeService {
  const repositories = new MemoCaptureRuntimeRepositories(db, config);
  return new SharedTargetAppRuntimeService({
    repositories: {
      tasks: repositories,
      hooks: repositories,
      taskRuns: repositories
    },
    adapters: options.adapters ?? buildMemoCaptureProviderAdapters(config),
    hostHooks: options.hostHooks ?? createMemoCaptureHostHooks(),
    secrets: createMemoCaptureSecretResolver(config),
    runtime: {
      resolveRuntime: () => ({
        availableRuntimeKeys: runtimeKeysForConfig(config),
        commitSha: config.invokeProviders.commitSha
      })
    },
    registryProfileSelection: {
      settings: new MemoCaptureProviderProfileSettingsRepository(db),
      registryBaseUrl: config.invokeProviders.registryUrl,
      env: {
        INVOKE_PROVIDERS_REGISTRY_URL: config.invokeProviders.registryUrl,
        INVOKE_PROVIDERS_PROFILE: config.invokeProviders.profile
      }
    },
    services: {
      createId: randomUUID
    }
  });
}

export const createTargetAppRuntimeService = createMemoCaptureInvokeRuntime;
