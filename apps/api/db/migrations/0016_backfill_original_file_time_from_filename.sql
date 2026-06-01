-- Recover original memo times for previously imported watched files whose names
-- begin with a timestamp such as "20230726 205704-C846C071.m4a".

with parsed_source_memos as (
  select
    source_memos.id,
    make_timestamptz(
      (matches.parts)[1]::integer,
      (matches.parts)[2]::integer,
      (matches.parts)[3]::integer,
      (matches.parts)[4]::integer,
      (matches.parts)[5]::integer,
      (matches.parts)[6]::double precision,
      'UTC'
    ) as parsed_original_file_modified_at
  from source_memos
  cross join lateral regexp_match(
    coalesce(source_memos.original_path, ''),
    '([12][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[\s_-]+([01][0-9]|2[0-3])([0-5][0-9])([0-5][0-9])'
  ) as matches(parts)
  where source_memos.original_file_modified_at = source_memos.created_at
)
update source_memos
set original_file_modified_at = parsed_source_memos.parsed_original_file_modified_at
from parsed_source_memos
where source_memos.id = parsed_source_memos.id;

with parsed_upload_sessions as (
  select
    import_upload_sessions.id,
    make_timestamptz(
      (matches.parts)[1]::integer,
      (matches.parts)[2]::integer,
      (matches.parts)[3]::integer,
      (matches.parts)[4]::integer,
      (matches.parts)[5]::integer,
      (matches.parts)[6]::double precision,
      'UTC'
    ) as parsed_original_file_modified_at
  from import_upload_sessions
  cross join lateral regexp_match(
    coalesce(import_upload_sessions.original_filename, import_upload_sessions.original_path, ''),
    '([12][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[\s_-]+([01][0-9]|2[0-3])([0-5][0-9])([0-5][0-9])'
  ) as matches(parts)
  where import_upload_sessions.original_file_modified_at is null
)
update import_upload_sessions
set original_file_modified_at = parsed_upload_sessions.parsed_original_file_modified_at
from parsed_upload_sessions
where import_upload_sessions.id = parsed_upload_sessions.id;

with parsed_import_events as (
  select
    import_events.id,
    make_timestamptz(
      (matches.parts)[1]::integer,
      (matches.parts)[2]::integer,
      (matches.parts)[3]::integer,
      (matches.parts)[4]::integer,
      (matches.parts)[5]::integer,
      (matches.parts)[6]::double precision,
      'UTC'
    ) as parsed_original_file_modified_at
  from import_events
  cross join lateral regexp_match(
    coalesce(import_events.original_path, ''),
    '([12][0-9]{3})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[\s_-]+([01][0-9]|2[0-3])([0-5][0-9])([0-5][0-9])'
  ) as matches(parts)
  where import_events.original_file_modified_at is null
)
update import_events
set original_file_modified_at = parsed_import_events.parsed_original_file_modified_at
from parsed_import_events
where import_events.id = parsed_import_events.id;
