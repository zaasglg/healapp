# Развертывание Supabase через Portainer

## Шаг 1: Подготовка переменных окружения

1. **Сгенерируйте секретные ключи:**

Откройте PowerShell на вашем компьютере и выполните:

```powershell
# Генерация JWT Secret
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Генерация Anon Key
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Генерация Service Role Key
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

2. **Откройте файл `.env.docker`** в корне проекта и замените:
   - `your_secure_postgres_password_here` → ваш пароль для PostgreSQL
   - `your_jwt_secret_here_min_32_chars` → сгенерированный JWT Secret
   - `your_anon_key_here` → сгенерированный Anon Key
   - `your_service_role_key_here` → сгенерированный Service Role Key

3. **Проверьте IP адрес:**
   - Убедитесь, что `SUPABASE_SITE_URL` содержит правильный IP вашего VPS (185.133.40.194)

## Шаг 2: Развертывание через Portainer

### Вариант A: Через веб-интерфейс Portainer

1. **Откройте Portainer:**
   - Перейдите на `http://185.133.40.194:9000`
   - Войдите с логином `admin` и паролем из письма

2. **Выберите окружение:**
   - В левом меню найдите блок **"Environment: None selected"**
   - Нажмите на него и выберите **"local"**

3. **Создайте Secret с переменными:**
   - Перейдите в **Secrets** (в меню слева)
   - Нажмите **+ Add secret**
   - **Name:** `supabase-env`
   - **Value:** Скопируйте ВСЁ содержимое файла `.env.docker` (все строки)
   - Нажмите **Create secret**

4. **Создайте Stack:**
   - Перейдите в **Stacks** (в меню слева)
   - Нажмите **+ Add stack**
   - **Name:** `supabase`
   - В поле **Web editor** вставьте содержимое файла `docker-compose.yml`
   - В разделе **Environment variables** нажмите **Load variables from secret**
   - Выберите `supabase-env`
   - Нажмите **Deploy the stack**

5. **Проверьте статус:**
   - Перейдите в **Containers**
   - Все контейнеры должны быть в статусе **Running** (зеленый)
   - Если какой-то контейнер в статусе **Exited** (красный):
     - Кликните на него
     - Перейдите в **Logs**
     - Скопируйте ошибку и отправьте мне

### Вариант B: Через SSH (если получите доступ)

1. **Подключитесь к серверу:**
   ```powershell
   ssh root@185.133.40.194
   ```

2. **Клонируйте репозиторий:**
   ```bash
   git clone https://github.com/nazardubnak/HealApp-Web.git
   cd HealApp-Web
   ```

3. **Создайте .env.docker:**
   ```bash
   nano .env.docker
   ```
   Вставьте содержимое файла `.env.docker` (с реальными значениями) и сохраните (Ctrl+O, Enter, Ctrl+X)

4. **Запустите Docker Compose:**
   ```bash
   docker compose up -d
   ```

5. **Проверьте статус:**
   ```bash
   docker compose ps
   ```

## Шаг 3: Проверка работы

После успешного развертывания:

1. **Supabase Studio:** `http://185.133.40.194:54324`
2. **API Gateway:** `http://185.133.40.194:54321`
3. **PostgreSQL:** `185.133.40.194:54322`

## Если что-то не работает

### Проблема: Контейнеры не запускаются

1. Проверьте логи в Portainer:
   - **Containers** → кликните на контейнер → **Logs**
2. Проверьте переменные окружения:
   - Убедитесь, что все значения в `.env.docker` заполнены
   - Проверьте, что нет лишних пробелов или символов

### Проблема: Нет доступа по SSH

Напишите в поддержку DockerHosting.ru:
> Здравствуйте! Не могу подключиться по SSH к VPS HealApp Web (185.133.40.194) с логином root и паролем из письма. Просьба сбросить пароль или предоставить доступ по SSH.

### Проблема: Portainer не открывается

1. Проверьте, что VPS запущен (статус "running")
2. Попробуйте перезагрузить VPS через панель DockerHosting.ru
3. Проверьте, что порт 9000 открыт в firewall

## Следующие шаги

После успешного развертывания:
1. Примените миграции базы данных (они автоматически применятся при первом запуске)
2. Настройте фронтенд для работы с вашим Supabase
3. Протестируйте основные функции

