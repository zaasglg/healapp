# Применение миграций из Supabase Cloud

## Статус

- ✅ Auth исправлен и работает
- ✅ Получен список всех миграций (95 миграций)
- ⏳ Нужно получить SQL миграций и применить их

## Проблема

Таблица `supabase_migrations.schema_migrations` хранит только версии и имена миграций, но не SQL самих миграций.

## Решение

### Вариант 1: Использовать Supabase CLI (Рекомендуется)

На вашем локальном компьютере:

```bash
# Установить Supabase CLI
npm install -g supabase

# Авторизоваться
supabase login

# Связать проект
supabase link --project-ref mtpawypaihmwrngirnxa

# Получить дамп БД (включая все миграции)
supabase db dump -f migrations_backup.sql

# Загрузить на сервер
scp migrations_backup.sql root@176.124.217.224:~/HealApp-Web/
```

Затем на сервере:
```bash
ssh root@176.124.217.224
cd ~/HealApp-Web
docker compose exec -T db psql -U postgres -d postgres < migrations_backup.sql
```

### Вариант 2: Использовать pg_dump напрямую

```bash
# На вашем локальном компьютере
pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --schema=public --schema=storage --schema=auth \
  -f migrations_backup.sql

# Загрузить на сервер
scp migrations_backup.sql root@176.124.217.224:~/HealApp-Web/
```

### Вариант 3: Получить через Supabase Dashboard

1. Откройте https://mtpawypaihmwrngirnxa.supabase.co
2. Database → Migrations
3. Экспортируйте все миграции

## Важно

После применения миграций проверьте:
- ✅ Все таблицы созданы
- ✅ Все функции и RPC работают
- ✅ Все RLS политики применены
- ✅ Все индексы созданы

