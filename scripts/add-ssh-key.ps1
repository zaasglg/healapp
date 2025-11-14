# Скрипт для добавления SSH ключа на сервер
$serverIP = "89.111.154.27"
$serverUser = "root"
$serverPassword = "fYUD4YraHIgw2XUi"

# Читаем публичный ключ
$publicKeyPath = "$env:USERPROFILE\.ssh\id_ed25519.pub"
$publicKey = Get-Content $publicKeyPath -Raw

Write-Host "Публичный ключ:"
Write-Host $publicKey
Write-Host ""

# Создаем временный файл с командой
$tempScript = [System.IO.Path]::GetTempFileName()
$command = @"
echo '$($publicKey.Trim())' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/authorized_keys
"@

$command | Out-File -FilePath $tempScript -Encoding ASCII

Write-Host "Подключаюсь к серверу и добавляю ключ..."
Write-Host ""

# Используем plink если есть, иначе sshpass через WSL или просто ssh с интерактивным вводом
try {
    # Пробуем через ssh с передачей команды
    $sshCommand = "ssh"
    $sshArgs = @(
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "${serverUser}@${serverIP}",
        "bash -s"
    )
    
    # Запускаем ssh и передаем команду через stdin
    $process = Start-Process -FilePath $sshCommand -ArgumentList $sshArgs -NoNewWindow -Wait -PassThru -RedirectStandardInput $tempScript -RedirectStandardOutput "output.txt" -RedirectStandardError "error.txt"
    
    if (Test-Path "output.txt") {
        Write-Host "Результат:"
        Get-Content "output.txt"
    }
    
    if (Test-Path "error.txt") {
        $errors = Get-Content "error.txt"
        if ($errors) {
            Write-Host "Ошибки:"
            Write-Host $errors
        }
    }
} catch {
    Write-Host "Ошибка: $_"
    Write-Host ""
    Write-Host "Попробуй выполнить вручную через консоль Reg.ru:"
    Write-Host ""
    Write-Host "1. Подключись к серверу через консоль Reg.ru"
    Write-Host "2. Выполни команды:"
    Write-Host ""
    Write-Host "echo '$($publicKey.Trim())' >> ~/.ssh/authorized_keys"
    Write-Host "chmod 600 ~/.ssh/authorized_keys"
    Write-Host "cat ~/.ssh/authorized_keys"
}

# Удаляем временный файл
Remove-Item $tempScript -ErrorAction SilentlyContinue

