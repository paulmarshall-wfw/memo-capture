-- Add task-aware AI provider routing and AppLauncher runtime-option metadata.

alter table if exists provider_configs
  add column if not exists display_name text,
  add column if not exists adapter_key text,
  add column if not exists external_send_enabled boolean not null default false,
  add column if not exists required_secret_env text,
  add column if not exists runtime_provider_env text,
  add column if not exists runtime_model_env text,
  add column if not exists runtime_endpoint_env text;

update provider_configs
set
  display_name = coalesce(display_name, provider_name),
  adapter_key = coalesce(adapter_key, provider_name),
  external_send_enabled = case
    when provider_kind = 'llm' and provider_name = 'local-dev' then false
    else external_send_enabled
  end,
  runtime_provider_env = coalesce(runtime_provider_env, 'LLM_PROVIDER'),
  runtime_model_env = coalesce(runtime_model_env, 'LLM_MODEL')
where provider_kind = 'llm';

insert into provider_configs (
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
  health_status
)
values (
  '00000000-0000-4000-8000-000000000303',
  'llm',
  'openai-compatible',
  'OpenAI-compatible',
  'openai-compatible',
  false,
  null,
  'gpt-4.1-mini',
  'environment',
  'OPENAI_COMPATIBLE_API_KEY',
  true,
  null,
  null,
  null,
  'unknown'
)
on conflict (provider_kind, provider_name) do update
set
  display_name = coalesce(provider_configs.display_name, excluded.display_name),
  adapter_key = coalesce(provider_configs.adapter_key, excluded.adapter_key),
  model_name = coalesce(provider_configs.model_name, excluded.model_name),
  secret_source = excluded.secret_source,
  required_secret_env = coalesce(provider_configs.required_secret_env, excluded.required_secret_env),
  external_send_enabled = excluded.external_send_enabled;

create table if not exists ai_task_definitions (
  id uuid primary key,
  task_key text not null unique,
  display_name text not null,
  description text,
  hook_key text not null,
  task_kind text not null default 'llm',
  implemented boolean not null default false,
  default_provider_name text,
  default_model_name text,
  runtime_option_id text not null,
  runtime_option_purpose text not null,
  runtime_provider_env text not null,
  runtime_model_env text not null,
  runtime_endpoint_env text,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_task_routes (
  task_definition_id uuid primary key references ai_task_definitions(id) on delete cascade,
  provider_config_id uuid references provider_configs(id),
  model_name text,
  enabled boolean not null default true,
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now()
);

-- Task definitions are user-managed from Settings. This migration creates the
-- routing tables only; it intentionally does not seed OCR, memo expansion, or
-- suggestion tasks.
