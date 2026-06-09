import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import type { AppUserRecord } from "../repositories/rows.js";
import {
  SettingsRepository,
  type AiTaskRouteRow,
  type MediaTypeSettingRow,
  type ParserTypeSettingRow,
  type ProcessingHookRow,
  type PromptDefinitionRow,
  type ProviderRegistrySettingsRow,
  type ProviderCapabilityRow,
  type ProviderConfigRow
} from "../repositories/settings.js";
import { HttpError, assertNonEmptyString, optionalString } from "./errors.js";
import { fetchRegistryProfile, fetchRegistryProfiles, fetchRegistryProviders } from "./invoke-providers/registry.js";
import { createTargetAppRuntimeService } from "./invoke-providers/runtime.js";
import { normalizeCapabilityKey } from "./invoke-providers/mapping.js";
import { isSecretAvailable } from "./invoke-providers/secrets.js";
import type { SharedProviderConfig, SharedRegistryProfile } from "./invoke-providers/types.js";
import {
  DEFAULT_LLM_SYSTEM_MESSAGE,
  DEFAULT_LLM_SYSTEM_MESSAGES_BY_HOOK,
  MEMO_EXPANSION_HOOK_KEY,
  SUGGEST_NEW_MEMOS_HOOK_KEY,
  normalizePromptContextConfig
} from "./llm.js";

const IMPLEMENTED_AI_TASK_HOOKS: ReadonlySet<string> = new Set([
  MEMO_EXPANSION_HOOK_KEY,
  SUGGEST_NEW_MEMOS_HOOK_KEY
]);
const TASK_RENDER_LOCATIONS = new Set(["work_item_detail", "work_item_list", "export_page"]);

export class SettingsService {
  constructor(
    private readonly db: Database,
    private readonly config: ApiConfig
  ) {}

  async getSummary(): Promise<Record<string, unknown>> {
    const settings = new SettingsRepository(this.db);
    const providerRegistrySettings = await settings.getProviderRegistrySettings();
    const registryResolution = resolveProviderRegistryProfile(this.config, providerRegistrySettings);
    const effectiveConfig = configWithProviderRegistryProfile(this.config, registryResolution.activeProfileKey);
    const runtimeService = createTargetAppRuntimeService(this.db, effectiveConfig);
    const [
      mediaTypes,
      parserTypes,
      fileTypes,
      extraction,
      transcription,
      taskKinds,
      aiTasks,
      processingHooks,
      prompts,
      providerRegistry,
      readinessDiagnostics,
      hookRegistryState
    ] = await Promise.all([
      settings.listMediaTypes(),
      settings.listParserTypes(),
      settings.listFileTypes(),
      settings.getExtractionSettings(),
      settings.getTranscriptionSettings(),
      settings.listTaskKinds(),
      settings.listAiTaskRoutes(),
      settings.listProcessingHooks(),
      settings.listPrompts(),
      loadProviderRegistryState(effectiveConfig, registryResolution),
      runtimeService.getReadinessDiagnostics(),
      runtimeService.getHookRegistryState()
    ]);
    const readinessByTaskKey = new Map(
      readinessDiagnostics.tasks.map((entry) => [entry.taskKey, entry])
    );

    const serializedExtraction =
      extraction === null
        ? defaultExtractionSettings()
        : {
            projectConfidenceThreshold: toNumber(extraction.project_confidence_threshold),
            contributorConfidenceThreshold: toNumber(extraction.contributor_confidence_threshold),
            tagConfidenceThreshold: toNumber(extraction.tag_confidence_threshold),
            updatedAt: toIso(extraction.updated_at)
          };

    return {
      mediaTypes: mediaTypes.map(serializeMediaType),
      parserTypes: parserTypes.map(serializeParserType),
      fileTypes: fileTypes.map(serializeFileType),
      extraction: serializedExtraction,
      transcription: transcription === null
        ? null
        : {
            maxRetryAttempts: transcription.max_retry_attempts,
            runtimeProvider: this.config.transcription.provider,
            runtimeModelName: this.config.transcription.modelName,
            updatedAt: toIso(transcription.updated_at)
          },
      providerCatalog: {
        registry: providerRegistry.registry,
        providers: providerRegistry.providers
      },
      providerRegistry: providerRegistry.settings,
      taskKinds: taskKinds.map(serializeTaskKind),
      aiTasks: aiTasks.map((task) => serializeAiTaskRoute(task, effectiveConfig, readinessByTaskKey.get(task.task_key))),
      invokeProviders: {
        registry: providerRegistry.registry,
        profile: registryResolution.activeProfileKey ?? "",
        commitSha: this.config.invokeProviders.commitSha,
        diagnostics: readinessDiagnostics
      },
      registeredTaskHooks: serializeRegisteredTaskHooks(processingHooks, hookRegistryState),
      prompts: prompts.map(serializePrompt),
      auth: {
        mode: this.config.authMode,
        oidcConfigured:
          this.config.oidc.issuerUrl.trim() !== "" &&
          this.config.oidc.audience.trim() !== "" &&
          this.config.oidc.clientId.trim() !== "" &&
          this.config.oidc.jwksUrl.trim() !== ""
      }
    };
  }

  async getRegistryStatus(): Promise<Record<string, unknown>> {
    const settings = new SettingsRepository(this.db);
    const registryResolution = resolveProviderRegistryProfile(this.config, await settings.getProviderRegistrySettings());
    const providerCatalog = await loadProviderRegistryState(
      configWithProviderRegistryProfile(this.config, registryResolution.activeProfileKey),
      registryResolution
    );
    return {
      registry: providerCatalog.registry,
      providers: providerCatalog.providers,
      providerRegistry: providerCatalog.settings
    };
  }

