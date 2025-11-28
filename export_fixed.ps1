# Экспорт с автоматическим поиском pg_dump

Write-Host "=== Экспорт из Supabase ===" -ForegroundColor Green
Write-Host ""

# Поиск pg_dump
$pgDump = $null

# Проверка в PATH
if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
    $pgDump = "pg_dump"
    Write-Host "OK: pg_dump найден в PATH" -ForegroundColor Green
} else {
    # Поиск в стандартных папках
    $versions = @(18, 17, 16, 15, 14, 13)
    foreach ($ver in $versions) {
        $path = "C:\Program Files\PostgreSQL\$ver\bin\pg_dump.exe"
        if (Test-Path $path) {
            $pgDump = $path
            Write-Host "OK: pg_dump найден: $path" -ForegroundColor Green
            break
        }
    }
}

if (-not $pgDump) {
    Write-Host "ERROR: pg_dump не найден!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Добавьте PostgreSQL в PATH:" -ForegroundColor Yellow
    Write-Host '$env:Path += ";C:\Program Files\PostgreSQL\18\bin"' -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Получите Connection String из Supabase:" -ForegroundColor Yellow
Write-Host "1. Откройте: https://supabase.com" -ForegroundColor Cyan
Write-Host "2. Settings -> Database -> Connection string (URI format)" -ForegroundColor Cyan
Write-Host "3. Скопируйте строку подключения" -ForegroundColor Cyan
Write-Host ""

Write-Host "Пример:" -ForegroundColor Yellow
Write-Host "postgresql://postgres.mtpawypaihmwrngirnxa:[PASSWORD]@aws-0-eu-north-1.pooler.supabase.com:6543/postgres" -ForegroundColor Gray
Write-Host ""

$connectionString = Read-Host "Вставьте Connection String (с паролем)"

if ([string]::IsNullOrWhiteSpace($connectionString)) {
    Write-Host "ERROR: Connection String не указан" -ForegroundColor Red
    exit 1
}

$dumpFile = "full_dump_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

Write-Host ""
Write-Host "Экспорт дампа..." -ForegroundColor Yellow
Write-Host "Это может занять несколько минут..." -ForegroundColor Yellow
Write-Host ""

# Выполнение pg_dump
& $pgDump $connectionString --schema=public --schema=auth --schema=storage --no-owner --no-acl -f $dumpFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK: Дамп создан успешно!" -ForegroundColor Green
    Write-Host "Файл: $dumpFile" -ForegroundColor Cyan
    if (Test-Path $dumpFile) {
        $fileInfo = Get-Item $dumpFile
        Write-Host "Размер: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Отправьте этот файл для применения на новом сервере!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERROR: Ошибка при создании дампа" -ForegroundColor Red
    Write-Host "Проверьте Connection String и пароль" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Альтернатива: Используйте SQL Editor (см. файл export_via_sql_editor.md)" -ForegroundColor Cyan
}

