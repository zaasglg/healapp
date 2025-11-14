@echo off
REM Простой скрипт для добавления SSH ключа
REM Требуется установленный PuTTY (plink.exe)

echo Подключаюсь к серверу и добавляю SSH ключ...
echo.

set SERVER_IP=89.111.154.27
set SERVER_USER=root
set SERVER_PASSWORD=fYUD4YraHIgw2XUi
set PUBLIC_KEY=ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqV6yiw499ncx5OCHZ8qLFVvnZ7w2iorBB0CG6G+QB5 user@DESKTOP-K2HODEG

REM Проверяем наличие plink
where plink >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ОШИБКА: plink.exe не найден в PATH
    echo Установи PuTTY: https://www.putty.org/
    echo Или добавь путь к plink.exe в PATH
    pause
    exit /b 1
)

REM Выполняем команды на сервере
echo mkdir -p ~/.ssh ^&^& chmod 700 ~/.ssh ^&^& echo '%PUBLIC_KEY%' ^>^> ~/.ssh/authorized_keys ^&^& chmod 600 ~/.ssh/authorized_keys ^&^& cat ~/.ssh/authorized_keys | plink -ssh %SERVER_USER%@%SERVER_IP% -pw %SERVER_PASSWORD%

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ SSH ключ успешно добавлен!
) else (
    echo.
    echo ❌ Ошибка при добавлении ключа
)

pause