  async updateProviderRegistry(body: unknown, actor: AppUserRecord, requestId: string): Promise<Record<string, unknown>> {
    const input = parseProviderRegistryBody(body);
    if (input.selectedProviderProfileKey !== null) {
      const profile = await fetchRegistryProfile(this.config, input.selectedProviderProfileKey);
      if (!profile.ok || profile.profile === null) {
        throw new HttpError(
          profile.missing ? 400 : 409,
          profile.missing ? "provider_registry_profile_missing" : "provider_registry_unavailable",
          profile.error ?? "Provider registry profile could not be validated.",
          { selectedProviderProfileKey: input.selectedProviderProfileKey }
        );
      }
    }
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const updated = await settings.updateProviderRegistrySettings({
        selectedProviderProfileKey: input.selectedProviderProfileKey,
        actorUserId: actor.id
      });
      await audit.record({
        eventName: "provider_registry_settings.updated",
        actor,
        subjectType: "provider_registry_settings",
        subjectId: "singleton",
        requestId,
        metadata: {
          selectedProviderProfileKey: updated.selected_provider_profile_key
        },
        redactionApplied: true
      });
      const resolution = resolveProviderRegistryProfile(this.config, updated);
      const providerRegistry = await loadProviderRegistryState(
        configWithProviderRegistryProfile(this.config, resolution.activeProfileKey),
        resolution
      );
      return { providerRegistry: providerRegistry.settings };
    });
  }

  async getReadinessDiagnostics(): Promise<Record<string, unknown>> {
    const settings = new SettingsRepository(this.db);
    const registryResolution = resolveProviderRegistryProfile(this.config, await settings.getProviderRegistrySettings());
    return await createTargetAppRuntimeService(
      this.db,
      configWithProviderRegistryProfile(this.config, registryResolution.activeProfileKey)
    ).getReadinessDiagnostics();
  }

  async diagnoseProviderAdapter(body: unknown): Promise<Record<string, unknown>> {
    const input = parseAdapterDiagnosticBody(body);
    return await (await this.createRegistryAwareRuntimeService()).diagnoseAdapter(input);
  }

  async listRenderSlots(): Promise<Record<string, unknown>> {
    return await (await this.createRegistryAwareRuntimeService()).listRenderSlots();
  }

  async getRenderSlotActions(slot: string): Promise<Record<string, unknown>> {
    return await (await this.createRegistryAwareRuntimeService()).getRenderSlotActions(slot);
  }

  async listTaskRuns(query: URLSearchParams): Promise<Record<string, unknown>> {
    const filters: {
      taskKey?: string | null;
      hookKey?: string | null;
      providerKey?: string | null;
      status?: string | null;
      workItemId?: string | null;
      limit?: number;
    } = {};
    const taskKey = query.get("task_key");
    const hookKey = query.get("hook_key");
    const providerKey = query.get("provider_key");
    const status = query.get("status");
    const workItemId = query.get("work_item_id");
    const limit = parseQueryLimit(query.get("limit"));
    if (taskKey !== null) {
      filters.taskKey = taskKey;
    }
    if (hookKey !== null) {
      filters.hookKey = hookKey;
    }
    if (providerKey !== null) {
      filters.providerKey = providerKey;
    }
    if (status !== null) {
      filters.status = status;
    }
    if (workItemId !== null) {
      filters.workItemId = workItemId;
    }
    if (limit !== undefined) {
      filters.limit = limit;
    }
    return await (await this.createRegistryAwareRuntimeService()).listTaskRuns(filters);
  }

  async groupTaskRuns(query: URLSearchParams): Promise<Record<string, unknown>> {
    const groupBy = query.get("group_by");
    if (groupBy !== "taskKey" && groupBy !== "hookKey" && groupBy !== "providerKey" && groupBy !== "status") {
      throw new HttpError(400, "invalid_request", "group_by must be taskKey, hookKey, providerKey, or status.");
    }
    return await (await this.createRegistryAwareRuntimeService()).groupTaskRuns(groupBy);
  }

  private async createRegistryAwareRuntimeService() {
    const settings = new SettingsRepository(this.db);
    const registryResolution = resolveProviderRegistryProfile(this.config, await settings.getProviderRegistrySettings());
    return createTargetAppRuntimeService(
      this.db,
      configWithProviderRegistryProfile(this.config, registryResolution.activeProfileKey)
    );
  }

  async updateExtraction(body: unknown, actor: AppUserRecord, requestId: string): Promise<Record<string, unknown>> {
    const input = parseExtractionBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const updated = await settings.updateExtractionSettings({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "extraction_settings.updated",
        actor,
        subjectType: "extraction_settings",
        subjectId: "singleton",
        requestId,
        metadata: input
      });
      return {
        extraction: {
          projectConfidenceThreshold: toNumber(updated.project_confidence_threshold),
          contributorConfidenceThreshold: toNumber(updated.contributor_confidence_threshold),
          tagConfidenceThreshold: toNumber(updated.tag_confidence_threshold),
          updatedAt: toIso(updated.updated_at)
        }
      };
    });
  }

  async updateTranscription(body: unknown, actor: AppUserRecord, requestId: string): Promise<Record<string, unknown>> {
    const input = parseTranscriptionBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const updated = await settings.updateTranscriptionSettings({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "transcription_settings.updated",
        actor,
        subjectType: "transcription_settings",
        subjectId: "singleton",
        requestId,
        metadata: input
      });
      return {
        transcription: {
          maxRetryAttempts: updated.max_retry_attempts,
          runtimeProvider: this.config.transcription.provider,
          runtimeModelName: this.config.transcription.modelName,
          updatedAt: toIso(updated.updated_at)
        }
      };
    });
  }

  async createTaskKind(body: unknown, actor: AppUserRecord, requestId: string): Promise<Record<string, unknown>> {
    const input = parseCreateTaskKindBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findTaskKindByKey(input.kindKey);
      if (existing !== null) {
        throw new HttpError(409, "task_kind_exists", "A task kind already exists for the derived kind key.", {
          kindKey: input.kindKey,
          displayName: input.displayName
        });
      }
      await validateTaskKindEnablement(settings, input.kindKey, input.enabled);
      const taskKind = await settings.createTaskKind({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "task_kind.created",
        actor,
        subjectType: "task_kind",
        subjectId: taskKind.id,
        requestId,
        metadata: {
          kindKey: taskKind.kind_key,
          providerKind: taskKind.provider_kind,
          capabilityKey: taskKind.capability_key,
          promptFieldsEnabled: taskKind.prompt_fields_enabled,
          enabled: taskKind.enabled
        },
        redactionApplied: true
      });
      return { taskKind: serializeTaskKind(taskKind) };
    });
  }

  async updateTaskKind(
    taskKindId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseUpdateTaskKindBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findTaskKindById(taskKindId);
      if (existing === null) {
        throw new HttpError(404, "not_found", "task_kind was not found.");
      }
      await validateTaskKindEnablement(settings, existing.kind_key, input.enabled);
      const taskKind = await settings.updateTaskKind({ taskKindId, ...input, actorUserId: actor.id });
      if (taskKind === null) {
        throw new HttpError(404, "not_found", "task_kind was not found.");
      }
      await audit.record({
        eventName: "task_kind.updated",
        actor,
        subjectType: "task_kind",
        subjectId: taskKind.id,
        requestId,
        metadata: {
          kindKey: taskKind.kind_key,
          providerKind: taskKind.provider_kind,
          capabilityKey: taskKind.capability_key,
          promptFieldsEnabled: taskKind.prompt_fields_enabled,
          enabled: taskKind.enabled,
          active: taskKind.active
        },
        redactionApplied: true
      });
      return { taskKind: serializeTaskKind(taskKind) };
    });
  }

  async updateAiTaskRoute(
    taskDefinitionId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseAiTaskRouteBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const current = await settings.findAiTaskRouteById(taskDefinitionId);
      if (current === null) {
        throw new HttpError(404, "not_found", "ai_task_definition was not found.");
      }
      const registryProvider = await resolveRegistryProviderForTaskRoute(settings, current, input, this.config);
      await validateAiTaskRouteUpdate(settings, current, input, this.config);
      const providerConfig =
        registryProvider.provider === null
          ? null
          : await findEnabledProviderConfigForRegistryProvider(settings, registryProvider.provider);
      const task = await settings.updateAiTaskRoute({
        taskDefinitionId,
        ...input,
        providerConfigId: input.providerKey === undefined ? undefined : providerConfig?.id ?? null,
        registryProfileKey: registryProvider.registryProfileKey,
        providerKey: registryProvider.providerKey,
        actorUserId: actor.id
      });
      if (task === null) {
        throw new HttpError(404, "not_found", "ai_task_definition was not found.");
      }
      await audit.record({
        eventName: "ai_task_route.updated",
        actor,
        subjectType: "ai_task_definition",
        subjectId: task.id,
        requestId,
        metadata: {
          taskKey: task.task_key,
          hookKey: task.hook_key,
          renderLocation: task.render_location,
          displayOrder: task.display_order,
          providerName: task.provider_name,
          enabled: task.route_enabled,
          modelName: task.route_model_name
        },
        redactionApplied: true
      });
      return { aiTask: serializeAiTaskRoute(task, this.config) };
    });
  }

  async updateAiTaskDefinition(
    taskDefinitionId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseUpdateAiTaskBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const current = await settings.findAiTaskRouteById(taskDefinitionId);
      if (current === null) {
        throw new HttpError(404, "not_found", "ai_task_definition was not found.");
      }
      const registryProvider = await resolveRegistryProviderForTaskRoute(settings, current, input, this.config);
      const hookKey = input.hookKey ?? current.hook_key;
      if (input.hookKey !== undefined && input.hookKey !== current.hook_key) {
        await ensureProcessingHookExists(settings, input.hookKey);
      }
      const taskKindRow =
        registryProvider.provider === null
          ? await settings.findTaskKindByKey(current.task_kind)
          : await findTaskKindForProvider(settings, registryProvider.provider.providerKind);
      if (taskKindRow === null || !taskKindRow.active) {
        throw new HttpError(400, "invalid_request", "Selected provider kind does not have an active task mapping.");
      }
      const promptText =
        input.initialPromptText ??
        input.promptUpdate?.body ??
        `Return strict JSON for ${input.displayName ?? current.display_name}. Do not include prose outside JSON.`;
      const defaultSystemMessage = defaultSystemMessageForHook(hookKey);
      const promptsEnabled = input.promptsEnabled ?? current.prompt_definition_id !== null;
      const promptDefinitionId =
        promptsEnabled && current.prompt_definition_id === null
          ? (
              await settings.createPromptDefinition({
                name: promptNameForTaskKey(current.task_key),
                purpose: `Prompt for ${input.displayName ?? current.display_name}.`,
                body: promptText,
                outputSchema: input.promptUpdate?.outputSchema ?? {},
                contextConfig:
                  input.promptUpdate?.contextConfig ??
                  defaultPromptContextConfig(promptText, input.initialSystemMessage ?? defaultSystemMessage),
                actorUserId: actor.id
              })
            ).id
          : promptsEnabled
            ? current.prompt_definition_id
            : null;
      if (promptsEnabled && promptDefinitionId !== null && input.promptUpdate !== undefined) {
        const currentPrompt = await settings.getPromptById(promptDefinitionId);
        if (currentPrompt === null) {
          throw new HttpError(404, "not_found", "prompt_definition was not found.");
        }
        const currentPromptContext = normalizePromptContextConfig(
          currentPrompt.active_context_config,
          currentPrompt.active_body ?? ""
        );
        await settings.updateCurrentPrompt({
          promptDefinitionId,
          body: input.promptUpdate.body,
          outputSchema: input.promptUpdate.outputSchema,
          contextConfig: {
            ...currentPromptContext,
            ...input.promptUpdate.contextConfig,
            freeformText: input.promptUpdate.contextConfig.freeformText
          },
          actorUserId: actor.id
        });
      }
      await settings.updateAiTaskDefinition({
        taskDefinitionId,
        displayName: input.displayName,
        description: input.description,
        hookKey: input.hookKey,
        renderLocation: input.renderLocation,
        displayOrder: input.displayOrder,
        taskKind: taskKindRow.kind_key,
        taskKindId: taskKindRow.id,
        implemented: isHookImplemented(hookKey),
        promptDefinitionId,
        actorUserId: actor.id
      });
      const refreshed = await settings.findAiTaskRouteById(taskDefinitionId);
      if (refreshed === null) {
        throw new HttpError(404, "not_found", "ai_task_definition was not found.");
      }
      await validateAiTaskRouteUpdate(settings, refreshed, input, this.config);
      const providerConfig =
        registryProvider.provider === null
          ? null
          : await findEnabledProviderConfigForRegistryProvider(settings, registryProvider.provider);
      const task = await settings.updateAiTaskRoute({
        taskDefinitionId,
        ...input,
        providerConfigId: input.providerKey === undefined ? undefined : providerConfig?.id ?? null,
        registryProfileKey: registryProvider.registryProfileKey,
        providerKey: registryProvider.providerKey,
        actorUserId: actor.id
      });
      if (task === null) {
        throw new HttpError(404, "not_found", "ai_task_definition was not found.");
      }
      await audit.record({
        eventName: "ai_task_definition.updated",
        actor,
        subjectType: "ai_task_definition",
        subjectId: task.id,
        requestId,
        metadata: {
          taskKey: task.task_key,
          hookKey: task.hook_key,
          renderLocation: task.render_location,
          displayOrder: task.display_order,
          providerName: task.provider_name,
          enabled: task.route_enabled,
          promptsEnabled: task.prompt_definition_id !== null
        },
        redactionApplied: true
      });
      return { aiTask: serializeAiTaskRoute(task, this.config) };
    });
  }

  async deleteAiTaskDefinition(
    taskDefinitionId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const current = await settings.findAiTaskRouteById(taskDefinitionId);
      if (current === null) {
        throw new HttpError(404, "not_found", "ai_task_definition was not found.");
      }
      const deleted = await settings.deleteAiTaskDefinition(taskDefinitionId);
      if (!deleted) {
        throw new HttpError(404, "not_found", "ai_task_definition was not found.");
      }
      await audit.record({
        eventName: "ai_task_definition.deleted",
        actor,
        subjectType: "ai_task_definition",
        subjectId: current.id,
        requestId,
        metadata: {
          taskKey: current.task_key,
          hookKey: current.hook_key,
          promptsEnabled: current.prompt_definition_id !== null
        },
        redactionApplied: true
      });
      return { deleted: true, taskId: taskDefinitionId };
    });
  }

  async createAiTaskDefinition(
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = await parseCreateAiTaskBody(body, new SettingsRepository(this.db), this.config);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findAiTaskRoute(input.taskKey);
      if (existing !== null) {
        throw new HttpError(409, "ai_task_exists", "An AI task already exists for the derived task key.", {
          taskKey: input.taskKey,
          displayName: input.displayName
        });
      }
      const taskKind = await settings.findTaskKindByKey(input.taskKind);
      if (taskKind === null || taskKind.id !== input.taskKindId || !taskKind.active) {
        throw new HttpError(400, "invalid_request", "taskKind must reference an active configured task kind.");
      }
      const prompt =
        input.promptsEnabled
          ? await settings.createPromptDefinition({
              name: promptNameForTaskKey(input.taskKey),
              purpose: `Prompt for ${input.displayName}.`,
              body: input.initialPromptText,
              outputSchema: {},
              contextConfig: input.initialPromptContextConfig,
              actorUserId: actor.id
            })
          : null;
      const task = await settings.createAiTaskDefinition({
        ...input,
        promptDefinitionId: prompt?.id ?? null,
        actorUserId: actor.id
      });
      await validateAiTaskRouteUpdate(settings, task, { enabled: input.routeEnabled }, this.config);
      await audit.record({
        eventName: "ai_task_definition.created",
        actor,
        subjectType: "ai_task_definition",
        subjectId: task.id,
        requestId,
        metadata: {
          taskKey: task.task_key,
          hookKey: task.hook_key,
          renderLocation: task.render_location,
          displayOrder: task.display_order,
          taskKind: task.task_kind,
          providerName: task.provider_name,
          implemented: isHookImplemented(task.hook_key),
          promptsEnabled: task.prompt_definition_id !== null,
          enabled: task.route_enabled
        },
        redactionApplied: true
      });
      return { aiTask: serializeAiTaskRoute(task, this.config) };
    });
  }

  async createProcessingHook(
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseProcessingHookBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const created = await settings.createProcessingHook({ hookKey: input.hookKey, actorUserId: actor.id });
      if (created === null) {
        throw new HttpError(409, "processing_hook_exists", "A processing hook already exists for this hook key.", {
          hookKey: input.hookKey
        });
      }
      await audit.record({
        eventName: "processing_hook.created",
        actor,
        subjectType: "processing_hook",
        subjectId: created.hook_key,
        requestId,
        metadata: { hookKey: created.hook_key },
        redactionApplied: true
      });
      return { processingHook: serializeRegisteredTaskHook(created) };
    });
  }

  async deleteProcessingHook(
    hookKeyValue: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const hookKey = parseConfigKey(hookKeyValue, "hookKey");
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const current = await settings.findProcessingHook(hookKey);
      if (current === null) {
        throw new HttpError(404, "not_found", "processing_hook was not found.");
      }
      const taskUsageCount = toInteger(current.task_usage_count);
      if (taskUsageCount > 0) {
        throw new HttpError(409, "processing_hook_in_use", "Processing hook cannot be deleted while configured tasks use it.", {
          hookKey,
          taskUsageCount
        });
      }
      const deleted = await settings.deleteProcessingHook(hookKey);
      if (!deleted) {
        throw new HttpError(404, "not_found", "processing_hook was not found.");
      }
      await audit.record({
        eventName: "processing_hook.deleted",
        actor,
        subjectType: "processing_hook",
        subjectId: hookKey,
        requestId,
        metadata: { hookKey },
        redactionApplied: true
      });
      return { deleted: true, hookKey };
    });
  }

  async createFileType(
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseCreateFileTypeBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findFileTypeByExtension(input.extension);
      if (existing !== null) {
        throw new HttpError(409, "file_type_exists", "A file type setting already exists for this extension.");
      }
      await validateMediaParserSelection(settings, input.mediaKind, input.parserKey);
      const fileType = await settings.createFileType({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "file_type_settings.created",
        actor,
        subjectType: "file_type_settings",
        subjectId: fileType.id,
        requestId,
        metadata: {
          extension: fileType.extension,
          mediaKind: fileType.media_kind,
          capabilityState: fileType.capability_state,
          parserKey: fileType.parser_key
        }
      });
      return { fileType: serializeFileType(fileType) };
    });
  }

  async updateFileType(
    fileTypeId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseFileTypeBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const current = await settings.findFileTypeById(fileTypeId);
      if (current === null) {
        throw new HttpError(404, "not_found", "file_type_settings row was not found.");
      }
      const update = {
        mediaKind: input.mediaKind ?? current.media_kind,
        capabilityState: input.capabilityState ?? current.capability_state,
        parserKey: input.parserKey === undefined ? current.parser_key : input.parserKey
      };
      await validateMediaParserSelection(settings, update.mediaKind, update.parserKey);
      const fileType = await settings.updateFileType({ fileTypeId, ...update, actorUserId: actor.id });
      if (fileType === null) {
        throw new HttpError(404, "not_found", "file_type_settings row was not found.");
      }
      await audit.record({
        eventName: "file_type_settings.updated",
        actor,
        subjectType: "file_type_settings",
        subjectId: fileType.id,
        requestId,
        metadata: {
          extension: fileType.extension,
          mediaKind: fileType.media_kind,
          capabilityState: fileType.capability_state,
          parserKey: fileType.parser_key
        }
      });
      return { fileType: serializeFileType(fileType) };
    });
  }

  async deleteFileType(
    fileTypeId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const fileType = await settings.deleteFileType(fileTypeId);
      if (fileType === null) {
        throw new HttpError(404, "not_found", "file_type_settings row was not found.");
      }
      await audit.record({
        eventName: "file_type_settings.deleted",
        actor,
        subjectType: "file_type_settings",
        subjectId: fileType.id,
        requestId,
        metadata: serializeFileType(fileType)
      });
      return { deleted: true, fileType: serializeFileType(fileType) };
    });
  }

  async createMediaType(
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseMediaTypeBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findMediaTypeByKey(input.mediaKey);
      if (existing !== null) {
        throw new HttpError(409, "media_type_exists", "A media type already exists for this key.");
      }
      const mediaType = await settings.createMediaType({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "media_type_settings.created",
        actor,
        subjectType: "media_type_settings",
        subjectId: mediaType.id,
        requestId,
        metadata: serializeMediaType(mediaType)
      });
      return { mediaType: serializeMediaType(mediaType) };
    });
  }

  async updateMediaType(
    mediaTypeId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseMediaTypeBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findMediaTypeByKey(input.mediaKey);
      if (existing !== null && existing.id !== mediaTypeId) {
        throw new HttpError(409, "media_type_exists", "A media type already exists for this key.");
      }
      const mediaType = await settings.updateMediaType({ mediaTypeId, ...input, actorUserId: actor.id });
      if (mediaType === null) {
        throw new HttpError(404, "not_found", "media_type_settings row was not found.");
      }
      await audit.record({
        eventName: "media_type_settings.updated",
        actor,
        subjectType: "media_type_settings",
        subjectId: mediaType.id,
        requestId,
        metadata: serializeMediaType(mediaType)
      });
      return { mediaType: serializeMediaType(mediaType) };
    });
  }

  async deleteMediaType(
    mediaTypeId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const current = await settings.findMediaTypeById(mediaTypeId);
      if (current === null) {
        throw new HttpError(404, "not_found", "media_type_settings row was not found.");
      }
      const [fileTypeCount, parserTypeCount] = await Promise.all([
        settings.countFileTypesForMediaKey(current.media_key),
        settings.countParserTypesForMediaKey(current.media_key)
      ]);
      if (fileTypeCount > 0 || parserTypeCount > 0) {
        throw new HttpError(
          409,
          "media_type_in_use",
          "Remove file type and parser type references before deleting this media type."
        );
      }
      const mediaType = await settings.deleteMediaType(mediaTypeId);
      if (mediaType === null) {
        throw new HttpError(404, "not_found", "media_type_settings row was not found.");
      }
      await audit.record({
        eventName: "media_type_settings.deleted",
        actor,
        subjectType: "media_type_settings",
        subjectId: mediaType.id,
        requestId,
        metadata: serializeMediaType(mediaType)
      });
      return { deleted: true, mediaType: serializeMediaType(mediaType) };
    });
  }

  async createParserType(
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseParserTypeBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findParserTypeByKey(input.parserKey);
      if (existing !== null) {
        throw new HttpError(409, "parser_type_exists", "A parser type already exists for this key.");
      }
      await requireMediaType(settings, input.mediaKey);
      const parserType = await settings.createParserType({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "parser_type_settings.created",
        actor,
        subjectType: "parser_type_settings",
        subjectId: parserType.id,
        requestId,
        metadata: serializeParserType(parserType)
      });
      return { parserType: serializeParserType(parserType) };
    });
  }

  async updateParserType(
    parserTypeId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseParserTypeBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findParserTypeByKey(input.parserKey);
      if (existing !== null && existing.id !== parserTypeId) {
        throw new HttpError(409, "parser_type_exists", "A parser type already exists for this key.");
      }
      await requireMediaType(settings, input.mediaKey);
      const parserType = await settings.updateParserType({ parserTypeId, ...input, actorUserId: actor.id });
      if (parserType === null) {
        throw new HttpError(404, "not_found", "parser_type_settings row was not found.");
      }
      await audit.record({
        eventName: "parser_type_settings.updated",
        actor,
        subjectType: "parser_type_settings",
        subjectId: parserType.id,
        requestId,
        metadata: serializeParserType(parserType)
      });
      return { parserType: serializeParserType(parserType) };
    });
  }

  async deleteParserType(
    parserTypeId: string,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const current = await settings.findParserTypeById(parserTypeId);
      if (current === null) {
        throw new HttpError(404, "not_found", "parser_type_settings row was not found.");
      }
      const fileTypeCount = await settings.countFileTypesForParserKey(current.parser_key);
      if (fileTypeCount > 0) {
        throw new HttpError(
          409,
          "parser_type_in_use",
          "Remove file type references before deleting this parser type."
        );
      }
      const parserType = await settings.deleteParserType(parserTypeId);
      if (parserType === null) {
        throw new HttpError(404, "not_found", "parser_type_settings row was not found.");
      }
      await audit.record({
        eventName: "parser_type_settings.deleted",
        actor,
        subjectType: "parser_type_settings",
        subjectId: parserType.id,
        requestId,
        metadata: serializeParserType(parserType)
      });
      return { deleted: true, parserType: serializeParserType(parserType) };
    });
  }

  async createPromptVersion(
    promptDefinitionId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const currentPrompt = await settings.getPromptById(promptDefinitionId);
      if (currentPrompt === null) {
        throw new HttpError(404, "not_found", "prompt_definition was not found.");
      }
      const input = parsePromptVersionBody(body, getPromptSystemMessageFallback(currentPrompt));
      const prompt = await settings.createPromptVersion({
        promptDefinitionId,
        body: input.body,
        outputSchema: input.outputSchema,
        contextConfig: input.contextConfig,
        actorUserId: actor.id
      });
      await audit.record({
        eventName: "prompt_version.created",
        actor,
        subjectType: "prompt_definition",
        subjectId: prompt.id,
        requestId,
        metadata: {
          name: prompt.name,
          activeVersion: prompt.active_version
        }
      });
      await audit.record({
        eventName: "prompt_definition.activated_version",
        actor,
        subjectType: "prompt_definition",
        subjectId: prompt.id,
        requestId,
        metadata: {
          name: prompt.name,
          activeVersion: prompt.active_version
        }
      });
      return {
        prompt: serializePrompt(prompt)
      };
    });
  }

  async updateCurrentPrompt(
    promptDefinitionId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const currentPrompt = await settings.getPromptById(promptDefinitionId);
      if (currentPrompt === null) {
        throw new HttpError(404, "not_found", "prompt_definition was not found.");
      }
      const input = parsePromptVersionBody(body, getPromptSystemMessageFallback(currentPrompt));
      const prompt = await settings.updateCurrentPrompt({
        promptDefinitionId,
        body: input.body,
        outputSchema: input.outputSchema,
        contextConfig: input.contextConfig,
        actorUserId: actor.id
      });
      if (prompt === null) {
        throw new HttpError(404, "not_found", "prompt_definition was not found.");
      }
      await audit.record({
        eventName: "prompt_definition.updated_current",
        actor,
        subjectType: "prompt_definition",
        subjectId: prompt.id,
        requestId,
        metadata: {
          name: prompt.name,
          activeVersion: prompt.active_version
        },
        redactionApplied: true
      });
      return { prompt: serializePrompt(prompt) };
    });
  }
}

