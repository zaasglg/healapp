# Финальное исправление Supabase Studio

## Проблема

Studio показывает ошибку "password authentication failed for user 'supabase_admin'" и не может отобразить таблицы.

## Решение

### 1. Установить пароль для `supabase_admin` в БД

```bash
# На сервере
docker exec caregivers-diary-db psql -U postgres -c "ALTER ROLE supabase_admin WITH LOGIN PASSWORD 'Dn2907200!';"
```

### 2. Убедиться, что `meta` использует правильного пользователя

В `docker-compose.yml` для сервиса `meta`:
```yaml
environment:
  PG_META_DB_USER: supabase_admin
  PG_META_DB_PASSWORD: Dn2907200!
```

### 3. Перезапустить сервисы

```bash
cd ~/HealApp-Web
docker compose restart meta
docker restart supabase-studio
```

## Проверка

1. Откройте `http://supabase.healapp.ru/`
2. Введите HTTP аутентификацию: `admin` / `HealApp2024SecurePass!`
3. После входа должны отображаться все таблицы

## Важно

- `supabase_admin` - это системная роль в Supabase
- Пароль должен совпадать в БД и в `.env` файле
- После изменения пароля обязательно перезапустите `meta` и `studio`

