# Инструкция по применению всех миграций из Supabase Cloud

## Статус

- ✅ Auth исправлен и работает
- ✅ Получен список всех миграций (95 миграций)
- ⏳ Нужно получить SQL миграций и применить их

## Проблема

Сервер не может подключиться к Supabase Cloud (DNS не разрешается), так как старый сервер отключен.

## Решение

Получить дамп через Supabase CLI на вашем локальном компьютере:

### Шаг 1: Установить Supabase CLI

```bash
npm install -g supabase
```

### Шаг 2: Авторизоваться

```bash
supabase login
```

### Шаг 3: Связать проект

```bash
supabase link --project-ref mtpawypaihmwrngirnxa
```

### Шаг 4: Получить дамп БД

```bash
supabase db dump -f migrations_backup.sql
```

Это создаст файл `migrations_backup.sql` со всей схемой БД и всеми миграциями.

### Шаг 5: Загрузить на сервер

```bash
scp migrations_backup.sql root@176.124.217.224:~/HealApp-Web/
```

### Шаг 6: Применить на сервере

```bash
ssh root@176.124.217.224
cd ~/HealApp-Web
docker compose exec -T db psql -U postgres -d postgres < migrations_backup.sql
```

## Альтернативный метод

Если Supabase CLI не работает, можно использовать `pg_dump` напрямую:

```bash
pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --schema=public --schema=storage --no-owner --no-acl \
  -f migrations_backup.sql
```

## После применения

Проверьте:
- ✅ Все таблицы созданы
- ✅ Все функции и RPC работают
- ✅ Все RLS политики применены
- ✅ Все индексы созданы

