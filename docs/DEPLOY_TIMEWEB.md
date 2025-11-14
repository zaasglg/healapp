# Развертывание Supabase на Timeweb Cloud

## Шаг 1: Регистрация и создание VPS

1. **Зарегистрируйтесь на Timeweb Cloud:**
   - Перейдите на https://timeweb.com/cloud
   - Зарегистрируйте аккаунт

2. **Создайте VPS:**
   - В панели выберите **"Создать сервер"**
   - **ОС:** Ubuntu 22.04 или 24.04
   - **Конфигурация:** минимум 2 ядра, 4 ГБ RAM, 40 ГБ SSD
   - **Дополнительно:** отметьте "Установить Docker" (если есть опция)
   - Создайте сервер

3. **Получите доступ:**
   - После создания сервера вы получите:
     - IP адрес
     - Логин (обычно `root`)
     - Пароль (сохраните его!)

## Шаг 2: Подключение и установка Docker

1. **Подключитесь по SSH:**
   ```powershell
   ssh root@ваш_ip_адрес
   ```

2. **Установите Docker (если не установлен):**
   ```bash
   # Обновление системы
   apt update && apt upgrade -y
   
   # Установка Docker
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   
   # Установка Docker Compose
   apt install docker-compose-plugin -y
   
   # Проверка установки
   docker --version
   docker compose version
   ```

## Шаг 3: Подготовка проекта

1. **Клонируйте репозиторий:**
   ```bash
   git clone https://github.com/nazardubnak/HealApp-Web.git
   cd HealApp-Web
   ```

2. **Создайте файл `.env.docker`:**
   ```bash
   nano .env.docker
   ```
   
   Вставьте следующее содержимое (замените значения на свои):
   ```env
   SUPABASE_DB_PASSWORD=HealApp2024SecurePass!
   SUPABASE_JWT_SECRET=ваш_jwt_secret_32_символа
   SUPABASE_ANON_KEY=ваш_anon_key
   SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key
   SUPABASE_SITE_URL=http://ваш_ip:54321
   SUPABASE_URI_ALLOW_LIST=http://ваш_ip:54321,http://localhost:54321
   SUPABASE_API_PORT=54321
   SUPABASE_API_SSL_PORT=54323
   SUPABASE_DB_PORT=54322
   SUPABASE_STUDIO_PORT=54324
   SUPABASE_FUNCTIONS_PORT=54325
   ```
   
   Сохраните: `Ctrl+O`, `Enter`, `Ctrl+X`

3. **Сгенерируйте секретные ключи:**
   
   На вашем компьютере в PowerShell:
   ```powershell
   # Выполните 3 раза, каждый раз копируйте результат:
   [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
   ```
   
   Замените в `.env.docker`:
   - Первый результат → `SUPABASE_JWT_SECRET`
   - Второй результат → `SUPABASE_ANON_KEY`
   - Третий результат → `SUPABASE_SERVICE_ROLE_KEY`

## Шаг 4: Запуск Supabase

1. **Запустите Docker Compose:**
   ```bash
   docker compose up -d
   ```

2. **Проверьте статус:**
   ```bash
   docker compose ps
   ```
   
   Все контейнеры должны быть в статусе `Up`

3. **Проверьте логи (если что-то не работает):**
   ```bash
   docker compose logs
   # Или для конкретного сервиса:
   docker compose logs db
   docker compose logs auth
   ```

## Шаг 5: Открытие портов в firewall

1. **В панели Timeweb:**
   - Перейдите в настройки вашего VPS
   - Найдите раздел **"Firewall"** или **"Сетевые правила"**
   - Откройте порты:
     - `54321` (API Gateway)
     - `54322` (PostgreSQL)
     - `54324` (Supabase Studio)
     - `54325` (Edge Functions)

## Шаг 6: Проверка работы

После запуска проверьте:

1. **Supabase Studio:** `http://ваш_ip:54324`
2. **API Gateway:** `http://ваш_ip:54321`
3. **Health check:**
   ```bash
   curl http://localhost:54321/rest/v1/
   ```

## Полезные команды

```bash
# Остановить все контейнеры
docker compose down

# Перезапустить все контейнеры
docker compose restart

# Просмотр логов в реальном времени
docker compose logs -f

# Остановить и удалить все (включая данные!)
docker compose down -v
```

## Если что-то не работает

1. **Проверьте логи:**
   ```bash
   docker compose logs
   ```

2. **Проверьте, что порты открыты:**
   ```bash
   netstat -tulpn | grep 54321
   ```

3. **Проверьте переменные окружения:**
   ```bash
   cat .env.docker
   ```

4. **Перезапустите контейнеры:**
   ```bash
   docker compose restart
   ```

## Преимущества Timeweb

- ✅ Простой интерфейс
- ✅ Быстрая поддержка
- ✅ Стабильная работа
- ✅ Хорошая документация
- ✅ Российский сервис

