# ✅ Исправлено дублирование CORS заголовков

## Проблема

Ошибка: `The 'Access-Control-Allow-Origin' header contains multiple values '*, *', but only one is allowed.`

Это означало, что заголовки CORS добавлялись дважды:
1. Auth сервис (GoTrue) добавлял свои CORS заголовки
2. Nginx добавлял свои CORS заголовки

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
- ✅ CORS заголовки теперь добавляются только один раз
- ✅ Все готово к работе

## Проверка

После этих изменений:
1. ✅ CORS ошибки должны исчезнуть
2. ✅ Заголовки не дублируются
3. ✅ Авторизация должна работать

## Следующие шаги

1. Перезапустите dev сервер: `npm run dev`
2. Очистите кеш браузера (Ctrl+Shift+R)
3. Попробуйте войти в аккаунт
4. Все должно работать!

