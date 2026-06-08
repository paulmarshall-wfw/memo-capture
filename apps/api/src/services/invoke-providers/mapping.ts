import type { ApiConfig } from "../../config.js";
import type {
  AiTaskRouteRow,
  ProcessingHookRow,
  ProviderCapabilityRow,
  ProviderConfigRow
} from "../../repositories/settings.js";
import { normalizePromptContextConfig } from "../llm.js";
import type {
  SharedProcessingHook,
  SharedProviderCapabilityKey,
  SharedProviderConfig,
  SharedTaskDefinition
} from "./types.js";

const CAPABILITY_DISPLAY_NAMES: Record<SharedProviderCapabilityKey, string> = {
  "llm.generateText": "Generate text",
  "llm.generateJson": "Generate structured JSON",
  "stt.transcribe": "Transcribe speech",
  "tts.synthesize": "Synthesize speech",
  "ocr.extractText": "Extract text with OCR",
  "module.runDeterministic": "Run deterministic module"
};

export function mapProviderConfigRow(
  provider: ProviderConfigRow,
  capabilities: ProviderCapabilityRow[]
): SharedProviderConfig {
  const providerKind = normalizeProviderKind(provider.provider_kind);
  const health: NonNullable<SharedProviderConfig["health"]> = {
    status: normalizeHealthStatus(provider.health_status)
  };
  if (provider.last_health_check_at !== null) {
    health.checkedAt = new Date(provider.last_health_check_at).toISOString();
  }
  const sharedProvider: SharedProviderConfig = {
    providerKind,
    providerKey: provider.provider_name,
    adapterKey: provider.adapter_key ?? provider.provider_name,
    displayName: provider.display_name ?? provider.provider_name,
    enabled: provider.enabled,
    externalSend: provider.external_send_enabled,
    capabilities: capabilities
      .filter((capability) => capability.provider_config_id === provider.id && capability.enabled)
      .map((capability) => normalizeCapabilityKey(capability.capability_key))
      .map((key) => ({ key, displayName: CAPABILITY_DISPLAY_NAMES[key] })),
    health
  };
  if (provider.endpoint !== null) {
    sharedProvider.baseUrl = provider.endpoint;
  }
  if (provider.model_name !== null) {
    sharedProvider.model = provider.model_name;
  }
  if (provider.required_secret_env !== null) {
    sharedProvider.requiredSecretRef = provider.required_secret_env;
  }
  return sharedProvider;
}

export function mapTaskRouteRow(task: AiTaskRouteRow): SharedTaskDefinition {
  const promptContext = normalizePromptContextConfig(task.active_context_config, task.active_body ?? "");
  const sharedTask: SharedTaskDefinition = {
    taskKey: task.task_key,
    displayName: task.display_name,
    hookKey: task.hook_key,
    renderSlot: task.render_location,
    displayOrder: task.display_order,
    enabled: task.route_enabled,
    requiredRuntimeKeys: [task.runtime_option_id]
  };
  const selectedProviderKey = task.provider_key ?? task.provider_name;
  if (selectedProviderKey !== null) {
    sharedTask.selectedProviderKey = selectedProviderKey;
  }
  if (task.task_kind_capability_key !== null) {
    sharedTask.requiredCapability = normalizeCapabilityKey(task.task_kind_capability_key);
  }
  const modelOverride = task.provider_model_override ?? task.route_model_name;
  if (modelOverride !== null) {
    sharedTask.modelOverride = modelOverride;
  }
  if (task.prompt_definition_id !== null) {
    const prompt: NonNullable<SharedTaskDefinition["prompt"]> = {
      systemInstructions: promptContext.systemMessage,
    };
    if (task.active_body !== null) {
      prompt.userInstructions = task.active_body;
    }
    if (task.active_output_schema !== null) {
      prompt.structuredOutputSchema = task.active_output_schema;
    }
    if (task.prompt_active_version !== null) {
      prompt.promptVersion = String(task.prompt_active_version);
    }
    if (task.active_prompt_version_id !== null) {
      prompt.promptSnapshotId = task.active_prompt_version_id;
    }
    sharedTask.prompt = prompt;
  }
  return sharedTask;
}

export function mapProcessingHookRow(
  hook: ProcessingHookRow,
  isImplemented: (hookKey: string) => boolean
): SharedProcessingHook {
  return {
    hookKey: hook.hook_key,
    displayName: humanizeKey(hook.hook_key),
    implementationStatus: isImplemented(hook.hook_key) ? "implemented" : "unimplemented",
    usageCount: Number(hook.task_usage_count)
  };
}

export function runtimeKeysForConfig(config: ApiConfig): string[] {
  const keys = ["registry"];
  if (config.llm.provider !== "disabled") {
    keys.push("llm");
  }
  if (config.transcription.provider !== "disabled") {
    keys.push("transcription", "stt");
  }
  return keys;
}

export function normalizeCapabilityKey(value: string): SharedProviderCapabilityKey {
  if (value === "structured-generation") {
    return "llm.generateJson";
  }
  if (value === "text-generation") {
    return "llm.generateText";
  }
  if (value === "transcription") {
    return "stt.transcribe";
  }
  if (value === "text-to-speech") {
    return "tts.synthesize";
  }
  if (value === "ocr") {
    return "ocr.extractText";
  }
  if (value === "script") {
    return "module.runDeterministic";
  }
  if (isSharedCapabilityKey(value)) {
    return value;
  }
  return "module.runDeterministic";
}

function isSharedCapabilityKey(value: string): value is SharedProviderCapabilityKey {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_DISPLAY_NAMES, value);
}

function normalizeProviderKind(value: string): SharedProviderConfig["providerKind"] {
  if (value === "transcription") {
    return "stt";
  }
  if (value === "llm" || value === "stt" || value === "tts" || value === "ocr" || value === "module") {
    return value;
  }
  return "module";
}

function normalizeHealthStatus(value: string): "unknown" | "healthy" | "degraded" | "unhealthy" {
  if (value === "healthy" || value === "degraded" || value === "unhealthy" || value === "unknown") {
    return value;
  }
  return "unknown";
}

function humanizeKey(value: string): string {
  return value
    .split("-")
    .filter((part) => part.trim() !== "")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}
