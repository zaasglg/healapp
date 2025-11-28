# ✅ Пароль БД обновлен

## Обновленный пароль

**Новый пароль:** `FGHgbfjx-314gkmGf`

## Что было обновлено

1. **Файл `.env` на сервере:**
   - `SUPABASE_DB_PASSWORD=FGHgbfjx-314gkmGf`

2. **Пользователь `postgres` в БД:**
   - Пароль обновлен

3. **Пользователь `supabase_admin` в БД:**
   - Пароль обновлен

4. **Все сервисы перезапущены:**
   - auth
   - rest
   - storage
   - realtime
   - meta
   - functions

## Строка подключения

```
postgresql://postgres:FGHgbfjx-314gkmGf@176.124.217.224:54322/postgres
```

Или для локального подключения через Docker:
```
postgresql://postgres:FGHgbfjx-314gkmGf@localhost:54322/postgres
```

## Использование

Этот пароль используется для:
- Прямого подключения к PostgreSQL через клиенты (psql, DBeaver, etc.)
- Подключения через Supabase Studio
- Внутренних сервисов Supabase (auth, rest, storage, realtime, meta)

## Примечание

Если вы снова измените пароль через интерфейс Studio, нужно будет:
1. Обновить его в `.env` файле
2. Обновить пароли для `postgres` и `supabase_admin` в БД
3. Перезапустить все сервисы

