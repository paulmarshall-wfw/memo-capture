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
  '00000000-0000-4000-8000-000000000302',
  'transcription',
  'whisper-cpp',
  false,
  null,
  'base.en',
  'environment',
  'unknown'
)
on conflict (provider_kind, provider_name) do update
set
  model_name = coalesce(provider_configs.model_name, excluded.model_name),
  secret_source = excluded.secret_source,
  updated_at = now();

update parser_type_settings
set
  display_name = 'Whisper.cpp provider marker',
  description = 'Deprecated parser-row marker. Configure file types with audio-transcription and select Whisper.cpp as the transcription provider.',
  capability_state = 'not_supported_yet',
  updated_at = now()
where parser_key = 'whisper-cpp';

update parser_type_settings
set
  display_name = 'Faster-Whisper provider marker',
  description = 'Future transcription provider marker. Configure file types with audio-transcription; provider-specific execution is selected separately.',
  capability_state = 'not_supported_yet',
  updated_at = now()
where parser_key = 'faster-whisper';

