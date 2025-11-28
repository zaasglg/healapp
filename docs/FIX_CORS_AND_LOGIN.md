# ✅ Исправление CORS и входа

## Проблемы

1. **CORS ошибка:** `Request header field accept-profile is not allowed by Access-Control-Allow-Headers`
2. **Вход не работает:** 400 Bad Request при попытке входа

## Решения

### 1. CORS - добавлен заголовок `accept-profile`

Обновлена конфигурация Nginx для включения заголовка `accept-profile` в разрешенные заголовки:

```nginx
add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, apikey, x-supabase-api-version, x-client-info, accept-profile, prefer' always;
```

Также добавлен в обработку preflight запросов (OPTIONS).

### 2. Пароль - обновлен через bcrypt

Пароль для `nazardubnak@gmail.com` обновлен с использованием правильного формата bcrypt (`$2a$10$`).

## Статус

- ✅ Nginx обновлен с поддержкой `accept-profile`
- ✅ Пароль обновлен
- ✅ Auth перезапущен

## Следующие шаги

1. Перезапустите dev сервер: `npm run dev`
2. Очистите кеш браузера (Ctrl+Shift+R)
3. Попробуйте войти с паролем: `dn2907200`
4. Проверьте админку - данные должны подтягиваться

