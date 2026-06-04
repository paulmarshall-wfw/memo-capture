-- Split provider-instance catalog from task-owned routing and prompt configuration.

create table if not exists task_kinds (
  id uuid primary key,
  kind_key text not null unique,
  display_name text not null,
  description text,
  provider_kind text not null,
  capability_key text not null,
  prompt_fields_enabled boolean not null default false,
  enabled boolean not null default true,
  active boolean not null default true,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists provider_capabilities (
  id uuid primary key,
  provider_config_id uuid not null references provider_configs(id) on delete cascade,
  capability_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_config_id, capability_key)
);

alter table if exists ai_task_definitions
  add column if not exists task_kind_id uuid references task_kinds(id),
  add column if not exists prompt_definition_id uuid references prompt_definitions(id);

insert into task_kinds (
  id,
  kind_key,
  display_name,
  description,
  provider_kind,
  capability_key,
  prompt_fields_enabled,
  enabled,
  active
)
values
  (
    '00000000-0000-4000-8000-000000000601',
    'llm',
    'LLM generation',
    'Structured language-model tasks that use versioned prompts.',
    'llm',
    'structured-generation',
    true,
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000602',
    'ocr',
    'OCR',
    'Image and PDF text extraction tasks.',
    'ocr',
    'ocr',
    false,
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000603',
    'stt',
    'Speech to text',
    'Audio transcription tasks.',
    'transcription',
    'speech-to-text',
    false,
    true,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000604',
    'tts',
    'Text to speech',
    'Speech synthesis tasks.',
    'tts',
    'text-to-speech',
    false,
    false,
    true
  )
on conflict (kind_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  provider_kind = excluded.provider_kind,
  capability_key = excluded.capability_key,
  prompt_fields_enabled = excluded.prompt_fields_enabled,
  enabled = excluded.enabled,
  active = excluded.active,
  updated_at = now();

update ai_task_definitions
set task_kind_id = task_kinds.id
from task_kinds
where ai_task_definitions.task_kind = task_kinds.kind_key
  and ai_task_definitions.task_kind_id is null;

update ai_task_definitions
set prompt_definition_id = prompt_definitions.id
from prompt_definitions
where ai_task_definitions.task_key = 'memo-expansion'
  and prompt_definitions.name = 'work_item_expansion'
  and ai_task_definitions.prompt_definition_id is null;

insert into provider_capabilities (id, provider_config_id, capability_key, enabled)
select
  md5('provider_capability:' || provider_configs.id::text || ':' || capability.capability_key)::uuid,
  provider_configs.id,
  capability.capability_key,
  true
from provider_configs
join lateral (
  values
    (case
      when provider_configs.provider_kind = 'llm' then 'structured-generation'
      when provider_configs.provider_kind = 'transcription' then 'speech-to-text'
      when provider_configs.provider_kind = 'ocr' then 'ocr'
      when provider_configs.provider_kind = 'tts' then 'text-to-speech'
      else null
    end)
) as capability(capability_key) on capability.capability_key is not null
on conflict (provider_config_id, capability_key) do nothing;

create index if not exists provider_capabilities_lookup_idx
  on provider_capabilities (capability_key, enabled);

create index if not exists ai_task_definitions_task_kind_idx
  on ai_task_definitions (task_kind_id);

create index if not exists ai_task_definitions_prompt_definition_idx
  on ai_task_definitions (prompt_definition_id)
  where prompt_definition_id is not null;
