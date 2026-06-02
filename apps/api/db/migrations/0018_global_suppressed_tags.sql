create table if not exists suppressed_tags (
  normalized_name text primary key,
  display_name text not null,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppressed_tags_display_name_idx
  on suppressed_tags (lower(display_name), display_name);
