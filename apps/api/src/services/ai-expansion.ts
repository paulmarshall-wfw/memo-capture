import { randomUUID } from "node:crypto";
import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { AiSuggestionRepository, type AiSuggestionRecord } from "../repositories/ai-suggestions.js";
import { AuditRepository } from "../repositories/audit.js";
import { ProjectRepository } from "../repositories/catalog.js";
import { ProcessingJobRepository } from "../repositories/jobs.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { SettingsRepository, type AiTaskRouteRow } from "../repositories/settings.js";
import { SourceMemoRepository } from "../repositories/source-memos.js";
import { TagRepository } from "../repositories/tags.js";
import { WorkItemRepository, type WorkItemRecord } from "../repositories/work-items.js";
import { HttpError } from "./errors.js";
import { WorkflowHookScheduler } from "./workflow-hooks.js";
import {
  createLlmProvider,
  MEMO_EXPANSION_HOOK_KEY,
  normalizePromptContextConfig,
  SUGGEST_NEW_MEMOS_HOOK_KEY,
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
    const taskRoutes = await new SettingsRepository(this.db).listAiTaskRoutes();
    const taskRoute = selectMemoExpansionTask(taskRoutes);
    if (taskRoute === null) {
      throw new HttpError(409, "ai_task_missing", "Memo expansion task route is not configured.");
    }
    return this.expandWorkItemWithTaskRoute(workItemId, taskRoute, actor, requestId);
  }

  async runWorkItemTask(
    workItemId: string,
    taskDefinitionId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{
    taskResultType: "expanded_memo" | "suggested_work_items";
    expandedWorkItem: ValidExpandedWorkItem | null;
    suggestedWorkItems: EphemeralSuggestedWorkItem[];
    suggestions: AiSuggestionRecord[];
    providerName: string;
    modelName: string;
    validation: Record<string, unknown>;
  }> {
    const settings = new SettingsRepository(this.db);
    const taskRoute = await settings.findAiTaskRouteById(taskDefinitionId);
    if (taskRoute === null) {
      throw new HttpError(404, "not_found", "ai_task_definition was not found.");
    }
    validateWorkItemDetailTaskRoute(taskRoute);
    if (taskRoute.hook_key === MEMO_EXPANSION_HOOK_KEY) {
      const expanded = await this.expandWorkItemWithTaskRoute(workItemId, taskRoute, actor, requestId);
      return {
        taskResultType: "expanded_memo",
        expandedWorkItem: expanded.expandedWorkItem,
        suggestedWorkItems: [],
        suggestions: [],
        providerName: expanded.providerName,
        modelName: expanded.modelName,
        validation: expanded.validation
      };
    }
    if (taskRoute.hook_key === SUGGEST_NEW_MEMOS_HOOK_KEY) {
      const suggested = await this.suggestWorkItemsWithTaskRoute(workItemId, taskRoute, actor, requestId);
      return {
        taskResultType: "suggested_work_items",
        expandedWorkItem: null,
        suggestedWorkItems: suggested.suggestedWorkItems,
        suggestions: [],
        providerName: suggested.providerName,
        modelName: suggested.modelName,
        validation: suggested.validation
      };
    }
    throw new HttpError(409, "work_item_task_not_implemented", "No work item detail handler is registered for this task.");
  }

  private async expandWorkItemWithTaskRoute(
    workItemId: string,
    taskRoute: AiTaskRouteRow,
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
    const [workItem, sourceMemo, projects] = await Promise.all([
      new WorkItemRepository(this.db).findById(workItemId),
      this.findSourceMemoForWorkItem(workItemId),
      new ProjectRepository(this.db).list()
    ]);
    const promptDefinitionName = taskRoute.prompt_name ?? "work_item_expansion";
    const prompt = await settings.getActivePrompt(promptDefinitionName);
    await validateMemoExpansionTaskRoute(taskRoute, this.config);

    if (workItem === null) {
      throw new HttpError(404, "not_found", "work_item was not found.");
    }
    if (prompt === null || prompt.active_prompt_version_id === null || prompt.active_body === null) {
      throw new HttpError(409, "ai_prompt_missing", "Active AI expansion prompt is missing.");
    }
    const promptBody = prompt.active_body;
    const providerName = taskRoute.provider_name;
    if (providerName === null) {
      throw new HttpError(409, "llm_provider_not_enabled", "No LLM provider is selected for memo expansion.");
    }
    const modelName =
      taskRoute.route_model_name ?? taskRoute.provider_model_name ?? taskRoute.default_model_name ?? this.config.llm.modelName;
    const endpoint = this.config.llm.endpoint || (taskRoute.endpoint ?? "");
    const provider = createLlmProvider(this.config.llm, providerName, modelName, this.config.llm.provider, endpoint);

    const project = projects.find((candidate) => candidate.id === workItem.projectId) ?? null;
    const context: WorkItemExpansionContext = {
      hookKey: taskRoute.hook_key,
      prompt: {
        name: prompt.name,
        version: prompt.active_version,
        body: promptBody,
        contextConfig: normalizePromptContextConfig(prompt.active_context_config, promptBody)
      },
      project: {
        id: project?.id ?? null,
        name: project?.name ?? null,
        description: project?.description ?? null
      },
      workItem: {
        id: workItem.id,
        title: workItem.title,
        body: workItem.body,
        tags: workItem.tags,
        contributorText: workItem.contributorText
      },
      sourceMemo
    };
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
        taskKey: taskRoute.task_key,
        hookKey: taskRoute.hook_key,
        promptName: prompt.name,
        promptVersion: prompt.active_version,
        providerName,
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
        providerName,
        modelName,
        latencyMs: null
      });
      throw error;
    }
    const validation = validateExpandedMemoOutput(output.parsed);
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
          taskKey: taskRoute.task_key,
          hookKey: taskRoute.hook_key,
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
      const audit = new AuditRepository(client);
      await audit.record({
        eventName: "ai_expansion.completed",
        actor,
        subjectType: "work_item",
        subjectId: workItem.id,
        requestId,
        jobId: job.id,
        sourceMemoId: workItem.sourceMemoId,
        workItemId: workItem.id,
        metadata: {
          taskKey: taskRoute.task_key,
          hookKey: taskRoute.hook_key,
          providerName: output.providerName,
          modelName: output.modelName,
          latencyMs: output.latencyMs,
          suggestionCount: 0
        }
      });
      await new ProcessingJobRepository(client).markSucceeded(job.id);
      return {
        expandedWorkItem: validation.value.expandedWorkItem,
        suggestions: [],
        providerName: output.providerName,
        modelName: output.modelName,
        validation: {
          ok: true,
          promptVersion: prompt.active_version,
          strictJson: true
        }
      };
    });
  }

  private async suggestWorkItemsWithTaskRoute(
    workItemId: string,
    taskRoute: AiTaskRouteRow,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{
    suggestedWorkItems: EphemeralSuggestedWorkItem[];
    providerName: string;
    modelName: string;
    validation: Record<string, unknown>;
  }> {
    const settings = new SettingsRepository(this.db);
    const [workItem, sourceMemo, projects] = await Promise.all([
      new WorkItemRepository(this.db).findById(workItemId),
      this.findSourceMemoForWorkItem(workItemId),
      new ProjectRepository(this.db).list()
    ]);
    const promptDefinitionName = taskRoute.prompt_name ?? "work_item_suggestions";
    const prompt = await settings.getActivePrompt(promptDefinitionName);
    await validateSuggestNewMemosTaskRoute(taskRoute, this.config);

    if (workItem === null) {
      throw new HttpError(404, "not_found", "work_item was not found.");
    }
    if (prompt === null || prompt.active_prompt_version_id === null || prompt.active_body === null) {
      throw new HttpError(409, "ai_prompt_missing", "Active suggested work item prompt is missing.");
    }
    const providerName = taskRoute.provider_name;
    if (providerName === null) {
      throw new HttpError(409, "llm_provider_not_enabled", "No LLM provider is selected for suggested work items.");
    }
    const modelName =
      taskRoute.route_model_name ?? taskRoute.provider_model_name ?? taskRoute.default_model_name ?? this.config.llm.modelName;
    const endpoint = this.config.llm.endpoint || (taskRoute.endpoint ?? "");
    const provider = createLlmProvider(this.config.llm, providerName, modelName, this.config.llm.provider, endpoint);

    const project = projects.find((candidate) => candidate.id === workItem.projectId) ?? null;
    const context: WorkItemExpansionContext = {
      hookKey: taskRoute.hook_key,
      prompt: {
        name: prompt.name,
        version: prompt.active_version,
        body: prompt.active_body,
        contextConfig: normalizePromptContextConfig(prompt.active_context_config, prompt.active_body)
      },
      project: {
        id: project?.id ?? null,
        name: project?.name ?? null,
        description: project?.description ?? null
      },
      workItem: {
        id: workItem.id,
        title: workItem.title,
        body: workItem.body,
        tags: workItem.tags,
        contributorText: workItem.contributorText
      },
      sourceMemo
    };
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
        taskKey: taskRoute.task_key,
        hookKey: taskRoute.hook_key,
        promptName: prompt.name,
        promptVersion: prompt.active_version,
        providerName,
        modelName
      }
    });

    let output: LlmStructuredOutput;
    try {
      output = await provider.generateWorkItemExpansion(context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Suggested work item generation failed.";
      await new ProcessingJobRepository(this.db).markFailed({
        jobId: job.id,
        errorCode: "ai_provider_failed",
        userSafeErrorMessage: "Suggested work item generation failed before returning valid output.",
        internalErrorDetail: message,
        retryable: false,
        providerName,
        modelName,
        latencyMs: null
      });
      throw error;
    }

    const validation = validateSuggestedWorkItemsOutput(output.parsed);
    if (!validation.ok) {
      await new ProcessingJobRepository(this.db).markFailed({
        jobId: job.id,
        errorCode: "invalid_ai_output",
        userSafeErrorMessage: "Suggested work item generation returned invalid structured JSON.",
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
          taskKey: taskRoute.task_key,
          hookKey: taskRoute.hook_key,
          errors: validation.errors,
          providerName: output.providerName,
          modelName: output.modelName
        },
        redactionApplied: true
      });
      throw new HttpError(502, "invalid_ai_output", "Suggested work item generation returned invalid structured JSON.", {
        errors: validation.errors
      });
    }

    return this.db.transaction(async (client) => {
      await new AuditRepository(client).record({
        eventName: "ai_expansion.completed",
        actor,
        subjectType: "work_item",
        subjectId: workItem.id,
        requestId,
        jobId: job.id,
        sourceMemoId: workItem.sourceMemoId,
        workItemId: workItem.id,
        metadata: {
          taskKey: taskRoute.task_key,
          hookKey: taskRoute.hook_key,
          providerName: output.providerName,
          modelName: output.modelName,
          latencyMs: output.latencyMs,
          suggestionCount: validation.value.suggestedWorkItems.length,
          persistedSuggestionCount: 0
        }
      });
      await new ProcessingJobRepository(client).markSucceeded(job.id);
      return {
        suggestedWorkItems: validation.value.suggestedWorkItems.map((suggestion) => ({
          id: randomUUID(),
          parentWorkItemId: workItem.id,
          taskDefinitionId: taskRoute.id,
          taskRunId: job.id,
          title: suggestion.title,
          body: suggestion.body,
          tags: suggestion.tags,
          rationale: suggestion.rationale,
          providerName: output.providerName,
          modelName: output.modelName
        })),
        providerName: output.providerName,
        modelName: output.modelName,
        validation: {
          ok: true,
          promptVersion: prompt.active_version,
          strictJson: true
        }
      };
    });
  }

  async acceptEphemeralSuggestedWorkItem(
    parentWorkItemId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ workItem: WorkItemRecord }> {
    const input = parseEphemeralSuggestionAcceptBody(body);
    return this.db.transaction(async (client) => {
      const parent = await new WorkItemRepository(client).findById(parentWorkItemId);
      if (parent === null) {
        throw new HttpError(404, "not_found", "parent work_item was not found.");
      }
      const sourceMemo = await new SourceMemoRepository(client).create({
        sourceType: "ai_generated",
        originalText: input.body,
        extractedText: input.body,
        contributorText: "AI suggestion",
        createdBy: actor.id
      });
      const workItem = await new WorkItemRepository(client).create({
        sourceMemoId: sourceMemo.id,
        projectId: parent.projectId,
        contributorText: "AI suggestion",
        contributorId: null,
        title: input.title,
        body: input.body,
        bodyFormat: "markdown",
        workflowState: "memo",
        actorUserId: actor.id
      });
      await new TagRepository(client).setForWorkItem({
        workItemId: workItem.id,
        projectId: workItem.projectId,
        tags: input.tags,
        actorUserId: actor.id
      });
      if (workItem.projectId !== null) {
        await new WorkItemRepository(client).markTagNominationReady({
          workItemId: workItem.id,
          projectId: workItem.projectId,
          jobId: null
        });
      }
      const taggedWorkItem = (await new WorkItemRepository(client).findById(workItem.id)) ?? {
        ...workItem,
        tags: input.tags
      };
      await new WorkflowHookScheduler(client).scheduleStateResidentHooksForWorkItem({
        workItem: taggedWorkItem,
        actorUserId: actor.id
      });
      await new AuditRepository(client).record({
        eventName: "ai_suggestion.applied",
        actor,
        subjectType: "work_item",
        subjectId: taggedWorkItem.id,
        requestId,
        jobId: input.taskRunId,
        sourceMemoId: sourceMemo.id,
        workItemId: taggedWorkItem.id,
        metadata: {
          parentWorkItemId: parent.id,
          taskDefinitionId: input.taskDefinitionId,
          taskRunId: input.taskRunId,
          providerName: input.providerName,
          modelName: input.modelName,
          rationale: input.rationale,
          ephemeral: true
        },
        redactionApplied: true
      });
      return { workItem: taggedWorkItem };
    });
  }

  async acceptSuggestion(
    suggestionId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<{ suggestion: AiSuggestionRecord; workItem: WorkItemRecord }> {
    return this.db.transaction(async (client) => {
      const suggestions = new AiSuggestionRepository(client);
      const tags = new TagRepository(client);
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
        contributorText: "AI suggestion",
        contributorId: null,
        title: suggestion.title,
        body: suggestion.body,
        bodyFormat: "markdown",
        workflowState: "memo",
        actorUserId: actor.id
      });
      await tags.setForWorkItem({
        workItemId: workItem.id,
        projectId: workItem.projectId,
        tags: suggestion.tags,
        actorUserId: actor.id
      });
      if (workItem.projectId !== null) {
        await new WorkItemRepository(client).markTagNominationReady({
          workItemId: workItem.id,
          projectId: workItem.projectId,
          jobId: null
        });
      }
      const taggedWorkItem = (await new WorkItemRepository(client).findById(workItem.id)) ?? {
        ...workItem,
        tags: suggestion.tags
      };
      await new WorkflowHookScheduler(client).scheduleStateResidentHooksForWorkItem({
        workItem: taggedWorkItem,
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
          appliedWorkItemId: taggedWorkItem.id
        }
      });
      return { suggestion: applied, workItem: taggedWorkItem };
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
        throw new HttpError(409, "ai_suggestion_not_pending", "Only pending AI suggestions can be rejected.");
      }
      const dismissed = await suggestions.markDismissed({ suggestionId, actorUserId: actor.id });
      if (dismissed === null) {
        throw new HttpError(409, "ai_suggestion_not_pending", "Only pending AI suggestions can be rejected.");
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
}

