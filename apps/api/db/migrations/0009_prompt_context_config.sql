-- Add structured prompt context controls for versioned AI prompts.

alter table if exists prompt_versions
  add column if not exists context_config jsonb not null default '{
    "freeformText": "",
    "includeProjectSynopsis": true,
    "includeMemoMetadata": true,
    "includeMemoTranscriptText": true
  }'::jsonb;

update prompt_versions
set context_config = jsonb_build_object(
  'freeformText', body,
  'includeProjectSynopsis', true,
  'includeMemoMetadata', true,
  'includeMemoTranscriptText', true
)
where context_config is null
   or context_config = '{}'::jsonb
   or context_config->>'freeformText' is null;
