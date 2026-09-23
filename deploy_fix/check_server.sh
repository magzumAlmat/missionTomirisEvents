#!/bin/bash
# Скрипт для деплоя EventTomiris

# Проверка SSH подключения
echo "=== Проверка SSH подключения ==="
ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 root@89.207.249.82 "echo 'SSH connected!'" 2>/dev/null || echo "Cannot connect via SSH"

# Проверка состояния сервера
echo -e "\n=== Проверка состояния сервера ==="
ssh -o BatchMode=yes root@89.207.249.82 "
    echo '=== Папка missionTomirisEvents ==='
    ls -la /root/missionTomirisEvents/
    echo ''
    echo '=== Файлы в папке ==='
    find /root/missionTomirisEvents/ -type f 2>/dev/null | head -20
    echo ''
    echo '=== Nginx статус ==='
    pm2 list 2>/dev/null || systemctl status nginx 2>/dev/null || echo 'No PM2 or system nginx'
    echo ''
    echo '=== Конфиг nginx ==='
    cat /etc/nginx/sites-enabled/eventtomiris.conf 2>/dev/null || cat /etc/nginx/nginx.conf 2>/dev/null | grep -A 30 'server {'
"
