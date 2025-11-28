# Быстрая настройка SMTP для аутентификации по email

## Текущий статус

✅ **Регистрация по email включена:**
- `GOTRUE_EXTERNAL_EMAIL_ENABLED=true`
- `GOTRUE_MAILER_AUTOCONFIRM=true` (email автоматически подтверждается)

❌ **SMTP сервер не настроен:**
- Письма не отправляются
- Нужно добавить SMTP настройки

---

## Вариант 1: Автоматическая настройка (рекомендуется)

Запустите скрипт на сервере:

```bash
ssh root@176.124.217.224
bash /root/configure_smtp_now.sh
```

Скрипт запросит:
- SMTP Host (например, `smtp.gmail.com`)
- SMTP Port (обычно `587`)
- SMTP User (ваш email)
- SMTP Password (пароль приложения)
- Admin Email (отправитель)
- Sender Name (имя отправителя)

После этого перезапустите контейнер:
```bash
docker-compose -f /root/HealApp-Web/docker-compose.production.yml restart auth
```

---

## Вариант 2: Ручная настройка

### Шаг 1: Отредактируйте docker-compose.yml

```bash
ssh root@176.124.217.224
nano /root/HealApp-Web/docker-compose.production.yml
```

### Шаг 2: Найдите секцию `auth` → `environment`

Найдите строку:
```yaml
GOTRUE_MAILER_AUTOCONFIRM: "true"
```

Добавьте после неё:
```yaml
GOTRUE_SMTP_HOST: smtp.gmail.com
GOTRUE_SMTP_PORT: 587
GOTRUE_SMTP_USER: ваш_email@gmail.com
GOTRUE_SMTP_PASS: ваш_пароль_приложения
GOTRUE_SMTP_ADMIN_EMAIL: ваш_email@gmail.com
GOTRUE_SMTP_SENDER_NAME: Supabase
GOTRUE_MAILER_AUTOCONFIRM: "false"  # Измените на false для тестирования
```

### Шаг 3: Сохраните и перезапустите

```bash
docker-compose -f /root/HealApp-Web/docker-compose.production.yml restart auth
```

---

## Настройка Gmail SMTP

### 1. Включите двухэтапную аутентификацию
- Перейдите в [Настройки Google аккаунта](https://myaccount.google.com/security)
- Включите "Двухэтапную аутентификацию"

### 2. Создайте пароль приложения
- Перейдите в [Пароли приложений](https://myaccount.google.com/apppasswords)
- Выберите "Почта" и "Другое устройство"
- Введите имя: "Supabase"
- Скопируйте 16-символьный пароль

### 3. Используйте этот пароль в `GOTRUE_SMTP_PASS`

---

## Настройка других SMTP провайдеров

### Mail.ru:
```yaml
GOTRUE_SMTP_HOST: smtp.mail.ru
GOTRUE_SMTP_PORT: 587
GOTRUE_SMTP_USER: ваш_email@mail.ru
GOTRUE_SMTP_PASS: ваш_пароль
```

### Yandex:
```yaml
GOTRUE_SMTP_HOST: smtp.yandex.ru
GOTRUE_SMTP_PORT: 587
GOTRUE_SMTP_USER: ваш_email@yandex.ru
GOTRUE_SMTP_PASS: ваш_пароль_приложения
```

---

## Проверка работы

### 1. Проверьте логи:
```bash
docker logs supabase-auth --tail 50 | grep -i smtp
```

Должны увидеть:
```
time=... level=info msg="SMTP server configured" host=smtp.gmail.com
```

### 2. Проверьте переменные окружения:
```bash
docker exec supabase-auth printenv | grep SMTP
```

### 3. Протестируйте регистрацию:
- Откройте ваше приложение
- Попробуйте зарегистрироваться по email
- Проверьте почту (включая спам)

---

## Важные настройки

### GOTRUE_MAILER_AUTOCONFIRM:
- `"true"` - email автоматически подтверждается (без письма)
- `"false"` - отправляется письмо с кодом подтверждения

**Для тестирования SMTP установите `"false"`**

### GOTRUE_SITE_URL:
Должен быть правильный URL вашего Supabase:
```yaml
GOTRUE_SITE_URL: https://176.124.217.224
```

---

## Устранение проблем

### Письма не приходят:
1. Проверьте логи: `docker logs supabase-auth`
2. Проверьте спам
3. Убедитесь, что пароль приложения правильный (для Gmail)
4. Проверьте, что порт 587 открыт на сервере

### Ошибка аутентификации SMTP:
- Для Gmail: используйте пароль приложения, не обычный пароль
- Проверьте, что двухэтапная аутентификация включена

### Письма приходят, но ссылки не работают:
- Проверьте `GOTRUE_SITE_URL` - должен быть правильный URL
- Проверьте `GOTRUE_URI_ALLOW_LIST` - должен включать ваш домен

---

## Готово!

После настройки SMTP:
1. ✅ Регистрация по email работает
2. ✅ Письма отправляются
3. ✅ Пользователи могут подтверждать email

