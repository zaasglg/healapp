create table diary_history (
  id uuid primary key default gen_random_uuid(),
  diary_id uuid not null references diaries (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  recorded_by uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

alter table diary_history enable row level security;

create index diary_history_diary_id_idx on diary_history (diary_id, occurred_at desc);
