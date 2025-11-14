# Короткие команды для установки Nginx (легко ввести вручную)

## 🎯 Выполни эти команды по очереди в веб-консоли

### 1. Обновление и установка (короткая команда)
```bash
apt update && apt install -y nginx
```

### 2. Запуск Nginx
```bash
systemctl start nginx && systemctl enable nginx
```

### 3. Создание директории
```bash
mkdir -p /var/www/diary-app
```

### 4. Права на директорию
```bash
chown -R www-data:www-data /var/www/diary-app && chmod -R 755 /var/www/diary-app
```

### 5. Создание конфигурации (самая длинная, но необходимая)
```bash
cat > /etc/nginx/sites-available/diary-app << 'END'
server {
    listen 80;
    server_name _;
    root /var/www/diary-app;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
END
```

### 6. Активация конфигурации
```bash
ln -sf /etc/nginx/sites-available/diary-app /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default
```

### 7. Проверка и перезагрузка
```bash
nginx -t && systemctl reload nginx
```

---

## ✅ Проверка

```bash
systemctl status nginx
```

---

## 💡 Совет

Если команда 5 слишком длинная, можно разбить её на части или использовать другой способ создания файла.

