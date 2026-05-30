import type { ApiConfig } from "../config.js";
import type { Database } from "../db/types.js";
import { AuditRepository } from "../repositories/audit.js";
import type { AppUserRecord } from "../repositories/rows.js";
import { SettingsRepository, type ProviderConfigRow } from "../repositories/settings.js";
import { HttpError, assertNonEmptyString, optionalString } from "./errors.js";

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
      prompts: prompts.map((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        purpose: prompt.purpose,
        activeVersion: prompt.active_version,
        activePromptVersionId: prompt.active_prompt_version_id,
        body: prompt.active_body,
        outputSchema: prompt.active_output_schema,
        retentionPolicy: prompt.retention_policy,
        updatedAt: toIso(prompt.updated_at)
      })),
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
        prompt: {
          id: prompt.id,
          name: prompt.name,
          activeVersion: prompt.active_version,
          activePromptVersionId: prompt.active_prompt_version_id,
          body: prompt.active_body,
          outputSchema: prompt.active_output_schema
        }
      };
    });
  }
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

function parsePromptVersionBody(body: unknown) {
  const record = parseObject(body);
  const outputSchema = record.outputSchema;
  if (outputSchema === null || typeof outputSchema !== "object" || Array.isArray(outputSchema)) {
    throw new HttpError(400, "invalid_request", "outputSchema must be an object.");
  }
  return {
    body: assertNonEmptyString(record.body, "body"),
    outputSchema: outputSchema as Record<string, unknown>
  };
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
