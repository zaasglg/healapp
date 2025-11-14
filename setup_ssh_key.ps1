$host = "89.111.154.27"
$user = "root"
$password = "fYUD4YraHIgw2XUi"
$publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKls56GPMKGi9D0vY8NDZizdm3qnSmWnHD81Ho4adEHJ github-actions-deploy"

# Команды для выполнения на сервере (одной строкой для plink)
$commands = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$publicKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && cat ~/.ssh/authorized_keys"

Write-Host "Подключение к серверу $user@$host..."
Write-Host "Выполняю команды на сервере..."
Write-Host ""

# Используем plink с автоматической передачей пароля
& "C:\Program Files\PuTTY\plink.exe" -ssh -pw $password -batch "$user@$host" $commands