interface ValidSuggestion extends ValidExpandedWorkItem {
  rationale: string;
}

interface EphemeralSuggestedWorkItem extends ValidSuggestion {
  id: string;
  parentWorkItemId: string;
  taskDefinitionId: string;
  taskRunId: string;
  providerName: string;
  modelName: string;
}

function selectMemoExpansionTask(tasks: AiTaskRouteRow[]): AiTaskRouteRow | null {
  const memoExpansionTasks = tasks.filter((task) => task.hook_key === MEMO_EXPANSION_HOOK_KEY);
  return (
    memoExpansionTasks.find((task) => task.task_key === MEMO_EXPANSION_HOOK_KEY) ??
    memoExpansionTasks.find((task) => task.route_enabled) ??
    memoExpansionTasks[0] ??
    null
  );
}

function validateWorkItemDetailTaskRoute(task: AiTaskRouteRow): void {
  if (task.render_location !== "work_item_detail") {
    throw new HttpError(409, "work_item_task_location_mismatch", "Task is not assigned to the work item detail panel.");
  }
  if (!task.route_enabled) {
    throw new HttpError(409, "ai_task_route_disabled", "Task route is disabled.");
  }
}

function validateMemoExpansionTaskRoute(task: AiTaskRouteRow, config: ApiConfig): void {
  if (task.hook_key !== MEMO_EXPANSION_HOOK_KEY) {
    throw new HttpError(409, "ai_task_hook_mismatch", "Configured task does not dispatch to memo expansion.");
  }
  if (!task.route_enabled) {
    throw new HttpError(409, "ai_task_route_disabled", "Memo expansion task route is disabled.");
  }
  if (task.provider_name === null || task.provider_enabled !== true) {
    throw new HttpError(409, "llm_provider_not_enabled", "No enabled LLM provider is selected for memo expansion.");
  }
  if ((task.task_kind_provider_kind ?? task.task_kind) !== "llm" || task.provider_kind !== "llm") {
    throw new HttpError(409, "llm_provider_unavailable", "Memo expansion requires an LLM task route and provider.");
  }
  if (task.required_secret_env === "OPENAI_COMPATIBLE_API_KEY" && config.llm.openAiCompatibleApiKey.trim() === "") {
    throw new HttpError(409, "llm_secret_missing", "OpenAI-compatible LLM API key is not configured.");
  }
  if (config.llm.provider === "disabled") {
    throw new HttpError(
      409,
      "llm_provider_disabled",
      "Memo expansion is enabled in Settings, but the AppLauncher LLM runtime is disabled."
    );
  }
  if (config.llm.provider !== task.provider_name) {
    throw new HttpError(
      409,
      "llm_provider_unavailable",
      `Memo expansion uses ${task.provider_name}, but the AppLauncher LLM runtime selected ${config.llm.provider}.`
    );
  }
}

