# Настройка MCP сервера для self-hosted Supabase

## Проблема:
MCP Supabase сервер по умолчанию подключен к официальному Supabase проекту. Нужно подключить его к self-hosted Supabase на сервере 176.124.217.224.

---

## Шаг 1: Получить данные подключения

### 1.1. Получить Project URL:
```bash
ssh root@176.124.217.224
# URL будет: https://176.124.217.224
# Или через Nginx: https://ваш-домен.com
```

### 1.2. Получить API ключи:

#### Anon Key (публичный ключ):
```bash
ssh root@176.124.217.224 "docker exec supabase-rest printenv | grep ANON"
```

Или из docker-compose:
```bash
ssh root@176.124.217.224 "grep SUPABASE_ANON_KEY /root/HealApp-Web/docker-compose.production.yml"
```

#### Service Role Key (приватный ключ):
```bash
ssh root@176.124.217.224 "grep SUPABASE_SERVICE_ROLE_KEY /root/HealApp-Web/docker-compose.production.yml"
```

---

## Шаг 2: Настроить MCP сервер

### Вариант 1: Через переменные окружения

В настройках MCP сервера (обычно в `.cursor/mcp.json` или настройках Cursor):

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-supabase"
      ],
      "env": {
        "SUPABASE_URL": "https://176.124.217.224",
        "SUPABASE_SERVICE_ROLE_KEY": "ваш_service_role_key"
      }
    }
  }
}
```

### Вариант 2: Через файл конфигурации

Создайте файл `.env` или `.mcp.env` в корне проекта:

```env
SUPABASE_URL=https://176.124.217.224
SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key
```

---

## Шаг 3: Проверить подключение

После настройки MCP сервер должен:
1. Подключаться к self-hosted Supabase
2. Видеть все таблицы и данные
3. Позволять выполнять SQL запросы

---

## Важно:

1. **URL должен быть доступен:**
   - Если используется IP: `https://176.124.217.224`
   - Если есть домен: `https://ваш-домен.com`
   - Должен быть настроен SSL (или использовать HTTP для тестирования)

2. **Service Role Key:**
   - Это приватный ключ с полными правами
   - НЕ используйте anon key для MCP сервера
   - Храните в безопасности

3. **Проверка доступности:**
   ```bash
   curl https://176.124.217.224/rest/v1/
   # Должен вернуть JSON ответ
   ```

---

## Альтернатива: Использовать SSH туннель

Если MCP сервер не может напрямую подключиться к серверу:

```bash
# Создать SSH туннель
ssh -L 54321:localhost:54321 root@176.124.217.224

# В MCP использовать:
SUPABASE_URL=http://localhost:54321
```

---

## Проверка работы:

После настройки попробуйте:
1. Выполнить SQL запрос через MCP
2. Проверить список таблиц
3. Проверить данные

