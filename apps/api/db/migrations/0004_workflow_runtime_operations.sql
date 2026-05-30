-- Add indexes and constraints for workflow runtime operations.

create index if not exists workflow_staged_imports_status_created_at_idx
  on workflow_staged_imports (status, created_at);

create index if not exists workflow_staged_imports_identity_idx
  on workflow_staged_imports (workflow_id, workflow_version, content_hash);

create index if not exists workflow_activation_history_identity_idx
  on workflow_activation_history (workflow_id, new_workflow_version, activated_at);

create index if not exists work_items_workflow_state_updated_at_idx
  on work_items (workflow_state, updated_at);

do $$
begin
  if exists (
    select 1
    from workflow_staged_imports
    where status not in ('staged', 'activated', 'discarded', 'invalid')
  ) then
    raise exception 'Cannot apply 0004: workflow_staged_imports contains unsupported status values.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workflow_staged_imports_status_check'
  ) then
    alter table workflow_staged_imports
      add constraint workflow_staged_imports_status_check
      check (status in ('staged', 'activated', 'discarded', 'invalid'));
  end if;
end $$;
