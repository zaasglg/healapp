# Пошаговая инструкция по настройке деплоя

## Шаг 1: Заказ VPS на Reg.ru

1. Зайдите в личный кабинет Reg.ru
2. Перейдите в раздел "VPS"
3. Выберите тариф **"VPS Start"** (1 ядро, 1GB RAM, 10GB SSD)
4. Выберите ОС: **Ubuntu 22.04 LTS**
5. Закажите VPS (~400-600₽/мес)
6. Дождитесь создания (5-10 минут)
7. Получите:
   - IP адрес сервера
   - Логин (обычно `root`)
   - Пароль (сохраните!)

---

## Шаг 2: Подключение к серверу

### Windows (PowerShell):
```powershell
ssh root@ваш_ip_адрес
# Введите пароль
```

### Первое подключение:
- Введите `yes` когда спросит о подтверждении

---

## Шаг 3: Установка Nginx

```bash
# Обновление системы
apt update && apt upgrade -y

# Установка Nginx
apt install -y nginx

# Запуск Nginx
systemctl start nginx
systemctl enable nginx

# Проверка статуса
systemctl status nginx
```

### Проверка работы:
Откройте в браузере: `http://ваш_ip_адрес`
Должна открыться страница "Welcome to nginx!"

---

## Шаг 4: Настройка Nginx для React приложения

### Создаем конфигурацию:
```bash
nano /etc/nginx/sites-available/diary-app
```

### Вставляем конфигурацию:
```nginx
server {
    listen 80;
    server_name ваш-домен.ru www.ваш-домен.ru;
    
    root /var/www/diary-app;
    index index.html;
    
    # Для React Router (SPA)
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Кэширование статических файлов
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
```

### Активируем конфигурацию:
```bash
# Создаем символическую ссылку
ln -s /etc/nginx/sites-available/diary-app /etc/nginx/sites-enabled/

# Удаляем дефолтную конфигурацию
rm /etc/nginx/sites-enabled/default

# Проверяем конфигурацию
nginx -t

# Перезагружаем Nginx
systemctl reload nginx
```

### Создаем директорию для сайта:
```bash
mkdir -p /var/www/diary-app
chown -R www-data:www-data /var/www/diary-app
```

---

## Шаг 5: Настройка SSH ключей для GitHub Actions

### На локальном компьютере (Windows PowerShell):
```powershell
# Генерируем SSH ключ
ssh-keygen -t ed25519 -C "github-actions"

# Нажимаем Enter для сохранения в дефолтное место
# Можно оставить пароль пустым

# Копируем публичный ключ
cat ~/.ssh/id_ed25519.pub
# Скопируйте весь вывод!
```

### На сервере:
```bash
# Создаем директорию для ключей
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Добавляем публичный ключ
nano ~/.ssh/authorized_keys
# Вставьте скопированный публичный ключ
# Сохраните: Ctrl+O, Enter, Ctrl+X

# Устанавливаем права
chmod 600 ~/.ssh/authorized_keys
```

### Проверка подключения:
```powershell
# На локальном компьютере
ssh root@ваш_ip_адрес
# Должно подключиться без пароля!
```

---

## Шаг 6: Настройка GitHub Secrets

1. Зайдите в ваш репозиторий на GitHub
2. Перейдите: **Settings** → **Secrets and variables** → **Actions**
3. Нажмите **"New repository secret"**
4. Добавьте следующие секреты:

### `SSH_HOST`
- **Name**: `SSH_HOST`
- **Value**: `ваш_ip_адрес` (например: `185.123.45.67`)

### `SSH_USERNAME`
- **Name**: `SSH_USERNAME`
- **Value**: `root`

### `SSH_PRIVATE_KEY`
- **Name**: `SSH_PRIVATE_KEY`
- **Value**: Содержимое файла `~/.ssh/id_ed25519` (приватный ключ!)
  ```powershell
  # На локальном компьютере
  cat ~/.ssh/id_ed25519
  # Скопируйте ВСЁ содержимое (включая -----BEGIN и -----END)
  ```

---

## Шаг 7: Обновление GitHub Actions workflow

Файл `.github/workflows/deploy.yml` уже создан, но нужно его обновить:

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - main  # Автоматический деплой при push в main ветку

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build project
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      
      - name: Deploy to server via SSH
        uses: appleboy/scp-action@v0.1.4
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USERNAME }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          source: "dist/*"
          target: "/var/www/diary-app"
          strip_components: 1
      
      - name: Set correct permissions
        uses: appleboy/ssh-action@v0.1.4
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USERNAME }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            chown -R www-data:www-data /var/www/diary-app
            chmod -R 755 /var/www/diary-app
```

---

## Шаг 8: Добавление переменных окружения в GitHub

1. Зайдите в **Settings** → **Secrets and variables** → **Actions**
2. Добавьте секреты для сборки:

### `VITE_SUPABASE_URL`
- **Name**: `VITE_SUPABASE_URL`
- **Value**: URL вашего Supabase проекта (например: `https://xxxxx.supabase.co`)

### `VITE_SUPABASE_ANON_KEY`
- **Name**: `VITE_SUPABASE_ANON_KEY`
- **Value**: Anon key из Supabase Dashboard

---

## Шаг 9: Привязка домена

### В панели Reg.ru:
1. Зайдите в раздел **"Домены"**
2. Выберите ваш домен
3. Перейдите в **"DNS-серверы"**
4. Выберите **"Использовать DNS-серверы хостинга"** или укажите:
   - `ns1.hosting.reg.ru`
   - `ns2.hosting.reg.ru`

### В панели управления VPS:
1. Зайдите в панель управления VPS (ISPmanager или другая)
2. Добавьте домен в список доменов
3. Укажите корневую директорию: `/var/www/diary-app`

### Настройка DNS записей:
В панели управления доменом добавьте A-запись:
- **Тип**: A
- **Имя**: @ (или оставьте пустым)
- **Значение**: IP адрес вашего VPS
- **TTL**: 3600

Для www поддомена:
- **Тип**: A
- **Имя**: www
- **Значение**: IP адрес вашего VPS
- **TTL**: 3600

---

## Шаг 10: Настройка SSL (HTTPS) - опционально

### Установка Certbot:
```bash
apt install -y certbot python3-certbot-nginx
```

### Получение SSL сертификата:
```bash
certbot --nginx -d ваш-домен.ru -d www.ваш-домен.ru
```

### Автоматическое обновление:
```bash
certbot renew --dry-run
```

---

## Проверка работы

1. Сделайте изменения в коде
2. Закоммитьте и запушьте:
   ```bash
   git add .
   git commit -m "Тестовый деплой"
   git push origin main
   ```
3. Зайдите в GitHub → **Actions**
4. Увидите запущенный workflow
5. Дождитесь завершения (2-3 минуты)
6. Откройте ваш сайт - изменения должны быть видны!

---

## Устранение проблем

### Если деплой не работает:
1. Проверьте логи в GitHub Actions
2. Проверьте SSH подключение:
   ```bash
   ssh root@ваш_ip_адрес
   ```
3. Проверьте права на директорию:
   ```bash
   ls -la /var/www/diary-app
   ```

### Если сайт не открывается:
1. Проверьте Nginx:
   ```bash
   systemctl status nginx
   ```
2. Проверьте конфигурацию:
   ```bash
   nginx -t
   ```
3. Проверьте логи:
   ```bash
   tail -f /var/log/nginx/error.log
   ```

---

## Готово! 🎉

Теперь при каждом `git push` в ветку `main` ваш сайт будет автоматически обновляться на сервере!

