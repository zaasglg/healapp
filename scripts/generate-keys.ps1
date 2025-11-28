# Скрипт для генерации ключей Supabase
# Использование: .\scripts\generate-keys.ps1

Write-Host "=== Генерация ключей для Supabase ===" -ForegroundColor Cyan
Write-Host ""

# Функция для генерации случайной строки
function Generate-RandomString {
    param(
        [int]$Length = 32
    )
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
}

Write-Host "🔑 Генерация ключей..." -ForegroundColor Cyan
Write-Host ""

# Генерация JWT_SECRET (минимум 32 символа)
$jwtSecret = Generate-RandomString -Length 32
Write-Host "JWT_SECRET=" -NoNewline
Write-Host $jwtSecret -ForegroundColor Green

# Генерация ANON_KEY (JWT токен)
# Для реального ANON_KEY нужно использовать JWT с правильной структурой
# Здесь генерируем базовый ключ, который нужно будет использовать в Supabase
$anonKey = Generate-RandomString -Length 64
Write-Host "ANON_KEY=" -NoNewline
Write-Host $anonKey -ForegroundColor Green

# Генерация SERVICE_ROLE_KEY
$serviceRoleKey = Generate-RandomString -Length 64
Write-Host "SERVICE_ROLE_KEY=" -NoNewline
Write-Host $serviceRoleKey -ForegroundColor Green

# Генерация пароля для БД
$dbPassword = Generate-RandomString -Length 32
Write-Host "POSTGRES_PASSWORD=" -NoNewline
Write-Host $dbPassword -ForegroundColor Green

Write-Host ""
Write-Host "📋 ВАЖНО:" -ForegroundColor Yellow
Write-Host "   1. Сохраните эти ключи в безопасном месте" -ForegroundColor Yellow
Write-Host "   2. НЕ коммитьте их в Git" -ForegroundColor Yellow
Write-Host "   3. Используйте их в .env файле на сервере" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 Для создания правильного ANON_KEY и SERVICE_ROLE_KEY:" -ForegroundColor Cyan
Write-Host "   Используйте Supabase CLI или сгенерируйте через Supabase Studio" -ForegroundColor Gray
Write-Host "   после первого запуска контейнеров" -ForegroundColor Gray
Write-Host ""

# Создание файла .env.example
$envExample = @"
# Supabase Configuration
SUPABASE_JWT_SECRET=$jwtSecret
SUPABASE_ANON_KEY=$anonKey
SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey
SUPABASE_DB_PASSWORD=$dbPassword

# Site Configuration
SUPABASE_SITE_URL=https://ваш-домен.ru
SUPABASE_API_PORT=8000
SUPABASE_DB_PORT=54322
SUPABASE_STUDIO_PORT=54324
SUPABASE_FUNCTIONS_PORT=54325

# URI Allow List (разрешенные домены для CORS)
SUPABASE_URI_ALLOW_LIST=https://ваш-домен.ru,https://www.ваш-домен.ru
"@

$envExampleFile = ".env.example"
$envExample | Out-File -FilePath $envExampleFile -Encoding UTF8

Write-Host "✅ Создан файл $envExampleFile с примером конфигурации" -ForegroundColor Green
Write-Host "   Скопируйте его в .env на сервере и заполните реальными значениями" -ForegroundColor Gray
Write-Host ""

