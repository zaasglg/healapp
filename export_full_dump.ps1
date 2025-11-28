# Скрипт для экспорта полного дампа из Supabase через CLI

Write-Host "=== Экспорт полного дампа из Supabase ===" -ForegroundColor Green
Write-Host ""

# Проверка Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js не установлен!" -ForegroundColor Red
    Write-Host "Установите Node.js с https://nodejs.org/"
    exit 1
}

Write-Host "✅ Node.js установлен: $(node --version)" -ForegroundColor Green
Write-Host ""

# Используем npx для запуска Supabase CLI без глобальной установки
Write-Host "Использование Supabase CLI через npx..." -ForegroundColor Yellow
Write-Host ""

# Проверка авторизации
Write-Host "Проверка авторизации..." -ForegroundColor Yellow
$loginCheck = npx supabase projects list 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Не авторизованы. Выполните:" -ForegroundColor Yellow
    Write-Host "   npx supabase login" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Это откроет браузер для авторизации." -ForegroundColor Yellow
    Write-Host ""
    $proceed = Read-Host "Выполнить авторизацию сейчас? (y/n)"
    if ($proceed -eq "y" -or $proceed -eq "Y") {
        npx supabase login
    } else {
        Write-Host "Авторизуйтесь вручную и запустите скрипт снова." -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "Доступные проекты:" -ForegroundColor Green
npx supabase projects list

Write-Host ""
$projectRef = Read-Host "Введите project-ref вашего проекта (из URL Supabase)"

if ([string]::IsNullOrWhiteSpace($projectRef)) {
    Write-Host "❌ Project-ref не указан" -ForegroundColor Red
    exit 1
}

# Создание директории для экспорта
$exportDir = ".\supabase_migrations_export"
if (-not (Test-Path $exportDir)) {
    New-Item -ItemType Directory -Path $exportDir | Out-Null
}

Write-Host ""
Write-Host "Связывание с проектом..." -ForegroundColor Yellow
npx supabase link --project-ref $projectRef

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка при связывании проекта" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Создание полного дампа..." -ForegroundColor Yellow
Write-Host "Это может занять несколько минут..." -ForegroundColor Yellow

# Полный дамп со всеми схемами
$dumpFile = Join-Path $exportDir "full_dump_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
npx supabase db dump --schema public,auth,storage -f $dumpFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Дамп создан успешно!" -ForegroundColor Green
    Write-Host "Файл: $dumpFile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Размер файла: $((Get-Item $dumpFile).Length / 1KB) KB" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📤 Отправьте этот файл для применения на новом сервере!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Ошибка при создании дампа" -ForegroundColor Red
    Write-Host "Попробуйте другой способ экспорта из EXPORT_FULL_DUMP.md" -ForegroundColor Yellow
}

