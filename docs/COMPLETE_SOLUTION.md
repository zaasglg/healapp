# ПОЛНОЕ РЕШЕНИЕ ПРОБЛЕМЫ

## Проблема

Studio не может подключиться к БД через `postgres-meta`, ошибки:
- "password authentication failed for user \"postgres\""
- "password authentication failed for user \"supabase_admin\""

## Что проверить

### 1. Проверить работу `meta` API напрямую

```bash
curl http://127.0.0.1:8080/tables?included_schemas=public
```

Если API возвращает данные - проблема в Studio, а не в `meta`.

### 2. Проверить конфигурацию Studio

Studio должен использовать:
- `STUDIO_PG_META_URL=http://healapp-web-meta-1:8080`
- `POSTGRES_META_URL=http://healapp-web-meta-1:8080`

### 3. Проверить логи

```bash
docker logs healapp-web-meta-1 --tail 50
docker logs supabase-studio --tail 50
```

## Решение

Если `meta` API работает, но Studio не может подключиться:

1. Проверьте, что Studio использует правильный URL для `meta`
2. Убедитесь, что оба контейнера в одной сети Docker
3. Перезапустите Studio после изменения конфигурации

## Если `meta` API не работает

Нужно проверить пароль в БД и убедиться, что он совпадает с паролем в `.env`.

