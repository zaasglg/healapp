# Скрипт для создания бэкапа текущей БД Supabase
# Использование: .\scripts\create-backup.ps1

Write-Host "=== Создание бэкапа Supabase БД ===" -ForegroundColor Cyan

# Проверка наличия переменных окружения
if (-not $env:SUPABASE_DB_URL) {
    Write-Host "❌ ОШИБКА: Не установлена переменная SUPABASE_DB_URL" -ForegroundColor Red
    Write-Host ""
    Write-Host "Установите переменную окружения:" -ForegroundColor Yellow
    Write-Host '  $env:SUPABASE_DB_URL = "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"' -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Или получите connection string из Supabase Dashboard:" -ForegroundColor Yellow
    Write-Host "  Settings → Database → Connection string → URI" -ForegroundColor Yellow
    exit 1
}

# Проверка наличия pg_dump
$pgDumpPath = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDumpPath) {
    Write-Host "❌ ОШИБКА: pg_dump не найден" -ForegroundColor Red
    Write-Host ""
    Write-Host "Установите PostgreSQL client tools:" -ForegroundColor Yellow
    Write-Host "  https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    exit 1
}

# Создание директории для бэкапов
$backupDir = "backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
    Write-Host "✓ Создана директория для бэкапов: $backupDir" -ForegroundColor Green
}

# Генерация имени файла с датой и временем
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "$backupDir\supabase_backup_$timestamp.sql"

Write-Host ""
Write-Host "📦 Создание бэкапа..." -ForegroundColor Cyan
Write-Host "   Файл: $backupFile" -ForegroundColor Gray

try {
    # Создание бэкапа
    $env:PGPASSWORD = ($env:SUPABASE_DB_URL -split ':')[2] -replace '@.*', ''
    $connectionString = $env:SUPABASE_DB_URL
    
    # Извлечение компонентов из connection string
    if ($connectionString -match 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)') {
        $dbUser = $matches[1]
        $dbPassword = $matches[2]
        $dbHost = $matches[3]
        $dbPort = $matches[4]
        $dbName = $matches[5]
        
        $env:PGPASSWORD = $dbPassword
        
        # Создание бэкапа
        & pg_dump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F c -f $backupFile
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Бэкап успешно создан!" -ForegroundColor Green
            Write-Host "   Размер файла: $((Get-Item $backupFile).Length / 1MB) MB" -ForegroundColor Gray
            Write-Host ""
            Write-Host "📋 Следующие шаги:" -ForegroundColor Cyan
            Write-Host "   1. Сохраните файл $backupFile в безопасное место" -ForegroundColor Yellow
            Write-Host "   2. Проверьте целостность бэкапа (опционально)" -ForegroundColor Yellow
            Write-Host "   3. Переходите к Этапу 1 миграции" -ForegroundColor Yellow
        } else {
            Write-Host ""
            Write-Host "❌ ОШИБКА при создании бэкапа" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "❌ ОШИБКА: Неверный формат connection string" -ForegroundColor Red
        Write-Host "   Ожидается: postgresql://user:password@host:port/database" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ ОШИБКА: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    # Очистка пароля из переменных окружения
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ""

