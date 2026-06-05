-- Make task prompt system messages explicit and editable.

update prompt_versions
set context_config = coalesce(context_config, '{}'::jsonb) || jsonb_build_object(
  'systemMessage',
  'Return strict JSON for expanded_work_item and related_suggestions. Do not include prose outside JSON.'
)
where context_config is null
   or context_config->>'systemMessage' is null;
