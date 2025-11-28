# Исправление аутентификации БД в Supabase Studio

## Проблема

Studio показывает ошибку: "password authentication failed for user 'supabase_admin'"

Это означает, что сервис `postgres-meta` (который Studio использует для подключения к БД) не может подключиться к PostgreSQL.

## Решение

### 1. Установить пароль для `supabase_admin` в БД

```bash
# На сервере
docker exec -it caregivers-diary-db psql -U postgres -c "ALTER USER supabase_admin WITH PASSWORD 'Dn2907200!';"
```

### 2. Обновить пароль в `.env` файле

```bash
# На сервере
cd ~/HealApp-Web
sed -i 's/SUPABASE_DB_PASSWORD=.*/SUPABASE_DB_PASSWORD=Dn2907200!/' .env
sed -i 's/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=Dn2907200!/' .env
```

### 3. Перезапустить сервисы

```bash
# На сервере
cd ~/HealApp-Web
docker compose up -d meta
docker restart supabase-studio
```

### 4. Проверить работу

1. Откройте `http://supabase.healapp.ru/` (или `http://176.124.217.224/`)
2. Введите логин/пароль для HTTP аутентификации:
   - Логин: `admin`
   - Пароль: `HealApp2024SecurePass!`
3. После входа в Studio должны отображаться все таблицы и настройки

## Важно

- Пароль БД (`Dn2907200!`) используется для подключения `postgres-meta` к PostgreSQL
- HTTP аутентификация (`admin`/`HealApp2024SecurePass!`) используется для защиты доступа к Studio
- Это два разных уровня аутентификации

## Если проблема сохраняется

1. Проверьте логи: `docker logs healapp-web-meta-1`
2. Проверьте подключение: `docker exec -it caregivers-diary-db psql -U supabase_admin -d postgres -c 'SELECT 1;'`
3. Убедитесь, что пароль в `.env` совпадает с паролем в БД

