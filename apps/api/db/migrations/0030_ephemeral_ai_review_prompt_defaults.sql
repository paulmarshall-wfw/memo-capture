update ai_task_definitions
set implemented = true,
    updated_at = now()
where hook_key in ('memo-expansion', 'suggest-new-memos')
  and implemented is distinct from true;

update prompt_versions
set context_config = jsonb_set(
  coalesce(context_config, '{}'::jsonb),
  '{systemMessage}',
  to_jsonb('Return only strict JSON matching this shape: { "expanded_work_item": { "title": "string", "body": "string", "tags": ["string"] } }. Do not include prose outside JSON.'::text),
  true
)
from ai_task_definitions
where ai_task_definitions.prompt_definition_id = prompt_versions.prompt_definition_id
  and ai_task_definitions.hook_key = 'memo-expansion'
  and (
    prompt_versions.context_config->>'systemMessage' is null
    or prompt_versions.context_config->>'systemMessage' = 'Return strict JSON for expanded_work_item and related_suggestions. Do not include prose outside JSON.'
  );

update prompt_versions
set context_config = jsonb_set(
  coalesce(context_config, '{}'::jsonb),
  '{systemMessage}',
  to_jsonb('Return only strict JSON matching this shape: { "suggested_work_items": [{ "title": "string", "body": "string", "tags": ["string"], "rationale": "string" }] }. Do not include prose outside JSON.'::text),
  true
)
from ai_task_definitions
where ai_task_definitions.prompt_definition_id = prompt_versions.prompt_definition_id
  and ai_task_definitions.hook_key = 'suggest-new-memos'
  and (
    prompt_versions.context_config->>'systemMessage' is null
    or prompt_versions.context_config->>'systemMessage' = 'Return strict JSON for expanded_work_item and related_suggestions. Do not include prose outside JSON.'
  );
