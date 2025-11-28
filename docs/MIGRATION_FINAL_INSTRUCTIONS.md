# ✅ Финальные инструкции по применению миграций

## Статус

- ✅ Auth исправлен и работает
- ✅ Все сервисы работают
- ✅ Получен список всех миграций (95 миграций)

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

## После применения

Проверьте:
- ✅ Все таблицы созданы
- ✅ Все функции и RPC работают
- ✅ Все RLS политики применены
- ✅ Все индексы созданы

## Готово

После применения миграций все функции и RPC будут работать так же, как в оригинальном проекте.

