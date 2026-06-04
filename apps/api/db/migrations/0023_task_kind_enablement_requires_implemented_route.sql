-- Keep draft task kinds configurable while preventing runtime enablement before app route logic exists.

update task_kinds
set enabled = false,
    updated_at = now()
where enabled = true
  and not exists (
    select 1
    from ai_task_definitions
    where lower(ai_task_definitions.task_kind) = lower(task_kinds.kind_key)
      and ai_task_definitions.implemented = true
  );
