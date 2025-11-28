# Получение всех миграций из Supabase Cloud

## Список миграций

Получен полный список миграций из оригинального Supabase проекта через MCP Supabase.

Всего миграций: **95**

## Как получить SQL миграций

Миграции хранятся в Supabase Cloud, но SQL самих миграций не хранится в таблице `supabase_migrations.schema_migrations`.

Для получения SQL миграций нужно:

### Вариант 1: Через Supabase CLI

```bash
# Установить Supabase CLI
npm install -g supabase

# Авторизоваться
supabase login

# Связать проект
supabase link --project-ref mtpawypaihmwrngirnxa

# Получить дамп БД (включая все миграции)
supabase db dump -f migrations_backup.sql
```

### Вариант 2: Через Supabase Dashboard

1. Откройте https://mtpawypaihmwrngirnxa.supabase.co
2. Перейдите в Database → Migrations
3. Экспортируйте все миграции

### Вариант 3: Через API

Использовать Supabase Management API для получения миграций.

## Применение миграций

После получения SQL миграций, применить их на российский сервер:

```bash
# На сервере
cd ~/HealApp-Web
docker compose exec -T db psql -U postgres -d postgres < migrations_backup.sql
```

## Важно

Все миграции должны быть применены в том же порядке, в котором они были созданы в оригинальном Supabase проекте.

