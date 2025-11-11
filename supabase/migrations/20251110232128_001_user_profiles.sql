create type user_role_enum as enum ('admin', 'organization', 'org_employee', 'client');

create table if not exists user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role user_role_enum not null,
  phone_e164 text,
  phone_verified_at timestamptz,
  organization_id uuid,
  client_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.handle_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger user_profiles_set_updated_at
  before update on user_profiles
  for each row
  execute function public.handle_user_profiles_updated_at();
