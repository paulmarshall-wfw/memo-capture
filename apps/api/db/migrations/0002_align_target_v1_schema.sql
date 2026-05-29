-- Align the bootstrap schema to the target V1 backend contract.
-- This migration is forward-only and keeps existing developer data where the
-- conversion is unambiguous.

do $$
begin
  if exists (
    select 1
    from work_items
    where workflow_state not in (
      'needs_ingestion_review',
      'new_idea',
      'parked',
      'accepted',
      'rejected',
      'ignored',
      'failed'
    )
  ) then
    raise exception 'Cannot apply 0002: work_items contains unsupported workflow_state values.';
  end if;

  if exists (
    select 1
    from processing_jobs
    where job_kind not in (
      'transcribe_audio',
      'extract_memo_metadata',
      'generate_keywords',
      'expand_work_item',
      'generate_export_batch'
    )
  ) then
    raise exception 'Cannot apply 0002: processing_jobs contains unsupported job_kind values.';
  end if;

  if exists (
    select 1
    from processing_jobs
    where status not in (
      'queued',
      'claimed',
      'running',
      'succeeded',
      'retry_scheduled',
      'failed',
      'exhausted',
      'cancelled'
    )
  ) then
    raise exception 'Cannot apply 0002: processing_jobs contains unsupported status values.';
  end if;
end $$;

alter table if exists app_users
  add column if not exists oidc_issuer text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz;

update app_users
set
  oidc_issuer = coalesce(oidc_issuer, 'memo-capture-local-dev'),
  first_seen_at = coalesce(first_seen_at, created_at, now()),
  last_seen_at = coalesce(last_seen_at, updated_at, created_at, now());

alter table if exists app_users
  alter column oidc_issuer set not null,
  alter column first_seen_at set not null,
  alter column last_seen_at set not null;

alter table if exists app_users
  drop constraint if exists app_users_oidc_subject_key;

create unique index if not exists app_users_oidc_identity_key
  on app_users (oidc_issuer, oidc_subject);

create index if not exists app_users_email_idx
  on app_users (lower(email))
  where email is not null;

alter table if exists projects
  add column if not exists slug text,
  add column if not exists context text not null default '',
  add column if not exists created_by uuid references app_users(id),
  add column if not exists updated_by uuid references app_users(id);

update projects
set slug = coalesce(
  slug,
  trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
);

alter table if exists projects
  alter column slug set not null;

create unique index if not exists projects_slug_key
  on projects (slug);

alter table if exists feature_groups
  add column if not exists slug text,
  add column if not exists description text not null default '',
  add column if not exists merged_into_feature_group_id uuid references feature_groups(id),
  add column if not exists created_by uuid references app_users(id),
  add column if not exists updated_by uuid references app_users(id);

