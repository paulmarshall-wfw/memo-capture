-- Add watched-folder photo intake and attachment support.

alter table import_upload_sessions
  drop constraint if exists import_upload_sessions_source_type_check;

alter table import_upload_sessions
  add constraint import_upload_sessions_source_type_check check (source_type in (
    'watched_text_file',
    'watched_audio_file',
    'watched_photo_file'
  ));

update media_type_settings
set
  capability_state = 'active',
  description = 'Photo and image files that can be attached to generated memos.',
  updated_at = now()
where media_key = 'image';

insert into parser_type_settings (id, parser_key, display_name, description, media_key, capability_state)
values
  ('00000000-0000-4000-8000-000000001106', 'photo-preprocess', 'Photo preprocessing', 'Extract photo metadata and generate thumbnails.', 'image', 'active')
on conflict (parser_key) do update
set
  display_name = excluded.display_name,
  description = excluded.description,
  media_key = excluded.media_key,
  capability_state = excluded.capability_state,
  updated_at = now();

insert into file_type_settings (id, extension, media_kind, capability_state, parser_key)
values
  ('00000000-0000-4000-8000-000000000301', '.jpg', 'image', 'active', 'photo-preprocess'),
  ('00000000-0000-4000-8000-000000000302', '.jpeg', 'image', 'active', 'photo-preprocess'),
  ('00000000-0000-4000-8000-000000000303', '.png', 'image', 'active', 'photo-preprocess'),
  ('00000000-0000-4000-8000-000000000304', '.webp', 'image', 'active', 'photo-preprocess'),
  ('00000000-0000-4000-8000-000000000305', '.heic', 'image', 'active', 'photo-preprocess'),
  ('00000000-0000-4000-8000-000000000306', '.heif', 'image', 'active', 'photo-preprocess')
on conflict (extension) do update
set
  media_kind = excluded.media_kind,
  capability_state = excluded.capability_state,
  parser_key = excluded.parser_key,
  updated_at = now();

create table if not exists photo_imports (
  id uuid primary key,
  source_memo_id uuid not null references source_memos(id) on delete cascade,
  original_artifact_id uuid not null references artifacts(id),
  thumbnail_artifact_id uuid references artifacts(id),
  import_event_id uuid references import_events(id),
  status text not null,
  original_filename text not null,
  content_hash text not null,
  contributor_text text,
  contributor_id uuid references contributors(id),
  captured_at timestamptz,
  camera_make text,
  camera_model text,
  gps_latitude double precision,
  gps_longitude double precision,
  preprocessing_error_code text,
  preprocessing_error_message text,
  attached_work_item_id uuid references work_items(id),
  attached_at timestamptz,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint photo_imports_status_check check (status in (
    'available',
    'preprocessing',
    'preprocessing_failed',
    'attached'
  ))
);

create unique index if not exists photo_imports_source_memo_key
  on photo_imports (source_memo_id);

create index if not exists photo_imports_visible_idx
  on photo_imports (status, created_at desc)
  where status in ('available', 'preprocessing', 'preprocessing_failed');

create index if not exists photo_imports_attached_work_item_idx
  on photo_imports (attached_work_item_id)
  where attached_work_item_id is not null;

create table if not exists work_item_artifacts (
  work_item_id uuid not null references work_items(id) on delete cascade,
  artifact_id uuid not null references artifacts(id),
  relationship text not null,
  created_at timestamptz not null default now(),
  primary key (work_item_id, artifact_id, relationship)
);

create index if not exists work_item_artifacts_artifact_idx
  on work_item_artifacts (artifact_id);
