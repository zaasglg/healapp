# Скрипт для автоматического добавления SSH ключа на сервер
$serverIP = "89.111.154.27"
$serverUser = "root"
$serverPassword = "fYUD4YraHIgw2XUi"
$publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqV6yiw499ncx5OCHZ8qLFVvnZ7w2iorBB0CG6G+QB5 user@DESKTOP-K2HODEG"

Write-Host "Подключаюсь к серверу и добавляю SSH ключ..."
Write-Host ""

# Создаем команды для выполнения
$commands = @"
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo '$publicKey' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys
"@

# Сохраняем команды во временный файл
$tempFile = [System.IO.Path]::GetTempFileName()
$commands | Out-File -FilePath $tempFile -Encoding ASCII -NoNewline

# Пробуем использовать plink (PuTTY) если установлен
$plinkPath = "C:\Program Files\PuTTY\plink.exe"
if (Test-Path $plinkPath) {
    Write-Host "Используется PuTTY plink..."
    & $plinkPath -ssh -pw $serverPassword "$serverUser@$serverIP" -m $tempFile
} else {
    # Используем ssh с передачей команд через stdin
    Write-Host "Используется стандартный SSH..."
    Write-Host "ВНИМАНИЕ: Потребуется ввести пароль вручную: $serverPassword"
    Write-Host ""
    
    # Пробуем через ssh с передачей команд
    Get-Content $tempFile | ssh -o StrictHostKeyChecking=no "$serverUser@$serverIP" "bash"
}

# Удаляем временный файл
Remove-Item $tempFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Готово!"