function defaultExtractionSettings() {
  return {
    projectConfidenceThreshold: 0.65,
    contributorConfidenceThreshold: 0.7,
    tagConfidenceThreshold: 0.7,
    updatedAt: new Date(0).toISOString()
  };
}

interface ProviderRegistryResolution {
  selectedProviderProfileKey: string | null;
  bootstrapProfileKey: string | null;
  activeProfileKey: string | null;
  profileSource: "saved" | "env" | "none";
  updatedAt: string | null;
}

interface ProviderRegistryState {
  registry: {
    url: string;
    profile: string;
    configured: boolean;
    reachable: boolean;
    error: string | null;
  };
  providers: SharedProviderConfig[];
  settings: {
    registryUrl: string;
    bootstrapProfileKey: string | null;
    selectedProviderProfileKey: string | null;
    activeProfileKey: string | null;
    profileSource: "saved" | "env" | "none";
    profiles: SharedRegistryProfile[];
    activeProfile: SharedRegistryProfile | null;
    status: "ready" | "not_configured" | "missing_profile" | "error";
    error: string | null;
    providerCount: number;
    updatedAt: string | null;
  };
}

function resolveProviderRegistryProfile(
  config: ApiConfig,
  settings: ProviderRegistrySettingsRow | null
): ProviderRegistryResolution {
  const selectedProviderProfileKey = nullIfBlank(settings?.selected_provider_profile_key ?? null);
  const bootstrapProfileKey = nullIfBlank(config.invokeProviders.profile);
  const activeProfileKey = selectedProviderProfileKey ?? bootstrapProfileKey;
  return {
    selectedProviderProfileKey,
    bootstrapProfileKey,
    activeProfileKey,
    profileSource: selectedProviderProfileKey !== null ? "saved" : bootstrapProfileKey !== null ? "env" : "none",
    updatedAt: settings === null ? null : toIso(settings.updated_at)
  };
}

