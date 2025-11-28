# Настройка домена для Supabase

## Текущая конфигурация

- **Домен**: `supabase.healapp.ru`
- **IP**: `176.124.217.224`
- **DNS**: A-запись настроена (`supabase → 176.124.217.224`)

## Доступ к Supabase Studio

После настройки домен доступен по адресу:
```
http://supabase.healapp.ru/
```

Studio автоматически проксируется через nginx на порт 54324.

## Решение проблемы с доступом к базе данных

Если в Studio появляется ошибка "password authentication failed for user 'supabase_admin'", выполните:

```bash
# На сервере - создайте SQL файл
echo "ALTER USER supabase_admin WITH PASSWORD 'HealApp2024SecurePass!';" > /tmp/fix_password.sql

# Выполните SQL
docker exec -i caregivers-diary-db psql -U postgres < /tmp/fix_password.sql

# Перезапустите сервисы
docker restart healapp-web-meta-1
docker restart supabase-studio
```

## Проверка работы

1. **Важно:** Убедитесь, что порт 80 открыт в панели управления Timeweb Cloud (см. `docs/TIMEWEB_FIREWALL_SETUP.md`)
2. **Важно:** Убедитесь, что группа правил файрвола **применена к вашему серверу**
3. Подождите 2-3 минуты после применения правил
4. Откройте `http://supabase.healapp.ru/` в браузере
5. Появится окно запроса логина и пароля:
   - **Логин**: `admin`
   - **Пароль**: `HealApp2024SecurePass!`
6. После ввода откроется интерфейс Supabase Studio

## Если Studio показывает ошибку аутентификации БД

Если вы видите ошибку "password authentication failed for user 'supabase_admin'":

1. Пароль БД должен быть установлен в `.env` файле: `SUPABASE_DB_PASSWORD=Dn2907200!`
2. Пароль должен совпадать в БД: `ALTER USER supabase_admin WITH PASSWORD 'Dn2907200!';`
3. Перезапустите сервисы: `docker compose up -d meta && docker restart supabase-studio`
4. Подробнее см. `docs/STUDIO_DB_AUTH_FIX.md`

## Если домен не доступен

Если домен не открывается с вашего компьютера:

1. **Проверьте, что группа правил файрвола применена к серверу** (не только создана, но и подключена к серверу)
2. **Проверьте файрвол в панели Timeweb Cloud** - порт 80 должен быть открыт
3. **Подождите 2-3 минуты** после применения правил (может потребоваться время)
4. **Проверьте DNS**: `nslookup supabase.healapp.ru` должен вернуть `176.124.217.224`
5. **Очистите кэш DNS**: `ipconfig /flushdns` (Windows) или перезапустите браузер
6. **Временное решение**: Используйте прямой доступ: `http://176.124.217.224/` (требует HTTP логин/пароль: admin/HealApp2024SecurePass!)

## API эндпоинты через домен

- REST API: `http://supabase.healapp.ru/rest/v1/`
- Functions: `http://supabase.healapp.ru/functions/v1/`
- Auth: `http://supabase.healapp.ru/auth/v1/`

