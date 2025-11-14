# Настройка Docker Hub авторизации на Timeweb VPS

## Проблема

При деплое через Timeweb Apps возникает ошибка:
```
toomanyrequests: You have reached your unauthenticated pull rate limit
```

Docker Hub ограничивает количество запросов для неаутентифицированных пользователей.

## Решение: VPS с Docker Login

### Шаг 1: Создать VPS в Timeweb

1. Перейдите в **Timeweb Cloud** → **VPS**
2. Нажмите **"+ Создать сервер"**
3. Выберите конфигурацию:
   - **Минимум:** 2 ядра, 4 ГБ RAM, 50 ГБ SSD
   - **Рекомендуется:** 4 ядра, 8 ГБ RAM, 100 ГБ SSD
4. Выберите ОС: **Ubuntu 22.04 LTS** или **Debian 12**
5. Выберите регион: **Москва** или **Санкт-Петербург**
6. Нажмите **"Создать"**

### Шаг 2: Подключиться по SSH

1. В панели VPS найдите **IP адрес** и **root пароль**
2. Откройте PowerShell или Terminal
3. Подключитесь:

```bash
ssh root@ваш_ip_адрес
```

Введите пароль при запросе.

### Шаг 3: Установить Docker и Docker Compose

```bash
# Обновить пакеты
apt update && apt upgrade -y

# Установить Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Установить Docker Compose
apt install docker-compose-plugin -y

# Проверить установку
docker --version
docker compose version
```

### Шаг 4: Авторизоваться в Docker Hub

**Важно:** Создайте бесплатный аккаунт на https://hub.docker.com если его нет.

```bash
# Войти в Docker Hub
docker login

# Введите:
# - Username: ваш_username
# - Password: ваш_пароль
```

После успешного входа Docker будет использовать ваши credentials для всех pull запросов.

### Шаг 5: Клонировать репозиторий

```bash
# Установить Git (если не установлен)
apt install git -y

# Клонировать репозиторий
cd /root
git clone https://github.com/nazardubnak/HealApp-Web.git
cd HealApp-Web
```

### Шаг 6: Создать .env.docker

```bash
# Создать файл
nano .env.docker
```

Вставьте содержимое (замените значения):

```env
SUPABASE_DB_PASSWORD=HealApp2024SecurePass!
SUPABASE_JWT_SECRET=ваш_jwt_secret_32_символа_минимум
SUPABASE_ANON_KEY=ваш_anon_key
SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key

SUPABASE_SITE_URL=http://ваш_ip:54321
SUPABASE_URI_ALLOW_LIST=http://ваш_ip:54321,http://localhost:54321

SUPABASE_API_PORT=54321
SUPABASE_API_SSL_PORT=54323
SUPABASE_DB_PORT=54322
SUPABASE_STUDIO_PORT=54324
SUPABASE_FUNCTIONS_PORT=54325
SUPABASE_AUTH_PORT=54326
SUPABASE_REST_PORT=54327
SUPABASE_REALTIME_PORT=54328
SUPABASE_STORAGE_PORT=54329
```

Сохраните: `Ctrl+O`, `Enter`, `Ctrl+X`

### Шаг 7: Запустить Docker Compose

```bash
# Запустить все сервисы
docker compose up -d

# Проверить статус
docker compose ps

# Посмотреть логи
docker compose logs -f
```

### Шаг 8: Открыть порты в Firewall

```bash
# Установить UFW (если не установлен)
apt install ufw -y

# Открыть необходимые порты
ufw allow 54321/tcp  # API
ufw allow 54322/tcp  # PostgreSQL
ufw allow 54324/tcp  # Studio
ufw allow 54325/tcp  # Functions
ufw allow 54326/tcp  # Auth
ufw allow 54327/tcp  # REST
ufw allow 54328/tcp  # Realtime
ufw allow 54329/tcp  # Storage

# Включить firewall
ufw enable
```

### Шаг 9: Проверить работу

1. **Supabase Studio:** `http://ваш_ip:54324`
2. **REST API:** `http://ваш_ip:54327`
3. **Auth API:** `http://ваш_ip:54326`

### Шаг 10: Настроить автозапуск при перезагрузке

```bash
# Docker Compose уже настроен на автозапуск (restart: unless-stopped)
# Но можно добавить в systemd для надежности

# Создать systemd service
nano /etc/systemd/system/supabase.service
```

Вставьте:

```ini
[Unit]
Description=Supabase Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/HealApp-Web
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Активировать:

```bash
systemctl daemon-reload
systemctl enable supabase
systemctl start supabase
```

## Преимущества VPS

✅ Полный контроль над сервером  
✅ Можно настроить Docker Hub авторизацию  
✅ Нет ограничений на volumes  
✅ Можно настроить reverse proxy (nginx)  
✅ Дешевле чем Apps для долгосрочного использования  

## Обновление приложения

```bash
cd /root/HealApp-Web
git pull
docker compose down
docker compose up -d --build
```

## Мониторинг

```bash
# Статус контейнеров
docker compose ps

# Логи всех сервисов
docker compose logs -f

# Логи конкретного сервиса
docker compose logs -f db
docker compose logs -f auth
docker compose logs -f rest

# Использование ресурсов
docker stats
```

## Резервное копирование БД

```bash
# Создать бэкап
docker compose exec db pg_dump -U postgres postgres > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из бэкапа
docker compose exec -T db psql -U postgres postgres < backup_20241112_170000.sql
```

