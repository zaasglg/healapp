# Скрипт для экспорта через pg_dump (без Docker)

Write-Host "=== Экспорт через pg_dump ===" -ForegroundColor Green
Write-Host ""

# Проверка pg_dump
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Host "❌ pg_dump не найден!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Установите PostgreSQL клиент:" -ForegroundColor Yellow
    Write-Host "1. Скачайте: https://www.postgresql.org/download/windows/" -ForegroundColor Cyan
    Write-Host "2. Или используйте Supabase Dashboard для экспорта" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Альтернатива: Используйте Supabase Dashboard:" -ForegroundColor Yellow
    Write-Host "1. Database → Backups → Create backup" -ForegroundColor Cyan
    exit 1
}

Write-Host "✅ pg_dump найден: $(pg_dump --version)" -ForegroundColor Green
Write-Host ""

Write-Host "Для экспорта нужен Connection String из Supabase:" -ForegroundColor Yellow
Write-Host "1. Откройте: https://supabase.com" -ForegroundColor Cyan
Write-Host "2. Settings → Database → Connection string (URI format)" -ForegroundColor Cyan
Write-Host ""

$connectionString = Read-Host "Вставьте Connection String"

if ([string]::IsNullOrWhiteSpace($connectionString)) {
    Write-Host "❌ Connection String не указан" -ForegroundColor Red
    exit 1
}

$dumpFile = "full_dump_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

Write-Host ""
Write-Host "Экспорт дампа..." -ForegroundColor Yellow
Write-Host "Это может занять несколько минут..." -ForegroundColor Yellow

pg_dump $connectionString --schema=public --schema=auth --schema=storage --no-owner --no-acl -f $dumpFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Дамп создан успешно!" -ForegroundColor Green
    Write-Host "Файл: $dumpFile" -ForegroundColor Cyan
    $fileInfo = Get-Item $dumpFile
    Write-Host "Размер: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📤 Отправьте этот файл для применения на новом сервере!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Ошибка при создании дампа" -ForegroundColor Red
    Write-Host "Проверьте Connection String и попробуйте снова" -ForegroundColor Yellow
}

