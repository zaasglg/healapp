# ⚠️ ВАЖНО: Работаем с ПРАВИЛЬНЫМ Supabase

## Проблема была:
Я работал с **официальным Supabase** (через MCP), а нужно работать с **self-hosted Supabase на сервере 176.124.217.224**!

## Что исправлено:
✅ RLS включен обратно в официальном Supabase (от которого мы уходим)
✅ Теперь работаем ТОЛЬКО с self-hosted Supabase на сервере

---

## Правильный Supabase:
- **Сервер:** 176.124.217.224
- **База данных:** PostgreSQL в контейнере `supabase-db`
- **Доступ:** через SSH + docker exec

---

## Команды для работы с ПРАВИЛЬНЫМ Supabase:

### Подключение к базе:
```bash
ssh root@176.124.217.224
docker exec -it supabase-db psql -U postgres -d postgres
```

### Выполнение SQL:
```bash
ssh root@176.124.217.224 "docker exec supabase-db psql -U postgres -d postgres -c \"YOUR_SQL_HERE\""
```

### Применение SQL файла:
```bash
ssh root@176.124.217.224 "docker exec -i supabase-db psql -U postgres -d postgres < /path/to/file.sql"
```

---

## Проверка правильного Supabase:

1. **Проверка подключения:**
   ```bash
   ssh root@176.124.217.224 "docker exec supabase-db psql -U postgres -d postgres -c \"SELECT current_database();\""
   ```

2. **Проверка таблиц:**
   ```bash
   ssh root@176.124.217.224 "docker exec supabase-db psql -U postgres -d postgres -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';\""
   ```

3. **Проверка данных:**
   ```bash
   ssh root@176.124.217.224 "docker exec supabase-db psql -U postgres -d postgres -c \"SELECT COUNT(*) FROM public.organizations;\""
   ```

---

## ⚠️ ВАЖНО:
- **НЕ используем** MCP Supabase инструменты (они подключены к официальному проекту)
- **Используем** SSH команды для работы с self-hosted Supabase
- Все изменения делаем **ТОЛЬКО** на сервере 176.124.217.224

---

## Следующие шаги:
1. Проверить статус RLS в правильном Supabase
2. Настроить SMTP для правильного Supabase
3. Все дальнейшие изменения делать через SSH на сервере

