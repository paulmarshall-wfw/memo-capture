-- Persist the app-owned shared provider registry profile selection.

create table if not exists provider_registry_settings (
  singleton_id boolean primary key default true,
  selected_provider_profile_key text,
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now(),
  check (singleton_id = true)
);
