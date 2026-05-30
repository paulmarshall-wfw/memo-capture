-- Align workflow state storage with the 0.2.2 workflow-definition contract.

do $$
begin
  if exists (
    select 1
    from work_items
    where workflow_state not in (
      'needs_review',
      'needs_ingestion_review',
      'new_idea',
      'memo',
      'parked',
      'accepted',
      'rejected',
      'ignored',
      'failed'
    )
  ) then
    raise exception 'Cannot apply 0003: work_items contains unsupported workflow_state values.';
  end if;
end $$;

update work_items
set workflow_state = 'memo'
where workflow_state = 'new_idea';

update work_items
set workflow_state = 'needs_review'
where workflow_state = 'needs_ingestion_review';

alter table if exists workflow_active_definition
  drop column if exists variant_key;

alter table if exists workflow_activation_history
  drop column if exists variant_key;

alter table if exists workflow_staged_imports
  drop column if exists variant_key;
