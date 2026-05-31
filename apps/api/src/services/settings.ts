import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { SettingsRepository, type PromptDefinitionRow, type ProviderConfigRow } from "../repositories/settings.js";
import { HttpError, assertNonEmptyString, optionalString } from "./errors.js";
import { normalizePromptContextConfig } from "./llm.js";

export class SettingsService {
  constructor(
    private readonly db: Database,
    private readonly config: ApiConfig
  ) {}

  async getSummary(): Promise<Record<string, unknown>> {
    const settings = new SettingsRepository(this.db);
    const [fileTypes, extraction, transcription, providers, prompts] = await Promise.all([
      settings.listFileTypes(),
      settings.getExtractionSettings(),
      settings.getTranscriptionSettings(),
      settings.listProviders(),
      settings.listPrompts()
    ]);

    return {
      fileTypes: fileTypes.map((row) => ({
        id: row.id,
        extension: row.extension,
        mediaKind: row.media_kind,
        capabilityState: row.capability_state,
        parserKey: row.parser_key,
        updatedAt: toIso(row.updated_at)
      })),
      extraction: extraction === null
        ? null
        : {
            projectConfidenceThreshold: toNumber(extraction.project_confidence_threshold),
            featureGroupConfidenceThreshold: toNumber(extraction.feature_group_confidence_threshold),
            contributorConfidenceThreshold: toNumber(extraction.contributor_confidence_threshold),
            tagConfidenceThreshold: toNumber(extraction.tag_confidence_threshold),
            updatedAt: toIso(extraction.updated_at)
          },
      transcription: transcription === null
        ? null
        : {
            maxRetryAttempts: transcription.max_retry_attempts,
            runtimeProvider: this.config.transcription.provider,
            runtimeModelName: this.config.transcription.modelName,
            updatedAt: toIso(transcription.updated_at)
          },
      providers: providers.map((provider) => serializeProvider(provider, this.config)),
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
          featureGroupConfidenceThreshold: toNumber(updated.feature_group_confidence_threshold),
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
      const fileType = await settings.updateFileType({ fileTypeId, ...input, actorUserId: actor.id });
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
          capabilityState: fileType.capability_state
        }
      });
      return { fileType: serializeFileType(fileType) };
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
  return {
    id: provider.id,
    providerKind: provider.provider_kind,
    providerName: provider.provider_name,
    enabled: provider.enabled,
    endpointConfigured: provider.endpoint !== null && provider.endpoint.trim() !== "",
    modelName: provider.model_name,
    secretSource: provider.secret_source,
    secretConfigured: provider.secret_source === "environment" && runtimeProvider !== "disabled",
    healthStatus: provider.health_status,
    runtimeProvider,
    runtimeModelName,
    lastHealthCheckAt: provider.last_health_check_at === null ? null : toIso(provider.last_health_check_at),
    updatedAt: toIso(provider.updated_at)
  };
}

function parseExtractionBody(body: unknown) {
  const record = parseObject(body);
  return {
    projectConfidenceThreshold: parseThreshold(record.projectConfidenceThreshold, "projectConfidenceThreshold"),
    featureGroupConfidenceThreshold: parseThreshold(
      record.featureGroupConfidenceThreshold,
      "featureGroupConfidenceThreshold"
    ),
    contributorConfidenceThreshold: parseThreshold(
      record.contributorConfidenceThreshold,
      "contributorConfidenceThreshold"
    ),
    tagConfidenceThreshold: parseThreshold(record.tagConfidenceThreshold, "tagConfidenceThreshold")
  };
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
  const capabilityState = assertNonEmptyString(record.capabilityState, "capabilityState");
  if (!["active", "inactive", "not_supported_yet"].includes(capabilityState)) {
    throw new HttpError(
      400,
      "invalid_request",
      "capabilityState must be active, inactive, or not_supported_yet."
    );
  }
  return { capabilityState };
}

function parseCreateFileTypeBody(body: unknown) {
  const record = parseObject(body);
  const extension = normalizeExtension(assertNonEmptyString(record.extension, "extension"));
  const mediaKind = assertNonEmptyString(record.mediaKind, "mediaKind");
  if (mediaKind !== "text" && mediaKind !== "audio") {
    throw new HttpError(400, "invalid_request", "mediaKind must be text or audio.");
  }
  const capabilityState =
    typeof record.active === "boolean"
      ? record.active ? "active" : "inactive"
      : record.capabilityState === undefined
        ? "inactive"
        : assertNonEmptyString(record.capabilityState, "capabilityState");
  if (!["active", "inactive", "not_supported_yet"].includes(capabilityState)) {
    throw new HttpError(
      400,
      "invalid_request",
      "capabilityState must be active, inactive, or not_supported_yet."
    );
  }
  const parserKey = parseParserKey(record.parserKey);
  return { extension, mediaKind, capabilityState, parserKey };
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
  const parserKey = value.trim().toLowerCase();
  if (parserKey === "" || parserKey === "none") {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(parserKey)) {
    throw new HttpError(400, "invalid_request", "parserKey contains unsupported characters.");
  }
  return parserKey;
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