function validateSuggestNewMemosTaskRoute(task: AiTaskRouteRow, config: ApiConfig): void {
  if (task.hook_key !== SUGGEST_NEW_MEMOS_HOOK_KEY) {
    throw new HttpError(409, "ai_task_hook_mismatch", "Configured task does not dispatch to suggested work items.");
  }
  if (!task.route_enabled) {
    throw new HttpError(409, "ai_task_route_disabled", "Suggested work item task route is disabled.");
  }
  if (task.provider_name === null || task.provider_enabled !== true) {
    throw new HttpError(409, "llm_provider_not_enabled", "No enabled LLM provider is selected for suggested work items.");
  }
  if ((task.task_kind_provider_kind ?? task.task_kind) !== "llm" || task.provider_kind !== "llm") {
    throw new HttpError(409, "llm_provider_unavailable", "Suggested work items require an LLM task route and provider.");
  }
  if (task.required_secret_env === "OPENAI_COMPATIBLE_API_KEY" && config.llm.openAiCompatibleApiKey.trim() === "") {
    throw new HttpError(409, "llm_secret_missing", "OpenAI-compatible LLM API key is not configured.");
  }
  if (config.llm.provider === "disabled") {
    throw new HttpError(
      409,
      "llm_provider_disabled",
      "Suggested work items are enabled in Settings, but the AppLauncher LLM runtime is disabled."
    );
  }
  if (config.llm.provider !== task.provider_name) {
    throw new HttpError(
      409,
      "llm_provider_unavailable",
      `Suggested work items use ${task.provider_name}, but the AppLauncher LLM runtime selected ${config.llm.provider}.`
    );
  }
}

