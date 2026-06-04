-- Align settings-owned task hooks with the simplified provider/task configuration UI.

update ai_task_definitions
set
  task_key = 'suggest-tags',
  display_name = 'Suggested tags',
  description = 'Suggest tags for a memo.',
  hook_key = 'suggest-tags',
  runtime_option_id = 'suggest-tags-provider',
  runtime_option_purpose = 'suggest-tags',
  runtime_provider_env = 'SUGGEST_TAGS_PROVIDER',
  runtime_model_env = 'SUGGEST_TAGS_MODEL',
  runtime_endpoint_env = 'SUGGEST_TAGS_ENDPOINT',
  implemented = false,
  updated_at = now()
where task_key = 'suggest-selected-tags'
  and not exists (
    select 1
    from ai_task_definitions existing
    where existing.task_key = 'suggest-tags'
  );

insert into ai_task_definitions (
  id,
  task_key,
  display_name,
  description,
  hook_key,
  task_kind,
  implemented,
  default_provider_name,
  default_model_name,
  runtime_option_id,
  runtime_option_purpose,
  runtime_provider_env,
  runtime_model_env,
  runtime_endpoint_env
)
values
  (
    '00000000-0000-4000-8000-000000000505',
    'revise-memo',
    'Revise memo',
    'Revise an existing memo draft.',
    'revise-memo',
    'llm',
    false,
    'local-dev',
    'memo-capture-local-dev-expander-v1',
    'revise-memo-provider',
    'revise-memo',
    'REVISE_MEMO_PROVIDER',
    'REVISE_MEMO_MODEL',
    'REVISE_MEMO_ENDPOINT'
  ),
  (
    '00000000-0000-4000-8000-000000000506',
    'suggest-tags',
    'Suggested tags',
    'Suggest tags for a memo.',
    'suggest-tags',
    'llm',
    false,
    'local-dev',
    'memo-capture-local-dev-expander-v1',
    'suggest-tags-provider',
    'suggest-tags',
    'SUGGEST_TAGS_PROVIDER',
    'SUGGEST_TAGS_MODEL',
    'SUGGEST_TAGS_ENDPOINT'
  )
on conflict (task_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  hook_key = excluded.hook_key,
  implemented = false,
  updated_at = now();

update ai_task_definitions
set task_kind_id = task_kinds.id
from task_kinds
where ai_task_definitions.task_kind = task_kinds.kind_key
  and ai_task_definitions.task_kind_id is null;

insert into ai_task_routes (task_definition_id, provider_config_id, model_name, enabled)
select id, null, default_model_name, false
from ai_task_definitions
where hook_key in ('revise-memo', 'suggest-tags')
on conflict (task_definition_id) do nothing;
