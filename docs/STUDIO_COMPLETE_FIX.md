# Полное исправление Supabase Studio

## Проблема

Studio не может подключиться к БД и показывает ошибку "password authentication failed".

## Решение

### 1. Установить правильный пароль для `postgres` в БД

```sql
ALTER USER postgres WITH PASSWORD 'Dn2907200!';
```

### 2. Убедиться, что пароль в `.env` совпадает

```bash
cd ~/HealApp-Web
cat .env | grep SUPABASE_DB_PASSWORD
# Должно быть: SUPABASE_DB_PASSWORD=Dn2907200!
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

- `postgres-meta` использует пользователя `postgres` с паролем из `SUPABASE_DB_PASSWORD`
- Пароль должен совпадать в БД и в `.env` файле
- После изменения пароля обязательно перезапустите `meta` и `studio`

