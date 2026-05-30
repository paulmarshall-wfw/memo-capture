-- Add constraints and indexes used by accepted snapshots and export generation.

create index if not exists accepted_snapshots_work_item_created_at_idx
  on accepted_snapshots (work_item_id, created_at desc);

create index if not exists export_batches_status_created_at_idx
  on export_batches (status, created_at desc);

create index if not exists export_batch_items_snapshot_idx
  on export_batch_items (accepted_snapshot_id);

create index if not exists export_batch_items_work_item_idx
  on export_batch_items (work_item_id);

do $$
begin
  if exists (
    select 1
    from export_batches
    where status not in ('pending', 'generating', 'succeeded', 'failed', 'cancelled')
  ) then
    raise exception 'Cannot apply 0005: export_batches contains unsupported status values.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'export_batches_status_check'
  ) then
    alter table export_batches
      add constraint export_batches_status_check
      check (status in ('pending', 'generating', 'succeeded', 'failed', 'cancelled'));
  end if;
end $$;
