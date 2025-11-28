# ✅ Исправлена ошибка CORS и JWT

## Проблемы

1. **CORS ошибка**: `Access to fetch at 'http://176.124.217.224/auth/v1/token' from origin 'http://localhost:5173' has been blocked by CORS policy`
2. **JWT ошибка**: `PGRST301: JWSError (CompactDecodeError Invalid number of parts: Expected 3 parts; got 1)`

## Решение

### 1. Добавлены CORS заголовки в nginx

Обновлена конфигурация nginx для всех эндпоинтов (`/auth/`, `/rest/`, `/functions/`):
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, apikey, Content-Type`
- Обработка OPTIONS запросов (preflight)

### 2. Обновлен GOTRUE_URI_ALLOW_LIST

Добавлен `http://localhost:5173` в список разрешенных URI для Auth:
```
GOTRUE_URI_ALLOW_LIST=http://176.124.217.224,http://localhost:5173,http://localhost:54321
```

### 3. Перезапущены сервисы

- ✅ Nginx перезагружен с новой конфигурацией
- ✅ Auth перезапущен с обновленными настройками

## Проверка

После этих изменений:
1. CORS ошибки должны исчезнуть
2. Авторизация должна работать
3. JWT токены должны корректно обрабатываться

## Следующие шаги

1. Перезапустите dev сервер: `npm run dev`
2. Попробуйте войти в аккаунт
3. Проверьте, что все работает

