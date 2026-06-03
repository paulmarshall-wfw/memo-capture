import type { LlmProviderConfig } from "../config.js";
import { HttpError } from "./errors.js";

export interface WorkItemExpansionContext {
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
  includeProjectSynopsis: boolean;
  includeMemoMetadata: boolean;
  includeMemoTranscriptText: boolean;
}

export const DEFAULT_PROMPT_CONTEXT_CONFIG: PromptContextConfig = {
  freeformText: "",
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

export interface LlmProvider {
  generateWorkItemExpansion(context: WorkItemExpansionContext): Promise<LlmStructuredOutput>;
}

export function createLlmProvider(config: LlmProviderConfig, providerName: string, modelName: string): LlmProvider {
  if (config.provider === "disabled") {
    throw new HttpError(
      409,
      "llm_provider_disabled",
      "LLM provider is enabled in Settings, but this API runtime is disabled. Restart the API with LLM_PROVIDER=local-dev."
    );
  }

  if (providerName !== "local-dev" || config.provider !== "local-dev") {
    throw new HttpError(
      409,
      "llm_provider_unavailable",
      `Configured LLM provider ${providerName} is not available in this runtime. Runtime provider is ${config.provider}.`
    );
  }

  return new LocalDevLlmProvider(modelName || config.modelName);
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
    const composedPrompt = buildWorkItemExpansionPrompt(context);
    const title = context.workItem.title.trim();
    const projectPrefix = context.project.name === null ? "Memo" : context.project.name;
    const expanded = {
      expanded_work_item: {
        title: title.endsWith("expanded") ? title : `${title} expanded`,
        body: [
          context.workItem.body.trim(),
          "",
          composedPrompt === "" ? "" : `Prompt focus: ${composedPrompt.slice(0, 180)}`,
          `Expansion focus: clarify the user value, evidence, edge cases, and next review questions for ${projectPrefix}.`
        ]
          .filter((part) => part !== "")
          .join("\n"),
        tags: ["ai-expanded", normalizeTag(projectPrefix)]
      },
      related_suggestions: [
        {
          title: `${title} acceptance criteria`,
          body: `Define acceptance criteria, failure modes, and owner review notes for: ${context.workItem.body.trim()}`,
          tags: ["acceptance-criteria", "ai-suggestion"],
          rationale: "Acceptance criteria make the captured idea easier to review and export."
        }
      ]
    };
    return {
      rawText: JSON.stringify(expanded),
      parsed: expanded,
      providerName: "local-dev",
      modelName: this.modelName,
      latencyMs: Date.now() - startedAt
    };
  }
}

function normalizeTag(value: string): string {
  const tag = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return tag === "" ? "memo" : tag;
}
