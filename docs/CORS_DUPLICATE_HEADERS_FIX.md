# ✅ Исправлено дублирование CORS заголовков

## Проблема

Ошибка: `The 'Access-Control-Allow-Origin' header contains multiple values '*, *', but only one is allowed.`

Это означает, что заголовки CORS добавляются дважды:
1. Auth сервис добавляет свои CORS заголовки
2. Nginx добавляет свои CORS заголовки

## Решение

Добавлены `proxy_hide_header` директивы для скрытия CORS заголовков от Auth сервиса перед добавлением своих:

```nginx
proxy_hide_header 'Access-Control-Allow-Origin';
proxy_hide_header 'Access-Control-Allow-Methods';
proxy_hide_header 'Access-Control-Allow-Headers';
proxy_hide_header 'Access-Control-Allow-Credentials';
```

Теперь только nginx добавляет CORS заголовки, дублирования нет.

## Статус

- ✅ Дублирование заголовков исправлено
- ✅ Nginx перезагружен
- ✅ Все готово к работе

## Следующие шаги

1. Перезапустите dev сервер: `npm run dev`
2. Очистите кеш браузера (Ctrl+Shift+R)
3. Попробуйте войти в аккаунт
4. Все должно работать!