function configWithProviderRegistryProfile(config: ApiConfig, profileKey: string | null): ApiConfig {
  return {
    ...config,
    invokeProviders: {
      ...config.invokeProviders,
      profile: profileKey ?? ""
    }
  };
}

async function loadProviderRegistryState(
  config: ApiConfig,
  resolution: ProviderRegistryResolution
): Promise<ProviderRegistryState> {
  const registryUrl = config.invokeProviders.registryUrl.trim().replace(/\/$/, "");
  const profileList = await fetchRegistryProfiles(config);
  const baseSettings = {
    registryUrl,
    bootstrapProfileKey: resolution.bootstrapProfileKey,
    selectedProviderProfileKey: resolution.selectedProviderProfileKey,
    activeProfileKey: resolution.activeProfileKey,
    profileSource: resolution.profileSource,
    profiles: profileList.profiles,
    activeProfile: null as SharedRegistryProfile | null,
    providerCount: 0,
    updatedAt: resolution.updatedAt
  };
  const registryProfile = resolution.activeProfileKey ?? "";
  if (!profileList.registry.configured) {
    return {
      registry: {
        url: registryUrl,
        profile: registryProfile,
        configured: false,
        reachable: false,
        error: profileList.registry.error
      },
      providers: [],
      settings: {
        ...baseSettings,
        status: "error",
        error: profileList.registry.error
      }
    };
  }
  if (!profileList.registry.reachable) {
    return {
      registry: {
        url: registryUrl,
        profile: registryProfile,
        configured: registryProfile !== "",
        reachable: false,
        error: profileList.registry.error
      },
      providers: [],
      settings: {
        ...baseSettings,
        status: "error",
        error: profileList.registry.error
      }
    };
  }
  if (resolution.activeProfileKey === null) {
    return {
      registry: {
        url: registryUrl,
        profile: "",
        configured: false,
        reachable: false,
        error: "No registry profile is selected."
      },
      providers: [],
      settings: {
        ...baseSettings,
        status: "not_configured",
        error: "No registry profile is selected."
      }
    };
  }

  const activeProfile = await fetchRegistryProfile(config, resolution.activeProfileKey);
  if (!activeProfile.ok || activeProfile.profile === null) {
    return {
      registry: {
        url: registryUrl,
        profile: resolution.activeProfileKey,
        configured: true,
        reachable: false,
        error: activeProfile.error
      },
      providers: [],
      settings: {
        ...baseSettings,
        status: activeProfile.missing ? "missing_profile" : "error",
        error: activeProfile.error
      }
    };
  }

  const providerCatalog = await fetchRegistryProviders(config);
  if (!providerCatalog.registry.reachable) {
    return {
      registry: providerCatalog.registry,
      providers: [],
      settings: {
        ...baseSettings,
        activeProfile: activeProfile.profile,
        status: "error",
        error: providerCatalog.registry.error
      }
    };
  }

  return {
    registry: providerCatalog.registry,
    providers: providerCatalog.providers,
    settings: {
      ...baseSettings,
      activeProfile: activeProfile.profile,
      status: "ready",
      error: null,
      providerCount: providerCatalog.providers.length
    }
  };
}

