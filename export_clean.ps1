# Clean export script without special characters

Write-Host "=== Export from Supabase ===" -ForegroundColor Green
Write-Host ""

# Find pg_dump
$pgDump = $null

# Check in PATH
if (Get-Command pg_dump -ErrorAction SilentlyContinue) {
    $pgDump = "pg_dump"
    Write-Host "OK: pg_dump found in PATH" -ForegroundColor Green
} else {
    # Search in standard folders
    $versions = @(18, 17, 16, 15, 14, 13)
    foreach ($ver in $versions) {
        $path = "C:\Program Files\PostgreSQL\$ver\bin\pg_dump.exe"
        if (Test-Path $path) {
            $pgDump = $path
            Write-Host "OK: pg_dump found: $path" -ForegroundColor Green
            break
        }
    }
}

if (-not $pgDump) {
    Write-Host "ERROR: pg_dump not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Add PostgreSQL to PATH:" -ForegroundColor Yellow
    Write-Host '$env:Path += ";C:\Program Files\PostgreSQL\18\bin"' -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "Get Connection String from Supabase:" -ForegroundColor Yellow
Write-Host "1. Open: https://supabase.com" -ForegroundColor Cyan
Write-Host "2. Settings -> Database -> Connection string (URI format)" -ForegroundColor Cyan
Write-Host "3. Copy connection string" -ForegroundColor Cyan
Write-Host ""

Write-Host "Example:" -ForegroundColor Yellow
Write-Host "postgresql://postgres.mtpawypaihmwrngirnxa:[PASSWORD]@aws-0-eu-north-1.pooler.supabase.com:6543/postgres" -ForegroundColor Gray
Write-Host ""

$connectionString = Read-Host "Paste Connection String (with password)"

if ([string]::IsNullOrWhiteSpace($connectionString)) {
    Write-Host "ERROR: Connection String not provided" -ForegroundColor Red
    exit 1
}

$dumpFile = "full_dump_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

Write-Host ""
Write-Host "Exporting dump..." -ForegroundColor Yellow
Write-Host "This may take several minutes..." -ForegroundColor Yellow
Write-Host ""

# Execute pg_dump
& $pgDump $connectionString --schema=public --schema=auth --schema=storage --no-owner --no-acl -f $dumpFile

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "OK: Dump created successfully!" -ForegroundColor Green
    Write-Host "File: $dumpFile" -ForegroundColor Cyan
    if (Test-Path $dumpFile) {
        $fileInfo = Get-Item $dumpFile
        Write-Host "Size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Send this file to apply on new server!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERROR: Error creating dump" -ForegroundColor Red
    Write-Host "Check Connection String and password" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative: Use SQL Editor (see export_via_sql_editor.md)" -ForegroundColor Cyan
}

