import {
  CodexCliAdapter,
  DeterministicOcrAdapter,
  DeterministicSttAdapter,
  DeterministicTtsAdapter,
  OpenAiCompatibleTextAdapter,
  WhisperCppAdapter
} from "@invoke-providers/adapters";
import type { ProviderAdapter, ProviderInvocationRequest, ProviderInvocationResult } from "@invoke-providers/core";
import type { ApiConfig } from "../../config.js";
import type { SharedProviderConfig } from "./types.js";
import { isSecretAvailable, resolveSecretValue } from "./secrets.js";
import {
  MEMO_EXPANSION_HOOK_KEY,
  SUGGEST_NEW_MEMOS_HOOK_KEY,
  buildWorkItemExpansionPrompt,
  type WorkItemExpansionContext
} from "../llm.js";

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
  return adapterKeys.map((adapterKey) => diagnoseAdapterRegistration(adapterKey, config, providers));
}

export function diagnoseAdapterRegistration(
  adapterKey: string,
  config: ApiConfig,
  providers: SharedProviderConfig[] = []
): AdapterCatalogEntry {
  if (adapterKey === "deterministic-llm" || adapterKey === "local-dev") {
    return { adapterKey, configured: true, reason: null };
  }
  if (adapterKey === "openai-compatible-cloud" || adapterKey === "openai-compatible-local" || adapterKey === "openai-compatible") {
    const matchingProviders = providers.filter((provider) => provider.adapterKey === adapterKey);
    const endpointConfigured = matchingProviders.some((provider) => provider.baseUrl?.trim());
    const requiredSecretsReady = matchingProviders.every((provider) =>
      isSecretAvailable(provider.requiredSecretRef, config, {
        adapterKey: provider.adapterKey,
        endpoint: provider.baseUrl ?? null,
        providerKey: provider.providerKey
      })
    );
    return {
      adapterKey,
      configured: endpointConfigured && requiredSecretsReady,
      reason: !endpointConfigured
        ? "OpenAI-compatible provider endpoint is not configured."
        : !requiredSecretsReady
          ? "OpenAI-compatible provider secret is not configured."
          : null
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
  if (adapterKey === "codex-cli") {
    return {
      adapterKey,
      configured: isSecretAvailable("INVOKE_PROVIDERS_CODEX_CLI_BINARY", config),
      reason: isSecretAvailable("INVOKE_PROVIDERS_CODEX_CLI_BINARY", config)
        ? null
        : "Codex CLI binary is not configured for this API process."
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

export function buildMemoCaptureProviderAdapters(config: ApiConfig): ProviderAdapter[] {
  return [
    new MemoCaptureLocalDevAdapter("local-dev"),
    new MemoCaptureLocalDevAdapter("deterministic-local-dev"),
    new MemoCaptureLocalDevAdapter("deterministic-llm"),
    memoPromptAdapter(new OpenAiCompatibleTextAdapter({
      adapterKey: "openai-compatible",
      apiKey: resolveSecretValue("OPENAI_COMPATIBLE_API_KEY", config)
    })),
    memoPromptAdapter(new OpenAiCompatibleTextAdapter({
      adapterKey: "openai-compatible-local",
      apiKey: resolveSecretValue("LOCAL_OPENAI_COMPATIBLE_API_KEY", config)
    })),
    memoPromptAdapter(new OpenAiCompatibleTextAdapter({
      adapterKey: "openai-compatible-cloud",
      apiKey: resolveSecretValue("OPENAI_COMPATIBLE_API_KEY", config)
    })),
    memoPromptAdapter(new CodexCliAdapter({
      binaryPath: resolveSecretValue("INVOKE_PROVIDERS_CODEX_CLI_BINARY", config),
      ...optionalProperty("model", process.env.CODEX_CLI_MODEL?.trim()),
      ...optionalProperty("profile", process.env.CODEX_CLI_PROFILE?.trim()),
      ...optionalProperty("extraArgs", parseExtraArgs(process.env.CODEX_CLI_EXTRA_ARGS))
    })),
    new WhisperCppAdapter({
      binaryPath: config.whisperCpp.binaryPath,
      modelPath: config.whisperCpp.modelPath,
      ffmpegPath: config.whisperCpp.ffmpegPath,
      language: config.whisperCpp.language,
      threads: config.whisperCpp.threads,
      timeoutMs: config.whisperCpp.timeoutMs
    }),
    new DeterministicSttAdapter(),
    new DeterministicOcrAdapter(),
    new DeterministicTtsAdapter()
  ];
}

class MemoCaptureLocalDevAdapter implements ProviderAdapter {
  constructor(readonly adapterKey: string) {}

  async invoke(request: ProviderInvocationRequest): Promise<ProviderInvocationResult> {
    const context = readMemoCaptureContext(request);
    const startedAt = Date.now();
    const title = context.workItem.title.trim();
    const projectPrefix = context.project.name === null ? "Memo" : context.project.name;
    const output =
      context.hookKey === SUGGEST_NEW_MEMOS_HOOK_KEY
        ? {
            suggested_work_items: [
              {
                title: `${title} acceptance criteria`,
                body: `Define acceptance criteria, failure modes, and owner review notes for: ${context.workItem.body.trim()}`,
                tags: ["acceptance-criteria", "ai-suggestion"],
                rationale: "Acceptance criteria make the captured idea easier to review and export."
              }
            ]
          }
        : {
            expanded_work_item: {
              title: title.endsWith("expanded") ? title : `${title} expanded`,
              body: [
                context.workItem.body.trim(),
                "",
                `Expansion focus: clarify the user value, evidence, edge cases, and next review questions for ${projectPrefix}.`
              ]
                .filter((part) => part !== "")
                .join("\n"),
              tags: ["ai-expanded", normalizeTag(projectPrefix)]
            }
          };
    return {
      output,
      rawOutput: JSON.stringify(output),
      latencyMs: Date.now() - startedAt
    };
  }
}

function memoPromptAdapter(adapter: ProviderAdapter): ProviderAdapter {
  return {
    adapterKey: adapter.adapterKey,
    async invoke(request) {
      const context = readOptionalMemoCaptureContext(request);
      if (context === null) {
        return await adapter.invoke(request);
      }
      return await adapter.invoke({
        ...request,
        prompt: {
          ...request.prompt,
          systemInstructions: context.prompt.contextConfig.systemMessage,
          userInstructions: buildWorkItemExpansionPrompt(context)
        },
        hostContext: {
          ...request.hostContext,
          input: {
            workItemId: context.workItem.id,
            sourceMemoId: context.sourceMemo?.id ?? null
          }
        }
      });
    }
  };
}

function readMemoCaptureContext(request: ProviderInvocationRequest): WorkItemExpansionContext {
  const context = readOptionalMemoCaptureContext(request);
  if (context === null) {
    throw Object.assign(new Error("Memo Capture task input is missing work-item context."), {
      errorClass: "adapter_failure"
    });
  }
  return context;
}

function readOptionalMemoCaptureContext(request: ProviderInvocationRequest): WorkItemExpansionContext | null {
  const input = request.hostContext.input;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const context = (input as Record<string, unknown>).memoCaptureContext;
  return isWorkItemExpansionContext(context) ? context : null;
}

function isWorkItemExpansionContext(value: unknown): value is WorkItemExpansionContext {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { hookKey?: unknown }).hookKey === "string" &&
    ((value as { hookKey: string }).hookKey === MEMO_EXPANSION_HOOK_KEY ||
      (value as { hookKey: string }).hookKey === SUGGEST_NEW_MEMOS_HOOK_KEY)
  );
}

function parseExtraArgs(value: string | undefined): string[] | undefined {
  const args = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  return args.length === 0 ? undefined : args;
}

function optionalProperty<Key extends string, Value>(
  key: Key,
  value: Value | undefined
): Value extends undefined ? Record<string, never> : { [Property in Key]: Value } {
  return (value === undefined || value === "" ? {} : { [key]: value }) as Value extends undefined
    ? Record<string, never>
    : { [Property in Key]: Value };
}

function normalizeTag(value: string): string {
  const tag = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return tag === "" ? "memo" : tag;
}
