# Устранение проблем с доменом supabase.healapp.ru

## Проверка доступности

### С сервера:
```bash
curl -I http://supabase.healapp.ru
# Должен вернуть HTTP 307 или 200
```

### С вашего компьютера:
1. Проверьте DNS:
   ```bash
   nslookup supabase.healapp.ru
   # Должен вернуть 176.124.217.224
   ```

2. Проверьте доступность порта:
   ```bash
   telnet 176.124.217.224 80
   # Или используйте онлайн-сервисы для проверки портов
   ```

## Если домен не доступен

### 1. Проверьте файрвол на сервере:
```bash
ufw status
ufw allow 80/tcp
ufw allow 443/tcp
```

### 2. Проверьте файрвол провайдера:
- Убедитесь, что порт 80 открыт в панели управления Timeweb Cloud
- Проверьте правила безопасности в облачном провайдере

### 3. Проверьте DNS:
- Убедитесь, что A-запись `supabase → 176.124.217.224` активна
- Подождите 5-10 минут после изменения DNS (может потребоваться время на распространение)

### 4. Проверьте nginx:
```bash
nginx -t
systemctl status nginx
systemctl restart nginx
```

## Решение проблемы с доступом к базе данных

Если в Studio видите ошибку "password authentication failed for user 'supabase_admin'":

1. **Исправьте docker-compose.yml:**
   ```bash
   cd ~/HealApp-Web
   # Убедитесь, что PG_META_DB_USER: supabase_admin
   # Или измените на postgres, если supabase_admin не работает
   ```

2. **Перезапустите сервисы:**
   ```bash
   docker compose up -d meta
   docker restart supabase-studio
   ```

3. **Проверьте логи:**
   ```bash
   docker logs healapp-web-meta-1 --tail 20
   docker logs supabase-studio --tail 20
   ```

## Альтернативный доступ

Если домен не работает, используйте прямой IP:
- Studio: `http://176.124.217.224:54324/`
- REST API: `http://176.124.217.224/rest/v1/`
- Functions: `http://176.124.217.224/functions/v1/`
- Auth: `http://176.124.217.224/auth/v1/`

