import type { ApiConfig } from "../../config.js";

export function isSecretAvailable(secretRef: string | undefined, config: ApiConfig): boolean {
  if (secretRef === undefined || secretRef.trim() === "") {
    return true;
  }
  if (secretRef === "OPENAI_COMPATIBLE_API_KEY" || secretRef === "OPENAI_API_KEY") {
    return config.llm.openAiCompatibleApiKey.trim() !== "";
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
