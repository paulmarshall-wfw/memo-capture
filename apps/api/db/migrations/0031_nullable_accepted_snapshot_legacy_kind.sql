alter table if exists accepted_snapshots
  alter column legacy_snapshot_kind drop not null;
