-- Scope tag nomination to project lexicons and hide tags until nomination completes.

alter table if exists work_items
  add column if not exists tag_nomination_completed_at timestamptz,
  add column if not exists tag_nomination_project_id uuid references projects(id),
  add column if not exists tag_nomination_job_id uuid references processing_jobs(id);

create table if not exists project_tags (
  project_id uuid not null references projects(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  first_seen_work_item_id uuid references work_items(id) on delete set null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  primary key (project_id, tag_id)
);

insert into project_tags (
  project_id,
  tag_id,
  first_seen_work_item_id,
  created_by,
  created_at
)
select distinct on (work_items.project_id, work_item_tags.tag_id)
  work_items.project_id,
  work_item_tags.tag_id,
  work_item_tags.work_item_id,
  work_item_tags.created_by,
  work_item_tags.created_at
from work_item_tags
join work_items on work_items.id = work_item_tags.work_item_id
where work_items.project_id is not null
order by work_items.project_id, work_item_tags.tag_id, work_item_tags.created_at asc
on conflict (project_id, tag_id) do nothing;

create index if not exists project_tags_tag_id_idx
  on project_tags (tag_id);

create index if not exists work_items_tag_nomination_project_idx
  on work_items (tag_nomination_project_id, tag_nomination_completed_at);