do $$
begin
  if exists (
    select 1
    from (
      select lower(name) as normalized_name, count(*) as duplicate_count
      from feature_groups
      group by lower(name)
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Cannot apply 0002: feature_groups contains duplicate global names.';
  end if;
end $$;

update feature_groups
set slug = coalesce(
  slug,
  trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
);

alter table if exists feature_groups
  drop constraint if exists feature_groups_project_id_name_key,
  alter column slug set not null,
  alter column project_id drop not null;

create unique index if not exists feature_groups_slug_key
  on feature_groups (slug);

create unique index if not exists feature_groups_name_key
  on feature_groups (name);

alter table if exists contributors
  add column if not exists merged_into_contributor_id uuid references contributors(id),
  add column if not exists created_by uuid references app_users(id),
  add column if not exists updated_by uuid references app_users(id);

alter table if exists contributors
  drop constraint if exists contributors_display_name_key;

create table if not exists contributor_aliases (
  id uuid primary key,
  contributor_id uuid not null references contributors(id),
  alias text not null,
  created_at timestamptz not null default now(),
  created_by uuid references app_users(id),
  unique (contributor_id, alias)
);

alter table if exists artifacts
  add column if not exists artifact_kind text,
  add column if not exists bucket text,
  add column if not exists layout_version text not null default 'v1',
  add column if not exists created_by uuid references app_users(id);

update artifacts
set
  artifact_kind = coalesce(artifact_kind, 'original_text_file'),
  bucket = coalesce(bucket, 'memo-capture');

alter table if exists artifacts
  alter column artifact_kind set not null,
  alter column bucket set not null,
  alter column original_filename drop not null;

create index if not exists artifacts_content_hash_idx
  on artifacts (content_hash);

create index if not exists artifacts_kind_created_at_idx
  on artifacts (artifact_kind, created_at);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'source_memos' and column_name = 'artifact_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'source_memos' and column_name = 'primary_artifact_id'
  ) then
    alter table source_memos rename column artifact_id to primary_artifact_id;
  end if;
end $$;

alter table if exists source_memos
  add column if not exists current_transcript_text text,
  add column if not exists original_path text,
  add column if not exists archive_path text,
  add column if not exists contributor_text text,
  add column if not exists updated_at timestamptz;

update source_memos
set updated_at = coalesce(updated_at, created_at, now());

alter table if exists source_memos
  alter column updated_at set not null;

create table if not exists source_memo_artifacts (
  source_memo_id uuid not null references source_memos(id) on delete cascade,
  artifact_id uuid not null references artifacts(id),
  relationship text not null,
  created_at timestamptz not null default now(),
  primary key (source_memo_id, artifact_id, relationship)
);

insert into source_memo_artifacts (source_memo_id, artifact_id, relationship)
select id, primary_artifact_id, 'primary_original'
from source_memos
where primary_artifact_id is not null
on conflict do nothing;

alter table if exists work_items
  add column if not exists contributor_text text,
  add column if not exists body_format text not null default 'markdown',
  add column if not exists accepted_snapshot_id uuid;

do $$
begin
  if to_regclass('work_item_snapshots') is not null
    and to_regclass('accepted_snapshots') is null then
    alter table work_item_snapshots rename to accepted_snapshots;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_name = 'accepted_snapshots' and column_name = 'snapshot_kind'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'accepted_snapshots' and column_name = 'legacy_snapshot_kind'
  ) then
    alter table accepted_snapshots rename column snapshot_kind to legacy_snapshot_kind;
  end if;
end $$;

alter table if exists accepted_snapshots
  add column if not exists snapshot_number integer,
  add column if not exists body_format text not null default 'markdown',
  add column if not exists project_slug text,
  add column if not exists project_name text,
  add column if not exists feature_group_name text,
  add column if not exists contributor_text text,
  add column if not exists source_memo_id uuid references source_memos(id),
  add column if not exists source_content_hash text;

with numbered as (
  select
    id,
    row_number() over (partition by work_item_id order by created_at, id)::integer as snapshot_number
  from accepted_snapshots
)
update accepted_snapshots snapshots
set snapshot_number = coalesce(snapshots.snapshot_number, numbered.snapshot_number)
from numbered
where snapshots.id = numbered.id;

update accepted_snapshots snapshots
set
  project_slug = coalesce(snapshots.project_slug, projects.slug),
  project_name = coalesce(snapshots.project_name, projects.name),
  feature_group_name = coalesce(snapshots.feature_group_name, feature_groups.name),
  contributor_text = coalesce(snapshots.contributor_text, contributors.display_name),
  source_memo_id = coalesce(snapshots.source_memo_id, work_items.source_memo_id),
  source_content_hash = coalesce(snapshots.source_content_hash, source_memos.content_hash)
from work_items
left join source_memos on source_memos.id = work_items.source_memo_id
left join projects on projects.id = work_items.project_id
left join feature_groups on feature_groups.id = work_items.feature_group_id
left join contributors on contributors.id = work_items.contributor_id
where snapshots.work_item_id = work_items.id;

