create table patient_cards (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  full_name text not null,
  date_of_birth date,
  height_cm integer,
  weight_kg integer,
  gender text,
  diagnoses jsonb default '[]'::jsonb,
  mobility text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table patient_cards enable row level security;

create index patient_cards_client_id_idx on patient_cards (client_id);

create or replace function public.handle_patient_cards_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger patient_cards_set_updated_at
  before update on patient_cards
  for each row
  execute function public.handle_patient_cards_updated_at();

create table diaries (
  id uuid primary key default gen_random_uuid(),
  owner_client_id uuid not null references clients (id) on delete cascade,
  patient_card_id uuid not null references patient_cards (id) on delete cascade,
  organization_id uuid references organizations (id) on delete set null,
  organization_type organization_type_enum,
  caregiver_id uuid references organizations (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  status text default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint diaries_unique_patient_active unique (patient_card_id, status)
);

alter table diaries enable row level security;

create index diaries_owner_client_id_idx on diaries (owner_client_id);
create index diaries_patient_card_id_idx on diaries (patient_card_id);
create index diaries_organization_id_idx on diaries (organization_id);

create or replace function public.handle_diaries_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger diaries_set_updated_at
  before update on diaries
  for each row
  execute function public.handle_diaries_updated_at();

create table diary_metrics (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  metric_key text not null,
  is_pinned boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table diary_metrics enable row level security;

create unique index diary_metrics_unique_key on diary_metrics (diary_id, metric_key);

create table diary_metric_values (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  metric_id uuid references diary_metrics (id) on delete set null,
  metric_key text not null,
  value jsonb,
  recorded_at timestamptz not null default timezone('utc', now()),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table diary_metric_values enable row level security;

create index diary_metric_values_diary_id_idx on diary_metric_values (diary_id, recorded_at);

create table diary_employee_access (
  diary_id uuid not null references diaries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  constraint diary_employee_access_pk primary key (diary_id, user_id)
);

alter table diary_employee_access enable row level security;

create index diary_employee_access_user_id_idx on diary_employee_access (user_id);

create table diary_client_links (
  diary_id uuid not null references diaries (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  token text,
  constraint diary_client_links_pk primary key (diary_id, client_id)
);

alter table diary_client_links enable row level security;

create index diary_client_links_client_id_idx on diary_client_links (client_id);

create table diary_external_access_links (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  invited_email text,
  invited_phone text,
  link_token text not null,
  expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);

alter table diary_external_access_links enable row level security;

create unique index diary_external_access_links_token_idx on diary_external_access_links (link_token);
