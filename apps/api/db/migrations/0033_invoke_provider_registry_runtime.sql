-- Add shared invoke-providers registry selection and task-run history.

alter table if exists ai_task_routes
  add column if not exists registry_profile_key text,
  add column if not exists provider_key text,
  add column if not exists provider_model_override text;

update ai_task_routes
set
  registry_profile_key = coalesce(registry_profile_key, 'default'),
  provider_key = coalesce(
    provider_key,
    (
      select provider_configs.provider_name
      from provider_configs
      where provider_configs.id = ai_task_routes.provider_config_id
      limit 1
    )
  ),
  provider_model_override = coalesce(provider_model_override, model_name);

create index if not exists ai_task_routes_provider_key_idx
  on ai_task_routes (registry_profile_key, provider_key)
  where provider_key is not null;

create table if not exists invoke_task_runs (
  id uuid primary key,
  task_key text not null,
  hook_key text not null,
  provider_key text,
  adapter_key text,
  model text,
  prompt_version integer,
  prompt_snapshot_id uuid,
  status text not null check (status in ('succeeded', 'failed', 'skipped')),
  error_class text,
  error_message text,
  readiness_reasons jsonb not null default '[]'::jsonb,
  validation_metadata jsonb not null default '{}'::jsonb,
  latency_ms integer,
  usage_metadata jsonb not null default '{}'::jsonb,
  commit_sha text,
  request_id text,
  correlation_id text,
  actor_user_id uuid references app_users(id),
  work_item_id uuid references work_items(id) on delete set null,
  source_memo_id uuid references source_memos(id) on delete set null,
  processing_job_id uuid references processing_jobs(id) on delete set null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists invoke_task_runs_task_key_created_idx
  on invoke_task_runs (task_key, created_at desc);

create index if not exists invoke_task_runs_work_item_created_idx
  on invoke_task_runs (work_item_id, created_at desc)
  where work_item_id is not null;

create index if not exists invoke_task_runs_status_created_idx
  on invoke_task_runs (status, created_at desc);

update provider_capabilities
set capability_key = case capability_key
  when 'structured-generation' then 'llm.generateJson'
  when 'text-generation' then 'llm.generateText'
  when 'transcription' then 'stt.transcribe'
  when 'text-to-speech' then 'tts.synthesize'
  when 'ocr' then 'ocr.extractText'
  when 'script' then 'module.runDeterministic'
  else capability_key
end;

update task_kinds
set capability_key = case capability_key
  when 'structured-generation' then 'llm.generateJson'
  when 'text-generation' then 'llm.generateText'
  when 'transcription' then 'stt.transcribe'
  when 'text-to-speech' then 'tts.synthesize'
  when 'ocr' then 'ocr.extractText'
  when 'script' then 'module.runDeterministic'
  else capability_key
end;
