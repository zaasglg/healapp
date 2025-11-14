#!/usr/bin/env python3
"""
Скрипт для автоматического добавления SSH ключа на сервер через SSH
Требуется: pip install paramiko
"""

import paramiko
import sys

# Данные сервера
SERVER_IP = "89.111.154.27"
SERVER_USER = "root"
SERVER_PASSWORD = "fYUD4YraHIgw2XUi"
PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqV6yiw499ncx5OCHZ8qLFVvnZ7w2iorBB0CG6G+QB5 user@DESKTOP-K2HODEG"

def add_ssh_key():
    """Добавляет SSH ключ на сервер"""
    try:
        print(f"Подключаюсь к серверу {SERVER_USER}@{SERVER_IP}...")
        
        # Создаем SSH клиент
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        # Подключаемся
        ssh.connect(
            hostname=SERVER_IP,
            username=SERVER_USER,
            password=SERVER_PASSWORD,
            timeout=10
        )
        
        print("Подключение установлено!")
        print("Выполняю команды...")
        
        # Команды для выполнения
        commands = [
            "mkdir -p ~/.ssh",
            "chmod 700 ~/.ssh",
            f"echo '{PUBLIC_KEY}' >> ~/.ssh/authorized_keys",
            "chmod 600 ~/.ssh/authorized_keys",
            "cat ~/.ssh/authorized_keys"
        ]
        
        # Выполняем команды
        for cmd in commands:
            print(f"\nВыполняю: {cmd}")
            stdin, stdout, stderr = ssh.exec_command(cmd)
            
            # Выводим результат
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            if output:
                print(f"Результат: {output}")
            if error:
                print(f"Ошибка: {error}")
        
        print("\n✅ SSH ключ успешно добавлен на сервер!")
        
        # Закрываем соединение
        ssh.close()
        
    except paramiko.AuthenticationException:
        print("❌ Ошибка аутентификации. Проверь пароль.")
        sys.exit(1)
    except paramiko.SSHException as e:
        print(f"❌ Ошибка SSH: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {e}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        import paramiko
    except ImportError:
        print("❌ Библиотека paramiko не установлена.")
        print("Установи её командой: pip install paramiko")
        sys.exit(1)
    
    add_ssh_key()

