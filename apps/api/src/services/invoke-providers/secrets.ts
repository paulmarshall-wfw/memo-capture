import type { ApiConfig } from "../../config.js";

export interface SecretAvailabilityContext {
  adapterKey?: string | null;
  endpoint?: string | null;
  providerKey?: string | null;
}

export function isSecretAvailable(
  secretRef: string | undefined,
  config: ApiConfig,
  context: SecretAvailabilityContext = {}
): boolean {
  if (secretRef === undefined || secretRef.trim() === "") {
    return true;
  }
  if (secretRef === "OPENAI_COMPATIBLE_API_KEY" || secretRef === "OPENAI_API_KEY") {
    return (
      config.llm.openAiCompatibleApiKey.trim() !== "" ||
      (process.env.LOCAL_OPENAI_COMPATIBLE_API_KEY ?? "").trim() !== "" ||
      isLocalOpenAiCompatibleContext(config, context)
    );
  }
  if (secretRef === "LOCAL_OPENAI_COMPATIBLE_API_KEY") {
    return true;
  }
  if (secretRef === "INVOKE_PROVIDERS_CODEX_CLI_BINARY") {
    return (
      (process.env.INVOKE_PROVIDERS_CODEX_CLI_BINARY ?? "").trim() !== "" ||
      (process.env.CODEX_CLI_EXECUTABLE ?? "").trim() !== ""
    );
  }
  if (secretRef === "WHISPER_CPP_MODEL_PATH") {
    return config.whisperCpp.modelPath.trim() !== "";
  }
  return process.env[secretRef]?.trim() !== "";
}

function isLocalOpenAiCompatibleContext(config: ApiConfig, context: SecretAvailabilityContext): boolean {
  if (isLocalOpenAiCompatibleKey(context.adapterKey) || isLocalOpenAiCompatibleKey(context.providerKey)) {
    return true;
  }
  return isLocalEndpoint(context.endpoint) || isLocalEndpoint(config.llm.endpoint);
}

function isLocalOpenAiCompatibleKey(value: string | null | undefined): boolean {
  return value === "openai-compatible-local";
}

function isLocalEndpoint(endpoint: string | null | undefined): boolean {
  if (endpoint === null || endpoint === undefined || endpoint.trim() === "") {
    return false;
  }
  try {
    const url = new URL(endpoint);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  } catch {
    return false;
  }
}
