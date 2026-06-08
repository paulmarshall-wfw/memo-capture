import type { ApiConfig } from "../../config.js";

export function isSecretAvailable(secretRef: string | undefined, config: ApiConfig): boolean {
  if (secretRef === undefined || secretRef.trim() === "") {
    return true;
  }
  if (secretRef === "OPENAI_COMPATIBLE_API_KEY" || secretRef === "OPENAI_API_KEY") {
    return config.llm.openAiCompatibleApiKey.trim() !== "";
  }
  if (secretRef === "WHISPER_CPP_MODEL_PATH") {
    return config.whisperCpp.modelPath.trim() !== "";
  }
  return process.env[secretRef]?.trim() !== "";
}
