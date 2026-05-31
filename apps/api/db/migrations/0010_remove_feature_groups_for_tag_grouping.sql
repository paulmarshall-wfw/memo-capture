-- Remove feature groups from the V1 domain contract and preserve existing
-- assignments as normal tags.

alter table if exists work_item_tags
  add column if not exists assignment_source text not null default 'user',
  add column if not exists confidence numeric,
  add column if not exists item_count integer;

create table if not exists tag_statistics (
  tag_id uuid primary key references tags(id) on delete cascade,
  document_count integer not null default 0,
  total_item_count integer not null default 0,
  project_distribution jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists tag_co_occurrences (
  tag_id uuid not null references tags(id) on delete cascade,
  co_tag_id uuid not null references tags(id) on delete cascade,
  co_document_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tag_id, co_tag_id),
  constraint tag_co_occurrences_order check (tag_id < co_tag_id)
);

insert into tags (id, name, normalized_name, created_by, created_at)
select md5('feature_group_tag:' || lower(trim(feature_groups.name)))::uuid, feature_groups.name, lower(trim(feature_groups.name)), feature_groups.created_by, now()
from feature_groups
where trim(feature_groups.name) <> ''
on conflict (normalized_name) do nothing;

insert into work_item_tags (
  work_item_id,
  tag_id,
  assignment_source,
  confidence,
  item_count,
  created_by,
  created_at
)
select
  work_items.id,
  tags.id,
  'feature_group_migration',
  1.0,
  1,
  work_items.updated_by,
  now()
from work_items
join feature_groups on feature_groups.id = work_items.feature_group_id
join tags on tags.normalized_name = lower(trim(feature_groups.name))
where work_items.feature_group_id is not null
on conflict (work_item_id, tag_id) do nothing;

alter table if exists ai_suggestions
  drop column if exists feature_group_id,
  drop column if exists proposed_feature_group;

alter table if exists accepted_snapshots
  drop column if exists feature_group_id,
  drop column if exists feature_group_name;

alter table if exists work_item_snapshots
  drop column if exists feature_group_id;

alter table if exists work_items
  drop column if exists feature_group_id;

alter table if exists extraction_settings
  drop column if exists feature_group_confidence_threshold;

drop table if exists feature_groups;

update prompt_versions
set output_schema = jsonb_set(
  jsonb_set(
    output_schema #- '{properties,expanded_work_item,properties,feature_group}',
    '{properties,expanded_work_item,required}',
    (
      select jsonb_agg(value)
      from jsonb_array_elements(output_schema #> '{properties,expanded_work_item,required}') as value
      where value <> '"feature_group"'::jsonb
    )
  ) #- '{properties,related_suggestions,items,properties,feature_group}',
  '{properties,related_suggestions,items,required}',
  (
    select jsonb_agg(value)
    from jsonb_array_elements(output_schema #> '{properties,related_suggestions,items,required}') as value
    where value <> '"feature_group"'::jsonb
  )
)
where output_schema ? 'properties'
  and output_schema #> '{properties,expanded_work_item,properties,feature_group}' is not null;

insert into tag_statistics (
  tag_id,
  document_count,
  total_item_count,
  project_distribution,
  updated_at
)
select
  tags.id,
  count(distinct work_item_tags.work_item_id),
  coalesce(sum(work_item_tags.item_count), 0),
  coalesce(
    jsonb_object_agg(project_counts.slug, project_counts.document_count)
      filter (where project_counts.slug is not null),
    '{}'::jsonb
  ),
  now()
from tags
join work_item_tags on work_item_tags.tag_id = tags.id
left join lateral (
  select projects.slug, count(distinct scoped_tags.work_item_id) as document_count
  from work_item_tags scoped_tags
  join work_items on work_items.id = scoped_tags.work_item_id
  join projects on projects.id = work_items.project_id
  where scoped_tags.tag_id = tags.id
  group by projects.slug
) project_counts on true
group by tags.id
on conflict (tag_id) do update
set
  document_count = excluded.document_count,
  total_item_count = excluded.total_item_count,
  project_distribution = excluded.project_distribution,
  updated_at = now();
