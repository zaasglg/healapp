#!/bin/bash
# Скрипт для установки и настройки Nginx на сервере

set -e

echo "=== Установка Nginx ==="
apt update
apt install -y nginx

echo "=== Запуск Nginx ==="
systemctl start nginx
systemctl enable nginx

echo "=== Создание директории для сайта ==="
mkdir -p /var/www/diary-app
chown -R www-data:www-data /var/www/diary-app
chmod -R 755 /var/www/diary-app

echo "=== Создание конфигурации Nginx ==="
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

echo "=== Активация конфигурации ==="
ln -sf /etc/nginx/sites-available/diary-app /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

echo "=== Проверка конфигурации ==="
nginx -t

echo "=== Перезагрузка Nginx ==="
systemctl reload nginx

echo "=== Проверка статуса ==="
systemctl status nginx --no-pager

echo ""
echo "✅ Nginx успешно установлен и настроен!"
echo "Директория для сайта: /var/www/diary-app"

