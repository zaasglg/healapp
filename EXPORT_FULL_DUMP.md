# 📥 Как экспортировать ПОЛНЫЙ дамп из официального Supabase

## ⚠️ Важно:
Текущий файл `migrations_20251120_031007.sql` содержит только структуру auth схемы, но **НЕ содержит пользовательских таблиц** (user_profiles, clients, organizations, diaries и т.д.).

Нужно экспортировать **ПОЛНЫЙ дамп** со всеми таблицами!

---

## 🎯 Способ 1: Через Supabase Dashboard (Самый простой)

### 1. Откройте Supabase Dashboard:
- Зайдите на https://supabase.com
- Войдите в аккаунт
- Откройте проект **"Дневник подопечного"**

### 2. Перейдите в Database → Backups:
- В левом меню нажмите **Database** (иконка базы данных)
- Откройте вкладку **Backups**

### 3. Создайте новый бэкап:
- Нажмите **"Create backup"** или **"Download backup"**
- Выберите **"Full database dump"** (полный дамп)
- Скачайте SQL файл

**Этот файл будет содержать ВСЕ таблицы, включая пользовательские!**

---

## 🎯 Способ 2: Через SQL Editor (Если нет бэкапов)

### 1. Откройте SQL Editor:
- В левом меню нажмите **SQL Editor** (иконка с `</>`)

### 2. Выполните этот SQL для экспорта всех таблиц:

```sql
-- Экспорт всех пользовательских таблиц из схемы public
SELECT 
    'CREATE TABLE ' || schemaname || '.' || tablename || ' (' || E'\n' ||
    string_agg(
        '  ' || column_name || ' ' || 
        CASE 
            WHEN data_type = 'USER-DEFINED' THEN udt_name
            ELSE data_type
        END ||
        CASE 
            WHEN character_maximum_length IS NOT NULL 
            THEN '(' || character_maximum_length || ')'
            ELSE ''
        END ||
        CASE 
            WHEN is_nullable = 'NO' THEN ' NOT NULL'
            ELSE ''
        END ||
        CASE 
            WHEN column_default IS NOT NULL 
            THEN ' DEFAULT ' || column_default
            ELSE ''
        END,
        ',' || E'\n'
        ORDER BY ordinal_position
    ) || E'\n);\n\n'
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name NOT IN ('schema_migrations')
GROUP BY schemaname, tablename
ORDER BY schemaname, tablename;
```

Скопируйте результат и сохраните в файл.

---

## 🎯 Способ 3: Через pg_dump (Самый полный)

### 1. Получите Connection String:
- Перейдите в **Settings** → **Database**
- Скопируйте **Connection string** (URI format)
- Выглядит так: `postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres`

### 2. Выполните pg_dump на вашем компьютере:

```bash
# Установите PostgreSQL клиент (если нет)
# Windows: скачайте с https://www.postgresql.org/download/windows/

# Выполните дамп
pg_dump "postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres" \
  --schema=public \
  --schema=auth \
  --no-owner \
  --no-acl \
  -f full_dump.sql
```

**Замените:**
- `[PROJECT-REF]` - ваш project reference
- `[PASSWORD]` - пароль базы данных
- `[REGION]` - регион (например, eu-central-1)

---

## 🎯 Способ 4: Через Supabase CLI

### 1. Установите Supabase CLI:
```bash
npm install -g supabase
```

### 2. Войдите и свяжите проект:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Создайте полный дамп:
```bash
# Полный дамп со всеми схемами
supabase db dump --schema public,auth,storage -f full_dump.sql
```

---

## 📤 Что мне прислать:

**Нужен файл, который содержит:**
- ✅ Все таблицы из схемы `public` (user_profiles, clients, organizations, diaries и т.д.)
- ✅ Все функции
- ✅ Все триггеры
- ✅ Все политики RLS
- ✅ Все индексы
- ✅ Все типы данных

**Пришлите этот файл** — я применю все миграции на новом сервере!

---

## ✅ Проверка:

После экспорта проверьте, что в файле есть строки:
- `CREATE TABLE public.user_profiles`
- `CREATE TABLE public.clients`
- `CREATE TABLE public.organizations`
- `CREATE TABLE public.diaries`
- И другие ваши таблицы

Если этих строк нет — дамп неполный, используйте другой способ!

