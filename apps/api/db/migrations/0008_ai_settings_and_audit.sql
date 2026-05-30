-- Add AI expansion hardening, settings defaults, and audit query support.

alter table if exists ai_suggestions
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists feature_group_id uuid references feature_groups(id),
  add column if not exists applied_work_item_id uuid references work_items(id),
  add column if not exists dismissed_by uuid references app_users(id),
  add column if not exists applied_by uuid references app_users(id);

create index if not exists ai_suggestions_parent_status_idx
  on ai_suggestions (parent_work_item_id, status, created_at desc);

create index if not exists ai_suggestions_applied_work_item_idx
  on ai_suggestions (applied_work_item_id)
  where applied_work_item_id is not null;

insert into provider_configs (
  id,
  provider_kind,
  provider_name,
  enabled,
  endpoint,
  model_name,
  secret_source,
  health_status
)
values (
  '00000000-0000-4000-8000-000000000301',
  'llm',
  'local-dev',
  false,
  null,
  'memo-capture-local-dev-expander-v1',
  'environment',
  'unknown'
)
on conflict (provider_kind, provider_name) do nothing;

insert into prompt_definitions (
  id,
  name,
  purpose,
  active_version,
  retention_policy
)
values (
  '00000000-0000-4000-8000-000000000401',
  'work_item_expansion',
  'Expand one work item into a stronger draft plus related idea suggestions.',
  1,
  'retain_active_and_referenced'
)
on conflict (name) do nothing;

insert into prompt_versions (
  id,
  prompt_definition_id,
  version,
  body,
  output_schema
)
select
  '00000000-0000-4000-8000-000000000402',
  prompt_definitions.id,
  1,
  'Return strict JSON for expanded_work_item and related_suggestions. Do not include prose outside JSON.',
  '{
    "type": "object",
    "required": ["expanded_work_item", "related_suggestions"],
    "properties": {
      "expanded_work_item": {
        "type": "object",
        "required": ["title", "body", "tags", "feature_group"],
        "properties": {
          "title": { "type": "string" },
          "body": { "type": "string" },
          "tags": { "type": "array", "items": { "type": "string" } },
          "feature_group": { "type": ["string", "null"] }
        }
      },
      "related_suggestions": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["title", "body", "tags", "feature_group", "rationale"],
          "properties": {
            "title": { "type": "string" },
            "body": { "type": "string" },
            "tags": { "type": "array", "items": { "type": "string" } },
            "feature_group": { "type": ["string", "null"] },
            "rationale": { "type": "string" }
          }
        }
      }
    }
  }'::jsonb
from prompt_definitions
where prompt_definitions.name = 'work_item_expansion'
on conflict (prompt_definition_id, version) do nothing;
