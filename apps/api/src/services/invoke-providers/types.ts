import type {
  ProcessingHook,
  PromptConfig,
  ProviderCapabilityKey,
  ProviderConfig,
  ReadinessReason,
  TaskDefinition,
  TaskReadiness,
  TaskRun,
  TaskRunErrorClass,
  TaskRunStatus
} from "@invoke-providers/core";
import type { RegistryProfile } from "@invoke-providers/client";

export type SharedProviderCapabilityKey = ProviderCapabilityKey;
export type { TaskRunErrorClass, TaskRunStatus };
export type SharedProviderConfig = ProviderConfig;
export type SharedRegistryProfile = RegistryProfile;
export type SharedProcessingHook = ProcessingHook;
export type SharedPromptConfig = PromptConfig;
export type SharedTaskDefinition = TaskDefinition;
export type SharedReadinessReason = ReadinessReason;
export type SharedTaskReadiness = TaskReadiness;
export type SharedTaskRun = TaskRun;
