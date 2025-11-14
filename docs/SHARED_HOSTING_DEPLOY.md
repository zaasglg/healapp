# Деплой на обычный хостинг Reg.ru (через FTP)

## ⚠️ ВНИМАНИЕ: Это НЕ рекомендуется!

**Минусы:**
- ❌ Нет автоматического деплоя через GitHub Actions (нужен FTP)
- ❌ React Router может не работать (нужна настройка `.htaccess`)
- ❌ Придется вручную загружать файлы каждый раз
- ❌ Медленнее и неудобнее

**Рекомендую:** Используй VPS или Vercel/Cloudflare Pages (см. `SHARED_HOSTING_ANALYSIS.md`)

---

## Если все-таки решил использовать обычный хостинг:

### Шаг 1: Получи данные FTP

В панели Reg.ru найди:
- **FTP хост** (например: `ftp.ваш-домен.ru` или IP)
- **FTP логин** (обычно имя пользователя)
- **FTP пароль**
- **Путь к сайту** (обычно `/public_html` или `/www`)

---

### Шаг 2: Настройка для React Router

Создай файл `.htaccess` в корне сайта:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

Это нужно для работы React Router (чтобы не было 404 при переходе на `/profile` и т.д.)

---

### Шаг 3: GitHub Actions для FTP деплоя

Создай файл `.github/workflows/deploy-ftp.yml`:

```yaml
name: Deploy to FTP

on:
  push:
    branches:
      - main

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
      
      - name: Deploy to FTP
        uses: SamKirkland/FTP-Deploy-Action@v4.3.0
        with:
          server: ${{ secrets.FTP_HOST }}
          username: ${{ secrets.FTP_USERNAME }}
          password: ${{ secrets.FTP_PASSWORD }}
          local-dir: ./dist/
          server-dir: /public_html/
```

---

### Шаг 4: GitHub Secrets для FTP

Добавь в GitHub Secrets:
- `FTP_HOST` - FTP хост
- `FTP_USERNAME` - FTP логин
- `FTP_PASSWORD` - FTP пароль

---

### Шаг 5: Ручная загрузка (если GitHub Actions не работает)

1. Собери проект локально:
   ```bash
   npm run build
   ```

2. Загрузи все файлы из папки `dist/` на сервер через FTP клиент (FileZilla, WinSCP и т.д.)

3. Убедись, что файл `.htaccess` есть в корне сайта

---

## ⚠️ ПРОБЛЕМЫ, которые могут возникнуть:

### 1. React Router не работает (404 ошибки)
**Решение:** Убедись, что файл `.htaccess` загружен и правильно настроен

### 2. GitHub Actions не может подключиться к FTP
**Решение:** Проверь, что FTP хост, логин и пароль правильные в Secrets

### 3. Медленная загрузка
**Решение:** Это нормально для FTP, он медленнее SSH

---

## 🎯 ВЫВОД

**Обычный хостинг = много ручной работы и проблем**

**Лучше использовать:**
- ✅ VPS (400-600₽/мес) - автоматический деплой через SSH
- ✅ Vercel/Cloudflare Pages (БЕСПЛАТНО) - автоматический деплой из GitHub

