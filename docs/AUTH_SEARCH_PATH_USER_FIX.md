# ✅ Исправлена ошибка "Database error querying schema" - установлен search_path для пользователя

## Проблема

Ошибка 500: `Database error querying schema` - `relation "users" does not exist`

`ALTER DATABASE` не применяется к существующим подключениям. Нужно установить `search_path` для пользователя `postgres`.

## Решение

Установлен `search_path` для пользователя `postgres`:

```sql
ALTER USER postgres SET search_path = "$user", public, auth;
```

Теперь все новые подключения от пользователя `postgres` будут автоматически включать схему `auth` в `search_path`.

## Статус

- ✅ `search_path` установлен для пользователя `postgres`
- ✅ Auth перезапущен для применения изменений
- ✅ Все готово к работе

## Проверка

После этих изменений:
1. ✅ Auth должен находить таблицы в схеме `auth`
2. ✅ Авторизация должна работать
3. ✅ Ошибка 500 должна исчезнуть

## Следующие шаги

1. Перезапустите dev сервер: `npm run dev`
2. Очистите кеш браузера (Ctrl+Shift+R)
3. Попробуйте войти в аккаунт
4. Все должно работать!

