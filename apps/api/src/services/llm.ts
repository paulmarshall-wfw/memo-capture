import type { LlmProviderConfig, LlmProviderMode } from "../config.js";
import { HttpError } from "./errors.js";

export interface WorkItemExpansionContext {
  hookKey: string;
  prompt: {
    name: string;
    version: number;
    body: string;
    contextConfig: PromptContextConfig;
  };
  project: {
    id: string | null;
    name: string | null;
    description: string | null;
  };
  workItem: {
    id: string;
    title: string;
    body: string;
    tags: string[];
    contributorText: string | null;
  };
  sourceMemo: {
    id: string;
    sourceType: string | null;
    transcriptText: string | null;
  } | null;
}

export interface PromptContextConfig {
  freeformText: string;
  systemMessage: string;
  includeProjectSynopsis: boolean;
  includeMemoMetadata: boolean;
  includeMemoTranscriptText: boolean;
}

export const MEMO_EXPANSION_HOOK_KEY = "memo-expansion";
export const SUGGEST_NEW_MEMOS_HOOK_KEY = "suggest-new-memos";

export const DEFAULT_LLM_SYSTEM_MESSAGE =
  'Return only strict JSON matching this shape: { "expanded_work_item": { "title": "string", "body": "string", "tags": ["string"] } }. Do not include prose outside JSON.';

export const DEFAULT_LLM_SYSTEM_MESSAGES_BY_HOOK: Record<string, string> = {
  [MEMO_EXPANSION_HOOK_KEY]: DEFAULT_LLM_SYSTEM_MESSAGE,
  [SUGGEST_NEW_MEMOS_HOOK_KEY]:
    'Return only strict JSON matching this shape: { "suggested_work_items": [{ "title": "string", "body": "string", "tags": ["string"], "rationale": "string" }] }. Do not include prose outside JSON.'
};

export const DEFAULT_PROMPT_CONTEXT_CONFIG: PromptContextConfig = {
  freeformText: "",
  systemMessage: DEFAULT_LLM_SYSTEM_MESSAGE,
  includeProjectSynopsis: true,
  includeMemoMetadata: true,
  includeMemoTranscriptText: true
};

export interface LlmStructuredOutput {
  rawText: string;
  parsed: unknown;
  providerName: string;
  modelName: string;
  latencyMs: number;
}

interface JsonSchemaResponseFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
}

export interface LlmProvider {
  generateWorkItemExpansion(context: WorkItemExpansionContext): Promise<LlmStructuredOutput>;
}

export function createLlmProvider(
  config: LlmProviderConfig,
  providerName: string,
  modelName: string,
  runtimeProvider: LlmProviderMode = config.provider,
  endpoint = config.endpoint
): LlmProvider {
  if (runtimeProvider === "disabled") {
    throw new HttpError(
      409,
      "llm_provider_disabled",
      "LLM provider is enabled in Settings, but this API runtime is disabled. Select an AppLauncher AI runtime option and relaunch."
    );
  }

  if (providerName !== runtimeProvider) {
    throw new HttpError(
      409,
      "llm_provider_unavailable",
      `Configured LLM provider ${providerName} is not available in this runtime. Runtime provider is ${runtimeProvider}.`
    );
  }

  if (providerName === "local-dev") {
    return new LocalDevLlmProvider(modelName || config.modelName);
  }

  if (providerName === "openai-compatible") {
    return new OpenAiCompatibleLlmProvider({
      modelName: modelName || config.modelName,
      endpoint: endpoint || config.endpoint,
      apiKey: config.openAiCompatibleApiKey
    });
  }

  throw new HttpError(409, "llm_provider_unavailable", `Configured LLM provider ${providerName} is not supported.`);
}

export function normalizePromptContextConfig(value: unknown, fallbackFreeformText = ""): PromptContextConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...DEFAULT_PROMPT_CONTEXT_CONFIG,
      freeformText: fallbackFreeformText
    };
  }

  const record = value as Record<string, unknown>;
  return {
    freeformText:
      typeof record.freeformText === "string" ? record.freeformText : fallbackFreeformText,
    systemMessage:
      typeof record.systemMessage === "string" ? record.systemMessage : DEFAULT_PROMPT_CONTEXT_CONFIG.systemMessage,
    includeProjectSynopsis:
      typeof record.includeProjectSynopsis === "boolean"
        ? record.includeProjectSynopsis
        : DEFAULT_PROMPT_CONTEXT_CONFIG.includeProjectSynopsis,
    includeMemoMetadata:
      typeof record.includeMemoMetadata === "boolean"
        ? record.includeMemoMetadata
        : DEFAULT_PROMPT_CONTEXT_CONFIG.includeMemoMetadata,
    includeMemoTranscriptText:
      typeof record.includeMemoTranscriptText === "boolean"
        ? record.includeMemoTranscriptText
        : DEFAULT_PROMPT_CONTEXT_CONFIG.includeMemoTranscriptText
  };
}

