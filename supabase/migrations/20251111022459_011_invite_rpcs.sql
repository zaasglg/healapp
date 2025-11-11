create or replace function public.generate_invite_link(
  invite_type invite_type_enum,
  payload jsonb
)
returns invite_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role user_role_enum;
  v_org_id uuid;
  v_org_type organization_type_enum;
  v_token uuid := gen_random_uuid();
  v_invite invite_tokens;
  v_employee_role organization_employee_role_enum;
  v_expires interval := coalesce((payload ->> 'expires_in_hours')::integer, 72) * interval '1 hour';
  v_expiry timestamptz := now() + v_expires;
  v_now timestamptz := now();
begin
  if not public.is_service_role() then
    v_actor_role := public.current_user_role();
    if v_actor_role not in ('organization', 'org_employee') then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    if v_actor_role = 'org_employee' and not public.current_user_has_manager_permissions() then
      raise exception 'Требуются права менеджера' using errcode = '42501';
    end if;
    v_org_id := public.current_organization_id();
    if v_org_id is null then
      raise exception 'organization_id is required';
    end if;
  else
    v_org_id := (payload ->> 'organization_id')::uuid;
  end if;

  select organization_type into v_org_type from organizations where id = v_org_id;
  if v_org_type is null then
    raise exception 'Organization not found';
  end if;

  insert into invite_tokens (
    id,
    token,
    invite_type,
    created_by,
    created_at,
    expires_at,
    metadata
  ) values (
    gen_random_uuid(),
    v_token::text,
    invite_type,
    auth.uid(),
    v_now,
    v_expiry,
    coalesce(payload -> 'metadata', '{}'::jsonb)
  )
  returning * into v_invite;

  if invite_type = 'organization_employee' then
    if v_org_type not in ('pension', 'patronage_agency') then
      raise exception 'Организация не может приглашать сотрудников';
    end if;
    v_employee_role := (payload ->> 'employee_role')::organization_employee_role_enum;
    if v_employee_role is null then
      raise exception 'employee_role is required';
    end if;
    insert into organization_invite_tokens (
      invite_id,
      organization_id,
      organization_type,
      employee_role,
      invited_phone,
      invited_email,
      invited_name
    ) values (
      v_invite.id,
      v_org_id,
      v_org_type,
      v_employee_role,
      payload ->> 'phone',
      payload ->> 'email',
      payload ->> 'name'
    );
  elsif invite_type = 'organization_client' then
    if v_org_type not in ('pension', 'patronage_agency') then
      raise exception 'Организация не может приглашать клиентов этим методом';
    end if;
    if payload ->> 'patient_card_id' is null then
      raise exception 'patient_card_id is required';
    end if;
    insert into organization_client_invite_tokens (
      invite_id,
      organization_id,
      patient_card_id,
      diary_id,
      invited_client_phone,
      invited_client_name
    ) values (
      v_invite.id,
      v_org_id,
      (payload ->> 'patient_card_id')::uuid,
      (payload ->> 'diary_id')::uuid,
      payload ->> 'phone',
      payload ->> 'name'
    );
  elsif invite_type = 'caregiver_client' then
    if v_org_type <> 'caregiver' then
      raise exception 'Только частные сиделки могут приглашать клиентов этим методом';
    end if;
    insert into caregiver_client_invite_tokens (
      invite_id,
      caregiver_id,
      invited_client_phone,
      invited_client_name
    ) values (
      v_invite.id,
      v_org_id,
      payload ->> 'phone',
      payload ->> 'name'
    );
  else
    raise exception 'unsupported invite_type %', invite_type;
  end if;

  return v_invite;
end;
$$;

comment on function public.generate_invite_link(invite_type_enum, jsonb)
  is 'Создание приглашения. Доступно организациям (и менеджерам) и service role.';

create or replace function public.revoke_invite_link(p_invite_id uuid)
returns invite_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite invite_tokens;
  v_actor_role user_role_enum;
  v_org_id uuid;
  v_target_id uuid := p_invite_id;
begin
  select * into v_invite from invite_tokens where id = v_target_id;
  if not found then
    raise exception 'Invite not found' using errcode = 'P0002';
  end if;

  if not public.is_service_role() then
    v_actor_role := public.current_user_role();
    if v_actor_role not in ('organization', 'org_employee') then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
    if v_actor_role = 'org_employee' and not public.current_user_has_manager_permissions() then
      raise exception 'Требуются права менеджера' using errcode = '42501';
    end if;

    if v_invite.invite_type = 'organization_employee' then
      select oit.organization_id into v_org_id from organization_invite_tokens oit where oit.invite_id = v_target_id;
    elsif v_invite.invite_type = 'organization_client' then
      select ocit.organization_id into v_org_id from organization_client_invite_tokens ocit where ocit.invite_id = v_target_id;
    elsif v_invite.invite_type = 'caregiver_client' then
      select ccit.caregiver_id into v_org_id from caregiver_client_invite_tokens ccit where ccit.invite_id = v_target_id;
    end if;

    if v_org_id is null or v_org_id <> public.current_organization_id() then
      raise exception 'Недостаточно прав' using errcode = '42501';
    end if;
  end if;

  update invite_tokens
    set revoked_at = now(), revoked_by = auth.uid()
    where id = v_target_id
    returning * into v_invite;

  return v_invite;
end;
$$;

comment on function public.revoke_invite_link(uuid)
  is 'Отзыв приглашения. Доступно организациям (менеджерам) и service role.';

revoke all on function public.generate_invite_link(invite_type_enum, jsonb) from public;
revoke all on function public.revoke_invite_link(uuid) from public;

grant execute on function public.generate_invite_link(invite_type_enum, jsonb) to authenticated;
grant execute on function public.revoke_invite_link(uuid) to authenticated;
