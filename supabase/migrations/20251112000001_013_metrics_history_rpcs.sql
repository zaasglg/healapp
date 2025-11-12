-- RPC функции для работы с метриками и историей
-- Шаг 16.4: Метрики и история

-- Триггер для автоматического обновления diary_history при добавлении значений метрик
create or replace function public.handle_diary_metric_value_insert()
returns trigger as $$
begin
  -- Добавляем запись в историю
  insert into diary_history (
    diary_id,
    event_type,
    payload,
    recorded_by,
    occurred_at
  ) values (
    new.diary_id,
    'metric_value',
    jsonb_build_object(
      'metric_key', new.metric_key,
      'metric_id', new.metric_id,
      'value', new.value,
      'recorded_at', new.recorded_at
    ),
    new.recorded_by,
    new.recorded_at
  );
  
  return new;
end;
$$ language plpgsql;

create trigger diary_metric_values_history_trigger
  after insert on diary_metric_values
  for each row
  execute function public.handle_diary_metric_value_insert();

comment on function public.handle_diary_metric_value_insert()
  is 'Триггер для автоматического добавления записей в diary_history при создании значений метрик.';

-- Функция сохранения значения метрики
create or replace function public.save_metric_value(
  p_diary_id uuid,
  p_metric_key text,
  p_value jsonb,
  p_recorded_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns diary_metric_values
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role user_role_enum;
  v_metric_id uuid;
  v_recorded_at timestamptz;
  v_metric_value diary_metric_values;
begin
  -- Проверка прав доступа
  if not public.is_service_role() then
    -- Проверяем доступ к дневнику
    if not public.has_diary_access(p_diary_id) then
      raise exception 'Нет доступа к дневнику' using errcode = '42501';
    end if;
  end if;

  -- Определяем время записи
  v_recorded_at := coalesce(p_recorded_at, timezone('utc', now()));

  -- Ищем метрику в дневнике
  select id into v_metric_id
  from diary_metrics
  where diary_id = p_diary_id
    and metric_key = p_metric_key
  limit 1;

  -- Если метрика не найдена, создаем её (для пользовательских метрик)
  if v_metric_id is null then
    insert into diary_metrics (
      diary_id,
      metric_key,
      is_pinned,
      metadata
    ) values (
      p_diary_id,
      p_metric_key,
      false,
      p_metadata
    )
    returning id into v_metric_id;
  end if;

  -- Сохраняем значение метрики
  insert into diary_metric_values (
    diary_id,
    metric_id,
    metric_key,
    value,
    recorded_at,
    recorded_by
  ) values (
    p_diary_id,
    v_metric_id,
    p_metric_key,
    p_value,
    v_recorded_at,
    auth.uid()
  )
  returning * into v_metric_value;

  return v_metric_value;
end;
$$;

comment on function public.save_metric_value(uuid, text, jsonb, timestamptz, jsonb)
  is 'Сохранение значения метрики. Доступно пользователям с доступом к дневнику.';

-- Функция получения истории дневника за конкретную дату
create or replace function public.get_diary_history(
  p_diary_id uuid,
  p_date date default null
)
returns table (
  event_type text,
  payload jsonb,
  recorded_by uuid,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_date date;
begin
  -- Проверка прав доступа
  if not public.is_service_role() then
    if not public.has_diary_access(p_diary_id) then
      raise exception 'Нет доступа к дневнику' using errcode = '42501';
    end if;
  end if;

  -- Если дата не указана, используем сегодня
  v_target_date := coalesce(p_date, current_date);

  -- Возвращаем историю за указанную дату
  return query
  select 
    dh.event_type,
    dh.payload,
    dh.recorded_by,
    dh.occurred_at
  from diary_history dh
  where dh.diary_id = p_diary_id
    and date(dh.occurred_at) = v_target_date
  order by dh.occurred_at asc;
end;
$$;

comment on function public.get_diary_history(uuid, date)
  is 'Получение истории дневника за конкретную дату. Доступно пользователям с доступом к дневнику.';

-- Функция получения последнего значения метрики
create or replace function public.get_last_metric_value(
  p_diary_id uuid,
  p_metric_key text
)
returns diary_metric_values
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metric_value diary_metric_values;
begin
  -- Проверка прав доступа
  if not public.is_service_role() then
    if not public.has_diary_access(p_diary_id) then
      raise exception 'Нет доступа к дневнику' using errcode = '42501';
    end if;
  end if;

  -- Получаем последнее значение метрики
  select * into v_metric_value
  from diary_metric_values
  where diary_id = p_diary_id
    and metric_key = p_metric_key
  order by recorded_at desc
  limit 1;

  return v_metric_value;
end;
$$;

comment on function public.get_last_metric_value(uuid, text)
  is 'Получение последнего значения метрики. Доступно пользователям с доступом к дневнику.';

-- Предоставляем права на выполнение функций
revoke all on function public.save_metric_value(uuid, text, jsonb, timestamptz, jsonb) from public;
revoke all on function public.get_diary_history(uuid, date) from public;
revoke all on function public.get_last_metric_value(uuid, text) from public;

grant execute on function public.save_metric_value(uuid, text, jsonb, timestamptz, jsonb) to authenticated;
grant execute on function public.get_diary_history(uuid, date) to authenticated;
grant execute on function public.get_last_metric_value(uuid, text) to authenticated;