function serializeMediaType(row: MediaTypeSettingRow): Record<string, unknown> {
  return {
    id: row.id,
    mediaKey: row.media_key,
    displayName: row.display_name,
    description: row.description,
    capabilityState: row.capability_state,
    updatedAt: toIso(row.updated_at)
  };
}

function serializeParserType(row: ParserTypeSettingRow): Record<string, unknown> {
  return {
    id: row.id,
    parserKey: row.parser_key,
    displayName: row.display_name,
    description: row.description,
    mediaKey: row.media_key,
    capabilityState: row.capability_state,
    updatedAt: toIso(row.updated_at)
  };
}

function serializeFileType(row: {
  id: string;
  extension: string;
  media_kind: string;
  capability_state: string;
  parser_key: string | null;
  updated_at: Date | string;
}): Record<string, unknown> {
  return {
    id: row.id,
    extension: row.extension,
    mediaKind: row.media_kind,
    capabilityState: row.capability_state,
    parserKey: row.parser_key,
    updatedAt: toIso(row.updated_at)
  };
}

function serializePrompt(prompt: PromptDefinitionRow): Record<string, unknown> {
  const contextConfig = normalizePromptContextConfig(prompt.active_context_config, prompt.active_body ?? "");
  return {
    id: prompt.id,
    name: prompt.name,
    purpose: prompt.purpose,
    activeVersion: prompt.active_version,
    activePromptVersionId: prompt.active_prompt_version_id,
    body: prompt.active_body,
    outputSchema: prompt.active_output_schema,
    contextConfig,
    retentionPolicy: prompt.retention_policy,
    updatedAt: toIso(prompt.updated_at)
  };
}

function serializeTaskKind(row: {
  id: string;
  kind_key: string;
  display_name: string;
  description: string | null;
  provider_kind: string;
  capability_key: string;
  prompt_fields_enabled: boolean;
  enabled: boolean;
  active: boolean;
  updated_at: Date | string;
}): Record<string, unknown> {
  return {
    id: row.id,
    kindKey: row.kind_key,
    displayName: row.display_name,
    description: row.description,
    providerKind: row.provider_kind,
    capabilityKey: normalizeCapabilityKey(row.capability_key),
    promptFieldsEnabled: row.prompt_fields_enabled,
    enabled: row.enabled,
    active: row.active,
    updatedAt: toIso(row.updated_at)
  };
}

function serializeProviderCapability(row: ProviderCapabilityRow): Record<string, unknown> {
  return {
    id: row.id,
    providerConfigId: row.provider_config_id,
    capabilityKey: normalizeCapabilityKey(row.capability_key),
    enabled: row.enabled,
    updatedAt: toIso(row.updated_at)
  };
}

function serializeRegisteredTaskHooks(
  hooks: ProcessingHookRow[],
  runtimeState?: { hooks?: Array<{ hookKey: string; implementationStatus: string; usageCount: number }> }
): Array<Record<string, unknown>> {
  const stateByHook = new Map((runtimeState?.hooks ?? []).map((hook) => [hook.hookKey, hook]));
  return hooks.map((hook) => serializeRegisteredTaskHook(hook, stateByHook.get(hook.hook_key)));
}

function serializeRegisteredTaskHook(
  hook: ProcessingHookRow,
  runtimeState?: { implementationStatus: string; usageCount: number } | undefined
): Record<string, unknown> {
  const implemented = runtimeState === undefined ? isHookImplemented(hook.hook_key) : runtimeState.implementationStatus === "implemented";
  const taskUsageCount = runtimeState === undefined ? toInteger(hook.task_usage_count) : runtimeState.usageCount;
  return {
    hookKey: hook.hook_key,
    displayName: humanizeKey(hook.hook_key),
    implemented,
    status: implemented ? "custom_function_implemented" : "default_noop",
    statusLabel: implemented ? "Custom function implemented" : "Default no-op",
    taskUsageCount,
    deletable: taskUsageCount === 0,
    deleteBlockedReason:
      taskUsageCount === 0
        ? null
        : `Hook is used by ${taskUsageCount} configured task${taskUsageCount === 1 ? "" : "s"}.`,
    createdAt: toIso(hook.created_at),
    updatedAt: toIso(hook.updated_at)
  };
}

function serializeProvider(
  provider: ProviderConfigRow,
  config: ApiConfig,
  capabilities: ProviderCapabilityRow[]
): Record<string, unknown> {
  const runtimeProvider =
    provider.provider_kind === "llm" ? config.llm.provider : config.transcription.provider;
  const runtimeModelName =
    provider.provider_kind === "llm" ? config.llm.modelName : config.transcription.modelName;
  const requiredSecretEnv = provider.required_secret_env;
  return {
    id: provider.id,
    providerKind: provider.provider_kind,
    providerName: provider.provider_name,
    displayName: provider.display_name ?? provider.provider_name,
    adapterKey: provider.adapter_key ?? provider.provider_name,
    enabled: provider.enabled,
    endpoint: provider.endpoint,
    endpointConfigured: provider.endpoint !== null && provider.endpoint.trim() !== "",
    modelName: provider.model_name,
    secretSource: provider.secret_source,
    requiredSecretEnv,
    externalSendEnabled: provider.external_send_enabled,
    capabilities: capabilities
      .filter((capability) => capability.provider_config_id === provider.id)
      .map((capability) => ({
        capabilityKey: normalizeCapabilityKey(capability.capability_key),
        enabled: capability.enabled
      })),
    secretConfigured: provider.secret_source === "environment" && secretConfigured(requiredSecretEnv, config),
    healthStatus: provider.health_status,
    runtimeProvider,
    runtimeModelName,
    runtimeProviderEnv: provider.runtime_provider_env,
    runtimeModelEnv: provider.runtime_model_env,
    runtimeEndpointEnv: provider.runtime_endpoint_env,
    runtimeConfiguration:
      provider.provider_kind === "transcription" && provider.provider_name === "whisper-cpp"
        ? {
            mode: config.whisperCpp.mode,
            binaryPath: config.whisperCpp.binaryPath,
            modelPathConfigured: config.whisperCpp.modelPath.trim() !== "",
            ffmpegPath: config.whisperCpp.ffmpegPath,
            language: config.whisperCpp.language,
            threads: config.whisperCpp.threads,
            timeoutMs: config.whisperCpp.timeoutMs
          }
        : null,
    lastHealthCheckAt: provider.last_health_check_at === null ? null : toIso(provider.last_health_check_at),
    updatedAt: toIso(provider.updated_at)
  };
}

function serializeAiTaskRoute(
  task: AiTaskRouteRow,
  config: ApiConfig,
  sharedReadiness?: { ready: boolean; reasons: Array<{ message: string }> } | undefined
): Record<string, unknown> {
  const runtime = runtimeForTaskRoute(task, config);
  const providerName = task.provider_key;
  const selectedModelName = task.provider_model_override ?? task.route_model_name ?? task.default_model_name;
  const hookImplemented = isHookImplemented(task.hook_key);
  const routeEnabled = task.route_enabled;
  const legacyRuntimeReady =
    providerName !== null &&
    hookImplemented &&
    routeEnabled;
  const legacyUnavailableReason =
    !hookImplemented
      ? "No app logic is registered for this hook."
      : !routeEnabled
        ? "Task route is disabled."
        : providerName === null
          ? "No provider is selected."
          : null;

  return {
    id: task.id,
    taskKey: task.task_key,
    displayName: task.display_name,
    description: task.description,
    hookKey: task.hook_key,
    renderLocation: task.render_location,
    displayOrder: task.display_order,
    taskKind: task.task_kind,
    taskKindId: task.task_kind_id,
    taskKindDisplayName: task.task_kind_display_name ?? humanizeKey(task.task_kind),
    taskKindProviderKind: task.task_kind_provider_kind ?? task.task_kind,
    taskKindCapabilityKey: task.task_kind_capability_key,
    promptFieldsEnabled: task.prompt_fields_enabled === true,
    hookImplemented,
    routeEnabled,
    runtimeOptionId: task.runtime_option_id,
    runtimeOptionPurpose: task.runtime_option_purpose,
    runtimeProviderEnv: task.runtime_provider_env,
    runtimeModelEnv: task.runtime_model_env,
    runtimeEndpointEnv: task.runtime_endpoint_env,
    registryProfileKey: task.registry_profile_key,
    registryProviderKey: task.provider_key,
    selectedProviderName: providerName,
    selectedProviderDisplayName: providerName,
    selectedModelName,
    providerModelOverride: task.provider_model_override,
    providerAdapterKey: null,
    providerExternalSendEnabled: false,
    providerSecretEnv: null,
    runtimeProvider: runtime.provider,
    runtimeModelName: runtime.modelName,
    runtimeEndpointConfigured: runtime.endpoint.trim() !== "",
    runtimeReady: sharedReadiness?.ready ?? legacyRuntimeReady,
    unavailableReason: sharedReadiness?.reasons[0]?.message ?? legacyUnavailableReason,
    readinessReasons: sharedReadiness?.reasons ?? [],
    prompt:
      task.prompt_definition_id === null
        ? null
        : serializeTaskPrompt({
            id: task.prompt_definition_id,
            name: task.prompt_name ?? task.task_key,
            purpose: task.prompt_purpose ?? "",
            active_version: task.prompt_active_version ?? 0,
            active_prompt_version_id: task.active_prompt_version_id,
            active_body: task.active_body,
            active_output_schema: task.active_output_schema,
            active_context_config: task.active_context_config,
            retention_policy: task.prompt_retention_policy ?? "retain_active_and_referenced",
            updated_at: task.updated_at
          }),
    updatedAt: toIso(task.updated_at)
  };
}

