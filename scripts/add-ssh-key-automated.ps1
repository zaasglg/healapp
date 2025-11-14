# Автоматическое добавление SSH ключа на сервер через SSH с паролем

$serverIP = "89.111.154.27"
$serverUser = "root"
$serverPassword = "fYUD4YraHIgw2XUi"
$publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqV6yiw499ncx5OCHZ8qLFVvnZ7w2iorBB0CG6G+QB5 user@DESKTOP-K2HODEG"

Write-Host "Подключаюсь к серверу и добавляю SSH ключ..."
Write-Host ""

# Создаем команду для выполнения
$command = @"
mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$publicKey' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && cat ~/.ssh/authorized_keys
"@

# Пробуем использовать plink (если установлен PuTTY)
$plinkPath = "C:\Program Files\PuTTY\plink.exe"
if (Test-Path $plinkPath) {
    Write-Host "Используем plink..."
    $command | & $plinkPath -ssh "$serverUser@$serverIP" -pw $serverPassword
} else {
    # Альтернатива: используем ssh с expect-подобным скриптом
    Write-Host "plink не найден. Попробуем другой способ..."
    Write-Host ""
    Write-Host "Выполни команду вручную через PowerShell:"
    Write-Host ""
    Write-Host "ssh $serverUser@$serverIP"
    Write-Host "Пароль: $serverPassword"
    Write-Host ""
    Write-Host "Затем выполни:"
    Write-Host $command
}

