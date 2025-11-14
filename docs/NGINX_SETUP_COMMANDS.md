# Команды для установки и настройки Nginx

## 🎯 Выполни эти команды на сервере через SSH

Подключись к серверу:
```bash
ssh root@89.111.154.27
```

Затем выполни команды:

### 1. Установка Nginx
```bash
apt update
apt install -y nginx
```

### 2. Запуск Nginx
```bash
systemctl start nginx
systemctl enable nginx
```

### 3. Создание директории для сайта
```bash
mkdir -p /var/www/diary-app
chown -R www-data:www-data /var/www/diary-app
chmod -R 755 /var/www/diary-app
```

### 4. Создание конфигурации Nginx
```bash
cat > /etc/nginx/sites-available/diary-app << 'EOF'
server {
    listen 80;
    server_name _;
    
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
EOF
```

### 5. Активация конфигурации
```bash
ln -sf /etc/nginx/sites-available/diary-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
```

### 6. Проверка конфигурации
```bash
nginx -t
```

### 7. Перезагрузка Nginx
```bash
systemctl reload nginx
```

### 8. Проверка статуса
```bash
systemctl status nginx
```

---

## ✅ Проверка работы

Открой в браузере: `http://89.111.154.27`

Должна открыться страница (пока пустая, но Nginx работает).

---

## 🚀 Что дальше

После установки Nginx:
- Настроим GitHub Secrets
- Настроим автоматический деплой
- Привяжем домен

