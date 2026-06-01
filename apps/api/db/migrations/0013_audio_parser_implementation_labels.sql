update parser_type_settings
set
  description = 'Generic audio transcription parser; retained for current audio mappings and removable once specific implementations are configured.',
  updated_at = now()
where parser_key = 'audio-transcription';

update parser_type_settings
set
  description = 'Specific audio transcription parser implementation planned for Whisper.cpp.',
  updated_at = now()
where parser_key = 'whisper-cpp';

update parser_type_settings
set
  description = 'Specific audio transcription parser implementation planned for Faster-Whisper.',
  updated_at = now()
where parser_key = 'faster-whisper';
