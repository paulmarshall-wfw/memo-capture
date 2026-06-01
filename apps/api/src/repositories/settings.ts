import { randomUUID } from "node:crypto";
import type { Queryable } from "../db/types.js";

export interface FileTypeSettingRow extends Record<string, unknown> {
  id: string;
  extension: string;
  media_kind: string;
  capability_state: string;
  parser_key: string | null;
  updated_at: Date | string;
}

export interface MediaTypeSettingRow extends Record<string, unknown> {
  id: string;
  media_key: string;
  display_name: string;
  description: string | null;
  capability_state: string;
  updated_at: Date | string;
}

export interface ParserTypeSettingRow extends Record<string, unknown> {
  id: string;
  parser_key: string;
  display_name: string;
  description: string | null;
  media_key: string;
  capability_state: string;
  updated_at: Date | string;
}

export interface ExtractionSettingsRow extends Record<string, unknown> {
  project_confidence_threshold: string | number;
  contributor_confidence_threshold: string | number;
  tag_confidence_threshold: string | number;
  updated_at: Date | string;
}

export interface TranscriptionSettingsRow extends Record<string, unknown> {
  max_retry_attempts: number;
  updated_at: Date | string;
}

export interface ProviderConfigRow extends Record<string, unknown> {
  id: string;
  provider_kind: string;
  provider_name: string;
  enabled: boolean;
  endpoint: string | null;
  model_name: string | null;
  secret_source: string;
  health_status: string;
  last_health_check_at: Date | string | null;
  updated_at: Date | string;
}

export interface PromptDefinitionRow extends Record<string, unknown> {
  id: string;
  name: string;
  purpose: string;
  active_version: number;
  retention_policy: string;
  active_prompt_version_id: string | null;
  active_body: string | null;
  active_output_schema: Record<string, unknown> | null;
  active_context_config: Record<string, unknown> | null;
  updated_at: Date | string;
}

export class SettingsRepository {
  constructor(private readonly db: Queryable) {}

  async listMediaTypes(): Promise<MediaTypeSettingRow[]> {
    const result = await this.db.query<MediaTypeSettingRow>(
      `select id, media_key, display_name, description, capability_state, updated_at
       from media_type_settings
       order by display_name asc, media_key asc`
    );
    return result.rows;
  }

  async findMediaTypeByKey(mediaKey: string): Promise<MediaTypeSettingRow | null> {
    const result = await this.db.query<MediaTypeSettingRow>(
      `select id, media_key, display_name, description, capability_state, updated_at
       from media_type_settings
       where lower(media_key) = lower($1)
       limit 1`,
      [mediaKey]
    );
    return result.rows[0] ?? null;
  }

  async findMediaTypeById(mediaTypeId: string): Promise<MediaTypeSettingRow | null> {
    const result = await this.db.query<MediaTypeSettingRow>(
      `select id, media_key, display_name, description, capability_state, updated_at
       from media_type_settings
       where id = $1
       limit 1`,
      [mediaTypeId]
    );
    return result.rows[0] ?? null;
  }

  async createMediaType(input: {
    mediaKey: string;
    displayName: string;
    description: string | null;
    capabilityState: string;
    actorUserId: string;
  }): Promise<MediaTypeSettingRow> {
    const result = await this.db.query<MediaTypeSettingRow>(
      `insert into media_type_settings (
         id,
         media_key,
         display_name,
         description,
         capability_state,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $6, now(), now())
       returning id, media_key, display_name, description, capability_state, updated_at`,
      [
        randomUUID(),
        input.mediaKey,
        input.displayName,
        input.description,
        input.capabilityState,
        input.actorUserId
      ]
    );
    return requiredRow(result.rows[0], "media type setting creation failed");
  }

  async updateMediaType(input: {
    mediaTypeId: string;
    mediaKey: string;
    displayName: string;
    description: string | null;
    capabilityState: string;
    actorUserId: string;
  }): Promise<MediaTypeSettingRow | null> {
    const result = await this.db.query<MediaTypeSettingRow>(
      `update media_type_settings
       set
         media_key = $2,
         display_name = $3,
         description = $4,
         capability_state = $5,
         updated_by = $6,
         updated_at = now()
       where id = $1
       returning id, media_key, display_name, description, capability_state, updated_at`,
      [
        input.mediaTypeId,
        input.mediaKey,
        input.displayName,
        input.description,
        input.capabilityState,
        input.actorUserId
      ]
    );
    return result.rows[0] ?? null;
  }

