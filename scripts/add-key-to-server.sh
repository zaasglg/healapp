#!/bin/bash
# Скрипт для добавления SSH ключа на сервер

PUBLIC_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqV6yiw499ncx5OCHZ8qLFVvnZ7w2iorBB0CG6G+QB5 user@DESKTOP-K2HODEG"

# Создаем директорию если нет
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Добавляем ключ
echo "$PUBLIC_KEY" >> ~/.ssh/authorized_keys

# Устанавливаем права
chmod 600 ~/.ssh/authorized_keys

# Проверяем
echo "Ключ добавлен. Содержимое authorized_keys:"
cat ~/.ssh/authorized_keys

