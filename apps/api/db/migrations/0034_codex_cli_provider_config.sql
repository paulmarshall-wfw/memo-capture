-- Add Memo Capture's local bridge for the shared invoke-providers Codex CLI adapter.

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
  '00000000-0000-4000-8000-000000000304',
  'llm',
  'codex-cli',
  'Codex CLI',
  'codex-cli',
  true,
  null,
  null,
  'environment',
  'INVOKE_PROVIDERS_CODEX_CLI_BINARY',
  true,
  null,
  null,
  null,
  'unknown'
)
on conflict (provider_kind, provider_name) do update
set
  display_name = excluded.display_name,
  adapter_key = excluded.adapter_key,
  secret_source = excluded.secret_source,
  required_secret_env = excluded.required_secret_env,
  external_send_enabled = excluded.external_send_enabled,
  enabled = true;

insert into provider_capabilities (id, provider_config_id, capability_key, enabled)
values
  (
    '00000000-0000-4000-8000-000000000322',
    '00000000-0000-4000-8000-000000000304',
    'llm.generateText',
    true
  ),
  (
    '00000000-0000-4000-8000-000000000323',
    '00000000-0000-4000-8000-000000000304',
    'llm.generateJson',
    true
  )
on conflict (provider_config_id, capability_key) do update
set enabled = true, updated_at = now();
