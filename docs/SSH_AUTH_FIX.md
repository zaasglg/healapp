# Исправление проблемы SSH аутентификации

## 🔴 Проблема
```
ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey], no supported methods remain
```

Это означает, что сервер не может аутентифицировать GitHub Actions через SSH ключ.

---

## ✅ Решение: Проверка и исправление на сервере

### Шаг 1: Подключись к серверу через PuTTY

1. Открой PuTTY
2. Подключись: `root@89.111.154.27`
3. Введи пароль: `fYUD4YraHIgw2XUi`

---

### Шаг 2: Проверь наличие публичного ключа

Выполни команду:
```bash
cat ~/.ssh/authorized_keys
```

**Должна быть строка:**
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqV6yiw499ncx5OCHZ8qLFVvnZ7w2iorBB0CG6G+QB5 user@DESKTOP-K2HODEG
```

**Если ключа нет или он другой:**
1. Выполни:
```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
```

2. Добавь ключ:
```bash
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqV6yiw499ncx5OCHZ8qLFVvnZ7w2iorBB0CG6G+QB5 user@DESKTOP-K2HODEG" >> ~/.ssh/authorized_keys
```

3. Установи правильные права:
```bash
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

---

### Шаг 3: Проверь права доступа

Выполни команды:
```bash
ls -la ~/.ssh
```

**Должно быть:**
```
drwx------ 2 root root 4096 ... .ssh
-rw------- 1 root root  123 ... authorized_keys
```

Если права другие, исправь:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chown root:root ~/.ssh
chown root:root ~/.ssh/authorized_keys
```

---

### Шаг 4: Проверь конфигурацию SSH

Выполни:
```bash
cat /etc/ssh/sshd_config | grep -E "PubkeyAuthentication|AuthorizedKeysFile|PasswordAuthentication"
```

**Должно быть:**
```
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PasswordAuthentication yes
```

Если `PubkeyAuthentication no`, исправь:
```bash
sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/PubkeyAuthentication no/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd
```

---

## 🔐 Проверка GitHub Secrets

### Убедись, что в GitHub Secrets правильно добавлен приватный ключ:

1. Зайди в GitHub → Settings → Secrets and variables → Actions
2. Проверь секрет `SSH_PRIVATE_KEY`
3. Он должен начинаться с `-----BEGIN OPENSSH PRIVATE KEY-----` или `-----BEGIN PRIVATE KEY-----`
4. И заканчиваться на `-----END OPENSSH PRIVATE KEY-----` или `-----END PRIVATE KEY-----`

**Если ключ неправильный:**
1. На своем компьютере выполни в PowerShell:
```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519
```

2. Скопируй ВСЁ содержимое (включая строки BEGIN и END)
3. Обнови секрет `SSH_PRIVATE_KEY` в GitHub

---

## 🧪 Тест подключения

После исправления, проверь подключение с твоего компьютера:

В PowerShell:
```powershell
ssh -i $env:USERPROFILE\.ssh\id_ed25519 root@89.111.154.27
```

Если подключение работает без пароля - значит всё правильно!

---

## 🚀 После исправления

1. Сделай небольшое изменение в коде (например, добавь комментарий)
2. Закоммить и запушь:
```bash
git add .
git commit -m "Тест деплоя после исправления SSH"
git push origin main
```

3. Проверь GitHub Actions - деплой должен пройти успешно!

