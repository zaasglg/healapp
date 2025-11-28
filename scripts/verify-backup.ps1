# Скрипт для проверки целостности бэкапа
# Использование: .\scripts\verify-backup.ps1 -BackupFile "backups\supabase_backup_YYYYMMDD_HHMMSS.sql"

param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile
)

Write-Host "=== Проверка целостности бэкапа ===" -ForegroundColor Cyan

if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ ОШИБКА: Файл бэкапа не найден: $BackupFile" -ForegroundColor Red
    exit 1
}

$fileSize = (Get-Item $BackupFile).Length
Write-Host "📦 Файл: $BackupFile" -ForegroundColor Gray
Write-Host "   Размер: $([math]::Round($fileSize / 1MB, 2)) MB" -ForegroundColor Gray

if ($fileSize -lt 1024) {
    Write-Host "⚠️  ПРЕДУПРЕЖДЕНИЕ: Файл слишком маленький, возможно бэкап неполный" -ForegroundColor Yellow
}

# Проверка формата файла
$fileContent = Get-Content $BackupFile -TotalCount 10 -ErrorAction SilentlyContinue
if ($fileContent -match 'PostgreSQL database dump|pg_dump') {
    Write-Host "✅ Формат файла корректный (PostgreSQL dump)" -ForegroundColor Green
} else {
    Write-Host "⚠️  ПРЕДУПРЕЖДЕНИЕ: Не удалось определить формат файла" -ForegroundColor Yellow
}

# Проверка наличия основных таблиц в бэкапе
Write-Host ""
Write-Host "🔍 Проверка содержимого..." -ForegroundColor Cyan

$requiredTables = @(
    'organizations',
    'clients',
    'patient_cards',
    'diaries',
    'diary_metrics',
    'organization_employees',
    'auth.users'
)

$fileContent = Get-Content $BackupFile -Raw -ErrorAction SilentlyContinue
$foundTables = @()

foreach ($table in $requiredTables) {
    if ($fileContent -match "CREATE TABLE.*$table|COPY.*$table") {
        $foundTables += $table
        Write-Host "   ✓ Найдена таблица: $table" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ Не найдена таблица: $table" -ForegroundColor Yellow
    }
}

Write-Host ""
if ($foundTables.Count -ge 5) {
    Write-Host "✅ Бэкап выглядит корректно" -ForegroundColor Green
    Write-Host "   Найдено таблиц: $($foundTables.Count) из $($requiredTables.Count)" -ForegroundColor Gray
} else {
    Write-Host "⚠️  ПРЕДУПРЕЖДЕНИЕ: В бэкапе найдено мало таблиц" -ForegroundColor Yellow
    Write-Host "   Рекомендуется проверить процесс создания бэкапа" -ForegroundColor Yellow
}

Write-Host ""

