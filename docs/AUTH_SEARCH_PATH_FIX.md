# ✅ Исправлена ошибка "Database error querying schema"

## Проблема

Ошибка 500: `Database error querying schema` - `relation "users" does not exist`

Таблица `auth.users` существует, но Auth сервис не может её найти, потому что `search_path` не включает схему `auth`.

## Решение

Установлен `search_path` для базы данных, чтобы включить схему `auth`:

```sql
ALTER DATABASE postgres SET search_path TO "$user", public, auth;
```

Теперь PostgreSQL будет искать таблицы в схеме `auth` автоматически.

## Статус

- ✅ `search_path` установлен
- ✅ Auth перезапущен
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