alter table if exists accepted_snapshots
  alter column snapshot_number set not null,
  alter column source_memo_id set not null;

create unique index if not exists accepted_snapshots_work_item_number_key
  on accepted_snapshots (work_item_id, snapshot_number);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_items_accepted_snapshot_fk'
  ) then
    alter table work_items
      add constraint work_items_accepted_snapshot_fk
      foreign key (accepted_snapshot_id) references accepted_snapshots(id);
  end if;
end $$;

alter table if exists tags
  add column if not exists normalized_name text,
  add column if not exists created_by uuid references app_users(id);

update tags
set normalized_name = coalesce(normalized_name, lower(name));

alter table if exists tags
  alter column normalized_name set not null;

create unique index if not exists tags_normalized_name_key
  on tags (normalized_name);

alter table if exists work_item_tags
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists created_by uuid references app_users(id);

alter table if exists import_events
  add column if not exists watch_folder_id text,
  add column if not exists warning_code text,
  add column if not exists warning_message text;

create table if not exists possible_duplicates (
  id uuid primary key,
  source_memo_id uuid references source_memos(id),
  work_item_id uuid references work_items(id),
  possible_duplicate_source_memo_id uuid references source_memos(id),
  possible_duplicate_work_item_id uuid references work_items(id),
  reason text not null,
  score numeric,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_by uuid references app_users(id),
  resolved_at timestamptz
);

create table if not exists file_type_settings (
  id uuid primary key,
  extension text not null unique,
  media_kind text not null,
  capability_state text not null,
  parser_key text,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists extraction_settings (
  singleton_id boolean primary key default true,
  project_confidence_threshold numeric not null default 0.7,
  feature_group_confidence_threshold numeric not null default 0.7,
  contributor_confidence_threshold numeric not null default 0.7,
  tag_confidence_threshold numeric not null default 0.7,
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now(),
  constraint extraction_settings_singleton check (singleton_id)
);

create table if not exists transcription_settings (
  singleton_id boolean primary key default true,
  max_retry_attempts integer not null default 3,
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now(),
  constraint transcription_settings_singleton check (singleton_id)
);

create table if not exists provider_configs (
  id uuid primary key,
  provider_kind text not null,
  provider_name text not null,
  enabled boolean not null default false,
  endpoint text,
  model_name text,
  secret_source text not null,
  health_status text not null default 'unknown',
  last_health_check_at timestamptz,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_kind, provider_name)
);

alter table if exists prompt_definitions
  add column if not exists retention_policy text not null default 'retain_active_and_referenced',
  add column if not exists created_by uuid references app_users(id),
  add column if not exists updated_by uuid references app_users(id);

alter table if exists processing_jobs
  add column if not exists export_batch_id uuid,
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists cancel_requested_by uuid references app_users(id),
  add column if not exists user_safe_error_message text,
  add column if not exists internal_error_detail text,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists estimated_cost_minor_units integer,
  add column if not exists estimated_cost_currency text,
  add column if not exists latency_ms integer;

update processing_jobs
set user_safe_error_message = coalesce(user_safe_error_message, error_message)
where error_message is not null;

create index if not exists processing_jobs_kind_status_idx
  on processing_jobs (job_kind, status);

create index if not exists processing_jobs_source_memo_idx
  on processing_jobs (source_memo_id);

create index if not exists processing_jobs_work_item_idx
  on processing_jobs (work_item_id);

create index if not exists processing_jobs_export_batch_idx
  on processing_jobs (export_batch_id);

create index if not exists processing_jobs_created_at_idx
  on processing_jobs (created_at);

alter table if exists workflow_active_definition
  add column if not exists required_app_capabilities jsonb not null default '[]'::jsonb;

alter table if exists workflow_activation_history
  add column if not exists workflow_id text not null default 'memo-capture-review',
  add column if not exists variant_key text not null default 'default',
  add column if not exists activation_notes text not null default '',
  add column if not exists compatibility_result jsonb not null default '{}'::jsonb;

