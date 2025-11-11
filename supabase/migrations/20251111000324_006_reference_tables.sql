create table metric_catalog (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null unique,
  title text not null,
  category text not null,
  unit text,
  is_default boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table metric_catalog enable row level security;

create or replace function public.handle_metric_catalog_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger metric_catalog_set_updated_at
  before update on metric_catalog
  for each row
  execute function public.handle_metric_catalog_updated_at();

create index metric_catalog_category_idx on metric_catalog (category);
create index metric_catalog_is_default_idx on metric_catalog (is_default);

create table medication_dictionary (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  form text,
  dosage text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table medication_dictionary enable row level security;

create index medication_dictionary_name_idx on medication_dictionary using gin (to_tsvector('simple', name));

create table vitamin_dictionary (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  form text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table vitamin_dictionary enable row level security;

create index vitamin_dictionary_name_idx on vitamin_dictionary using gin (to_tsvector('simple', name));

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table activity_log enable row level security;

create index activity_log_user_idx on activity_log (user_id, created_at desc);
create index activity_log_entity_idx on activity_log (entity_type, entity_id);

create table support_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table support_logs enable row level security;

create index support_logs_admin_idx on support_logs (admin_user_id, created_at desc);
create index support_logs_user_idx on support_logs (user_id, created_at desc);

create table dashboard_counters (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  metric text not null,
  value numeric not null,
  collected_at date not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint dashboard_counters_scope_metric_unique unique (scope, metric, collected_at)
);

alter table dashboard_counters enable row level security;

create index dashboard_counters_scope_idx on dashboard_counters (scope, collected_at desc);

create table diary_activity_snapshots (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  snapshot_date date not null,
  filled_metrics_count integer not null default 0,
  caregivers_involved integer not null default 0,
  notes_count integer not null default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint diary_activity_snapshots_unique unique (diary_id, snapshot_date)
);

alter table diary_activity_snapshots enable row level security;

create index diary_activity_snapshots_diary_idx on diary_activity_snapshots (diary_id, snapshot_date desc);
