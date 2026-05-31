import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { AiSuggestionRepository, type AiSuggestionRecord } from "../repositories/ai-suggestions.js";
import { AuditRepository } from "../repositories/audit.js";
import { FeatureGroupRepository, ProjectRepository } from "../repositories/catalog.js";
import { ProcessingJobRepository } from "../repositories/jobs.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { SettingsRepository } from "../repositories/settings.js";
import { SourceMemoRepository } from "../repositories/source-memos.js";
import { WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import { HttpError } from "./errors.js";
import {
  createLlmProvider,
  normalizePromptContextConfig,
  type LlmStructuredOutput,
  type WorkItemExpansionContext
} from "./llm.js";

export class AiExpansionService {
  constructor(
    private readonly db: Database,
    private readonly config: ApiConfig
  ) {}

  async listSuggestions(workItemId: string): Promise<{ suggestions: AiSuggestionRecord[] }> {
    const workItem = await new WorkItemRepository(this.db).findById(workItemId);
    if (workItem === null) {
      throw new HttpError(404, "not_found", "work_item was not found.");
    }
    return { suggestions: await new AiSuggestionRepository(this.db).listForWorkItem(workItemId) };
  }

  async expandWorkItem(
    workItemId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{
    expandedWorkItem: ValidExpandedWorkItem;
    suggestions: AiSuggestionRecord[];
    providerName: string;
    modelName: string;
    validation: Record<string, unknown>;
  }> {
    const settings = new SettingsRepository(this.db);
    const [prompt, providerConfig, workItem, sourceMemo, projects, featureGroups] = await Promise.all([
      settings.getActivePrompt("work_item_expansion"),
      settings.findEnabledProvider("llm"),
      new WorkItemRepository(this.db).findById(workItemId),
      this.findSourceMemoForWorkItem(workItemId),
      new ProjectRepository(this.db).list(),
      new FeatureGroupRepository(this.db).list()
    ]);
    if (workItem === null) {
      throw new HttpError(404, "not_found", "work_item was not found.");
    }
    if (prompt === null || prompt.active_prompt_version_id === null || prompt.active_body === null) {
      throw new HttpError(409, "ai_prompt_missing", "Active AI expansion prompt is missing.");
    }
    const promptVersionId = prompt.active_prompt_version_id;
    const promptBody = prompt.active_body;
    if (providerConfig === null) {
      throw new HttpError(409, "llm_provider_not_enabled", "No LLM provider is enabled.");
    }

    const project = projects.find((candidate) => candidate.id === workItem.projectId) ?? null;
    const featureGroup = featureGroups.find((candidate) => candidate.id === workItem.featureGroupId) ?? null;
    const context: WorkItemExpansionContext = {
      prompt: {
        name: prompt.name,
        version: prompt.active_version,
        body: promptBody,
        contextConfig: normalizePromptContextConfig(prompt.active_context_config, promptBody)
      },
      project: {
        id: project?.id ?? null,
        name: project?.name ?? null,
        description: project?.description ?? null,
        context: project?.context ?? null
      },
      featureGroup: {
        id: featureGroup?.id ?? null,
        name: featureGroup?.name ?? null
      },
      workItem: {
        id: workItem.id,
        title: workItem.title,
        body: workItem.body,
        contributorText: workItem.contributorText
      },
      sourceMemo
    };
    const modelName = providerConfig.model_name ?? this.config.llm.modelName;
    const provider = createLlmProvider(this.config.llm, providerConfig.provider_name, modelName);
    const job = await new ProcessingJobRepository(this.db).create({
      jobKind: "expand_work_item",
      status: "running",
      workItemId: workItem.id,
      sourceMemoId: workItem.sourceMemoId,
      maxAttempts: 1,
      initiatedBy: actor.id
    });

    await new AuditRepository(this.db).record({
      eventName: "ai_expansion.requested",
      actor,
      subjectType: "work_item",
      subjectId: workItem.id,
      requestId,
      jobId: job.id,
      sourceMemoId: workItem.sourceMemoId,
      workItemId: workItem.id,
      metadata: {
        promptName: prompt.name,
        promptVersion: prompt.active_version,
        providerName: providerConfig.provider_name,
        modelName
      }
    });

    let output: LlmStructuredOutput;
    try {
      output = await provider.generateWorkItemExpansion(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI expansion failed.";
      await new ProcessingJobRepository(this.db).markFailed({
        jobId: job.id,
        errorCode: "ai_provider_failed",
        userSafeErrorMessage: "AI expansion failed before returning valid output.",
        internalErrorDetail: message,
        retryable: false,
        providerName: providerConfig.provider_name,
        modelName,
        latencyMs: null
      });
      throw error;
    }
    const validation = validateExpansionOutput(output.parsed);
    if (!validation.ok) {
      await new ProcessingJobRepository(this.db).markFailed({
        jobId: job.id,
        errorCode: "invalid_ai_output",
        userSafeErrorMessage: "AI expansion returned invalid structured JSON.",
        internalErrorDetail: validation.errors.join("; "),
        retryable: false,
        providerName: output.providerName,
        modelName: output.modelName,
        latencyMs: output.latencyMs
      });
      await new AuditRepository(this.db).record({
        eventName: "ai_expansion.validation_failed",
        actor,
        subjectType: "work_item",
        subjectId: workItem.id,
        requestId,
        jobId: job.id,
        sourceMemoId: workItem.sourceMemoId,
        workItemId: workItem.id,
        metadata: {
          errors: validation.errors,
          providerName: output.providerName,
          modelName: output.modelName
        },
        redactionApplied: true
      });
      throw new HttpError(502, "invalid_ai_output", "AI expansion returned invalid structured JSON.", {
        errors: validation.errors
      });
    }

    return this.db.transaction(async (client) => {
      const suggestions = new AiSuggestionRepository(client);
      const audit = new AuditRepository(client);
      const created: AiSuggestionRecord[] = [];
      for (const suggestion of validation.value.relatedSuggestions) {
        const record = await suggestions.create({
          parentWorkItemId: workItem.id,
          title: suggestion.title,
          body: suggestion.body,
          tags: suggestion.tags,
          featureGroup: suggestion.featureGroup,
          rationale: suggestion.rationale,
          promptVersionId,
          providerName: output.providerName,
          modelName: output.modelName,
          validationResult: {
            ok: true,
            promptVersion: prompt.active_version,
            strictJson: true
          },
          actorUserId: actor.id
        });
        created.push(record);
        await audit.record({
          eventName: "ai_suggestion.created",
          actor,
          subjectType: "ai_suggestion",
          subjectId: record.id,
          requestId,
          jobId: job.id,
          sourceMemoId: workItem.sourceMemoId,
          workItemId: workItem.id,
          metadata: {
            parentWorkItemId: workItem.id,
            promptVersion: prompt.active_version,
            providerName: output.providerName,
            modelName: output.modelName
          }
        });
      }
      await new ProcessingJobRepository(client).markSucceeded(job.id);
      return {
        expandedWorkItem: validation.value.expandedWorkItem,
        suggestions: created,
        providerName: output.providerName,
        modelName: output.modelName,
        validation: { ok: true, strictJson: true }
      };
    });
  }

  async acceptSuggestion(
    suggestionId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ suggestion: AiSuggestionRecord; workItem: WorkItemRecord }> {
    return this.db.transaction(async (client) => {
      const suggestions = new AiSuggestionRepository(client);
      const suggestion = await suggestions.findById(suggestionId);
      if (suggestion === null) {
        throw new HttpError(404, "not_found", "ai_suggestion was not found.");
      }
      if (suggestion.status !== "pending") {
        throw new HttpError(409, "ai_suggestion_not_pending", "Only pending AI suggestions can be accepted.");
      }
      const parent = await new WorkItemRepository(client).findById(suggestion.parentWorkItemId);
      if (parent === null) {
        throw new HttpError(404, "not_found", "parent work_item was not found.");
      }
      const sourceMemo = await new SourceMemoRepository(client).create({
        sourceType: "ai_generated",
        originalText: suggestion.body,
        extractedText: suggestion.body,
        contributorText: "AI suggestion",
        createdBy: actor.id
      });
      const workItem = await new WorkItemRepository(client).create({
        sourceMemoId: sourceMemo.id,
        projectId: parent.projectId,
        featureGroupId: parent.featureGroupId,
        contributorText: "AI suggestion",
        contributorId: null,
        title: suggestion.title,
        body: suggestion.body,
        bodyFormat: "markdown",
        workflowState: "memo",
        actorUserId: actor.id
      });
      const applied = await suggestions.markApplied({
        suggestionId,
        appliedWorkItemId: workItem.id,
        actorUserId: actor.id
      });
      if (applied === null) {
        throw new HttpError(409, "ai_suggestion_not_pending", "Only pending AI suggestions can be accepted.");
      }
      await new AuditRepository(client).record({
        eventName: "ai_suggestion.applied",
        actor,
        subjectType: "ai_suggestion",
        subjectId: suggestion.id,
        requestId,
        sourceMemoId: sourceMemo.id,
        workItemId: workItem.id,
        metadata: {
          parentWorkItemId: parent.id,
          appliedWorkItemId: workItem.id
        }
      });
      return { suggestion: applied, workItem };
    });
  }

  async dismissSuggestion(
    suggestionId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ suggestion: AiSuggestionRecord }> {
    return this.db.transaction(async (client) => {
      const suggestions = new AiSuggestionRepository(client);
      const existing = await suggestions.findById(suggestionId);
      if (existing === null) {
        throw new HttpError(404, "not_found", "ai_suggestion was not found.");
      }
      if (existing.status !== "pending") {
        throw new HttpError(409, "ai_suggestion_not_pending", "Only pending AI suggestions can be dismissed.");
      }
      const dismissed = await suggestions.markDismissed({ suggestionId, actorUserId: actor.id });
      if (dismissed === null) {
        throw new HttpError(409, "ai_suggestion_not_pending", "Only pending AI suggestions can be dismissed.");
      }
      await new AuditRepository(client).record({
        eventName: "ai_suggestion.dismissed",
        actor,
        subjectType: "ai_suggestion",
        subjectId: suggestionId,
        requestId,
        workItemId: existing.parentWorkItemId,
        metadata: {
          parentWorkItemId: existing.parentWorkItemId
        }
      });
      return { suggestion: dismissed };
    });
  }

  private async findSourceMemoForWorkItem(workItemId: string): Promise<WorkItemExpansionContext["sourceMemo"]> {
    const workItem = await new WorkItemRepository(this.db).findById(workItemId);
    if (workItem === null) {
      return null;
    }
    const sourceMemo = await new SourceMemoRepository(this.db).findById(workItem.sourceMemoId);
    if (sourceMemo === null) {
      return null;
    }
    return {
      id: sourceMemo.id,
      sourceType: sourceMemo.sourceType ?? null,
      transcriptText: sourceMemo.currentTranscriptText ?? null
    };
  }
}

interface ValidExpandedWorkItem {
  title: string;
  body: string;
  tags: string[];
  featureGroup: string | null;
}

interface ValidSuggestion extends ValidExpandedWorkItem {
  rationale: string;
}

function validateExpansionOutput(output: unknown):
  | { ok: true; value: { expandedWorkItem: ValidExpandedWorkItem; relatedSuggestions: ValidSuggestion[] } }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(output)) {
    return { ok: false, errors: ["Output must be a JSON object."] };
  }
  const expandedWorkItem = parseWorkItemShape(output.expanded_work_item, "expanded_work_item", errors);
  const relatedSuggestionsRaw = output.related_suggestions;
  const relatedSuggestions: ValidSuggestion[] = [];
  if (!Array.isArray(relatedSuggestionsRaw)) {
    errors.push("related_suggestions must be an array.");
  } else {
    relatedSuggestionsRaw.slice(0, 5).forEach((value, index) => {
      const parsed = parseWorkItemShape(value, `related_suggestions[${index}]`, errors);
      const rationale = isRecord(value) ? readRequiredString(value.rationale, `related_suggestions[${index}].rationale`, errors) : "";
      if (parsed !== null && rationale !== "") {
        relatedSuggestions.push({ ...parsed, rationale });
      }
    });
  }
  if (expandedWorkItem === null || errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      expandedWorkItem,
      relatedSuggestions
    }
  };
}

function parseWorkItemShape(value: unknown, path: string, errors: string[]): ValidExpandedWorkItem | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  const title = readRequiredString(value.title, `${path}.title`, errors);
  const body = readRequiredString(value.body, `${path}.body`, errors);
  const tags = readTags(value.tags, `${path}.tags`, errors);
  const featureGroup = readNullableString(value.feature_group, `${path}.feature_group`, errors);
  if (title === "" || body === "" || tags === null || featureGroup === undefined) {
    return null;
  }
  return { title, body, tags, featureGroup };
}

function readRequiredString(value: unknown, path: string, errors: string[]): string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path} must be a non-empty string.`);
    return "";
  }
  return value.trim();
}

function readNullableString(value: unknown, path: string, errors: string[]): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${path} must be a string or null.`);
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readTags(value: unknown, path: string, errors: string[]): string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return null;
  }
  const tags = value
    .filter((item): item is string => typeof item === "string" && item.trim() !== "")
    .map((item) => item.trim())
    .slice(0, 12);
  if (tags.length !== value.length) {
    errors.push(`${path} must contain only non-empty strings.`);
    return null;
  }
  return tags;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
