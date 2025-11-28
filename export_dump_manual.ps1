# Скрипт для экспорта полного дампа из Supabase
# Выполните этот скрипт в PowerShell

Write-Host "=== Экспорт полного дампа из Supabase ===" -ForegroundColor Green
Write-Host ""

# Шаг 1: Авторизация
Write-Host "Шаг 1: Авторизация в Supabase..." -ForegroundColor Yellow
Write-Host "Нажмите Enter для открытия браузера и авторизации..." -ForegroundColor Cyan
Read-Host
npx supabase login

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка авторизации" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Шаг 2: Список проектов..." -ForegroundColor Yellow
npx supabase projects list

Write-Host ""
$projectRef = Read-Host "Введите project-ref вашего проекта (из URL: https://supabase.com/dashboard/project/XXXXX)"

if ([string]::IsNullOrWhiteSpace($projectRef)) {
    Write-Host "❌ Project-ref не указан" -ForegroundColor Red
    exit 1
}

# Создание директории
$exportDir = ".\supabase_migrations_export"
if (-not (Test-Path $exportDir)) {
    New-Item -ItemType Directory -Path $exportDir | Out-Null
}

Write-Host ""
Write-Host "Шаг 3: Связывание с проектом..." -ForegroundColor Yellow
npx supabase link --project-ref $projectRef

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка при связывании проекта" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Шаг 4: Создание полного дампа..." -ForegroundColor Yellow
Write-Host "Это может занять несколько минут..." -ForegroundColor Yellow

$dumpFile = Join-Path $exportDir "full_dump_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

# Полный дамп со всеми схемами
npx supabase db dump --schema public,auth,storage -f $dumpFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Дамп создан успешно!" -ForegroundColor Green
    Write-Host "Файл: $dumpFile" -ForegroundColor Cyan
    Write-Host ""
    $fileInfo = Get-Item $dumpFile
    Write-Host "Размер: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📤 Отправьте этот файл для применения на новом сервере!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Ошибка при создании дампа" -ForegroundColor Red
}

