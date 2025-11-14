# Автоматическое добавление SSH ключа на сервер
$serverIP = "89.111.154.27"
$serverUser = "root"
$serverPassword = "fYUD4YraHIgw2XUi"
$publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1lZDI1NTE5AAAAIAqV6yiw499ncx5OCHZ8qLFVvnZ7w2iorBB0CG6G+QB5 user@DESKTOP-K2HODEG"

# Команды для выполнения на сервере
$commands = @"
mkdir -p ~/.ssh
chmod 700 ~/.ssh
echo '$publicKey' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys
"@

# Сохраняем команды во временный файл
$tempScript = [System.IO.Path]::GetTempFileName() + ".sh"
$commands | Out-File -FilePath $tempScript -Encoding ASCII -NoNewline

Write-Host "Подключаюсь к серверу и добавляю SSH ключ..."
Write-Host ""

# Используем plink если установлен, иначе ssh
$plinkPath = "plink.exe"
if (Get-Command $plinkPath -ErrorAction SilentlyContinue) {
    # Используем plink с автоматической передачей пароля
    $plinkArgs = @(
        "-ssh",
        "-batch",
        "-pw", $serverPassword,
        "${serverUser}@${serverIP}",
        "bash -s"
    )
    
    Get-Content $tempScript | & $plinkPath $plinkArgs
} else {
    # Пробуем через ssh с использованием sshpass (если есть WSL)
    Write-Host "Пробую через WSL sshpass..."
    $wslCommand = "wsl sshpass -p '$serverPassword' ssh -o StrictHostKeyChecking=no ${serverUser}@${serverIP} 'bash -s' < $tempScript"
    
    try {
        Invoke-Expression $wslCommand
    } catch {
        Write-Host "Ошибка: $_"
        Write-Host ""
        Write-Host "Попробуй установить plink или используй веб-консоль Reg.cloud"
        Write-Host "Команды для выполнения вручную:"
        Write-Host $commands
    }
}

# Удаляем временный файл
Remove-Item $tempScript -ErrorAction SilentlyContinue

