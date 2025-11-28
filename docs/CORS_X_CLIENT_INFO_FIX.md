# ✅ Добавлен заголовок x-client-info в CORS

## Проблема

Ошибка: `Request header field x-client-info is not allowed by Access-Control-Allow-Headers in preflight response.`

Supabase клиент отправляет заголовок `x-client-info`, который не был разрешен в CORS.

## Решение

Добавлен заголовок `x-client-info` в список разрешенных заголовков для всех эндпоинтов:
- `/auth/`
- `/rest/`
- `/functions/`

## Обновленные заголовки

Теперь разрешены:
- `Authorization`
- `apikey`
- `Content-Type`
- `x-supabase-api-version`
- `x-client-info` ✅ (добавлен)
- `Prefer` (только для `/rest/`)
- `Prefer-Push` (только для `/rest/`)

## Статус

- ✅ Заголовок `x-client-info` добавлен
- ✅ Nginx перезагружен
- ✅ Все готово к работе

## Следующие шаги

1. Перезапустите dev сервер: `npm run dev`
2. Очистите кеш браузера (Ctrl+Shift+R)
3. Попробуйте войти в аккаунт
4. Все должно работать!

