# ✅ Исправление CORS и входа - завершено

## Проблемы

1. **CORS ошибка:** `Request header field accept-profile is not allowed by Access-Control-Allow-Headers`
2. **Вход не работает:** 400 Bad Request при попытке входа

## Решения

### 1. CORS - добавлен заголовок `accept-profile`

Обновлена конфигурация Nginx для включения заголовка `accept-profile` в разрешенные заголовки для `/rest/`:

```nginx
add_header 'Access-Control-Allow-Headers' 'Authorization, apikey, Content-Type, Prefer, Prefer-Push, x-supabase-api-version, x-client-info, accept-profile' always;
```

### 2. Пароль - обновлен через bcrypt

Пароль для `nazardubnak@gmail.com` обновлен с использованием правильного формата bcrypt (`$2a$10$`).

## Статус

- ✅ Nginx обновлен с поддержкой `accept-profile`
- ✅ Пароль обновлен
- ✅ Auth перезапущен
- ✅ CORS заголовки проверены

## Следующие шаги

1. Перезапустите dev сервер: `npm run dev`
2. Очистите кеш браузера (Ctrl+Shift+R)
3. Попробуйте войти с паролем: `dn2907200`
4. Проверьте админку - данные должны подтягиваться

## Проверка

- ✅ OPTIONS запросы возвращают правильные CORS заголовки
- ✅ `accept-profile` добавлен в разрешенные заголовки
- ✅ Пароль обновлен в правильном формате