function serializeTaskPrompt(prompt: PromptDefinitionRow): Record<string, unknown> {
  const contextConfig = normalizePromptContextConfig(prompt.active_context_config, prompt.active_body ?? "");
  return {
    id: prompt.id,
    name: prompt.name,
    purpose: prompt.purpose,
    activeVersion: prompt.active_version,
    activePromptVersionId: prompt.active_prompt_version_id,
    body: prompt.active_body,
    outputSchema: prompt.active_output_schema ?? {},
    contextConfig,
    retentionPolicy: prompt.retention_policy,
    updatedAt: toIso(prompt.updated_at)
  };
}

function serializeAppLauncherRuntimeOptions(providers: ProviderConfigRow[], config: ApiConfig): Record<string, unknown> {
  return {
    manifestVersion: "1.2.0",
    minLauncherVersion: "1.2.0",
    runtimeOptionsPresent: true,
    nativeLaunchTarget: "executablePath",
    secretEnvironmentNames: Array.from(
      new Set(
        providers
          .map((provider) => provider.required_secret_env)
          .filter((value): value is string => value !== null && value.trim() !== "")
      )
    ),
    llmRuntime: {
      provider: config.llm.provider,
      modelName: config.llm.modelName,
      endpointConfigured: config.llm.endpoint.trim() !== "",
      ready: config.llm.provider !== "disabled"
    },
    restartRequiredAfterChange: true
  };
}

function runtimeForTaskRoute(
  task: Pick<
    AiTaskRouteRow,
    "task_kind" | "task_kind_provider_kind" | "route_model_name" | "default_model_name" | "endpoint"
  >,
  config: ApiConfig
): { provider: string; modelName: string; endpoint: string; label: string } {
  const requiredProviderKind = task.task_kind_provider_kind ?? task.task_kind;
  if (requiredProviderKind === "llm") {
    return {
      provider: config.llm.provider,
      modelName: config.llm.modelName,
      endpoint: config.llm.endpoint,
      label: "LLM"
    };
  }
  if (requiredProviderKind === "transcription" || requiredProviderKind === "stt") {
    return {
      provider: config.transcription.provider,
      modelName: config.transcription.modelName,
      endpoint: "",
      label: "transcription"
    };
  }
  return {
    provider: "disabled",
    modelName: task.route_model_name ?? task.default_model_name ?? "",
    endpoint: "",
    label: requiredProviderKind
  };
}

function secretConfigured(requiredSecretEnv: string | null, config: ApiConfig): boolean {
  return isSecretAvailable(requiredSecretEnv ?? undefined, config);
}

function parseExtractionBody(body: unknown) {
  const record = parseObject(body);
  return {
    projectConfidenceThreshold: parseThreshold(record.projectConfidenceThreshold, "projectConfidenceThreshold"),
    contributorConfidenceThreshold: parseThreshold(
      record.contributorConfidenceThreshold,
      "contributorConfidenceThreshold"
    ),
    tagConfidenceThreshold: parseThreshold(record.tagConfidenceThreshold, "tagConfidenceThreshold")
  };
}

function parseCreateTaskKindBody(body: unknown) {
  const record = parseObject(body);
  const displayName = assertNonEmptyString(record.displayName, "displayName");
  const promptFieldsEnabled = parseOptionalBoolean(record.promptFieldsEnabled, "promptFieldsEnabled") ?? false;
  const enabled = parseOptionalBoolean(record.enabled, "enabled") ?? false;
  return {
    kindKey: deriveTaskKey(displayName),
    displayName,
    description: record.description === undefined ? null : optionalString(record.description, "description"),
    providerKind: parseConfigKey(record.providerKind, "providerKind"),
    capabilityKey: parseConfigKey(record.capabilityKey, "capabilityKey"),
    promptFieldsEnabled,
    enabled
  };
}

function parseUpdateTaskKindBody(body: unknown) {
  const record = parseObject(body);
  return {
    displayName:
      record.displayName === undefined ? undefined : assertNonEmptyString(record.displayName, "displayName"),
    description: record.description === undefined ? undefined : optionalString(record.description, "description"),
    providerKind: record.providerKind === undefined ? undefined : parseConfigKey(record.providerKind, "providerKind"),
    capabilityKey:
      record.capabilityKey === undefined ? undefined : parseConfigKey(record.capabilityKey, "capabilityKey"),
    promptFieldsEnabled: parseOptionalBoolean(record.promptFieldsEnabled, "promptFieldsEnabled"),
    enabled: parseOptionalBoolean(record.enabled, "enabled"),
    active: parseOptionalBoolean(record.active, "active")
  };
}

function parseAiTaskRouteBody(body: unknown) {
  const record = parseObject(body);
  const enabled = record.enabled;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new HttpError(400, "invalid_request", "enabled must be a boolean.");
  }
  return {
    registryProfileKey: record.registryProfileKey === undefined ? undefined : optionalString(record.registryProfileKey, "registryProfileKey"),
    providerKey: record.providerKey === undefined ? undefined : optionalString(record.providerKey, "providerKey"),
    modelName: record.modelName === undefined ? undefined : optionalString(record.modelName, "modelName"),
    enabled
  };
}

function parseAdapterDiagnosticBody(body: unknown) {
  const record = parseObject(body);
  return {
    providerKey: assertNonEmptyString(record.providerKey, "providerKey"),
    taskKey: assertNonEmptyString(record.taskKey, "taskKey"),
    input: record.input
  };
}

function parseQueryLimit(value: string | null): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new HttpError(400, "invalid_request", "limit must be an integer.");
  }
  return parsed;
}

function parseOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new HttpError(400, "invalid_request", `${field} must be a boolean.`);
  }
  return value;
}

function parseTaskRenderLocation(value: unknown, field: string): string {
  if (typeof value !== "string" || !TASK_RENDER_LOCATIONS.has(value)) {
    throw new HttpError(400, "invalid_request", `${field} must be work_item_detail, work_item_list, or export_page.`);
  }
  return value;
}

function parseDisplayOrder(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, "invalid_request", `${field} must be an integer.`);
  }
  return value;
}

async function validateTaskKindEnablement(
  settings: SettingsRepository,
  kindKey: string,
  enabled: boolean | undefined
): Promise<void> {
  if (enabled !== true) {
    return;
  }
  if (await settings.taskKindHasImplementedRoute(kindKey, [...IMPLEMENTED_AI_TASK_HOOKS])) {
    return;
  }
  throw new HttpError(
    409,
    "task_kind_route_not_implemented",
    "Task kind cannot be enabled until a protected task route is implemented.",
    { kindKey }
  );
}

async function resolveRegistryProviderForTaskRoute(
  settings: SettingsRepository,
  current: Pick<AiTaskRouteRow, "registry_profile_key" | "provider_key"> | null,
  input: {
    registryProfileKey?: string | null | undefined;
    providerKey?: string | null | undefined;
  },
  config: ApiConfig
): Promise<{
  registryProfileKey: string | null;
  providerKey: string | null;
  provider: SharedProviderConfig | null;
}> {
  const registrySettings = await settings.getProviderRegistrySettings();
  const resolution = resolveProviderRegistryProfile(config, registrySettings);
  const providerKey =
    input.providerKey === undefined
      ? nullIfBlank(current?.provider_key ?? null)
      : nullIfBlank(input.providerKey);
  const registryProfileKey =
    input.registryProfileKey === undefined
      ? nullIfBlank(current?.registry_profile_key ?? null) ?? resolution.activeProfileKey
      : nullIfBlank(input.registryProfileKey) ?? resolution.activeProfileKey;
  if (providerKey === null) {
    return { registryProfileKey, providerKey, provider: null };
  }
  if (registryProfileKey === null) {
    throw new HttpError(
      400,
      "provider_registry_profile_missing",
      "A provider registry profile is required before selecting a provider."
    );
  }
  const registry = await loadProviderRegistryState(
    configWithProviderRegistryProfile(config, registryProfileKey),
    {
      ...resolution,
      activeProfileKey: registryProfileKey
    }
  );
  if (registry.settings.status !== "ready") {
    throw new HttpError(
      409,
      "provider_registry_unavailable",
      registry.settings.error ?? "Provider registry is not ready.",
      { registryProfileKey }
    );
  }
  const provider = registry.providers.find((candidate) => candidate.providerKey === providerKey) ?? null;
  if (provider === null) {
    throw new HttpError(400, "invalid_request", "providerKey must reference a provider in the active registry profile.", {
      providerKey,
      registryProfileKey
    });
  }
  return { registryProfileKey, providerKey, provider };
}

