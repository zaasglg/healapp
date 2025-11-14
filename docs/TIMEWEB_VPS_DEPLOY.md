# Развертывание Supabase на Timeweb VPS (ручная установка)

## Шаг 1: Пополнение баланса

1. В панели Timeweb перейдите в **"Баланс и платежи"**
2. Пополните баланс минимум на **500₽**

## Шаг 2: Создание VPS

1. **Перейдите в "Облачные серверы":**
   - В левом меню найдите **"Облачные серверы"**
   - Нажмите **"+ Создать сервер"** или **"Создать"**

2. **Выберите конфигурацию:**
   - **ОС:** Ubuntu 22.04 LTS или Ubuntu 24.04 LTS
   - **Тариф:** минимум **2 ядра, 4 ГБ RAM, 40 ГБ SSD**
   - **Регион:** Москва или Санкт-Петербург
   - **Имя сервера:** `healapp-supabase` (любое)

3. **Создайте сервер:**
   - Нажмите **"Создать"**
   - Дождитесь создания (2-3 минуты)

4. **Получите доступ:**
   - После создания вы получите:
     - **IP адрес** (например: `185.xxx.xxx.xxx`)
     - **Логин:** `root`
     - **Пароль:** (будет отправлен на email или показан в панели)

## Шаг 3: Подключение по SSH

1. **На вашем компьютере откройте PowerShell:**
   ```powershell
   ssh root@ваш_ip_адрес
   ```

2. **Введите пароль** (символы не отображаются - это нормально)

3. **При первом подключении согласитесь:** введите `yes`

## Шаг 4: Установка Docker

Выполните команды на сервере:

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

# Добавление пользователя root в группу docker (если нужно)
usermod -aG docker root
```

## Шаг 4.5: Авторизация в Docker Hub

**ВАЖНО:** Docker Hub ограничивает количество запросов для неаутентифицированных пользователей. Нужно авторизоваться:

1. **Создайте аккаунт на Docker Hub** (если нет):
   - Перейдите на https://hub.docker.com
   - Зарегистрируйтесь (бесплатно)

2. **Войдите в Docker Hub на сервере:**
   ```bash
   docker login
   ```
   - Введите ваш **username** (не email!)
   - Введите **password** (Access Token, если используете 2FA)
   
   После успешного входа Docker будет использовать ваши credentials для всех pull запросов.

## Шаг 5: Клонирование проекта

```bash
# Клонируем репозиторий
git clone https://github.com/nazardubnak/HealApp-Web.git
cd HealApp-Web
```

## Шаг 6: Создание .env.docker

```bash
# Создаем файл
nano .env.docker
```

Вставьте следующее содержимое (замените значения):

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
SUPABASE_AUTH_PORT=54326
SUPABASE_REST_PORT=54327
SUPABASE_REALTIME_PORT=54328
SUPABASE_STORAGE_PORT=54329
```

**Генерация секретов (на вашем компьютере в PowerShell):**
```powershell
# Выполните 3 раза, каждый раз копируйте результат:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Сохраните файл: `Ctrl+O`, `Enter`, `Ctrl+X`

## Шаг 7: Запуск Supabase

```bash
# Запускаем все контейнеры
docker compose up -d

# Проверяем статус
docker compose ps

# Смотрим логи (если нужно)
docker compose logs -f
```

## Шаг 8: Открытие портов

1. **В панели Timeweb:**
   - Перейдите в раздел **"Сети"** или найдите настройки вашего сервера
   - Найдите **"Firewall"** или **"Правила безопасности"**
   - Откройте порты:
     - `54321` (TCP) - API Gateway (если используется Kong)
     - `54322` (TCP) - PostgreSQL
     - `54324` (TCP) - Supabase Studio
     - `54325` (TCP) - Edge Functions
     - `54326` (TCP) - Auth API
     - `54327` (TCP) - REST API
     - `54328` (TCP) - Realtime
     - `54329` (TCP) - Storage

## Шаг 9: Проверка работы

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

# Перезапустить
docker compose restart

# Просмотр логов
docker compose logs -f

# Просмотр логов конкретного сервиса
docker compose logs db
docker compose logs auth

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

3. **Перезапустите контейнеры:**
   ```bash
   docker compose restart
   ```

4. **Проверьте переменные окружения:**
   ```bash
   cat .env.docker
   ```

