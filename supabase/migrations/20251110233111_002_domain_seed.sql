create type organization_type_enum as enum ('pension', 'patronage_agency', 'caregiver');
create type organization_employee_role_enum as enum ('admin', 'manager', 'doctor', 'caregiver');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  organization_type organization_type_enum not null,
  name text,
  first_name text,
  last_name text,
  phone text not null,
  city text,
  address text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organizations_user_unique unique (user_id)
);

create or replace function public.handle_organizations_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger organizations_set_updated_at
  before update on organizations
  for each row
  execute function public.handle_organizations_updated_at();

create table organization_employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  organization_id uuid not null references organizations (id) on delete cascade,
  role organization_employee_role_enum not null,
  phone text,
  first_name text,
  last_name text,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organization_employees_user_unique unique (user_id)
);

create or replace function public.handle_organization_employees_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger organization_employees_set_updated_at
  before update on organization_employees
  for each row
  execute function public.handle_organization_employees_updated_at();

create table clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  invited_by_caregiver_id uuid references organizations (id) on delete set null,
  invited_by_organization_id uuid references organizations (id) on delete set null,
  phone text not null,
  first_name text,
  last_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint clients_user_unique unique (user_id)
);

create or replace function public.handle_clients_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger clients_set_updated_at
  before update on clients
  for each row
  execute function public.handle_clients_updated_at();

alter table user_profiles
  add constraint user_profiles_org_fk foreign key (organization_id) references organizations (id) on delete set null,
  add constraint user_profiles_client_fk foreign key (client_id) references clients (id) on delete set null;
