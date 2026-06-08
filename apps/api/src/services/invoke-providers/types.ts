export type SharedProviderCapabilityKey =
  | "llm.generateText"
  | "llm.generateJson"
  | "stt.transcribe"
  | "tts.synthesize"
  | "ocr.extractText"
  | "module.runDeterministic";

export type TaskRunStatus = "succeeded" | "failed" | "skipped";

export type TaskRunErrorClass =
  | "disabled"
  | "missing_provider"
  | "disabled_provider"
  | "missing_secret"
  | "runtime_mismatch"
  | "unimplemented_hook"
  | "incompatible_capability"
  | "adapter_failure"
  | "output_validation_failed"
  | "hook_failure"
  | "missing_adapter";

export interface SharedProviderConfig {
  providerKind: "llm" | "stt" | "tts" | "ocr" | "module";
  providerKey: string;
  adapterKey: string;
  displayName: string;
  enabled: boolean;
  baseUrl?: string;
  model?: string;
  externalSend: boolean;
  requiredSecretRef?: string;
  capabilities: Array<{
    key: SharedProviderCapabilityKey;
    displayName: string;
  }>;
  health?: {
    status: "unknown" | "healthy" | "degraded" | "unhealthy";
    checkedAt?: string;
    detail?: string;
  };
}

export interface SharedProcessingHook {
  hookKey: string;
  displayName: string;
  implementationStatus: "implemented" | "unimplemented";
  usageCount: number;
}

export interface SharedPromptConfig {
  systemInstructions?: string;
  userInstructions?: string;
  structuredOutputSchema?: unknown;
  contextSelectors?: string[];
  promptVersion?: string;
  promptSnapshotId?: string;
}

export interface SharedTaskDefinition {
  taskKey: string;
  displayName: string;
  hookKey: string;
  renderSlot: string;
  displayOrder: number;
  selectedProviderKey?: string;
  requiredCapability?: SharedProviderCapabilityKey;
  modelOverride?: string;
  prompt?: SharedPromptConfig;
  enabled: boolean;
  requiredRuntimeKeys?: string[];
}

export interface SharedReadinessReason {
  code: TaskRunErrorClass;
  message: string;
}

export interface SharedTaskReadiness {
  taskKey: string;
  ready: boolean;
  reasons: SharedReadinessReason[];
}

export interface SharedTaskRun {
  taskRunId: string;
  taskKey: string;
  hookKey: string;
  providerKey?: string;
  adapterKey?: string;
  model?: string;
  promptVersion?: string;
  promptSnapshotId?: string;
  readinessReasons?: SharedReadinessReason[];
  inputSnapshot: unknown;
  outputValidation?: unknown;
  latencyMs?: number;
  usage?: unknown;
  status: TaskRunStatus;
  errorClass?: TaskRunErrorClass;
  errorMessage?: string;
  correlationId?: string;
  commitSha?: string;
  createdAt: string;
}