async function validateAiTaskRouteUpdate(
  settings: SettingsRepository,
  current: AiTaskRouteRow,
  input: {
    registryProfileKey?: string | null | undefined;
    providerKey?: string | null | undefined;
    modelName?: string | null | undefined;
    enabled?: boolean | undefined;
  },
  config: ApiConfig
): Promise<void> {
  const nextEnabled = input.enabled ?? current.route_enabled;
  if (!nextEnabled) {
    return;
  }
  if (!isHookImplemented(current.hook_key)) {
    throw new HttpError(409, "ai_task_hook_not_implemented", "Task route cannot be enabled until app hook logic exists.");
  }
  const selection = await resolveRegistryProviderForTaskRoute(settings, current, input, config);
  if (selection.providerKey === null) {
    throw new HttpError(409, "ai_task_provider_missing", "Task route cannot be enabled without a provider.");
  }
  if (selection.provider === null) {
    throw new HttpError(400, "invalid_request", "providerKey must reference an enabled registry provider.");
  }
  const requiredProviderKind = current.task_kind_provider_kind ?? current.task_kind;
  if (selection.provider.providerKind !== requiredProviderKind) {
    throw new HttpError(400, "provider_incompatible", "Selected provider kind is not compatible with this task kind.", {
      providerKind: selection.provider.providerKind,
      requiredProviderKind
    });
  }
  const capabilityKey = current.task_kind_capability_key;
  if (
    capabilityKey !== null &&
    !selection.provider.capabilities.some((capability) => capability.key === normalizeCapabilityKey(capabilityKey))
  ) {
    throw new HttpError(400, "provider_incompatible", "Selected provider does not expose the task capability.", {
      providerKey: selection.provider.providerKey,
      capabilityKey
    });
  }
  if (!selection.provider.enabled) {
    throw new HttpError(409, "provider_disabled", "Task route cannot be enabled with a disabled provider.");
  }
  const providerConfig = await requireEnabledProviderConfigForRegistryProvider(settings, selection.provider);
  const requiredSecretEnv = selection.provider.requiredSecretRef ?? providerConfig.required_secret_env ?? null;
  if (!secretConfigured(requiredSecretEnv, config)) {
    throw new HttpError(409, "provider_secret_missing", "Task route cannot be enabled until the required secret is configured.", {
      requiredSecretEnv
    });
  }
}

async function findEnabledProviderConfigForRegistryProvider(
  settings: SettingsRepository,
  provider: SharedProviderConfig
): Promise<ProviderConfigRow | null> {
  const providerName = runtimeProviderNameForRegistryProvider(provider);
  if (providerName === null) {
    return null;
  }
  return await settings.findEnabledProvider(providerConfigKindForRegistryProvider(provider.providerKind), providerName);
}

async function requireEnabledProviderConfigForRegistryProvider(
  settings: SettingsRepository,
  provider: SharedProviderConfig
): Promise<ProviderConfigRow> {
  const providerConfig = await findEnabledProviderConfigForRegistryProvider(settings, provider);
  if (providerConfig !== null) {
    return providerConfig;
  }
  throw new HttpError(
    409,
    "provider_adapter_unavailable",
    "Task route cannot be enabled until the selected provider has a supported Memo Capture adapter.",
    {
      providerKey: provider.providerKey,
      adapterKey: provider.adapterKey
    }
  );
}

function providerConfigKindForRegistryProvider(providerKind: SharedProviderConfig["providerKind"]): string {
  return providerKind === "stt" ? "transcription" : providerKind;
}

function runtimeProviderNameForRegistryProvider(provider: SharedProviderConfig): string | null {
  const adapterKey = provider.adapterKey;
  const providerKey = provider.providerKey;
  if (
    adapterKey === "local-dev" ||
    adapterKey === "deterministic-llm" ||
    adapterKey === "deterministic-local-dev" ||
    providerKey === "local-dev" ||
    providerKey === "deterministic-local-dev"
  ) {
    return "local-dev";
  }
  if (
    adapterKey === "openai-compatible" ||
    adapterKey === "openai-compatible-local" ||
    adapterKey === "openai-compatible-cloud" ||
    providerKey === "openai-compatible" ||
    providerKey === "openai-compatible-local" ||
    providerKey === "openai-compatible-cloud"
  ) {
    return "openai-compatible";
  }
  if (adapterKey === "whisper-cpp" || adapterKey === "whisper-cpp-local" || providerKey === "whisper-cpp-local") {
    return "whisper-cpp";
  }
  if (adapterKey === "codex-cli" || providerKey === "codex-cli-local") {
    return "codex-cli";
  }
  return null;
}

async function parseCreateAiTaskBody(body: unknown, settings: SettingsRepository, config: ApiConfig) {
  const record = parseObject(body);
  const displayName = assertNonEmptyString(record.displayName, "displayName");
  const taskKey = deriveTaskKey(displayName);
  const hookKey = parseConfigKey(record.hookKey ?? taskKey, "hookKey");
  await ensureProcessingHookExists(settings, hookKey);
  const registryProfileKey =
    record.registryProfileKey === undefined ? undefined : optionalString(record.registryProfileKey, "registryProfileKey");
  const providerKey = record.providerKey === undefined ? undefined : optionalString(record.providerKey, "providerKey");
  const registryProvider = await resolveRegistryProviderForTaskRoute(
    settings,
    null,
    { registryProfileKey, providerKey },
    config
  );
  const taskKind =
    record.taskKind === undefined
      ? registryProvider.provider === null
        ? "llm"
        : (await findTaskKindForProvider(settings, registryProvider.provider.providerKind))?.kind_key
      : parseConfigKey(record.taskKind, "taskKind");
  if (taskKind === undefined) {
    throw new HttpError(400, "invalid_request", "Selected provider kind does not have an active task mapping.");
  }
  const taskKindRow = await settings.findTaskKindByKey(taskKind);
  if (taskKindRow === null || !taskKindRow.active) {
    throw new HttpError(400, "invalid_request", "taskKind must reference an active configured task kind.");
  }
  const routeEnabled = parseOptionalBoolean(record.enabled, "enabled") ?? false;
  const providerConfig =
    registryProvider.provider === null
      ? null
      : await findEnabledProviderConfigForRegistryProvider(settings, registryProvider.provider);
  return {
    taskKey,
    displayName,
    description: record.description === undefined ? null : optionalString(record.description, "description"),
    hookKey,
    renderLocation:
      record.renderLocation === undefined
        ? "work_item_detail"
        : parseTaskRenderLocation(record.renderLocation, "renderLocation"),
    displayOrder: record.displayOrder === undefined ? 0 : parseDisplayOrder(record.displayOrder, "displayOrder"),
    taskKind,
    taskKindId: taskKindRow.id,
    implemented: isHookImplemented(hookKey),
    promptDefinitionId: null,
    providerConfigId: providerConfig?.id ?? null,
    registryProfileKey: registryProvider.registryProfileKey,
    providerKey: registryProvider.providerKey,
    routeModelName:
      record.modelName === undefined
        ? registryProvider.provider?.model ?? null
        : optionalString(record.modelName, "modelName"),
    routeEnabled,
    promptsEnabled:
      parseOptionalBoolean(record.promptsEnabled ?? record.promptFieldsEnabled, "promptsEnabled") ??
      taskKindRow.prompt_fields_enabled,
    initialPromptText:
      record.initialPromptText === undefined
        ? `Return strict JSON for ${displayName}. Do not include prose outside JSON.`
        : assertNonEmptyString(record.initialPromptText, "initialPromptText"),
    initialPromptContextConfig: defaultPromptContextConfig(
      record.initialPromptText === undefined
        ? `Return strict JSON for ${displayName}. Do not include prose outside JSON.`
        : assertNonEmptyString(record.initialPromptText, "initialPromptText"),
      record.initialSystemMessage === undefined
        ? defaultSystemMessageForHook(hookKey)
        : assertString(record.initialSystemMessage, "initialSystemMessage"),
      {
        includeProjectSynopsis: parsePromptToggle(record.includeProjectSynopsis, "includeProjectSynopsis"),
        includeMemoMetadata: parsePromptToggle(record.includeMemoMetadata, "includeMemoMetadata"),
        includeMemoTranscriptText: parsePromptToggle(record.includeMemoTranscriptText, "includeMemoTranscriptText")
      }
    ),
    runtimeOptionId: "llm-runtime",
    runtimeOptionPurpose: "llm-runtime",
    runtimeProviderEnv: "LLM_PROVIDER",
    runtimeModelEnv: "LLM_MODEL",
    runtimeEndpointEnv: "LLM_ENDPOINT"
  };
}

async function ensureProcessingHookExists(settings: SettingsRepository, hookKey: string): Promise<void> {
  if ((await settings.findProcessingHook(hookKey)) !== null) {
    return;
  }
  throw new HttpError(400, "processing_hook_not_registered", "hookKey must reference a configured processing hook.", {
    hookKey
  });
}

function parseProcessingHookBody(body: unknown) {
  const record = parseObject(body);
  return {
    hookKey: parseConfigKey(record.hookKey, "hookKey")
  };
}

function parseUpdateAiTaskBody(body: unknown) {
  const record = parseObject(body);
  const route = parseAiTaskRouteBody(record);
  const promptFieldsPresent =
    record.freeformText !== undefined ||
    record.body !== undefined ||
    record.systemMessage !== undefined ||
    record.outputSchema !== undefined ||
    record.includeProjectSynopsis !== undefined ||
    record.includeMemoMetadata !== undefined ||
    record.includeMemoTranscriptText !== undefined;
  return {
    displayName:
      record.displayName === undefined ? undefined : assertNonEmptyString(record.displayName, "displayName"),
    description: record.description === undefined ? undefined : optionalString(record.description, "description"),
    hookKey: record.hookKey === undefined ? undefined : parseConfigKey(record.hookKey, "hookKey"),
    renderLocation:
      record.renderLocation === undefined
        ? undefined
        : parseTaskRenderLocation(record.renderLocation, "renderLocation"),
    displayOrder: record.displayOrder === undefined ? undefined : parseDisplayOrder(record.displayOrder, "displayOrder"),
    promptsEnabled: parseOptionalBoolean(record.promptsEnabled ?? record.promptFieldsEnabled, "promptsEnabled"),
    initialPromptText:
      record.initialPromptText === undefined ? undefined : assertNonEmptyString(record.initialPromptText, "initialPromptText"),
    initialSystemMessage:
      record.initialSystemMessage === undefined
        ? undefined
        : assertString(record.initialSystemMessage, "initialSystemMessage"),
    promptUpdate: promptFieldsPresent ? parsePromptVersionBody(record, DEFAULT_LLM_SYSTEM_MESSAGE, true) : undefined,
    ...route
  };
}

