# ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ ПАРОЛЕЙ

## Проблема

`postgres-meta` не может подключиться к БД из-за несовпадения паролей.

## Решение

### 1. Установить пароли для обоих пользователей

```sql
ALTER ROLE postgres WITH PASSWORD 'Dn2907200!';
ALTER ROLE supabase_admin WITH PASSWORD 'Dn2907200!';
```

### 2. Перезапустить сервисы

```bash
cd ~/HealApp-Web
docker compose restart meta
docker restart supabase-studio
```

## Проверка

После перезапуска:

1. Откройте `http://176.124.217.224/` в режиме инкогнито
2. Введите: `admin` / `HealApp2024SecurePass!`
3. Таблицы должны загрузиться

## Если не работает

Проверьте логи:
```bash
docker logs healapp-web-meta-1 --tail 20
```

Если ошибки сохраняются, возможно нужно проверить `pg_hba.conf` или пересоздать БД с правильным паролем с самого начала.

