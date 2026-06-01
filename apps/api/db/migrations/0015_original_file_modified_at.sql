-- Preserve the original watched-file modified time as source memo provenance.

alter table if exists source_memos
  add column if not exists original_file_modified_at timestamptz;

alter table if exists import_upload_sessions
  add column if not exists original_file_modified_at timestamptz;

alter table if exists import_events
  add column if not exists original_file_modified_at timestamptz;

update source_memos
set original_file_modified_at = created_at
where original_file_modified_at is null;

create index if not exists source_memos_original_file_modified_at_idx
  on source_memos (original_file_modified_at desc);
