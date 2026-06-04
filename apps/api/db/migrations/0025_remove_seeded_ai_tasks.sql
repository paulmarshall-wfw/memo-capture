-- Remove earlier built-in task definitions from already-migrated databases.
-- Users create the task list themselves from Settings.

delete from ai_task_definitions
where id in (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-4000-8000-000000000503',
    '00000000-0000-4000-8000-000000000504',
    '00000000-0000-4000-8000-000000000505',
    '00000000-0000-4000-8000-000000000506'
  );
