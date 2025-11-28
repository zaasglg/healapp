# Настройка Supabase Studio

## Текущий статус

Supabase Studio запущен как отдельный Docker контейнер:
- **Контейнер**: `supabase-studio`
- **Порт**: `54324` (внутренний порт 3000)
- **URL**: `http://176.124.217.224/studio/` (через nginx) или `http://176.124.217.224:54324/` (напрямую)

## Доступ к Studio

### Через nginx (рекомендуется):
```
http://176.124.217.224/studio/
```

### Напрямую:
```
http://176.124.217.224:54324/
```

## Настройка домена/поддомена

Если у вас есть домен, вы можете настроить поддомен для Studio:

1. **В DNS настройках вашего домена** добавьте A-запись:
   ```
   supabase.yourdomain.com → 176.124.217.224
   ```

2. **Обновите nginx конфигурацию** (`/etc/nginx/sites-available/supabase`):
   ```nginx
   server {
       listen 80;
       server_name supabase.yourdomain.com 176.124.217.224;

       # ... остальная конфигурация ...
   }
   ```

3. **Перезагрузите nginx**:
   ```bash
   nginx -t && systemctl reload nginx
   ```

4. **Доступ через домен**:
   ```
   http://supabase.yourdomain.com/studio/
   ```

## Управление контейнером Studio

### Перезапуск:
```bash
docker restart supabase-studio
```

### Просмотр логов:
```bash
docker logs supabase-studio --tail 50 -f
```

### Остановка:
```bash
docker stop supabase-studio
```

### Запуск:
```bash
docker start supabase-studio
```

## Переменные окружения

Studio использует следующие переменные:
- `STUDIO_PG_META_URL`: `http://healapp-web-meta-1:8080`
- `SUPABASE_URL`: `http://176.124.217.224`
- `SUPABASE_SERVICE_KEY`: Service role key
- `SUPABASE_ANON_KEY`: Anon key
- `POSTGRES_META_URL`: `http://healapp-web-meta-1:8080`

## Устранение проблем

### Studio не запускается:
1. Проверьте, что `meta` сервис запущен:
   ```bash
   cd ~/HealApp-Web && docker compose ps | grep meta
   ```

2. Проверьте логи:
   ```bash
   docker logs supabase-studio
   ```

### 502 Bad Gateway:
1. Проверьте, что Studio контейнер запущен:
   ```bash
   docker ps | grep studio
   ```

2. Проверьте nginx конфигурацию:
   ```bash
   nginx -t
   ```

3. Проверьте доступность Studio напрямую:
   ```bash
   curl http://127.0.0.1:54324/
   ```

