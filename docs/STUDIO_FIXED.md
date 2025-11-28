# Исправление аутентификации Supabase Studio

## Проблема решена

Исправлена ошибка "password authentication failed for user 'supabase_admin'" в Supabase Studio.

## Что было сделано

1. **Обновлен пароль в `.env` файле**:
   - `SUPABASE_DB_PASSWORD=Dn2907200!`
   - `POSTGRES_PASSWORD=Dn2907200!`

2. **Установлен пароль для `supabase_admin` в БД**:
   ```sql
   ALTER USER supabase_admin WITH PASSWORD 'Dn2907200!';
   ```

3. **Перезапущены сервисы**:
   - `docker compose restart meta`
   - `docker restart supabase-studio`

## Проверка работы

1. Откройте `http://supabase.healapp.ru/` (или `http://176.124.217.224/`)
2. Введите HTTP аутентификацию:
   - Логин: `admin`
   - Пароль: `HealApp2024SecurePass!`
3. После входа в Studio должны отображаться:
   - ✅ Все таблицы в разделе "Table Editor"
   - ✅ Все схемы и настройки
   - ✅ Доступ ко всем функциям Studio

## Учетные данные

### HTTP аутентификация (для доступа к Studio):
- **Логин**: `admin`
- **Пароль**: `HealApp2024SecurePass!`

### Пароль БД (для подключения postgres-meta):
- **Пароль**: `Dn2907200!`
- Используется автоматически сервисом `meta`

## Если проблема сохраняется

1. Проверьте логи: `docker logs healapp-web-meta-1`
2. Проверьте подключение: `docker exec caregivers-diary-db psql -U supabase_admin -d postgres -c 'SELECT 1;'`
3. Убедитесь, что пароль в `.env` совпадает с паролем в БД

