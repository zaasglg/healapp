# Восстановление данных в БД

## Проблема

После удаления volume данные были потеряны. Нужно восстановить из бэкапа.

## Что нужно сделать

### 1. Найти бэкап

Бэкап должен быть в одной из этих директорий:
- `/root/backup*.sql`
- `/root/HealApp-Web/backup*.sql`
- `/root/*.sql` или `/root/*.dump`

### 2. Восстановить данные

```bash
cd ~/HealApp-Web

# Восстановить из SQL файла
docker compose exec -T db psql -U postgres postgres < /path/to/backup.sql

# Или из dump файла
docker compose exec -T db pg_restore -U postgres -d postgres /path/to/backup.dump
```

### 3. Проверить восстановление

```bash
cd ~/HealApp-Web

# Проверить количество таблиц
docker compose exec db psql -U postgres -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';"

# Должно быть 26 таблиц
```

### 4. Перезапустить сервисы

```bash
cd ~/HealApp-Web

docker compose restart meta
docker restart supabase-studio
```

## Если бэкапа нет

Нужно будет импортировать данные заново из Supabase Cloud или восстановить из другого источника.

