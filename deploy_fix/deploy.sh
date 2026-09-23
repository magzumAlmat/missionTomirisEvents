#!/bin/bash
# Скрипт деплоя EventTomiris

# Пароль от сервера
SSH_PASSWORD="G1v%iju?0YU%"

echo "=============================================="
echo "      DEPLOYMENT SCRIPT - EventTomiris       "
echo "=============================================="
echo ""

# Шаг 1: Очистка сервера
echo "🗑  Шаг 1: Очистка сервера..."
ssh root@89.207.249.82 "
    rm -rf /root/missionTomirisEvents/*
    rm -f /root/missionTomirisEvents
    mkdir -p /root/missionTomirisEvents
    echo 'Server cleaned and ready.'
"
echo "✓ Сервер очищен"
echo ""

# Шаг 2: Переописание nginx конфига
echo "⚙️  Шаг 2: Обновление nginx конфига..."

cat > eventtomiris.conf << 'EOF'
server {
    listen 80;
    server_name 89.207.249.82;

    root /root/missionTomirisEvents;

    # Корневая страница /
    location = / {
        index index.html;
        try_files /admin/index.html /index.html /;
    }

    # Страница admin
    location = /admin {
        index admin/index.html;
        root /root/missionTomirisEvents;
        try_files /admin/index.html /admin/admin.html /admin/;
    }

    # Статические файлы
    location /assets/ {
        alias /root/missionTomirisEvents/assets/;
    }

    # API проксирование
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
EOF

# Очистка старых конфигов
ssh root@89.207.249.82 "rm -f /etc/nginx/sites-enabled/*"
cp eventtomiris.conf root@89.207.249.82:/etc/nginx/sites-enabled/eventtomiris.conf
ssh root@89.207.249.82 "nginx -t && nginx -s reload"

echo "✓ Nginx конфиг обновлен и перезагружен"
echo ""

# Шаг 3: Переписать dist/ на сервер
echo "📦 Шаг 3: Копирование dist/..."
scp -r dist/ root@89.207.249.82:/root/missionTomirisEvents/

echo "✓ dist/ скопирован"
echo ""

# Шаг 4: Переписать assets/ на сервер
echo "📁 Шаг 4: Копирование assets/..."
scp -r assets/ root@89.207.249.82:/root/missionTomirisEvents/assets/

echo "✓ assets/ скопирован"
echo ""

# Шаг 5: Создание dist/admin/
echo "🔧 Шаг 5: Создание dist/admin/..."

# Создать папки
mkdir -p dist/admin
mkdir -p dist/admin/components
mkdir -p dist/admin/lib
mkdir -p dist/admin/pages

# Копирование файлов из src/ (упрощенная версия без импорта модулей)
echo "Копируем базовые файлы для admin..."
cp src/App.jsx dist/admin/index.html
cp src/main.jsx dist/admin/main.jsx
cp src/styles.css dist/admin/styles.css

# Создадим простой index для admin
echo "<!DOCTYPE html>
<html lang='ru'>
  <head>
    <meta charset='UTF-8' />
    <meta name='viewport' content='width=device-width, initial-scale=1.0' />
    <meta name='theme-color' content='#0e1220' />
    <title>Администратор</title>
  </head>
  <body>
    <div id='root'></div>
    <script type='module' src='/main.jsx'></script>
  </body>
</html>" > dist/admin/index.html

echo "✓ dist/admin/ создан"
echo ""

# Шаг 6: Запуск бэкенда
echo "🚀 Шаг 6: Запуск бэкенда через pm2..."
ssh root@89.207.249.82 "
    # Проверка наличия сервера
    if [ ! -d '/root/missionTomirisEvents/server' ]; then
        echo 'Error: Server folder not found'
        exit 1
    fi
    
    # Запуск
    cd /root/missionTomirisEvents/server
    pm2 delete eventtomiris-api 2>/dev/null || true
    pm2 start npm --name 'eventtomiris-api'
    pm2 save
    pm2 startup
"

echo "✓ Бэкенд запущен"
echo ""

# Итоговый отчет
echo "=============================================="
echo "          DEPLOYMENT COMPLETE!               "
echo "=============================================="
echo ""
echo "📍 Доступные URL:"
echo "   http://89.207.249.82/           - Главная страница"
echo "   http://89.207.249.82/#/admin    - Админка (hash routing)"
echo ""
