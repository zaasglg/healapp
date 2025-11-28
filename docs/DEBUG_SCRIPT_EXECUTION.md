# 🔍 Отладка выполнения скрипта

## Проблема

Команда `bash <(curl -s https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh)` выполняется, но ничего не происходит.

## Возможные причины

### 1. GitHub недоступен
Если GitHub заблокирован или недоступен, скрипт не скачается.

**Проверка:**
```bash
curl -I https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh
```

### 2. Проблема с процессом подстановки
В некоторых оболочках `<(command)` может не работать.

**Решение:**
```bash
# Вместо bash <(curl ...)
curl -s https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh | bash
```

### 3. Скрипт скачался, но не вывел ничего
Скрипт может ждать ввода данных или выполнять действия без вывода.

**Решение:**
```bash
# Скачать и посмотреть что в скрипте
curl -s https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh > /tmp/install.sh
cat /tmp/install.sh | head -50
```

### 4. Проблемы с сетью
Медленное соединение или таймауты.

**Решение:**
```bash
# С таймаутом
curl --connect-timeout 10 -s https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh | bash
```

## ✅ Правильный способ выполнения

### Вариант 1: Прямой pipe (рекомендуется)
```bash
curl -s https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh | bash
```

### Вариант 2: Скачать и выполнить
```bash
curl -s https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh -o /tmp/install.sh
chmod +x /tmp/install.sh
bash /tmp/install.sh
```

### Вариант 3: С отладкой
```bash
curl -v https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh 2>&1 | tee /tmp/install.sh | bash
```

## 🔍 Диагностика

Выполните эти команды для диагностики:

```bash
# 1. Проверка доступности GitHub
ping -c 2 github.com

# 2. Проверка доступности raw.githubusercontent.com
curl -I https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh

# 3. Попытка скачать скрипт
curl -s https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh -o /tmp/test.sh
ls -lh /tmp/test.sh
head -20 /tmp/test.sh
```

## ⚠️ Если GitHub недоступен

Если GitHub заблокирован, используйте:

1. **Зеркало GitHub:**
   ```bash
   curl -s https://ghproxy.com/https://raw.githubusercontent.com/kalininlive/supabase-vds-install/main/install.sh | bash
   ```

2. **Загрузить файл вручную:**
   - Скачайте скрипт на вашу Windows машину
   - Загрузите на сервер через `scp`
   - Выполните на сервере

3. **Использовать VPN или прокси**

