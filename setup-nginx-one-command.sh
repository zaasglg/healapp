#!/bin/bash
apt update&&apt install -y nginx&&systemctl start nginx&&systemctl enable nginx&&mkdir -p /var/www/diary-app&&chown -R www-data:www-data /var/www/diary-app&&chmod -R 755 /var/www/diary-app&&cat>/etc/nginx/sites-available/diary-app<<'NGINXEOF'
server{listen 80;server_name _;root /var/www/diary-app;index index.html;location /{try_files $uri $uri/ /index.html;}location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {expires 1y;add_header Cache-Control "public, immutable";}gzip on;gzip_vary on;gzip_min_length 1024;gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;}
NGINXEOF
ln -sf /etc/nginx/sites-available/diary-app /etc/nginx/sites-enabled/&&rm -f /etc/nginx/sites-enabled/default&&nginx -t&&systemctl reload nginx&&echo "✅ Nginx установлен!"

