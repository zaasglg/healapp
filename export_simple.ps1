# Простой скрипт для экспорта через pg_dump

Write-Host "=== Бесплатный экспорт из Supabase ===" -ForegroundColor Green
Write-Host ""

# Проверка pg_dump
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: pg_dump не найден!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Установите PostgreSQL клиент:" -ForegroundColor Yellow
    Write-Host "1. Скачайте: https://www.postgresql.org/download/windows/" -ForegroundColor Cyan
    Write-Host "2. Или используйте SQL Editor (см. export_via_sql_editor.md)" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "OK: pg_dump найден!" -ForegroundColor Green
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

pg_dump $connectionString --schema=public --schema=auth --schema=storage --no-owner --no-acl -f $dumpFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK: Дамп создан успешно!" -ForegroundColor Green
    Write-Host "Файл: $dumpFile" -ForegroundColor Cyan
    $fileInfo = Get-Item $dumpFile
    Write-Host "Размер: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Отправьте этот файл для применения на новом сервере!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERROR: Ошибка при создании дампа" -ForegroundColor Red
    Write-Host "Проверьте Connection String и пароль" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Альтернатива: Используйте SQL Editor (см. export_via_sql_editor.md)" -ForegroundColor Cyan
}

