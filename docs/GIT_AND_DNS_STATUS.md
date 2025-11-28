# ✅ Статус Git и DNS на сервере

## Git

**Статус:** ✅ Установлен  
**Версия:** `git version 2.43.0`  
**Путь:** `/usr/bin/git`

## Проблема

**Не Git, а DNS и доступность GitHub:**

1. ❌ GitHub недоступен: `Temporary failure resolving 'github.com'`
2. ❌ Проблемы с DNS резолвингом многих доменов:
   - `archive.ubuntu.com`
   - `security.ubuntu.com`
   - `download.docker.com`
   - `github.com`

## Команда для установки Git (если понадобится)

```bash
apt update && apt install -y git
```

## Решение проблемы с GitHub

### Вариант 1: Исправить DNS

```bash
# Добавить Google DNS
echo "nameserver 8.8.8.8" >> /etc/resolv.conf
echo "nameserver 8.8.4.4" >> /etc/resolv.conf

# Или использовать Yandex DNS (для РФ)
echo "nameserver 77.88.8.8" >> /etc/resolv.conf
echo "nameserver 77.88.8.1" >> /etc/resolv.conf
```

### Вариант 2: Использовать зеркало GitHub

```bash
# Через ghproxy.com
curl -s https://ghproxy.com/https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh | bash
```

### Вариант 3: Загрузить файл вручную

Скопируйте файл `RF_server_SupaBase.sh` на сервер через `scp` или создайте вручную через `nano`.

## Проверка

```bash
# Проверка Git
git --version

# Проверка DNS
nslookup github.com 8.8.8.8

# Проверка доступности GitHub
curl -I https://github.com
```

