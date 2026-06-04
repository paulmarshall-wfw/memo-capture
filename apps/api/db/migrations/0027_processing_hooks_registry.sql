-- Persist the in-app processing hook registry so Settings can create and delete
-- hook keys without coupling task configuration to hard-coded dropdown values.

create table if not exists processing_hooks (
  hook_key text primary key,
  created_by uuid references app_users(id),
  updated_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint processing_hooks_hook_key_format check (hook_key ~ '^[a-z0-9][a-z0-9-]{0,63}$')
);

insert into processing_hooks (hook_key)
values
  ('memo-expansion'),
  ('revise-memo'),
  ('suggest-new-memos'),
  ('suggest-tags')
on conflict (hook_key) do nothing;

insert into processing_hooks (hook_key)
select distinct hook_key
from ai_task_definitions
where hook_key is not null and hook_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'
on conflict (hook_key) do nothing;
