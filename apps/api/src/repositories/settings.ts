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
  display_name: string | null;
  adapter_key: string | null;
  enabled: boolean;
  endpoint: string | null;
  model_name: string | null;
  secret_source: string;
  required_secret_env: string | null;
  external_send_enabled: boolean;
  runtime_provider_env: string | null;
  runtime_model_env: string | null;
  runtime_endpoint_env: string | null;
  health_status: string;
  last_health_check_at: Date | string | null;
  updated_at: Date | string;
}

export interface TaskKindRow extends Record<string, unknown> {
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
}

export interface ProviderCapabilityRow extends Record<string, unknown> {
  id: string;
  provider_config_id: string;
  capability_key: string;
  enabled: boolean;
  updated_at: Date | string;
}

export interface AiTaskRouteRow extends Record<string, unknown> {
  id: string;
  task_key: string;
  display_name: string;
  description: string | null;
  hook_key: string;
  task_kind: string;
  task_kind_id: string | null;
  task_kind_display_name: string | null;
  task_kind_description: string | null;
  task_kind_provider_kind: string | null;
  task_kind_capability_key: string | null;
  prompt_fields_enabled: boolean | null;
  implemented: boolean;
  default_provider_name: string | null;
  default_model_name: string | null;
  runtime_option_id: string;
  runtime_option_purpose: string;
  runtime_provider_env: string;
  runtime_model_env: string;
  runtime_endpoint_env: string | null;
  route_enabled: boolean;
  route_model_name: string | null;
  provider_config_id: string | null;
  provider_kind: string | null;
  provider_name: string | null;
  provider_display_name: string | null;
  adapter_key: string | null;
  provider_enabled: boolean | null;
  provider_model_name: string | null;
  endpoint: string | null;
  secret_source: string | null;
  required_secret_env: string | null;
  external_send_enabled: boolean | null;
  health_status: string | null;
  prompt_definition_id: string | null;
  prompt_name: string | null;
  prompt_purpose: string | null;
  prompt_active_version: number | null;
  active_prompt_version_id: string | null;
  active_body: string | null;
  active_output_schema: Record<string, unknown> | null;
  active_context_config: Record<string, unknown> | null;
  prompt_retention_policy: string | null;
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

const aiTaskRouteSelectSql = `
  select
    ai_task_definitions.id,
    ai_task_definitions.task_key,
    ai_task_definitions.display_name,
    ai_task_definitions.description,
    ai_task_definitions.hook_key,
    ai_task_definitions.task_kind,
    ai_task_definitions.task_kind_id,
    task_kinds.display_name as task_kind_display_name,
    task_kinds.description as task_kind_description,
    task_kinds.provider_kind as task_kind_provider_kind,
    task_kinds.capability_key as task_kind_capability_key,
    task_kinds.prompt_fields_enabled,
    ai_task_definitions.implemented,
    ai_task_definitions.default_provider_name,
    ai_task_definitions.default_model_name,
    ai_task_definitions.runtime_option_id,
    ai_task_definitions.runtime_option_purpose,
    ai_task_definitions.runtime_provider_env,
    ai_task_definitions.runtime_model_env,
    ai_task_definitions.runtime_endpoint_env,
    coalesce(ai_task_routes.enabled, false) as route_enabled,
    ai_task_routes.model_name as route_model_name,
    provider_configs.id as provider_config_id,
    provider_configs.provider_kind,
    provider_configs.provider_name,
    provider_configs.display_name as provider_display_name,
    provider_configs.adapter_key,
    provider_configs.enabled as provider_enabled,
    provider_configs.model_name as provider_model_name,
    provider_configs.endpoint,
    provider_configs.secret_source,
    provider_configs.required_secret_env,
    provider_configs.external_send_enabled,
    provider_configs.health_status,
    prompt_definitions.id as prompt_definition_id,
    prompt_definitions.name as prompt_name,
    prompt_definitions.purpose as prompt_purpose,
    prompt_definitions.active_version as prompt_active_version,
    prompt_versions.id as active_prompt_version_id,
    prompt_versions.body as active_body,
    prompt_versions.output_schema as active_output_schema,
    prompt_versions.context_config as active_context_config,
    prompt_definitions.retention_policy as prompt_retention_policy,
    coalesce(ai_task_routes.updated_at, ai_task_definitions.updated_at) as updated_at
  from ai_task_definitions
  left join task_kinds on task_kinds.id = ai_task_definitions.task_kind_id
  left join ai_task_routes on ai_task_routes.task_definition_id = ai_task_definitions.id
  left join provider_configs on provider_configs.id = ai_task_routes.provider_config_id
  left join prompt_definitions on prompt_definitions.id = ai_task_definitions.prompt_definition_id
  left join prompt_versions on prompt_versions.prompt_definition_id = prompt_definitions.id
   and prompt_versions.version = prompt_definitions.active_version`;

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
      `select id, provider_kind, provider_name, display_name, adapter_key, enabled, endpoint, model_name,
              secret_source, required_secret_env, external_send_enabled, runtime_provider_env, runtime_model_env,
              runtime_endpoint_env, health_status, last_health_check_at, updated_at
       from provider_configs
       order by provider_kind asc, provider_name asc`
    );
    return result.rows;
  }

  async findProviderByKindAndName(providerKind: string, providerName: string): Promise<ProviderConfigRow | null> {
    const result = await this.db.query<ProviderConfigRow>(
      `select id, provider_kind, provider_name, display_name, adapter_key, enabled, endpoint, model_name,
              secret_source, required_secret_env, external_send_enabled, runtime_provider_env, runtime_model_env,
              runtime_endpoint_env, health_status, last_health_check_at, updated_at
       from provider_configs
       where lower(provider_kind) = lower($1)
         and lower(provider_name) = lower($2)
       limit 1`,
      [providerKind, providerName]
    );
    return result.rows[0] ?? null;
  }

  async createProvider(input: {
    providerKind: string;
    providerName: string;
    displayName: string;
    adapterKey: string;
    enabled: boolean;
    endpoint: string | null;
    modelName: string | null;
    requiredSecretEnv: string | null;
    externalSendEnabled: boolean;
    actorUserId: string;
  }): Promise<ProviderConfigRow> {
    const result = await this.db.query<ProviderConfigRow>(
      `insert into provider_configs (
         id,
         provider_kind,
         provider_name,
         display_name,
         adapter_key,
         enabled,
         endpoint,
         model_name,
         secret_source,
         required_secret_env,
         external_send_enabled,
         runtime_provider_env,
         runtime_model_env,
         runtime_endpoint_env,
         health_status,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'environment', $9, $10, null, null, null, 'unknown', $11, $11, now(), now())
       returning id, provider_kind, provider_name, display_name, adapter_key, enabled, endpoint, model_name,
                 secret_source, required_secret_env, external_send_enabled, runtime_provider_env, runtime_model_env,
                 runtime_endpoint_env, health_status, last_health_check_at, updated_at`,
      [
        randomUUID(),
        input.providerKind,
        input.providerName,
        input.displayName,
        input.adapterKey,
        input.enabled,
        nullIfBlank(input.endpoint),
        nullIfBlank(input.modelName),
        nullIfBlank(input.requiredSecretEnv),
        input.externalSendEnabled,
        input.actorUserId
      ]
    );
    return requiredRow(result.rows[0], "provider create failed");
  }

  async listTaskKinds(): Promise<TaskKindRow[]> {
    const result = await this.db.query<TaskKindRow>(
      `select id, kind_key, display_name, description, provider_kind, capability_key,
              prompt_fields_enabled, enabled, active, updated_at
       from task_kinds
       order by display_name asc, kind_key asc`
    );
    return result.rows;
  }

  async findTaskKindByKey(kindKey: string): Promise<TaskKindRow | null> {
    const result = await this.db.query<TaskKindRow>(
      `select id, kind_key, display_name, description, provider_kind, capability_key,
              prompt_fields_enabled, enabled, active, updated_at
       from task_kinds
       where lower(kind_key) = lower($1)
       limit 1`,
      [kindKey]
    );
    return result.rows[0] ?? null;
  }

  async findTaskKindById(taskKindId: string): Promise<TaskKindRow | null> {
    const result = await this.db.query<TaskKindRow>(
      `select id, kind_key, display_name, description, provider_kind, capability_key,
              prompt_fields_enabled, enabled, active, updated_at
       from task_kinds
       where id = $1
       limit 1`,
      [taskKindId]
    );
    return result.rows[0] ?? null;
  }

  async taskKindHasImplementedRoute(kindKey: string): Promise<boolean> {
    const result = await this.db.query<{ exists: boolean }>(
      `select exists (
         select 1
         from ai_task_definitions
         where lower(task_kind) = lower($1)
           and implemented = true
       ) as exists`,
      [kindKey]
    );
    return result.rows[0]?.exists === true;
  }

  async createTaskKind(input: {
    kindKey: string;
    displayName: string;
    description: string | null;
    providerKind: string;
    capabilityKey: string;
    promptFieldsEnabled: boolean;
    enabled: boolean;
    actorUserId: string;
  }): Promise<TaskKindRow> {
    const result = await this.db.query<TaskKindRow>(
      `insert into task_kinds (
         id, kind_key, display_name, description, provider_kind, capability_key,
         prompt_fields_enabled, enabled, active, created_by, updated_by, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $9, now(), now())
       returning id, kind_key, display_name, description, provider_kind, capability_key,
                 prompt_fields_enabled, enabled, active, updated_at`,
      [
        randomUUID(),
        input.kindKey,
        input.displayName,
        input.description,
        input.providerKind,
        input.capabilityKey,
        input.promptFieldsEnabled,
        input.enabled,
        input.actorUserId
      ]
    );
    return result.rows[0]!;
  }

  async updateTaskKind(input: {
    taskKindId: string;
    displayName?: string | undefined;
    description?: string | null | undefined;
    providerKind?: string | undefined;
    capabilityKey?: string | undefined;
    promptFieldsEnabled?: boolean | undefined;
    enabled?: boolean | undefined;
    active?: boolean | undefined;
    actorUserId: string;
  }): Promise<TaskKindRow | null> {
    const result = await this.db.query<TaskKindRow>(
      `update task_kinds
       set
         display_name = case when $2::boolean then $3::text else display_name end,
         description = case when $4::boolean then $5::text else description end,
         provider_kind = case when $6::boolean then $7::text else provider_kind end,
         capability_key = case when $8::boolean then $9::text else capability_key end,
         prompt_fields_enabled = case when $10::boolean then $11::boolean else prompt_fields_enabled end,
         enabled = case when $12::boolean then $13::boolean else enabled end,
         active = case when $14::boolean then $15::boolean else active end,
         updated_by = $16,
         updated_at = now()
       where id = $1
       returning id, kind_key, display_name, description, provider_kind, capability_key,
                 prompt_fields_enabled, enabled, active, updated_at`,
      [
        input.taskKindId,
        input.displayName !== undefined,
        input.displayName ?? null,
        input.description !== undefined,
        input.description ?? null,
        input.providerKind !== undefined,
        input.providerKind ?? null,
        input.capabilityKey !== undefined,
        input.capabilityKey ?? null,
        input.promptFieldsEnabled !== undefined,
        input.promptFieldsEnabled ?? null,
        input.enabled !== undefined,
        input.enabled ?? null,
        input.active !== undefined,
        input.active ?? null,
        input.actorUserId
      ]
    );
    return result.rows[0] ?? null;
  }

  async listProviderCapabilities(): Promise<ProviderCapabilityRow[]> {
    const result = await this.db.query<ProviderCapabilityRow>(
      `select id, provider_config_id, capability_key, enabled, updated_at
       from provider_capabilities
       order by capability_key asc`
    );
    return result.rows;
  }

  async providerHasCapability(providerConfigId: string, capabilityKey: string): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `select id
       from provider_capabilities
       where provider_config_id = $1
         and capability_key = $2
         and enabled = true
       limit 1`,
      [providerConfigId, capabilityKey]
    );
    return result.rows[0] !== undefined;
  }

  async findProviderById(providerConfigId: string): Promise<ProviderConfigRow | null> {
    const result = await this.db.query<ProviderConfigRow>(
      `select id, provider_kind, provider_name, display_name, adapter_key, enabled, endpoint, model_name,
              secret_source, required_secret_env, external_send_enabled, runtime_provider_env, runtime_model_env,
              runtime_endpoint_env, health_status, last_health_check_at, updated_at
       from provider_configs
       where id = $1
       limit 1`,
      [providerConfigId]
    );
    return result.rows[0] ?? null;
  }

  async findEnabledProvider(providerKind: string, preferredProviderName?: string | null): Promise<ProviderConfigRow | null> {
    const result = await this.db.query<ProviderConfigRow>(
      `select id, provider_kind, provider_name, display_name, adapter_key, enabled, endpoint, model_name,
              secret_source, required_secret_env, external_send_enabled, runtime_provider_env, runtime_model_env,
              runtime_endpoint_env, health_status, last_health_check_at, updated_at
       from provider_configs
       where provider_kind = $1 and enabled = true
       order by
         case when $2::text is not null and provider_name = $2::text then 0 else 1 end,
         updated_at desc
       limit 1`,
      [providerKind, preferredProviderName ?? null]
    );
    return result.rows[0] ?? null;
  }

  async findAiTaskRoute(taskKey: string): Promise<AiTaskRouteRow | null> {
    const result = await this.db.query<AiTaskRouteRow>(
      `${aiTaskRouteSelectSql}
       where ai_task_definitions.task_key = $1
       limit 1`,
      [taskKey]
    );
    return result.rows[0] ?? null;
  }

  async listAiTaskRoutes(): Promise<AiTaskRouteRow[]> {
    const result = await this.db.query<AiTaskRouteRow>(
      `${aiTaskRouteSelectSql}
       order by ai_task_definitions.display_name asc, ai_task_definitions.task_key asc`
    );
    return result.rows;
  }

  async createAiTaskDefinition(input: {
    taskKey: string;
    displayName: string;
    description: string | null;
    hookKey: string;
    taskKind: string;
    taskKindId: string;
    implemented: boolean;
    promptDefinitionId: string | null;
    providerConfigId: string | null;
    routeModelName: string | null;
    routeEnabled: boolean;
    runtimeOptionId: string;
    runtimeOptionPurpose: string;
    runtimeProviderEnv: string;
    runtimeModelEnv: string;
    runtimeEndpointEnv: string;
    actorUserId: string;
  }): Promise<AiTaskRouteRow> {
    const taskId = randomUUID();
    await this.db.query(
      `insert into ai_task_definitions (
         id, task_key, display_name, description, hook_key, task_kind, implemented,
         task_kind_id, prompt_definition_id,
         runtime_option_id, runtime_option_purpose, runtime_provider_env, runtime_model_env,
         runtime_endpoint_env, created_by, updated_by, created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, now(), now())`,
      [
        taskId,
        input.taskKey,
        input.displayName,
        input.description,
        input.hookKey,
        input.taskKind,
        input.implemented,
        input.taskKindId,
        input.promptDefinitionId,
        input.runtimeOptionId,
        input.runtimeOptionPurpose,
        input.runtimeProviderEnv,
        input.runtimeModelEnv,
        input.runtimeEndpointEnv,
        input.actorUserId
      ]
    );
    await this.db.query(
      `insert into ai_task_routes (task_definition_id, provider_config_id, model_name, enabled, updated_by, updated_at)
       values ($1, $2::uuid, $3::text, $4::boolean, $5, now())`,
      [taskId, input.providerConfigId, nullIfBlank(input.routeModelName), input.routeEnabled, input.actorUserId]
    );
    const createdTask = await this.findAiTaskRouteById(taskId);
    if (createdTask === null) {
      throw new Error("AI task creation failed");
    }
    return createdTask;
  }

  async updateAiTaskRoute(input: {
    taskDefinitionId: string;
    providerConfigId?: string | null | undefined;
    modelName?: string | null | undefined;
    enabled?: boolean | undefined;
    actorUserId: string;
  }): Promise<AiTaskRouteRow | null> {
    await this.db.query(
      `insert into ai_task_routes (task_definition_id, provider_config_id, model_name, enabled, updated_by, updated_at)
       values ($1, $2::uuid, $3::text, coalesce($4::boolean, true), $5, now())
       on conflict (task_definition_id) do update
       set
         provider_config_id = case when $6::boolean then $2::uuid else ai_task_routes.provider_config_id end,
         model_name = case when $7::boolean then nullif($3::text, '') else ai_task_routes.model_name end,
         enabled = coalesce($4::boolean, ai_task_routes.enabled),
         updated_by = $5,
         updated_at = now()`,
      [
        input.taskDefinitionId,
        input.providerConfigId ?? null,
        input.modelName ?? null,
        input.enabled ?? null,
        input.actorUserId,
        input.providerConfigId !== undefined,
        input.modelName !== undefined
      ]
    );
    return this.findAiTaskRouteById(input.taskDefinitionId);
  }

  async updateAiTaskDefinition(input: {
    taskDefinitionId: string;
    displayName?: string | undefined;
    description?: string | null | undefined;
    hookKey?: string | undefined;
    taskKind?: string | undefined;
    taskKindId?: string | undefined;
    implemented?: boolean | undefined;
    promptDefinitionId?: string | null | undefined;
    actorUserId: string;
  }): Promise<AiTaskRouteRow | null> {
    await this.db.query(
      `update ai_task_definitions
       set
         display_name = case when $2::boolean then $3::text else display_name end,
         description = case when $4::boolean then $5::text else description end,
         hook_key = case when $6::boolean then $7::text else hook_key end,
         task_kind = case when $8::boolean then $9::text else task_kind end,
         task_kind_id = case when $10::boolean then $11::uuid else task_kind_id end,
         implemented = case when $12::boolean then $13::boolean else implemented end,
         prompt_definition_id = case when $14::boolean then $15::uuid else prompt_definition_id end,
         updated_by = $16,
         updated_at = now()
       where id = $1`,
      [
        input.taskDefinitionId,
        input.displayName !== undefined,
        input.displayName ?? null,
        input.description !== undefined,
        input.description ?? null,
        input.hookKey !== undefined,
        input.hookKey ?? null,
        input.taskKind !== undefined,
        input.taskKind ?? null,
        input.taskKindId !== undefined,
        input.taskKindId ?? null,
        input.implemented !== undefined,
        input.implemented ?? null,
        input.promptDefinitionId !== undefined,
        input.promptDefinitionId ?? null,
        input.actorUserId
      ]
    );
    return this.findAiTaskRouteById(input.taskDefinitionId);
  }

  async findAiTaskRouteById(taskDefinitionId: string): Promise<AiTaskRouteRow | null> {
    const result = await this.db.query<AiTaskRouteRow>(
      `${aiTaskRouteSelectSql}
       where ai_task_definitions.id = $1
       limit 1`,
      [taskDefinitionId]
    );
    return result.rows[0] ?? null;
  }

  async updateProvider(input: {
    providerId: string;
    displayName?: string | undefined;
    enabled?: boolean | undefined;
    endpoint?: string | null | undefined;
    modelName?: string | null | undefined;
    requiredSecretEnv?: string | null | undefined;
    externalSendEnabled?: boolean | undefined;
    actorUserId: string;
  }): Promise<ProviderConfigRow | null> {
    const result = await this.db.query<ProviderConfigRow>(
      `update provider_configs
       set
         display_name = case when $2::boolean then $3::text else display_name end,
         enabled = coalesce($4::boolean, enabled),
         endpoint = case when $5::boolean then $6::text else endpoint end,
         model_name = case when $7::boolean then $8::text else model_name end,
         required_secret_env = case when $9::boolean then $10::text else required_secret_env end,
         external_send_enabled = coalesce($11::boolean, external_send_enabled),
         updated_by = $12,
         updated_at = now()
       where id = $1
       returning id, provider_kind, provider_name, enabled, endpoint, model_name,
                 display_name, adapter_key, secret_source, required_secret_env, external_send_enabled,
                 runtime_provider_env, runtime_model_env, runtime_endpoint_env,
                 health_status, last_health_check_at, updated_at`,
      [
        input.providerId,
        input.displayName !== undefined,
        input.displayName ?? null,
        input.enabled ?? null,
        input.endpoint !== undefined,
        nullIfBlank(input.endpoint),
        input.modelName !== undefined,
        nullIfBlank(input.modelName),
        input.requiredSecretEnv !== undefined,
        nullIfBlank(input.requiredSecretEnv),
        input.externalSendEnabled ?? null,
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

  async createPromptDefinition(input: {
    name: string;
    purpose: string;
    body: string;
    outputSchema: Record<string, unknown>;
    contextConfig: Record<string, unknown>;
    actorUserId: string;
  }): Promise<PromptDefinitionRow> {
    const promptDefinitionId = randomUUID();
    await this.db.query(
      `insert into prompt_definitions (
         id,
         name,
         purpose,
         active_version,
         retention_policy,
         created_by,
         updated_by,
         created_at,
         updated_at
       )
       values ($1, $2, $3, 1, 'retain_active_and_referenced', $4, $4, now(), now())`,
      [promptDefinitionId, input.name, input.purpose, input.actorUserId]
    );
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
       values ($1, $2, 1, $3, $4::jsonb, $5::jsonb, $6, now())`,
      [
        randomUUID(),
        promptDefinitionId,
        input.body,
        JSON.stringify(input.outputSchema),
        JSON.stringify(input.contextConfig),
        input.actorUserId
      ]
    );
    const prompt = await this.getPromptById(promptDefinitionId);
    return requiredRow(prompt ?? undefined, "prompt definition create failed");
  }

  async getPromptById(promptDefinitionId: string): Promise<PromptDefinitionRow | null> {
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
       where prompt_definitions.id = $1
       limit 1`,
      [promptDefinitionId]
    );
    return result.rows[0] ?? null;
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

  async updateCurrentPrompt(input: {
    promptDefinitionId: string;
    body: string;
    outputSchema: Record<string, unknown>;
    contextConfig: Record<string, unknown>;
    actorUserId: string;
  }): Promise<PromptDefinitionRow | null> {
    const prompt = await this.getPromptById(input.promptDefinitionId);
    if (prompt === null || prompt.active_prompt_version_id === null) {
      return null;
    }
    await this.db.query(
      `update prompt_versions
       set
         body = $2,
         output_schema = $3::jsonb,
         context_config = $4::jsonb
       where id = $1`,
      [prompt.active_prompt_version_id, input.body, JSON.stringify(input.outputSchema), JSON.stringify(input.contextConfig)]
    );
    await this.db.query(
      `update prompt_definitions
       set updated_by = $2, updated_at = now()
       where id = $1`,
      [input.promptDefinitionId, input.actorUserId]
    );
    return this.getPromptById(input.promptDefinitionId);
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
