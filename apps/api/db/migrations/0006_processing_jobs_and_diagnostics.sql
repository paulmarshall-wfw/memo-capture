-- Add worker heartbeat and diagnostics support for processing jobs.

create table if not exists worker_heartbeats (
  worker_id text primary key,
  service text not null,
  supported_job_kinds text[] not null default '{}',
  version text not null,
  commit_sha text not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists worker_heartbeats_last_seen_at_idx
  on worker_heartbeats (last_seen_at desc);

create index if not exists processing_jobs_provider_created_at_idx
  on processing_jobs (provider_name, created_at)
  where provider_name is not null;

create index if not exists possible_duplicates_work_item_idx
  on possible_duplicates (work_item_id, status);

create index if not exists import_events_source_memo_created_at_idx
  on import_events (source_memo_id, created_at desc);

do $$
begin
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
    raise exception 'Cannot apply 0006: processing_jobs contains unsupported status values.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'processing_jobs_status_check'
  ) then
    alter table processing_jobs
      add constraint processing_jobs_status_check
      check (status in (
        'queued',
        'claimed',
        'running',
        'succeeded',
        'retry_scheduled',
        'failed',
        'exhausted',
        'cancelled'
      ));
  end if;
end $$;
