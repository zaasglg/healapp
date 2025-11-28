# 📥 Экспорт миграций из официального Supabase

## Способ 1: Через Supabase CLI (Рекомендуется)

### 1. Установите Supabase CLI (если еще не установлен):

```bash
# Windows (через npm)
npm install -g supabase

# Или через Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### 2. Войдите в Supabase:

```bash
supabase login
```

Это откроет браузер для авторизации.

### 3. Свяжите проект с локальным проектом:

```bash
# Перейдите в директорию вашего проекта
cd "C:\Users\User\Desktop\Веб версия дневник"

# Свяжите с проектом (нужен project-ref из URL Supabase)
supabase link --project-ref YOUR_PROJECT_REF
```

**Где найти project-ref:**
- Зайдите на https://supabase.com
- Откройте ваш проект "Дневник подопечного"
- В URL будет что-то вроде: `https://supabase.com/dashboard/project/abcdefghijklmnop`
- `abcdefghijklmnop` - это ваш project-ref

### 4. Скачайте все миграции:

```bash
# Скачать все миграции из облака
supabase db pull

# Или создать дамп всей базы данных
supabase db dump -f migrations_export.sql
```

Миграции будут сохранены в папке `supabase/migrations/` или в указанном файле.

## Способ 2: Через SQL Editor в Supabase Dashboard

### 1. Откройте SQL Editor:
- Зайдите на https://supabase.com
- Откройте проект "Дневник подопечного"
- Перейдите в **SQL Editor** (иконка с кодом в левом меню)

### 2. Создайте SQL дамп:

Выполните этот SQL запрос для получения структуры всех таблиц:

```sql
-- Экспорт схемы всех таблиц
SELECT 
    'CREATE TABLE ' || schemaname || '.' || tablename || ' (' ||
    string_agg(
        column_name || ' ' || data_type ||
        CASE 
            WHEN character_maximum_length IS NOT NULL 
            THEN '(' || character_maximum_length || ')'
            ELSE ''
        END ||
        CASE 
            WHEN is_nullable = 'NO' THEN ' NOT NULL'
            ELSE ''
        END,
        ', '
    ) || ');'
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY schemaname, tablename;
```

### 3. Экспорт через pg_dump (если есть доступ к базе):

Если у вас есть строка подключения к базе данных:

```bash
# Используйте Connection String из Settings → Database
pg_dump -h db.xxxxx.supabase.co -U postgres -d postgres -F c -f backup.dump

# Или SQL формат
pg_dump -h db.xxxxx.supabase.co -U postgres -d postgres -f backup.sql
```

**Где найти Connection String:**
- Settings → Database
- Connection string (URI format)

## Способ 3: Экспорт через Supabase Dashboard (самый простой)

### 1. Откройте Database → Migrations:
- Зайдите на https://supabase.com
- Откройте проект "Дневник подопечного"
- Перейдите в **Database** → **Migrations**

### 2. Скачайте каждую миграцию:
- Нажмите на каждую миграцию
- Скопируйте SQL код
- Сохраните в файлы

## 📋 Что нужно экспортировать:

1. **Все таблицы** (CREATE TABLE)
2. **Все функции** (CREATE FUNCTION)
3. **Все триггеры** (CREATE TRIGGER)
4. **Все политики RLS** (CREATE POLICY)
5. **Все индексы** (CREATE INDEX)
6. **Все типы** (CREATE TYPE)
7. **Все последовательности** (CREATE SEQUENCE)

## ✅ После экспорта:

Пришлите мне:
- Файлы миграций из папки `supabase/migrations/`
- Или один SQL файл с дампом
- Или скопируйте SQL из SQL Editor

Я применю их на новом сервере!
