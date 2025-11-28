# Экспорт недостающих компонентов базы данных

Для полного переноса базы данных нужно экспортировать следующие компоненты:

## 1. Типы и ENUM

Выполните этот SQL запрос в SQL Editor:

```sql
-- Все пользовательские типы и ENUM
SELECT 
    n.nspname as schema_name,
    t.typname as type_name,
    CASE t.typtype
        WHEN 'e' THEN 'ENUM'
        WHEN 'c' THEN 'COMPOSITE'
        WHEN 'd' THEN 'DOMAIN'
        WHEN 'r' THEN 'RANGE'
        ELSE 'OTHER'
    END as type_type,
    pg_catalog.format_type(t.oid, NULL) as type_definition,
    string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as enum_values
FROM pg_catalog.pg_type t
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
WHERE n.nspname = 'public'
  AND t.typtype IN ('e', 'c', 'd', 'r')
  AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_type el 
    WHERE el.oid = t.typelem AND el.typarray = t.oid
  )
GROUP BY n.nspname, t.typname, t.typtype, t.oid
ORDER BY t.typname;
```

Экспортируйте результат в CSV: `types_enums.csv`

---

## 2. Внешние ключи (Foreign Keys)

Выполните этот SQL запрос:

```sql
-- Все внешние ключи
SELECT
    tc.table_schema,
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;
```

Экспортируйте результат в CSV: `foreign_keys.csv`

---

## 3. Уникальные ограничения и индексы (Unique Constraints)

Выполните этот SQL запрос:

```sql
-- Все уникальные ограничения
SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    tc.constraint_type
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;
```

Экспортируйте результат в CSV: `unique_constraints.csv`

---

## 4. CHECK ограничения

Выполните этот SQL запрос:

```sql
-- Все CHECK ограничения
SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints AS tc
JOIN information_schema.check_constraints AS cc
  ON tc.constraint_name = cc.constraint_name
  AND tc.table_schema = cc.constraint_schema
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;
```

Экспортируйте результат в CSV: `check_constraints.csv`

---

## 5. Расширения PostgreSQL (Extensions)

Выполните этот SQL запрос:

```sql
-- Все установленные расширения
SELECT 
    extname as extension_name,
    extversion as version
FROM pg_extension
WHERE extname NOT IN ('plpgsql', 'pg_catalog')
ORDER BY extname;
```

Экспортируйте результат в CSV: `extensions.csv`

---

## 6. Последовательности (Sequences)

Выполните этот SQL запрос:

```sql
-- Все последовательности в схеме public
SELECT 
    sequence_schema,
    sequence_name,
    data_type,
    numeric_precision,
    numeric_scale,
    start_value,
    minimum_value,
    maximum_value,
    increment,
    cycle_option
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;
```

Экспортируйте результат в CSV: `sequences.csv`

---

## 7. Права доступа (Grants)

Выполните этот SQL запрос:

```sql
-- Все права доступа на таблицы
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type,
    is_grantable
FROM information_schema.table_privileges
WHERE table_schema = 'public'
ORDER BY table_name, grantee, privilege_type;
```

Экспортируйте результат в CSV: `grants.csv`

---

## 8. Комментарии к таблицам и колонкам

Выполните этот SQL запрос:

```sql
-- Комментарии к таблицам
SELECT 
    'TABLE' as object_type,
    schemaname,
    tablename as object_name,
    NULL as column_name,
    obj_description(c.oid, 'pg_class') as comment
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE schemaname = 'public'
UNION ALL
-- Комментарии к колонкам
SELECT 
    'COLUMN' as object_type,
    table_schema as schemaname,
    table_name as object_name,
    column_name,
    col_description(c.oid, a.attnum) as comment
FROM information_schema.columns i
JOIN pg_class c ON c.relname = i.table_name
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = i.column_name
WHERE table_schema = 'public'
  AND col_description(c.oid, a.attnum) IS NOT NULL
ORDER BY object_type, object_name, column_name;
```

Экспортируйте результат в CSV: `comments.csv`

---

## 9. Триггеры на auth.users (если есть)

Выполните этот SQL запрос:

```sql
-- Триггеры на таблице auth.users
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    event_object_schema,
    action_statement,
    action_timing,
    action_orientation
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users'
ORDER BY trigger_name;
```

Экспортируйте результат в CSV: `auth_triggers.csv`

---

## Приоритет экспорта:

**КРИТИЧНО (без этого не будет работать):**
1. ✅ Типы и ENUM - **ОБЯЗАТЕЛЬНО** (создан файл 00_types_and_extensions.sql, но нужно проверить значения!)
2. ✅ Расширения PostgreSQL - **ОБЯЗАТЕЛЬНО** (включено в 00_types_and_extensions.sql)
3. ✅ Внешние ключи - **ОБЯЗАТЕЛЬНО** (если есть)

**ВАЖНО (для полной функциональности):**
4. Уникальные ограничения
5. CHECK ограничения
6. Последовательности (если используются)

**ОПЦИОНАЛЬНО (можно добавить позже):**
7. Права доступа
8. Комментарии
9. Триггеры на auth.users

