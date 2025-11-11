create type metric_category_enum as enum ('care', 'physical', 'excretion', 'symptom', 'custom');
create type metric_data_type_enum as enum ('boolean', 'number', 'range', 'text', 'json');

alter table metric_catalog
  alter column category type metric_category_enum using category::metric_category_enum,
  add column if not exists data_type metric_data_type_enum not null default 'text',
  add column if not exists default_frequency text,
  add column if not exists is_active boolean;

alter table metric_catalog rename column is_default to default_is_pinned;

update metric_catalog set is_active = true where is_active is null;
alter table metric_catalog
  alter column default_is_pinned set default false,
  alter column default_is_pinned set not null,
  alter column is_active set default true,
  alter column is_active set not null;

drop trigger if exists metric_catalog_set_updated_at on metric_catalog;
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

drop index if exists metric_catalog_category_idx;
drop index if exists metric_catalog_is_default_idx;
create index metric_catalog_category_active_idx on metric_catalog (category) where is_active;

alter table medication_dictionary rename column form to dosage_form;
alter table medication_dictionary rename column dosage to default_dosage;

alter table medication_dictionary
  add column if not exists is_active boolean,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update medication_dictionary set is_active = true where is_active is null;
alter table medication_dictionary
  alter column is_active set default true,
  alter column is_active set not null;

drop trigger if exists medication_dictionary_set_updated_at on medication_dictionary;
create or replace function public.handle_medication_dictionary_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger medication_dictionary_set_updated_at
  before update on medication_dictionary
  for each row
  execute function public.handle_medication_dictionary_updated_at();

drop index if exists medication_dictionary_name_idx;
create index medication_dictionary_active_idx on medication_dictionary (is_active) where is_active;

alter table vitamin_dictionary rename column form to dosage_form;

alter table vitamin_dictionary
  add column if not exists default_dosage text,
  add column if not exists is_active boolean,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update vitamin_dictionary set is_active = true where is_active is null;
alter table vitamin_dictionary
  alter column is_active set default true,
  alter column is_active set not null;

drop trigger if exists vitamin_dictionary_set_updated_at on vitamin_dictionary;
create or replace function public.handle_vitamin_dictionary_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger vitamin_dictionary_set_updated_at
  before update on vitamin_dictionary
  for each row
  execute function public.handle_vitamin_dictionary_updated_at();

drop index if exists vitamin_dictionary_name_idx;
create index vitamin_dictionary_active_idx on vitamin_dictionary (is_active) where is_active;

create type activity_target_enum as enum ('diary', 'patient_card', 'organization', 'client', 'employee', 'invite', 'other');
create type activity_action_enum as enum ('created', 'updated', 'deleted', 'invite_sent', 'invite_used', 'access_granted', 'access_revoked', 'note');

drop index if exists activity_log_user_idx;
drop index if exists activity_log_entity_idx;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_log'
      and column_name = 'user_id'
  ) then
    alter table activity_log rename column user_id to actor_user_id;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_log'
      and column_name = 'entity_type'
  ) then
    alter table activity_log rename column entity_type to target_type_tmp;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_log'
      and column_name = 'entity_id'
  ) then
    alter table activity_log rename column entity_id to target_id;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_log'
      and column_name = 'action'
  ) then
    alter table activity_log rename column action to action_tmp;
  end if;
end;
$$;

alter table activity_log
  add column if not exists target_type activity_target_enum,
  add column if not exists description text,
  add column if not exists action activity_action_enum not null default 'note';

update activity_log set target_type = target_type_tmp::activity_target_enum where target_type is null and target_type_tmp is not null;
update activity_log set action = action_tmp::activity_action_enum where action_tmp is not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_log'
      and column_name = 'target_type_tmp'
  ) then
    alter table activity_log drop column target_type_tmp;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activity_log'
      and column_name = 'action_tmp'
  ) then
    alter table activity_log drop column action_tmp;
  end if;
end;
$$;

create index activity_log_target_idx on activity_log (target_type, target_id);
create index activity_log_actor_idx on activity_log (actor_user_id);
create index activity_log_created_at_idx on activity_log (created_at desc);

drop index if exists support_logs_admin_idx;
drop index if exists support_logs_user_idx;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'support_logs'
      and column_name = 'admin_user_id'
  ) then
    alter table support_logs rename column admin_user_id to support_user_id;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'support_logs'
      and column_name = 'user_id'
  ) then
    alter table support_logs drop column user_id;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'support_logs'
      and column_name = 'action'
  ) then
    alter table support_logs drop column action;
  end if;
end;
$$;

alter table support_logs
  add column if not exists related_activity_id uuid references activity_log (id) on delete set null;

create index support_logs_support_user_idx on support_logs (support_user_id);
create index support_logs_related_activity_idx on support_logs (related_activity_id);

alter table dashboard_counters
  drop constraint if exists dashboard_counters_scope_metric_unique;

do $$
begin
  if exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dashboard_counters' and column_name = 'scope'
  ) then
    alter table dashboard_counters drop column scope;
  end if;
  if exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dashboard_counters' and column_name = 'metric'
  ) then
    alter table dashboard_counters drop column metric;
  end if;
  if exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dashboard_counters' and column_name = 'value'
  ) then
    alter table dashboard_counters drop column value;
  end if;
  if exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'dashboard_counters' and column_name = 'collected_at'
  ) then
    alter table dashboard_counters drop column collected_at;
  end if;
end;
$$;

alter table dashboard_counters
  add column if not exists total_organizations integer not null default 0,
  add column if not exists total_clients integer not null default 0,
  add column if not exists total_diaries integer not null default 0,
  add column if not exists total_employees integer not null default 0,
  add column if not exists total_invites integer not null default 0,
  add column if not exists snapshot_at timestamptz not null default timezone('utc', now());

drop index if exists dashboard_counters_scope_idx;
create index dashboard_counters_snapshot_idx on dashboard_counters (snapshot_at desc);

do $$
begin
  if exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'diary_activity_snapshots' and column_name = 'filled_metrics_count'
  ) then
    alter table diary_activity_snapshots drop column filled_metrics_count;
  end if;
  if exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'diary_activity_snapshots' and column_name = 'caregivers_involved'
  ) then
    alter table diary_activity_snapshots drop column caregivers_involved;
  end if;
  if exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'diary_activity_snapshots' and column_name = 'notes_count'
  ) then
    alter table diary_activity_snapshots drop column notes_count;
  end if;
end;
$$;

alter table diary_activity_snapshots
  add column if not exists metrics jsonb not null default '{}'::jsonb;
