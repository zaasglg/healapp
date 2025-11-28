# Инструкция по получению всех миграций из Supabase Cloud

## Список миграций

Получен полный список всех миграций из оригинального Supabase проекта:
- **Всего миграций: 95**

## Как получить SQL миграций

### Вариант 1: Через Supabase CLI (Рекомендуется)

На вашем локальном компьютере:

```bash
# Установить Supabase CLI (если еще не установлен)
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

### Вариант 2: Через Supabase Dashboard

1. Откройте https://mtpawypaihmwrngirnxa.supabase.co
2. Перейдите в **Database → Migrations**
3. Экспортируйте все миграции

### Вариант 3: Через pg_dump

```bash
# На вашем локальном компьютере
pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --schema=public --schema=storage --schema=auth \
  -f migrations_backup.sql
```

## Применение миграций на российский сервер

После получения файла `migrations_backup.sql`:

```bash
# На сервере
ssh root@176.124.217.224
cd ~/HealApp-Web

# Применить миграции
docker compose exec -T db psql -U postgres -d postgres < migrations_backup.sql
```

## Важно

- Все миграции должны быть применены в том же порядке, в котором они были созданы
- Проверьте, что все функции и RPC работают после применения миграций
- Убедитесь, что все таблицы и схемы созданы правильно

