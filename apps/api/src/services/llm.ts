import type { LlmProviderConfig } from "../config.js";
import { HttpError } from "./errors.js";

export interface WorkItemExpansionContext {
  prompt: {
    name: string;
    version: number;
    body: string;
  };
  project: {
    id: string | null;
    name: string | null;
    context: string | null;
  };
  workItem: {
    id: string;
    title: string;
    body: string;
    contributorText: string | null;
  };
  sourceMemo: {
    id: string;
    sourceType: string | null;
    transcriptText: string | null;
  } | null;
}

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
    throw new HttpError(409, "llm_provider_disabled", "LLM provider is disabled.");
  }

  if (providerName !== "local-dev" || config.provider !== "local-dev") {
    throw new HttpError(
      409,
      "llm_provider_unavailable",
      "Configured LLM provider is not available in this runtime."
    );
  }

  return new LocalDevLlmProvider(modelName || config.modelName);
}

class LocalDevLlmProvider implements LlmProvider {
  constructor(private readonly modelName: string) {}

  async generateWorkItemExpansion(context: WorkItemExpansionContext): Promise<LlmStructuredOutput> {
    const startedAt = Date.now();
    const title = context.workItem.title.trim();
    const projectPrefix = context.project.name === null ? "Memo" : context.project.name;
    const expanded = {
      expanded_work_item: {
        title: title.endsWith("expanded") ? title : `${title} expanded`,
        body: [
          context.workItem.body.trim(),
          "",
          `Expansion focus: clarify the user value, evidence, edge cases, and next review questions for ${projectPrefix}.`
        ]
          .filter((part) => part !== "")
          .join("\n"),
        tags: ["ai-expanded", normalizeTag(projectPrefix)],
        feature_group: null
      },
      related_suggestions: [
        {
          title: `${title} acceptance criteria`,
          body: `Define acceptance criteria, failure modes, and owner review notes for: ${context.workItem.body.trim()}`,
          tags: ["acceptance-criteria", "ai-suggestion"],
          feature_group: null,
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