function validateExpandedMemoOutput(output: unknown):
  | { ok: true; value: { expandedWorkItem: ValidExpandedWorkItem } }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(output)) {
    return { ok: false, errors: ["Output must be a JSON object."] };
  }
  const expandedWorkItem = parseWorkItemShape(output.expanded_work_item, "expanded_work_item", errors);
  if (expandedWorkItem === null || errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      expandedWorkItem
    }
  };
}

function validateSuggestedWorkItemsOutput(output: unknown):
  | { ok: true; value: { suggestedWorkItems: ValidSuggestion[] } }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(output)) {
    return { ok: false, errors: ["Output must be a JSON object."] };
  }
  const suggestedRaw = output.suggested_work_items;
  const suggestedWorkItems: ValidSuggestion[] = [];
  if (!Array.isArray(suggestedRaw)) {
    errors.push("suggested_work_items must be an array.");
  } else {
    suggestedRaw.slice(0, 5).forEach((value, index) => {
      const parsed = parseWorkItemShape(value, `suggested_work_items[${index}]`, errors);
      const rationale = isRecord(value)
        ? readRequiredString(value.rationale, `suggested_work_items[${index}].rationale`, errors)
        : "";
      if (parsed !== null && rationale !== "") {
        suggestedWorkItems.push({ ...parsed, rationale });
      }
    });
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: { suggestedWorkItems } };
}

function parseEphemeralSuggestionAcceptBody(body: unknown): ValidSuggestion & {
  taskDefinitionId: string | null;
  taskRunId: string | null;
  providerName: string | null;
  modelName: string | null;
} {
  const record = isRecord(body) && isRecord(body.candidate) ? body.candidate : body;
  const errors: string[] = [];
  const parsed = parseWorkItemShape(record, "candidate", errors);
  const rationale = isRecord(record) ? readRequiredString(record.rationale, "candidate.rationale", errors) : "";
  if (parsed === null || rationale === "" || errors.length > 0 || !isRecord(record)) {
    throw new HttpError(400, "invalid_request", "candidate must include title, body, tags, and rationale.", { errors });
  }
  return {
    ...parsed,
    rationale,
    taskDefinitionId: optionalStringField(record.taskDefinitionId),
    taskRunId: optionalStringField(record.taskRunId),
    providerName: optionalStringField(record.providerName),
    modelName: optionalStringField(record.modelName)
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
  if (title === "" || body === "" || tags === null) {
    return null;
  }
  return { title, body, tags };
}

function readRequiredString(value: unknown, path: string, errors: string[]): string {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path} must be a non-empty string.`);
    return "";
  }
  return value.trim();
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

function optionalStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
