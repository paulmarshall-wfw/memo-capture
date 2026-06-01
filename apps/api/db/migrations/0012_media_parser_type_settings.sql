create table if not exists media_type_settings (
  id uuid primary key,
  media_key text not null unique,
  display_name text not null,
  description text,
  capability_state text not null,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists parser_type_settings (
  id uuid primary key,
  parser_key text not null unique,
  display_name text not null,
  description text,
  media_key text not null references media_type_settings(media_key) on update cascade,
  capability_state text not null,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into media_type_settings (id, media_key, display_name, description, capability_state)
values
  ('00000000-0000-4000-8000-000000001001', 'text', 'Text', 'Plain text and Markdown memo files.', 'active'),
  ('00000000-0000-4000-8000-000000001002', 'audio', 'Audio', 'Audio recordings that can be transcribed into memo text.', 'active'),
  ('00000000-0000-4000-8000-000000001003', 'image', 'Image', 'Image-based memo capture planned for a future parser.', 'not_supported_yet'),
  ('00000000-0000-4000-8000-000000001004', 'pdf', 'PDF', 'PDF memo capture planned for a future parser.', 'not_supported_yet')
on conflict (media_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  capability_state = excluded.capability_state,
  updated_at = now();

insert into media_type_settings (id, media_key, display_name, description, capability_state)
select
  (
    substr(md5('media:' || media_kind), 1, 8) || '-' ||
    substr(md5('media:' || media_kind), 9, 4) || '-' ||
    '4' || substr(md5('media:' || media_kind), 14, 3) || '-' ||
    '8' || substr(md5('media:' || media_kind), 18, 3) || '-' ||
    substr(md5('media:' || media_kind), 21, 12)
  )::uuid,
  media_kind,
  media_kind,
  'Custom media type preserved from existing file type settings.',
  'not_supported_yet'
from (
  select distinct media_kind
  from file_type_settings
  where media_kind is not null
) existing_media
where not exists (
  select 1 from media_type_settings where media_key = existing_media.media_kind
);

update file_type_settings
set parser_key = 'audio-transcription', updated_at = now()
where parser_key = 'audio';

insert into parser_type_settings (id, parser_key, display_name, description, media_key, capability_state)
values
  ('00000000-0000-4000-8000-000000001101', 'plain-text', 'Plain text', 'Extract UTF-8 text from plain text files.', 'text', 'active'),
  ('00000000-0000-4000-8000-000000001102', 'markdown', 'Markdown', 'Extract UTF-8 Markdown text.', 'text', 'active'),
  ('00000000-0000-4000-8000-000000001103', 'audio-transcription', 'Audio transcription', 'Transcribe audio files through the configured transcription provider.', 'audio', 'active'),
  ('00000000-0000-4000-8000-000000001104', 'whisper-cpp', 'Whisper.cpp', 'Future local transcription provider option behind audio transcription.', 'audio', 'not_supported_yet'),
  ('00000000-0000-4000-8000-000000001105', 'faster-whisper', 'Faster-Whisper', 'Future local transcription provider option behind audio transcription.', 'audio', 'not_supported_yet')
on conflict (parser_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  media_key = excluded.media_key,
  capability_state = excluded.capability_state,
  updated_at = now();

insert into parser_type_settings (id, parser_key, display_name, description, media_key, capability_state)
select
  (
    substr(md5('parser:' || parser_key), 1, 8) || '-' ||
    substr(md5('parser:' || parser_key), 9, 4) || '-' ||
    '4' || substr(md5('parser:' || parser_key), 14, 3) || '-' ||
    '8' || substr(md5('parser:' || parser_key), 18, 3) || '-' ||
    substr(md5('parser:' || parser_key), 21, 12)
  )::uuid,
  parser_key,
  parser_key,
  'Custom parser type preserved from existing file type settings.',
  media_kind,
  'not_supported_yet'
from (
  select distinct parser_key, media_kind
  from file_type_settings
  where parser_key is not null
) existing_parsers
where not exists (
  select 1 from parser_type_settings where parser_key = existing_parsers.parser_key
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'file_type_settings_media_kind_fk'
  ) then
    alter table file_type_settings
      add constraint file_type_settings_media_kind_fk
      foreign key (media_kind)
      references media_type_settings(media_key)
      on update cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'file_type_settings_parser_key_fk'
  ) then
    alter table file_type_settings
      add constraint file_type_settings_parser_key_fk
      foreign key (parser_key)
      references parser_type_settings(parser_key)
      on update cascade;
  end if;
end $$;
