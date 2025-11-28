# Скрипт для получения всех миграций из Supabase
# Использование: .\scripts\get-migrations-from-supabase.ps1

Write-Host "=== Получение миграций из Supabase ===" -ForegroundColor Cyan
Write-Host ""

# Проверка наличия Supabase CLI
$supabaseCli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCli) {
    Write-Host "❌ ОШИБКА: Supabase CLI не установлен" -ForegroundColor Red
    Write-Host ""
    Write-Host "Установите Supabase CLI:" -ForegroundColor Yellow
    Write-Host "  npm install -g supabase" -ForegroundColor Yellow
    Write-Host "  или" -ForegroundColor Yellow
    Write-Host "  scoop install supabase" -ForegroundColor Yellow
    exit 1
}

Write-Host "📋 Инструкция:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Убедитесь, что вы авторизованы в Supabase CLI:" -ForegroundColor Yellow
Write-Host "   supabase login" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Свяжите проект с вашим Supabase:" -ForegroundColor Yellow
Write-Host "   supabase link --project-ref mtpawypaihmwrngirnxa" -ForegroundColor Gray
Write-Host ""
Write-Host "3. После этого выполните:" -ForegroundColor Yellow
Write-Host "   supabase db dump -f supabase/migrations/current_schema.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "Или получите миграции через Supabase Dashboard:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Откройте: https://mtpawypaihmwrngirnxa.supabase.co" -ForegroundColor Gray
Write-Host "  2. Перейдите в Database → Migrations" -ForegroundColor Gray
Write-Host "  3. Экспортируйте все миграции" -ForegroundColor Gray
Write-Host ""

# Создание директории для миграций
$migrationsDir = "supabase/migrations/from_supabase"
if (-not (Test-Path $migrationsDir)) {
    New-Item -ItemType Directory -Path $migrationsDir -Force | Out-Null
    Write-Host "✅ Создана директория: $migrationsDir" -ForegroundColor Green
}

Write-Host "📁 Миграции будут сохранены в: $migrationsDir" -ForegroundColor Cyan
Write-Host ""

# Проверка, связан ли проект
if (Test-Path ".supabase/config.toml") {
    Write-Host "ℹ️  Найден файл конфигурации Supabase" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Выполните команду для получения миграций:" -ForegroundColor Yellow
    Write-Host "  supabase db dump -f $migrationsDir/current_schema.sql" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Или получите список миграций:" -ForegroundColor Yellow
    Write-Host "  supabase migration list" -ForegroundColor Gray
} else {
    Write-Host "⚠️  Проект не связан с Supabase" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Сначала выполните:" -ForegroundColor Yellow
    Write-Host "  supabase link --project-ref mtpawypaihmwrngirnxa" -ForegroundColor Gray
}

Write-Host ""

