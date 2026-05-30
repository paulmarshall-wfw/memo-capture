-- Add backend-managed upload sessions for watched-folder artifact imports.

create table if not exists import_upload_sessions (
  id uuid primary key,
  status text not null,
  machine_id text not null,
  watch_folder_id text not null,
  source_type text not null,
  original_filename text not null,
  original_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  content_hash text not null,
  object_key text,
  bucket text,
  artifact_id uuid,
  reserved_source_memo_id uuid,
  duplicate_of_source_memo_id uuid references source_memos(id),
  created_by uuid not null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_at timestamptz,
  finalized_at timestamptz,
  constraint import_upload_sessions_status_check check (status in (
    'upload_required',
    'uploaded',
    'finalized',
    'duplicate_exact'
  )),
  constraint import_upload_sessions_source_type_check check (source_type in (
    'watched_text_file',
    'watched_audio_file'
  ))
);

create index if not exists import_upload_sessions_content_hash_idx
  on import_upload_sessions (content_hash);

create index if not exists import_upload_sessions_machine_created_at_idx
  on import_upload_sessions (machine_id, created_at desc);

create index if not exists import_upload_sessions_status_created_at_idx
  on import_upload_sessions (status, created_at desc);
