create type invite_type_enum as enum ('organization_employee', 'caregiver_client', 'organization_client', 'admin_static');

create table invite_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  invite_type invite_type_enum not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  metadata jsonb default '{}'::jsonb,
  constraint invite_tokens_token_unique unique (token),
  constraint invite_tokens_id_type_unique unique (id, invite_type)
);

alter table invite_tokens enable row level security;

create index invite_tokens_type_idx on invite_tokens (invite_type);
create index invite_tokens_active_idx on invite_tokens (invite_type) where used_at is null and revoked_at is null;

create table organization_invite_tokens (
  invite_id uuid primary key,
  invite_type invite_type_enum not null default 'organization_employee',
  organization_id uuid not null references organizations (id) on delete cascade,
  organization_type organization_type_enum not null,
  employee_role organization_employee_role_enum not null,
  invited_phone text,
  invited_email text,
  invited_name text,
  metadata jsonb default '{}'::jsonb,
  constraint organization_invite_tokens_type_check check (invite_type = 'organization_employee'),
  constraint organization_invite_tokens_invite_fk foreign key (invite_id, invite_type)
    references invite_tokens (id, invite_type) on delete cascade
);

alter table organization_invite_tokens enable row level security;

create index organization_invite_tokens_org_idx on organization_invite_tokens (organization_id);
create index organization_invite_tokens_role_idx on organization_invite_tokens (employee_role);

create table caregiver_client_invite_tokens (
  invite_id uuid primary key,
  invite_type invite_type_enum not null default 'caregiver_client',
  caregiver_id uuid not null references organizations (id) on delete cascade,
  invited_client_phone text,
  invited_client_name text,
  metadata jsonb default '{}'::jsonb,
  constraint caregiver_client_invite_tokens_type_check check (invite_type = 'caregiver_client'),
  constraint caregiver_client_invite_tokens_invite_fk foreign key (invite_id, invite_type)
    references invite_tokens (id, invite_type) on delete cascade
);

alter table caregiver_client_invite_tokens enable row level security;

create index caregiver_client_invite_tokens_caregiver_idx on caregiver_client_invite_tokens (caregiver_id);

create table organization_client_invite_tokens (
  invite_id uuid primary key,
  invite_type invite_type_enum not null default 'organization_client',
  organization_id uuid not null references organizations (id) on delete cascade,
  patient_card_id uuid not null references patient_cards (id) on delete cascade,
  diary_id uuid references diaries (id) on delete set null,
  invited_client_phone text,
  invited_client_name text,
  metadata jsonb default '{}'::jsonb,
  constraint organization_client_invite_tokens_type_check check (invite_type = 'organization_client'),
  constraint organization_client_invite_tokens_invite_fk foreign key (invite_id, invite_type)
    references invite_tokens (id, invite_type) on delete cascade
);

alter table organization_client_invite_tokens enable row level security;

create index organization_client_invite_tokens_org_idx on organization_client_invite_tokens (organization_id);
create index organization_client_invite_tokens_patient_card_idx on organization_client_invite_tokens (patient_card_id);
create index organization_client_invite_tokens_diary_idx on organization_client_invite_tokens (diary_id);

create table admin_static_tokens (
  invite_id uuid primary key,
  invite_type invite_type_enum not null default 'admin_static',
  label text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  constraint admin_static_tokens_type_check check (invite_type = 'admin_static'),
  constraint admin_static_tokens_invite_fk foreign key (invite_id, invite_type)
    references invite_tokens (id, invite_type) on delete cascade
);

alter table admin_static_tokens enable row level security;

create index admin_static_tokens_label_idx on admin_static_tokens (label);
