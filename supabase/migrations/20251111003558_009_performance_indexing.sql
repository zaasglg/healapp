-- Дополнительные индексы для производительности
create index if not exists diaries_owner_status_active_idx
  on diaries (owner_client_id, status)
  where status = 'active';

create index if not exists diaries_org_status_active_idx
  on diaries (organization_id, status)
  where organization_id is not null and status = 'active';

create index if not exists diaries_caregiver_status_active_idx
  on diaries (caregiver_id, status)
  where caregiver_id is not null and status = 'active';

create index if not exists diary_employee_access_active_idx
  on diary_employee_access (diary_id, user_id)
  where revoked_at is null;

create index if not exists diary_employee_access_user_active_idx
  on diary_employee_access (user_id)
  where revoked_at is null;

drop index if exists diary_metric_values_diary_id_idx;
create index diary_metric_values_diary_date_idx
  on diary_metric_values (diary_id, recorded_at desc);

create index if not exists invite_tokens_org_employee_active_idx
  on invite_tokens (token)
  where invite_type = 'organization_employee' and used_at is null and revoked_at is null;

create index if not exists invite_tokens_org_client_active_idx
  on invite_tokens (token)
  where invite_type = 'organization_client' and used_at is null and revoked_at is null;

create index if not exists invite_tokens_caregiver_client_active_idx
  on invite_tokens (token)
  where invite_type = 'caregiver_client' and used_at is null and revoked_at is null;

-- Материализованные представления для админ-панели
create materialized view admin_invites_view as
select
  it.id,
  it.token,
  it.invite_type,
  it.created_at,
  it.used_at,
  it.revoked_at,
  it.metadata,
  case
    when it.invite_type = 'organization_employee' then oit.organization_id
    when it.invite_type = 'organization_client' then ocit.organization_id
    when it.invite_type = 'caregiver_client' then ccit.caregiver_id
    else null
  end as organization_id,
  case
    when it.invite_type = 'organization_employee' then oit.employee_role::text
    else null
  end as employee_role,
  case
    when it.invite_type = 'organization_client' then ocit.patient_card_id
    else null
  end as patient_card_id,
  case
    when it.invite_type = 'organization_client' then ocit.diary_id
    else null
  end as diary_id
from invite_tokens it
left join organization_invite_tokens oit on oit.invite_id = it.id
left join organization_client_invite_tokens ocit on ocit.invite_id = it.id
left join caregiver_client_invite_tokens ccit on ccit.invite_id = it.id;

create unique index on admin_invites_view (id);

create materialized view admin_users_view as
select
  up.user_id,
  up.role,
  up.phone_e164,
  up.organization_id,
  up.client_id,
  up.metadata,
  u.email,
  u.created_at
from user_profiles up
join auth.users u on u.id = up.user_id;

create unique index on admin_users_view (user_id);

create materialized view admin_diaries_view as
select
  d.id as diary_id,
  d.owner_client_id,
  d.organization_id,
  d.organization_type,
  d.caregiver_id,
  d.status,
  d.created_at,
  d.updated_at,
  pc.full_name as patient_name,
  org.name as organization_name,
  caregiver.name as caregiver_name,
  (select count(*) from diary_metric_values dmv where dmv.diary_id = d.id) as metric_entries,
  (select count(*) from diary_employee_access dea where dea.diary_id = d.id and dea.revoked_at is null) as active_employees
from diaries d
left join patient_cards pc on pc.id = d.patient_card_id
left join organizations org on org.id = d.organization_id
left join organizations caregiver on caregiver.id = d.caregiver_id;

create unique index on admin_diaries_view (diary_id);
