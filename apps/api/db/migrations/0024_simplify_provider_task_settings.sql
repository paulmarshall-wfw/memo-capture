-- Align task definitions with the simplified provider/task configuration UI.
-- Task definitions are user-managed from Settings, so this migration only
-- backfills task kind IDs for any user-created rows that already exist.

update ai_task_definitions
set task_kind_id = task_kinds.id
from task_kinds
where ai_task_definitions.task_kind = task_kinds.kind_key
  and ai_task_definitions.task_kind_id is null;
