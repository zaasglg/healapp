# Пошаговая настройка VPS для Supabase

## IP адрес: `176.124.217.224`

## Шаг 1: Подключение по SSH

В PowerShell выполните:

```powershell
ssh root@176.124.217.224
```

**При первом подключении:**
- Введите `yes` когда спросит о fingerprint
- Введите **root пароль** (символы не отображаются - это нормально)
- После успешного подключения вы увидите приглашение: `root@...:~#`

## Шаг 2: Установка Docker и Docker Compose

После подключения выполните на сервере:

```bash
# Обновление системы
apt update && apt upgrade -y

# Установка необходимых пакетов
apt install -y curl git

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Установка Docker Compose
apt install -y docker-compose-plugin

# Проверка установки
docker --version
docker compose version
```

## Шаг 3: Авторизация в Docker Hub

**ВАЖНО:** Создайте аккаунт на https://hub.docker.com если его нет!

```bash
docker login
```

- Введите ваш **username** (не email!)
- Введите **password** (или Access Token, если используете 2FA)

## Шаг 4: Клонирование репозитория

```bash
cd /root
git clone https://github.com/nazardubnak/HealApp-Web.git
cd HealApp-Web
```

## Шаг 5: Создание .env.docker

```bash
nano .env.docker
```

Вставьте следующее (замените значения на ваши):

```env
SUPABASE_DB_PASSWORD=HealApp2024SecurePass!
SUPABASE_JWT_SECRET=ваш_jwt_secret_32_символа_минимум
SUPABASE_ANON_KEY=ваш_anon_key
SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key

SUPABASE_SITE_URL=http://176.124.217.224:54321
SUPABASE_URI_ALLOW_LIST=http://176.124.217.224:54321,http://localhost:54321

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

**Сохраните:** `Ctrl+O`, `Enter`, `Ctrl+X`

## Шаг 6: Генерация секретов (если нужно)

Если у вас нет JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY - сгенерируйте их:

**На вашем компьютере в PowerShell:**

```powershell
# JWT_SECRET (32+ символа)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# ANON_KEY и SERVICE_ROLE_KEY можно сгенерировать так же
# Или использовать готовые из Supabase проекта (если есть)
```

## Шаг 7: Запуск Docker Compose

```bash
# Запустить все сервисы
docker compose up -d

# Проверить статус
docker compose ps

# Посмотреть логи
docker compose logs -f
```

## Шаг 8: Открытие портов в Firewall

```bash
# Установить UFW (если не установлен)
apt install ufw -y

# Открыть порты
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

## Шаг 9: Проверка работы

1. **Supabase Studio:** `http://176.124.217.224:54324`
2. **REST API:** `http://176.124.217.224:54327`
3. **Auth API:** `http://176.124.217.224:54326`

## Полезные команды

```bash
# Остановить все контейнеры
docker compose down

# Перезапустить
docker compose restart

# Просмотр логов
docker compose logs -f

# Логи конкретного сервиса
docker compose logs -f db
docker compose logs -f auth
```

