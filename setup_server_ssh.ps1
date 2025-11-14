# Скрипт для настройки SSH ключа на сервере
$serverIP = "89.111.154.27"
$password = "fYUD4YraHIgw2XUi"
$publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKls56GPMKGi9D0vY8NDZizdm3qnSmWnHD81Ho4adEHJ github-actions-deploy"

# Команды для выполнения на сервере
$commands = @"
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo '$publicKey' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys
"@

# Используем sshpass если доступен, иначе используем другой метод
Write-Host "Попытка подключения к серверу..."

# Попробуем использовать ssh с передачей пароля через stdin
$commands | ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=$null root@$serverIP 2>&1

