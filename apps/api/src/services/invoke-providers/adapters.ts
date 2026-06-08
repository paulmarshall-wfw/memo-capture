import type { ApiConfig } from "../../config.js";
import type { SharedProviderConfig } from "./types.js";

export interface AdapterCatalogEntry {
  adapterKey: string;
  configured: boolean;
  reason: string | null;
}

export function listConfiguredAdapters(
  providers: SharedProviderConfig[],
  config: ApiConfig
): AdapterCatalogEntry[] {
  const adapterKeys = [...new Set(providers.map((provider) => provider.adapterKey))].sort();
  return adapterKeys.map((adapterKey) => diagnoseAdapterRegistration(adapterKey, config));
}

export function diagnoseAdapterRegistration(adapterKey: string, config: ApiConfig): AdapterCatalogEntry {
  if (adapterKey === "deterministic-llm" || adapterKey === "local-dev") {
    return { adapterKey, configured: true, reason: null };
  }
  if (adapterKey === "openai-compatible-cloud" || adapterKey === "openai-compatible-local" || adapterKey === "openai-compatible") {
    return {
      adapterKey,
      configured: config.llm.provider === "openai-compatible",
      reason:
        config.llm.provider === "openai-compatible"
          ? null
          : "OpenAI-compatible LLM runtime is not selected for this API process."
    };
  }
  if (adapterKey === "whisper-cpp") {
    return {
      adapterKey,
      configured: config.transcription.provider === "whisper-cpp" && config.whisperCpp.modelPath.trim() !== "",
      reason:
        config.transcription.provider !== "whisper-cpp"
          ? "Whisper.cpp transcription runtime is not selected."
          : config.whisperCpp.modelPath.trim() === ""
            ? "WHISPER_CPP_MODEL_PATH is not configured."
            : null
    };
  }
  if (adapterKey === "apple-vision-ocr" || adapterKey === "paddleocr-local") {
    return {
      adapterKey,
      configured: false,
      reason: "OCR adapter is catalog-visible but not implemented in Memo Capture yet."
    };
  }
  return { adapterKey, configured: false, reason: "Adapter is not registered in Memo Capture." };
}
