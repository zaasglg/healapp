# Скрипт для применения всех миграций в правильном порядке (PowerShell)
# Использование: .\apply_all_migrations.ps1 -Host "176.124.217.224" -Port 54322 -Database "postgres" -User "postgres" -Password "your_password"

param(
    [string]$Host = "localhost",
    [int]$Port = 54322,
    [string]$Database = "postgres",
    [string]$User = "postgres",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Применение миграций Supabase" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Подключение к: $User@$Host`:$Port/$Database" -ForegroundColor Cyan
Write-Host ""

# Проверяем наличие psql
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "ОШИБКА: psql не найден!" -ForegroundColor Red
    Write-Host "Установите PostgreSQL client tools" -ForegroundColor Yellow
    exit 1
}

# Устанавливаем переменную окружения для пароля
$env:PGPASSWORD = $Password

# Функция для применения миграции
function Apply-Migration {
    param(
        [string]$File,
        [string]$Description
    )
    
    Write-Host "Применение: $Description" -ForegroundColor Yellow
    Write-Host "  Файл: $File" -ForegroundColor Gray
    
    $fullPath = Join-Path $PSScriptRoot $File
    
    if (-not (Test-Path $fullPath)) {
        Write-Host "  ✗ Файл не найден: $fullPath" -ForegroundColor Red
        exit 1
    }
    
    $result = & psql -h $Host -p $Port -U $User -d $Database -f $fullPath 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Успешно" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Ошибка!" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
    Write-Host ""
}

# Применяем миграции в правильном порядке
Apply-Migration "00_types_and_extensions.sql" "Типы, ENUM и расширения"
Apply-Migration "01_tables_structure.sql" "Структура таблиц"
Apply-Migration "01_foreign_keys.sql" "Внешние ключи"
Apply-Migration "01_unique_constraints.sql" "Уникальные ограничения"
Apply-Migration "01_check_constraints.sql" "CHECK ограничения"
Apply-Migration "02_indexes.sql" "Индексы"
Apply-Migration "03_functions.sql" "Функции"
Apply-Migration "04_rls_policies.sql" "RLS политики"
Apply-Migration "05_triggers.sql" "Триггеры на таблицах public"
Apply-Migration "05_auth_triggers.sql" "Триггеры на auth.users"

Write-Host "========================================" -ForegroundColor Green
Write-Host "Все миграции применены успешно!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

