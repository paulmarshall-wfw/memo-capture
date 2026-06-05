-- Let user-managed tasks render callable buttons in app surfaces.

alter table if exists ai_task_definitions
  add column if not exists render_location text not null default 'work_item_detail',
  add column if not exists display_order integer not null default 0;

alter table if exists ai_task_definitions
  drop constraint if exists ai_task_definitions_render_location_check;

alter table if exists ai_task_definitions
  add constraint ai_task_definitions_render_location_check
    check (render_location in ('work_item_detail', 'work_item_list', 'export_page'));

create index if not exists ai_task_definitions_render_location_order_idx
  on ai_task_definitions (render_location, display_order, display_name, task_key);
