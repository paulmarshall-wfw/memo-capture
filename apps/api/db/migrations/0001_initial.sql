-- Memo Capture bootstrap schema baseline.
-- This is a starting migration and will evolve with the implementation spec.

create table if not exists app_users (
  id uuid primary key,
  oidc_subject text not null unique,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key,
  name text not null unique,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists feature_groups (
  id uuid primary key,
  project_id uuid not null references projects(id),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists contributors (
  id uuid primary key,
  display_name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists artifacts (
  id uuid primary key,
  object_key text not null unique,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null,
  content_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists source_memos (
  id uuid primary key,
  source_type text not null,
  artifact_id uuid references artifacts(id),
  original_text text,
  extracted_text text,
  content_hash text,
  contributor_id uuid references contributors(id),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists work_items (
  id uuid primary key,
  source_memo_id uuid not null references source_memos(id),
  project_id uuid references projects(id),
  feature_group_id uuid references feature_groups(id),
  contributor_id uuid references contributors(id),
  title text not null default '',
  body text not null default '',
  workflow_state text not null,
  workflow_item_version integer not null default 1,
  accepted_unexported_changes boolean not null default false,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_item_snapshots (
  id uuid primary key,
  work_item_id uuid not null references work_items(id),
  snapshot_kind text not null,
  title text not null,
  body text not null,
  project_id uuid references projects(id),
  feature_group_id uuid references feature_groups(id),
  contributor_id uuid references contributors(id),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists tags (
  id uuid primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists work_item_tags (
  work_item_id uuid not null references work_items(id) on delete cascade,
  tag_id uuid not null references tags(id),
  primary key (work_item_id, tag_id)
);

create table if not exists import_events (
  id uuid primary key,
  source_memo_id uuid references source_memos(id),
  artifact_id uuid references artifacts(id),
  machine_id text,
  original_path text,
  archive_path text,
  content_hash text not null,
  duplicate_of_source_memo_id uuid references source_memos(id),
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists processing_jobs (
  id uuid primary key,
  job_kind text not null,
  status text not null,
  source_memo_id uuid references source_memos(id),
  work_item_id uuid references work_items(id),
  attempt_count integer not null default 0,
  max_attempts integer not null default 1,
  run_after timestamptz not null default now(),
  claimed_by text,
  claim_expires_at timestamptz,
  error_code text,
  error_message text,
  provider_name text,
  model_name text,
  initiated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists processing_jobs_claim_idx
  on processing_jobs (status, run_after, claim_expires_at);

create table if not exists prompt_definitions (
  id uuid primary key,
  name text not null unique,
  purpose text not null,
  active_version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prompt_versions (
  id uuid primary key,
  prompt_definition_id uuid not null references prompt_definitions(id),
  version integer not null,
  body text not null,
  output_schema jsonb not null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  unique (prompt_definition_id, version)
);

create table if not exists ai_suggestions (
  id uuid primary key,
  parent_work_item_id uuid not null references work_items(id),
  status text not null,
  title text not null,
  body text not null,
  proposed_feature_group text,
  rationale text,
  prompt_version_id uuid references prompt_versions(id),
  provider_name text,
  model_name text,
  validation_result jsonb,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  dismissed_at timestamptz
);

create table if not exists workflow_active_definition (
  singleton_id boolean primary key default true,
  workflow_id text not null,
  variant_key text not null,
  workflow_version text not null,
  state_machine_version text not null,
  content_hash text not null,
  bundle jsonb not null,
  activated_by uuid references app_users(id),
  activated_at timestamptz not null default now(),
  constraint workflow_active_definition_singleton check (singleton_id)
);

create table if not exists workflow_activation_history (
  id uuid primary key,
  previous_workflow_version text,
  previous_state_machine_version text,
  previous_content_hash text,
  new_workflow_version text not null,
  new_state_machine_version text not null,
  new_content_hash text not null,
  activated_by uuid references app_users(id),
  activated_at timestamptz not null default now()
);

create table if not exists export_batches (
  id uuid primary key,
  schema_version text not null,
  created_by uuid references app_users(id),
  filter_context jsonb,
  manifest_artifact_id uuid references artifacts(id),
  jsonl_artifact_id uuid references artifacts(id),
  combined_markdown_artifact_id uuid references artifacts(id),
  created_at timestamptz not null default now()
);

create table if not exists export_batch_items (
  export_batch_id uuid not null references export_batches(id) on delete cascade,
  work_item_snapshot_id uuid not null references work_item_snapshots(id),
  primary key (export_batch_id, work_item_snapshot_id)
);
