# Загрузить скрипт на сервер
$content = Get-Content -Path "RF_server_SupaBase.sh" -Raw -Encoding UTF8
$content | ssh root@176.124.217.224 "cat > /root/RF_server_SupaBase.sh"
ssh root@176.124.217.224 "chmod +x /root/RF_server_SupaBase.sh && echo 'Файл загружен и готов к выполнению'"

