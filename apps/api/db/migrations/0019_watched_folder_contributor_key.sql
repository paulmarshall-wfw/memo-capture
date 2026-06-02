-- Add hidden normalized contributor keys for watched-folder attribution.

alter table if exists contributors
  add column if not exists contributor_key text;

update contributors
set contributor_key = nullif(regexp_replace(lower(trim(display_name)), '[^a-z0-9]', '', 'g'), '')
where contributor_key is null;

create unique index if not exists contributors_contributor_key_unique
  on contributors (contributor_key)
  where contributor_key is not null;

alter table if exists import_upload_sessions
  add column if not exists contributor_text text;