  async countFileTypesForMediaKey(mediaKey: string): Promise<number> {
    const result = await this.db.query<{ count: string | number }>(
      `select count(*)::int as count
       from file_type_settings
       where media_kind = $1`,
      [mediaKey]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async countParserTypesForMediaKey(mediaKey: string): Promise<number> {
    const result = await this.db.query<{ count: string | number }>(
      `select count(*)::int as count
       from parser_type_settings
       where media_key = $1`,
      [mediaKey]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async deleteMediaType(mediaTypeId: string): Promise<MediaTypeSettingRow | null> {
    const result = await this.db.query<MediaTypeSettingRow>(
      `delete from media_type_settings
       where id = $1
       returning id, media_key, display_name, description, capability_state, updated_at`,
      [mediaTypeId]
    );
    return result.rows[0] ?? null;
  }

  async listParserTypes(): Promise<ParserTypeSettingRow[]> {
    const result = await this.db.query<ParserTypeSettingRow>(
      `select id, parser_key, display_name, description, media_key, capability_state, updated_at
       from parser_type_settings
       order by media_key asc, display_name asc, parser_key asc`
    );
    return result.rows;
  }

  async findParserTypeByKey(parserKey: string): Promise<ParserTypeSettingRow | null> {
    const result = await this.db.query<ParserTypeSettingRow>(
      `select id, parser_key, display_name, description, media_key, capability_state, updated_at
       from parser_type_settings
       where lower(parser_key) = lower($1)
       limit 1`,
      [parserKey]
    );
    return result.rows[0] ?? null;
  }

  async findParserTypeById(parserTypeId: string): Promise<ParserTypeSettingRow | null> {
    const result = await this.db.query<ParserTypeSettingRow>(
      `select id, parser_key, display_name, description, media_key, capability_state, updated_at
       from parser_type_settings
       where id = $1
       limit 1`,
      [parserTypeId]
    );
    return result.rows[0] ?? null;
  }

  async createParserType(input: {
    parserKey: string;
    displayName: string;
    description: string | null;
    mediaKey: string;
    capabilityState: string;
    actorUserId: string;
  }): Promise<ParserTypeSettingRow> {
    const result = await this.db.query<ParserTypeSettingRow>(
      `insert into parser_type_settings (
         id,
         parser_key,
         display_name,
         description,
         media_key,
         capability_state,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $7, now(), now())
       returning id, parser_key, display_name, description, media_key, capability_state, updated_at`,
      [
        randomUUID(),
        input.parserKey,
        input.displayName,
        input.description,
        input.mediaKey,
        input.capabilityState,
        input.actorUserId
      ]
    );
    return requiredRow(result.rows[0], "parser type setting creation failed");
  }

  async updateParserType(input: {
    parserTypeId: string;
    parserKey: string;
    displayName: string;
    description: string | null;
    mediaKey: string;
    capabilityState: string;
    actorUserId: string;
  }): Promise<ParserTypeSettingRow | null> {
    const result = await this.db.query<ParserTypeSettingRow>(
      `update parser_type_settings
       set
         parser_key = $2,
         display_name = $3,
         description = $4,
         media_key = $5,
         capability_state = $6,
         updated_by = $7,
         updated_at = now()
       where id = $1
       returning id, parser_key, display_name, description, media_key, capability_state, updated_at`,
      [
        input.parserTypeId,
        input.parserKey,
        input.displayName,
        input.description,
        input.mediaKey,
        input.capabilityState,
        input.actorUserId
      ]
    );
    return result.rows[0] ?? null;
  }

  async countFileTypesForParserKey(parserKey: string): Promise<number> {
    const result = await this.db.query<{ count: string | number }>(
      `select count(*)::int as count
       from file_type_settings
       where parser_key = $1`,
      [parserKey]
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async deleteParserType(parserTypeId: string): Promise<ParserTypeSettingRow | null> {
    const result = await this.db.query<ParserTypeSettingRow>(
      `delete from parser_type_settings
       where id = $1
       returning id, parser_key, display_name, description, media_key, capability_state, updated_at`,
      [parserTypeId]
    );
    return result.rows[0] ?? null;
  }

  async listFileTypes(): Promise<FileTypeSettingRow[]> {
    const result = await this.db.query<FileTypeSettingRow>(
      `select id, extension, media_kind, capability_state, parser_key, updated_at
       from file_type_settings
       order by media_kind asc, extension asc`
    );
    return result.rows;
  }

  async findFileTypeByExtension(extension: string): Promise<FileTypeSettingRow | null> {
    const result = await this.db.query<FileTypeSettingRow>(
      `select id, extension, media_kind, capability_state, parser_key, updated_at
       from file_type_settings
       where lower(extension) = lower($1)
       limit 1`,
      [extension]
    );
    return result.rows[0] ?? null;
  }

  async findFileTypeById(fileTypeId: string): Promise<FileTypeSettingRow | null> {
    const result = await this.db.query<FileTypeSettingRow>(
      `select id, extension, media_kind, capability_state, parser_key, updated_at
       from file_type_settings
       where id = $1
       limit 1`,
      [fileTypeId]
    );
    return result.rows[0] ?? null;
  }

  async createFileType(input: {
    extension: string;
    mediaKind: string;
    capabilityState: string;
    parserKey: string | null;
    actorUserId: string;
  }): Promise<FileTypeSettingRow> {
    const result = await this.db.query<FileTypeSettingRow>(
      `insert into file_type_settings (
         id,
         extension,
         media_kind,
         capability_state,
         parser_key,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $6, now(), now())
       returning id, extension, media_kind, capability_state, parser_key, updated_at`,
      [
        randomUUID(),
        input.extension,
        input.mediaKind,
        input.capabilityState,
        input.parserKey,
        input.actorUserId
      ]
    );
    return requiredRow(result.rows[0], "file type setting creation failed");
  }

  async updateFileType(input: {
    fileTypeId: string;
    mediaKind: string;
    capabilityState: string;
    parserKey: string | null;
    actorUserId: string;
  }): Promise<FileTypeSettingRow | null> {
    const result = await this.db.query<FileTypeSettingRow>(
      `update file_type_settings
       set
         media_kind = $2,
         capability_state = $3,
         parser_key = $4,
         updated_by = $5,
         updated_at = now()
       where id = $1
       returning id, extension, media_kind, capability_state, parser_key, updated_at`,
      [input.fileTypeId, input.mediaKind, input.capabilityState, input.parserKey, input.actorUserId]
    );
    return result.rows[0] ?? null;
  }

  async deleteFileType(fileTypeId: string): Promise<FileTypeSettingRow | null> {
    const result = await this.db.query<FileTypeSettingRow>(
      `delete from file_type_settings
       where id = $1
       returning id, extension, media_kind, capability_state, parser_key, updated_at`,
      [fileTypeId]
    );
    return result.rows[0] ?? null;
  }

  async getExtractionSettings(): Promise<ExtractionSettingsRow | null> {
    const result = await this.db.query<ExtractionSettingsRow>(
      `select project_confidence_threshold, contributor_confidence_threshold,
              tag_confidence_threshold, updated_at
       from extraction_settings
       where singleton_id = true`
    );
    return result.rows[0] ?? null;
  }

  async updateExtractionSettings(input: {
    projectConfidenceThreshold: number;
    contributorConfidenceThreshold: number;
    tagConfidenceThreshold: number;
    actorUserId: string;
  }): Promise<ExtractionSettingsRow> {
    const result = await this.db.query<ExtractionSettingsRow>(
      `insert into extraction_settings (
         singleton_id,
         project_confidence_threshold,
         contributor_confidence_threshold,
         tag_confidence_threshold,
         updated_by,
         updated_at
       )
       values (true, $1, $2, $3, $4, now())
       on conflict (singleton_id) do update
       set
         project_confidence_threshold = excluded.project_confidence_threshold,
         contributor_confidence_threshold = excluded.contributor_confidence_threshold,
         tag_confidence_threshold = excluded.tag_confidence_threshold,
         updated_by = excluded.updated_by,
         updated_at = now()
       returning project_confidence_threshold, contributor_confidence_threshold,
                 tag_confidence_threshold, updated_at`,
      [
        input.projectConfidenceThreshold,
        input.contributorConfidenceThreshold,
        input.tagConfidenceThreshold,
        input.actorUserId
      ]
    );
    return requiredRow(result.rows[0], "extraction settings update failed");
  }

  async getTranscriptionSettings(): Promise<TranscriptionSettingsRow | null> {
    const result = await this.db.query<TranscriptionSettingsRow>(
      `select max_retry_attempts, updated_at
       from transcription_settings
       where singleton_id = true`
    );
    return result.rows[0] ?? null;
  }

  async updateTranscriptionSettings(input: {
    maxRetryAttempts: number;
    actorUserId: string;
  }): Promise<TranscriptionSettingsRow> {
    const result = await this.db.query<TranscriptionSettingsRow>(
      `insert into transcription_settings (singleton_id, max_retry_attempts, updated_by, updated_at)
       values (true, $1, $2, now())
       on conflict (singleton_id) do update
       set
         max_retry_attempts = excluded.max_retry_attempts,
         updated_by = excluded.updated_by,
         updated_at = now()
       returning max_retry_attempts, updated_at`,
      [input.maxRetryAttempts, input.actorUserId]
    );
    return requiredRow(result.rows[0], "transcription settings update failed");
  }

  async listProviders(): Promise<ProviderConfigRow[]> {
    const result = await this.db.query<ProviderConfigRow>(
      `select id, provider_kind, provider_name, enabled, endpoint, model_name, secret_source,
              health_status, last_health_check_at, updated_at
       from provider_configs
       order by provider_kind asc, provider_name asc`
    );
    return result.rows;
  }

  async findEnabledProvider(providerKind: string): Promise<ProviderConfigRow | null> {
    const result = await this.db.query<ProviderConfigRow>(
      `select id, provider_kind, provider_name, enabled, endpoint, model_name, secret_source,
              health_status, last_health_check_at, updated_at
       from provider_configs
       where provider_kind = $1 and enabled = true
       order by updated_at desc
       limit 1`,
      [providerKind]
    );
    return result.rows[0] ?? null;
  }

  async updateProvider(input: {
    providerId: string;
    enabled?: boolean | undefined;
    endpoint?: string | null | undefined;
    modelName?: string | null | undefined;
    actorUserId: string;
  }): Promise<ProviderConfigRow | null> {
    const result = await this.db.query<ProviderConfigRow>(
      `update provider_configs
       set
         enabled = coalesce($2::boolean, enabled),
         endpoint = case when $3::boolean then $4::text else endpoint end,
         model_name = case when $5::boolean then $6::text else model_name end,
         updated_by = $7,
         updated_at = now()
       where id = $1
       returning id, provider_kind, provider_name, enabled, endpoint, model_name,
                 secret_source, health_status, last_health_check_at, updated_at`,
      [
        input.providerId,
        input.enabled ?? null,
        input.endpoint !== undefined,
        nullIfBlank(input.endpoint),
        input.modelName !== undefined,
        nullIfBlank(input.modelName),
        input.actorUserId
      ]
    );
    return result.rows[0] ?? null;
  }

  async listPrompts(): Promise<PromptDefinitionRow[]> {
    const result = await this.db.query<PromptDefinitionRow>(
      `select
         prompt_definitions.id,
         prompt_definitions.name,
         prompt_definitions.purpose,
         prompt_definitions.active_version,
         prompt_definitions.retention_policy,
         prompt_versions.id as active_prompt_version_id,
         prompt_versions.body as active_body,
         prompt_versions.output_schema as active_output_schema,
         prompt_versions.context_config as active_context_config,
         prompt_definitions.updated_at
       from prompt_definitions
       left join prompt_versions on prompt_versions.prompt_definition_id = prompt_definitions.id
        and prompt_versions.version = prompt_definitions.active_version
       order by prompt_definitions.name asc`
    );
    return result.rows;
  }

  async getActivePrompt(name: string): Promise<PromptDefinitionRow | null> {
    const result = await this.db.query<PromptDefinitionRow>(
      `select
         prompt_definitions.id,
         prompt_definitions.name,
         prompt_definitions.purpose,
         prompt_definitions.active_version,
         prompt_definitions.retention_policy,
         prompt_versions.id as active_prompt_version_id,
         prompt_versions.body as active_body,
         prompt_versions.output_schema as active_output_schema,
         prompt_versions.context_config as active_context_config,
         prompt_definitions.updated_at
       from prompt_definitions
       join prompt_versions on prompt_versions.prompt_definition_id = prompt_definitions.id
        and prompt_versions.version = prompt_definitions.active_version
       where prompt_definitions.name = $1`,
      [name]
    );
    return result.rows[0] ?? null;
  }

  async createPromptVersion(input: {
    promptDefinitionId: string;
    body: string;
    outputSchema: Record<string, unknown>;
    contextConfig: Record<string, unknown>;
    actorUserId: string;
  }): Promise<PromptDefinitionRow> {
    const version = await this.db.query<{ version: number }>(
      `select coalesce(max(version), 0) + 1 as version
       from prompt_versions
       where prompt_definition_id = $1`,
      [input.promptDefinitionId]
    );
    const nextVersion = version.rows[0]?.version ?? 1;
    await this.db.query(
      `insert into prompt_versions (
         id,
         prompt_definition_id,
         version,
         body,
         output_schema,
         context_config,
         created_by,
         created_at
       )
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, now())`,
      [
        randomUUID(),
        input.promptDefinitionId,
        nextVersion,
        input.body,
        JSON.stringify(input.outputSchema),
        JSON.stringify(input.contextConfig),
        input.actorUserId
      ]
    );
    await this.db.query(
      `update prompt_definitions
       set active_version = $2, updated_by = $3, updated_at = now()
       where id = $1`,
      [input.promptDefinitionId, nextVersion, input.actorUserId]
    );
    const prompts = await this.listPrompts();
    return requiredRow(
      prompts.find((prompt) => prompt.id === input.promptDefinitionId),
      "prompt version create failed"
    );
  }
}

function requiredRow<Row>(row: Row | undefined, message: string): Row {
  if (row === undefined) {
    throw new Error(message);
  }
  return row;
}

function nullIfBlank(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
