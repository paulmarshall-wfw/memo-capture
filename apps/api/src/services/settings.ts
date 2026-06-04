import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import type { AppUserRecord } from "../repositories/rows.js";
import {
  SettingsRepository,
  type AiTaskRouteRow,
  type MediaTypeSettingRow,
  type ParserTypeSettingRow,
  type PromptDefinitionRow,
  type ProviderConfigRow
} from "../repositories/settings.js";
import { HttpError, assertNonEmptyString, optionalString } from "./errors.js";
import { normalizePromptContextConfig } from "./llm.js";

export class SettingsService {
  constructor(
    private readonly db: Database,
    private readonly config: ApiConfig
  ) {}

  async getSummary(): Promise<Record<string, unknown>> {
    const settings = new SettingsRepository(this.db);
    const [mediaTypes, parserTypes, fileTypes, extraction, transcription, providers, aiTasks, prompts] = await Promise.all([
      settings.listMediaTypes(),
      settings.listParserTypes(),
      settings.listFileTypes(),
      settings.getExtractionSettings(),
      settings.getTranscriptionSettings(),
      settings.listProviders(),
      settings.listAiTaskRoutes(),
      settings.listPrompts()
    ]);

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
      providers: providers.map((provider) => serializeProvider(provider, this.config)),
      aiTasks: aiTasks.map((task) => serializeAiTaskRoute(task, this.config)),
      appLauncher: serializeAppLauncherRuntimeOptions(aiTasks),
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

  async updateProvider(
    providerId: string,
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseProviderBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const provider = await settings.updateProvider({ providerId, ...input, actorUserId: actor.id });
      if (provider === null) {
        throw new HttpError(404, "not_found", "provider_config was not found.");
      }
      await audit.record({
        eventName: "provider_config.updated",
        actor,
        subjectType: "provider_config",
        subjectId: provider.id,
        requestId,
        metadata: {
          providerKind: provider.provider_kind,
          providerName: provider.provider_name,
          enabled: provider.enabled,
          endpointConfigured: provider.endpoint !== null,
          modelName: provider.model_name
        },
        redactionApplied: true
      });
      return { provider: serializeProvider(provider, this.config) };
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
      const task = await settings.updateAiTaskRoute({ taskDefinitionId, ...input, actorUserId: actor.id });
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
          providerName: task.provider_name,
          enabled: task.route_enabled,
          modelName: task.route_model_name
        },
        redactionApplied: true
      });
      return { aiTask: serializeAiTaskRoute(task, this.config) };
    });
  }

  async createAiTaskDefinition(
    body: unknown,
    actor: AppUserRecord,
    requestId: string
  ): Promise<Record<string, unknown>> {
    const input = parseCreateAiTaskBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
      const existing = await settings.findAiTaskRoute(input.taskKey);
      if (existing !== null) {
        throw new HttpError(409, "ai_task_exists", "An AI task already exists for this task key.");
      }
      const task = await settings.createAiTaskDefinition({ ...input, actorUserId: actor.id });
      await audit.record({
        eventName: "ai_task_definition.created",
        actor,
        subjectType: "ai_task_definition",
        subjectId: task.id,
        requestId,
        metadata: {
          taskKey: task.task_key,
          hookKey: task.hook_key,
          taskKind: task.task_kind,
          implemented: task.implemented
        },
        redactionApplied: true
      });
      return { aiTask: serializeAiTaskRoute(task, this.config) };
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
    const input = parsePromptVersionBody(body);
    return this.db.transaction(async (client) => {
      const settings = new SettingsRepository(client);
      const audit = new AuditRepository(client);
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
}

function defaultExtractionSettings() {
  return {
    projectConfidenceThreshold: 0.65,
    contributorConfidenceThreshold: 0.7,
    tagConfidenceThreshold: 0.7,
    updatedAt: new Date(0).toISOString()
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

function serializeProvider(provider: ProviderConfigRow, config: ApiConfig): Record<string, unknown> {
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
    endpointConfigured: provider.endpoint !== null && provider.endpoint.trim() !== "",
    modelName: provider.model_name,
    secretSource: provider.secret_source,
    requiredSecretEnv,
    externalSendEnabled: provider.external_send_enabled,
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

function serializeAiTaskRoute(task: AiTaskRouteRow, config: ApiConfig): Record<string, unknown> {
  const runtime = config.llmTasks[task.task_key] ?? {
    provider: "disabled",
    modelName: task.route_model_name ?? task.default_model_name ?? "",
    endpoint: ""
  };
  const providerName = task.provider_name ?? task.default_provider_name;
  const selectedModelName = task.route_model_name ?? task.provider_model_name ?? task.default_model_name;
  const providerEnabled = task.provider_enabled === true;
  const hookImplemented = task.implemented;
  const routeEnabled = task.route_enabled;
  const requiredSecretEnv = task.required_secret_env;
  const secretReady = secretConfigured(requiredSecretEnv, config);
  const runtimeReady =
    runtime.provider !== "disabled" &&
    providerName !== null &&
    runtime.provider === providerName &&
    providerEnabled &&
    secretReady &&
    hookImplemented &&
    routeEnabled;
  const unavailableReason =
    !hookImplemented
      ? "No app logic is registered for this hook."
      : !routeEnabled
        ? "Task route is disabled."
        : providerName === null
          ? "No provider is selected."
          : !providerEnabled
            ? "Selected provider is disabled."
            : runtime.provider === "disabled"
              ? "Runtime option is disabled in AppLauncher."
              : runtime.provider !== providerName
                ? `AppLauncher runtime selected ${runtime.provider}, but Settings route selects ${providerName}.`
                : !secretReady
                  ? `Required secret ${requiredSecretEnv ?? "provider secret"} is not configured.`
                  : null;

  return {
    id: task.id,
    taskKey: task.task_key,
    displayName: task.display_name,
    description: task.description,
    hookKey: task.hook_key,
    taskKind: task.task_kind,
    hookImplemented,
    routeEnabled,
    runtimeOptionId: task.runtime_option_id,
    runtimeOptionPurpose: task.runtime_option_purpose,
    runtimeProviderEnv: task.runtime_provider_env,
    runtimeModelEnv: task.runtime_model_env,
    runtimeEndpointEnv: task.runtime_endpoint_env,
    selectedProviderId: task.provider_config_id,
    selectedProviderName: providerName,
    selectedProviderDisplayName: task.provider_display_name ?? providerName,
    selectedModelName,
    providerAdapterKey: task.adapter_key,
    providerExternalSendEnabled: task.external_send_enabled === true,
    providerSecretEnv: requiredSecretEnv,
    runtimeProvider: runtime.provider,
    runtimeModelName: runtime.modelName,
    runtimeEndpointConfigured: runtime.endpoint.trim() !== "",
    runtimeReady,
    unavailableReason,
    updatedAt: toIso(task.updated_at)
  };
}

function serializeAppLauncherRuntimeOptions(tasks: AiTaskRouteRow[]): Record<string, unknown> {
  return {
    manifestVersion: "1.2.0",
    minLauncherVersion: "1.2.0",
    runtimeOptionsPresent: tasks.length > 0,
    nativeLaunchTarget: "executablePath",
    secretEnvironmentNames: Array.from(
      new Set(
        tasks
          .map((task) => task.required_secret_env)
          .filter((value): value is string => value !== null && value.trim() !== "")
      )
    ),
    restartRequiredAfterChange: true
  };
}

function secretConfigured(requiredSecretEnv: string | null, config: ApiConfig): boolean {
  if (requiredSecretEnv === null || requiredSecretEnv.trim() === "") {
    return true;
  }
  if (requiredSecretEnv === "OPENAI_COMPATIBLE_API_KEY") {
    return config.llm.openAiCompatibleApiKey.trim() !== "";
  }
  return false;
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

function parseAiTaskRouteBody(body: unknown) {
  const record = parseObject(body);
  const enabled = record.enabled;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new HttpError(400, "invalid_request", "enabled must be a boolean.");
  }
  return {
    providerConfigId: record.providerConfigId === undefined ? undefined : optionalString(record.providerConfigId, "providerConfigId"),
    modelName: record.modelName === undefined ? undefined : optionalString(record.modelName, "modelName"),
    enabled
  };
}

function parseCreateAiTaskBody(body: unknown) {
  const record = parseObject(body);
  const taskKey = parseConfigKey(record.taskKey, "taskKey");
  const hookKey = parseConfigKey(record.hookKey, "hookKey");
  const taskKind = record.taskKind === undefined ? "llm" : parseConfigKey(record.taskKind, "taskKind");
  if (!["llm", "ocr"].includes(taskKind)) {
    throw new HttpError(400, "invalid_request", "taskKind must be llm or ocr.");
  }
  const runtimeEnvPrefix = runtimeEnvPrefixForTaskKey(taskKey);
  return {
    taskKey,
    displayName: assertNonEmptyString(record.displayName, "displayName"),
    description: record.description === undefined ? null : optionalString(record.description, "description"),
    hookKey,
    taskKind,
    runtimeOptionId: `${taskKey}-provider`,
    runtimeOptionPurpose: taskKey,
    runtimeProviderEnv: `${runtimeEnvPrefix}_PROVIDER`,
    runtimeModelEnv: `${runtimeEnvPrefix}_MODEL`,
    runtimeEndpointEnv: `${runtimeEnvPrefix}_ENDPOINT`
  };
}

function runtimeEnvPrefixForTaskKey(taskKey: string): string {
  return `AI_TASK_${taskKey
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/(^_+|_+$)/g, "")
    .replace(/(^|_)(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL|AUTH)(?=_|$)/g, "$1ITEM")}`;
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

function parseProviderBody(body: unknown) {
  const record = parseObject(body);
  if (record.enabled !== undefined && typeof record.enabled !== "boolean") {
    throw new HttpError(400, "invalid_request", "enabled must be a boolean.");
  }
  return {
    enabled: record.enabled === undefined ? undefined : record.enabled === true,
    endpoint: record.endpoint === undefined ? undefined : optionalString(record.endpoint, "endpoint"),
    modelName: record.modelName === undefined ? undefined : optionalString(record.modelName, "modelName")
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

function parsePromptVersionBody(body: unknown) {
  const record = parseObject(body);
  const outputSchema = record.outputSchema ?? {};
  if (outputSchema === null || typeof outputSchema !== "object" || Array.isArray(outputSchema)) {
    throw new HttpError(400, "invalid_request", "outputSchema must be an object.");
  }
  const freeformText =
    record.freeformText === undefined
      ? assertNonEmptyString(record.body, "body")
      : assertNonEmptyString(record.freeformText, "freeformText");
  const contextConfig = {
    freeformText,
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

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