async function findTaskKindForProvider(settings: SettingsRepository, providerKind: string) {
  const normalizedProviderKind = providerKind === "stt" ? "transcription" : providerKind;
  const candidates = await settings.listTaskKinds();
  return (
    candidates.find((candidate) => candidate.active && candidate.provider_kind === normalizedProviderKind) ??
    candidates.find((candidate) => candidate.active && candidate.kind_key === normalizedProviderKind) ??
    null
  );
}

function deriveTaskKey(displayName: string): string {
  const taskKey = displayName
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  if (taskKey === "") {
    throw new HttpError(400, "invalid_request", "displayName must contain letters or numbers.");
  }
  return taskKey;
}

function promptNameForTaskKey(taskKey: string): string {
  return `task_${taskKey.replace(/[^a-z0-9]+/g, "_")}`;
}

function defaultPromptContextConfig(
  freeformText: string,
  systemMessage?: string,
  toggles: {
    includeProjectSynopsis?: boolean;
    includeMemoMetadata?: boolean;
    includeMemoTranscriptText?: boolean;
  } = {}
): Record<string, unknown> {
  return {
    freeformText,
    systemMessage: systemMessage ?? DEFAULT_LLM_SYSTEM_MESSAGE,
    includeProjectSynopsis: toggles.includeProjectSynopsis ?? true,
    includeMemoMetadata: toggles.includeMemoMetadata ?? true,
    includeMemoTranscriptText: toggles.includeMemoTranscriptText ?? true
  };
}

function defaultSystemMessageForHook(hookKey: string): string {
  return DEFAULT_LLM_SYSTEM_MESSAGES_BY_HOOK[hookKey] ?? DEFAULT_LLM_SYSTEM_MESSAGE;
}

function humanizeKey(value: string): string {
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isHookImplemented(hookKey: string): boolean {
  return IMPLEMENTED_AI_TASK_HOOKS.has(hookKey);
}

function parseTranscriptionBody(body: unknown) {
  const record = parseObject(body);
  const maxRetryAttempts = record.maxRetryAttempts;
  if (
    typeof maxRetryAttempts !== "number" ||
    !Number.isInteger(maxRetryAttempts) ||
    maxRetryAttempts < 0 ||
    maxRetryAttempts > 10
  ) {
    throw new HttpError(400, "invalid_request", "maxRetryAttempts must be an integer from 0 to 10.");
  }
  return { maxRetryAttempts };
}

function parseProviderRegistryBody(body: unknown) {
  const record = parseObject(body);
  if (!Object.prototype.hasOwnProperty.call(record, "selectedProviderProfileKey")) {
    throw new HttpError(400, "invalid_request", "selectedProviderProfileKey is required.");
  }
  return {
    selectedProviderProfileKey: optionalString(record.selectedProviderProfileKey, "selectedProviderProfileKey")
  };
}

function parseFileTypeBody(body: unknown) {
  const record = parseObject(body);
  if (typeof record.active === "boolean") {
    return { capabilityState: record.active ? "active" : "inactive" };
  }
  return {
    mediaKind: record.mediaKind === undefined ? undefined : parseConfigKey(record.mediaKind, "mediaKind"),
    capabilityState:
      record.capabilityState === undefined ? undefined : parseCapabilityState(record.capabilityState),
    parserKey: record.parserKey === undefined ? undefined : parseParserKey(record.parserKey)
  };
}

function parseCreateFileTypeBody(body: unknown) {
  const record = parseObject(body);
  const extension = normalizeExtension(assertNonEmptyString(record.extension, "extension"));
  const mediaKind = parseConfigKey(record.mediaKind, "mediaKind");
  const capabilityState =
    typeof record.active === "boolean"
      ? record.active ? "active" : "inactive"
      : record.capabilityState === undefined
        ? "inactive"
        : parseCapabilityState(record.capabilityState);
  const parserKey = parseParserKey(record.parserKey);
  return { extension, mediaKind, capabilityState, parserKey };
}

function parseMediaTypeBody(body: unknown) {
  const record = parseObject(body);
  return {
    mediaKey: parseConfigKey(record.mediaKey, "mediaKey"),
    displayName: assertNonEmptyString(record.displayName, "displayName"),
    description: record.description === undefined ? null : optionalString(record.description, "description"),
    capabilityState: parseCapabilityState(record.capabilityState)
  };
}

function parseParserTypeBody(body: unknown) {
  const record = parseObject(body);
  return {
    parserKey: parseConfigKey(record.parserKey, "parserKey"),
    displayName: assertNonEmptyString(record.displayName, "displayName"),
    description: record.description === undefined ? null : optionalString(record.description, "description"),
    mediaKey: parseConfigKey(record.mediaKey, "mediaKey"),
    capabilityState: parseCapabilityState(record.capabilityState)
  };
}

function normalizeExtension(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\.+/, "");
  const extension = `.${normalized}`;
  if (!/^\.[a-z0-9][a-z0-9_-]{0,31}$/.test(extension)) {
    throw new HttpError(
      400,
      "invalid_request",
      "extension must be one file extension such as .txt, .md, or .mp3."
    );
  }
  return extension;
}

function parseParserKey(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_request", "parserKey must be a string when provided.");
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed === "" || trimmed === "none") {
    return null;
  }
  return parseConfigKey(trimmed, "parserKey");
}

function parseConfigKey(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_request", `${field} must be a string.`);
  }
  const parserKey = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(parserKey)) {
    throw new HttpError(400, "invalid_request", `${field} contains unsupported characters.`);
  }
  return parserKey;
}

function parseCapabilityState(value: unknown): string {
  const capabilityState = assertNonEmptyString(value, "capabilityState");
  if (!["active", "inactive", "not_supported_yet"].includes(capabilityState)) {
    throw new HttpError(
      400,
      "invalid_request",
      "capabilityState must be active, inactive, or not_supported_yet."
    );
  }
  return capabilityState;
}

async function requireMediaType(settings: SettingsRepository, mediaKey: string): Promise<MediaTypeSettingRow> {
  const mediaType = await settings.findMediaTypeByKey(mediaKey);
  if (mediaType === null) {
    throw new HttpError(400, "invalid_request", "mediaKind must reference a configured media type.");
  }
  return mediaType;
}

async function validateMediaParserSelection(
  settings: SettingsRepository,
  mediaKey: string,
  parserKey: string | null
): Promise<void> {
  await requireMediaType(settings, mediaKey);
  if (parserKey === null) {
    return;
  }
  const parserType = await settings.findParserTypeByKey(parserKey);
  if (parserType === null) {
    throw new HttpError(400, "invalid_request", "parserKey must reference a configured parser type.");
  }
  if (parserType.media_key !== mediaKey) {
    throw new HttpError(400, "invalid_request", "parserKey is not compatible with the selected media type.");
  }
}

function parsePromptVersionBody(
  body: unknown,
  fallbackSystemMessage = DEFAULT_LLM_SYSTEM_MESSAGE,
  preserveMissingSystemMessage = false
) {
  const record = parseObject(body);
  const outputSchema = record.outputSchema ?? {};
  if (outputSchema === null || typeof outputSchema !== "object" || Array.isArray(outputSchema)) {
    throw new HttpError(400, "invalid_request", "outputSchema must be an object.");
  }
  const freeformText =
    record.freeformText === undefined
      ? assertNonEmptyString(record.body, "body")
      : assertNonEmptyString(record.freeformText, "freeformText");
  const systemMessage =
    record.systemMessage === undefined
      ? preserveMissingSystemMessage
        ? undefined
        : fallbackSystemMessage
      : assertString(record.systemMessage, "systemMessage");
  const contextConfig = {
    freeformText,
    ...(systemMessage === undefined ? {} : { systemMessage }),
    includeProjectSynopsis: parsePromptToggle(record.includeProjectSynopsis, "includeProjectSynopsis"),
    includeMemoMetadata: parsePromptToggle(record.includeMemoMetadata, "includeMemoMetadata"),
    includeMemoTranscriptText: parsePromptToggle(record.includeMemoTranscriptText, "includeMemoTranscriptText")
  };
  return {
    body: freeformText,
    outputSchema: outputSchema as Record<string, unknown>,
    contextConfig
  };
}

function parsePromptToggle(value: unknown, field: string): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "boolean") {
    throw new HttpError(400, "invalid_request", `${field} must be a boolean.`);
  }
  return value;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_request", `${field} must be a string.`);
  }
  return value;
}

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function getPromptSystemMessageFallback(prompt: PromptDefinitionRow): string {
  return normalizePromptContextConfig(prompt.active_context_config, prompt.active_body ?? "").systemMessage;
}

function parseThreshold(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new HttpError(400, "invalid_request", `${field} must be a number from 0 to 1.`);
  }
  return value;
}

function parseObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "invalid_request", "Request body must be an object.");
  }
  return body as Record<string, unknown>;
}

function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

function toInteger(value: string | number): number {
  return Math.trunc(toNumber(value));
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