export function buildWorkItemExpansionPrompt(context: WorkItemExpansionContext): string {
  const config = context.prompt.contextConfig;
  const parts = [config.freeformText.trim()].filter((part) => part !== "");

  if (config.includeProjectSynopsis && context.project.description !== null && context.project.description.trim() !== "") {
    parts.push(`Project synopsis:\n${context.project.description.trim()}`);
  }

  if (config.includeMemoMetadata) {
    parts.push(
      [
        "Memo metadata:",
        `- Title: ${context.workItem.title}`,
        `- Project: ${context.project.name ?? "Unassigned"}`,
        `- Tags: ${context.workItem.tags.length === 0 ? "None" : context.workItem.tags.join(", ")}`,
        `- Contributor: ${context.workItem.contributorText ?? "Unknown"}`,
        `- Source type: ${context.sourceMemo?.sourceType ?? "unknown"}`
      ].join("\n")
    );
  }

  if (config.includeMemoTranscriptText) {
    const memoText = [context.workItem.body.trim(), context.sourceMemo?.transcriptText?.trim() ?? ""]
      .filter((part) => part !== "")
      .join("\n\n");
    if (memoText !== "") {
      parts.push(`Memo text:\n${memoText}`);
    }
  }

  return parts.join("\n\n");
}

class LocalDevLlmProvider implements LlmProvider {
  constructor(private readonly modelName: string) {}

  async generateWorkItemExpansion(context: WorkItemExpansionContext): Promise<LlmStructuredOutput> {
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
      rawText: JSON.stringify(output),
      parsed: output,
      providerName: "local-dev",
      modelName: this.modelName,
      latencyMs: Date.now() - startedAt
    };
  }
}

class OpenAiCompatibleLlmProvider implements LlmProvider {
  constructor(
    private readonly options: {
      modelName: string;
      endpoint: string;
      apiKey: string;
    }
  ) {}

  async generateWorkItemExpansion(context: WorkItemExpansionContext): Promise<LlmStructuredOutput> {
    const endpoint = this.options.endpoint.trim();
    if (endpoint === "") {
      throw new HttpError(409, "llm_endpoint_missing", "OpenAI-compatible LLM endpoint is not configured.");
    }
    if (this.options.apiKey.trim() === "") {
      throw new HttpError(409, "llm_secret_missing", "OpenAI-compatible LLM API key is not configured.");
    }

    const startedAt = Date.now();
    const prompt = buildWorkItemExpansionPrompt(context);
    const systemMessage = context.prompt.contextConfig.systemMessage.trim();
    const messages: Array<{ role: "system" | "user"; content: string }> = [
      ...(systemMessage === "" ? [] : [{ role: "system" as const, content: systemMessage }]),
      {
        role: "user",
        content: prompt
      }
    ];
    const url = endpoint.endsWith("/chat/completions") ? endpoint : `${endpoint.replace(/\/+$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.modelName,
        response_format: buildStructuredResponseFormat(context.hookKey),
        messages
      })
    });

    if (!response.ok) {
      throw new HttpError(502, "llm_provider_failed", `OpenAI-compatible provider returned HTTP ${response.status}.`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawText = body.choices?.[0]?.message?.content ?? "";
    if (rawText.trim() === "") {
      throw new HttpError(502, "llm_provider_empty_output", "OpenAI-compatible provider returned empty output.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new HttpError(502, "llm_provider_invalid_json", "OpenAI-compatible provider returned non-JSON output.");
    }

    return {
      rawText,
      parsed,
      providerName: "openai-compatible",
      modelName: this.options.modelName,
      latencyMs: Date.now() - startedAt
    };
  }
}

function buildStructuredResponseFormat(hookKey: string): JsonSchemaResponseFormat {
  if (hookKey === SUGGEST_NEW_MEMOS_HOOK_KEY) {
    return {
      type: "json_schema",
      json_schema: {
        name: "memo_capture_suggested_work_items",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["suggested_work_items"],
          properties: {
            suggested_work_items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "body", "tags", "rationale"],
                properties: {
                  title: { type: "string" },
                  body: { type: "string" },
                  tags: {
                    type: "array",
                    items: { type: "string" }
                  },
                  rationale: { type: "string" }
                }
              }
            }
          }
        }
      }
    };
  }

  return {
    type: "json_schema",
    json_schema: {
      name: "memo_capture_expanded_work_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["expanded_work_item"],
        properties: {
          expanded_work_item: {
            type: "object",
            additionalProperties: false,
            required: ["title", "body", "tags"],
            properties: {
              title: { type: "string" },
              body: { type: "string" },
              tags: {
                type: "array",
                items: { type: "string" }
              }
            }
          }
        }
      }
    }
  };
}

function normalizeTag(value: string): string {
  const tag = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return tag === "" ? "memo" : tag;
}
