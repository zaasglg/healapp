# Скрипт для автоматического подключения к серверу
$password = "fYUD4YraHIgw2XUi"
$server = "89.111.154.27"
$user = "root"

# Устанавливаем переменную окружения для неинтерактивного режима
$env:SSH_ASKPASS_REQUIRE = "never"

# Создаем команды для выполнения на сервере
$commands = @"
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKls56GPMKGi9D0vY8NDZizdm3qnSmWnHD81Ho4adEHJ github-actions-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys
"@

# Пробуем подключиться через ssh с передачей команд
Write-Host "Подключаюсь к серверу..."
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=$null root@$server $commands