create table if not exists workflow_staged_imports (
  id uuid primary key,
  workflow_id text not null,
  variant_key text not null,
  workflow_version text not null,
  state_machine_version text not null,
  content_hash text not null,
  bundle jsonb not null,
  validation_result jsonb not null,
  status text not null,
  imported_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

alter table if exists export_batches
  add column if not exists status text not null default 'pending',
  add column if not exists options jsonb not null default '{}'::jsonb,
  add column if not exists bundle_artifact_id uuid references artifacts(id),
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists error_code text,
  add column if not exists error_message text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'processing_jobs_export_batch_fk'
  ) then
    alter table processing_jobs
      add constraint processing_jobs_export_batch_fk
      foreign key (export_batch_id) references export_batches(id);
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'export_batch_items' and column_name = 'work_item_snapshot_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_name = 'export_batch_items' and column_name = 'accepted_snapshot_id'
  ) then
    alter table export_batch_items rename column work_item_snapshot_id to accepted_snapshot_id;
  end if;
end $$;

alter table if exists export_batch_items
  add column if not exists work_item_id uuid references work_items(id),
  add column if not exists project_slug text,
  add column if not exists item_markdown_artifact_id uuid references artifacts(id),
  add column if not exists created_at timestamptz not null default now();

update export_batch_items items
set
  work_item_id = coalesce(items.work_item_id, snapshots.work_item_id),
  project_slug = coalesce(items.project_slug, snapshots.project_slug)
from accepted_snapshots snapshots
where items.accepted_snapshot_id = snapshots.id;

create table if not exists export_templates (
  id uuid primary key,
  name text not null unique,
  schema_version text not null,
  include_contributor_default boolean not null default true,
  markdown_template text not null,
  frontmatter_template jsonb not null,
  is_active boolean not null default true,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id uuid primary key,
  event_name text not null,
  actor_user_id uuid references app_users(id),
  actor_email_snapshot text,
  actor_display_name_snapshot text,
  subject_type text not null,
  subject_id text,
  request_id text,
  job_id uuid references processing_jobs(id),
  source_memo_id uuid references source_memos(id),
  work_item_id uuid references work_items(id),
  metadata jsonb not null default '{}'::jsonb,
  redaction_applied boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_event_created_at_idx
  on audit_events (event_name, created_at);

create index if not exists audit_events_actor_created_at_idx
  on audit_events (actor_user_id, created_at);

create index if not exists audit_events_subject_idx
  on audit_events (subject_type, subject_id);

create index if not exists audit_events_work_item_created_at_idx
  on audit_events (work_item_id, created_at);

create index if not exists audit_events_job_created_at_idx
  on audit_events (job_id, created_at);

insert into file_type_settings (id, extension, media_kind, capability_state, parser_key)
values
  ('00000000-0000-4000-8000-000000000101', '.txt', 'text', 'active', 'plain-text'),
  ('00000000-0000-4000-8000-000000000102', '.md', 'text', 'active', 'markdown'),
  ('00000000-0000-4000-8000-000000000103', '.markdown', 'text', 'active', 'markdown'),
  ('00000000-0000-4000-8000-000000000201', '.m4a', 'audio', 'active', 'audio'),
  ('00000000-0000-4000-8000-000000000202', '.mp3', 'audio', 'active', 'audio'),
  ('00000000-0000-4000-8000-000000000203', '.wav', 'audio', 'active', 'audio')
on conflict (extension) do update
set
  media_kind = excluded.media_kind,
  capability_state = excluded.capability_state,
  parser_key = excluded.parser_key,
  updated_at = now();

insert into extraction_settings (singleton_id)
values (true)
on conflict (singleton_id) do nothing;

insert into transcription_settings (singleton_id)
values (true)
on conflict (singleton_id) do nothing;
