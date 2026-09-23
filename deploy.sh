#!/bin/bash

# =======================================================================
# СКРИПТ ДЕПЛОЯ EventTomiris на сервер 89.207.249.82
# =======================================================================
# ЭТОТ СКРИПТ НАСТРАИВАЕТ И ДЕКЛОИТ ПРОЕКТ НА СЕРВЕР
# 
# ШАГИ:
# 1. Настройка SSH ключа на сервере (ОДНОРАЗОВО)
# 2. Деплой проекта на сервере (регулярно)
# 3. Настройка nginx и запуск
# =======================================================================

set -e

# --- НАСТРОЙКИ ---
SERVER="89.207.249.82"
SSH_USER="root"
SSH_PASS="G1v%iju?0YU%"
PROJECT_DIR="/root/missionTomirisEvents"
Nginx_Config="/etc/nginx/sites-available/eventtomiris"

echo "======================================================================="
echo "🚀 ДЕПЛОЙ EVENTTOMIRIS НА ${SERVER}"
echo "======================================================================="

# =======================================================================
# ЭТАП 1: Настройка SSH ключа (ТОЛЬКО РАЗ)
# =======================================================================
# 1. Скопируйте этот SSH-ключ на сервер:
# 
# mkdir -p ~/.ssh
# echo "ssh-rsa AAAA... your-key-fingerprint root@89.207.249.82" > ~/.ssh/id_eventtomiris
# chmod 600 ~/.ssh/id_eventtomiris
# sshpass -p 'G1v%iju?0YU%' ssh -o StrictHostKeyChecking=no root@89.207.249.82 "mkdir -p ~.ssh && ssh-keyscan 89.207.249.82 >> ~/.ssh/known_hosts"
# 
# ЛИБО используйте ssh-agent:
#   ssh-add ~/.ssh/id_eventtomiris
#   ssh -o StrictHostKeyChecking=no root@89.207.249.82
#
# 2. На сервере выполните:
#    mkdir -p ~/.ssh
#    chmod 700 ~/.ssh
#    echo "ваше-ssh-ключе" > ~/.ssh/id_eventtomiris
#    chmod 600 ~/.ssh/id_eventtomiris
#    echo "ваш-pub-key" > ~/.ssh/id_eventtomiris.pub
#    cat ~/.ssh/id_eventtomiris.pub
#
# 3. Скопируйте публичный ключ на сервер:
#    ssh-copy-id root@89.207.249.82

# =======================================================================
# ЭТАП 2: Деплой на сервере
# =======================================================================

cd "$PROJECT_DIR"

echo ""
echo "📦 [1/7] Установка зависимостей..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "cd $PROJECT_DIR && rm -rf node_modules package-lock.json && npm install --silent"

echo ""
echo "🔲 [2/7] Генерация QR-кодов..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "cd $PROJECT_DIR && npm run qr"

echo ""
echo "🔨 [3/7] Сборка фронтенда..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "cd $PROJECT_DIR && npm run build"

echo ""
echo "📂 [4/7] Подготовка структуры папок..."
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER <<'EOF'
# Создаём директорию для деплоя
mkdir -p /var/www/eventtomiris
mkdir -p /var/www/eventtomiris/assets

# Очищаем предыдущий деплой
rm -rf /var/www/eventtomiris/*

# Создаём папки с правильными правами
mkdir -p /var/www/eventtomiris/assets
chmod -R 755 /var/www/eventtomiris/assets

mkdir -p /var/www/eventtomiris/dist
chmod -R 755 /var/www/eventtomiris/dist

# Копируем статические файлы из папки assets (если есть)
if [ -d /var/www/eventtomiris/assets ] && [ ! -f /var/www/eventtomiris/assets/.gitkeep ]; then
  cp -r /var/www/eventtomiris/assets/* /var/www/eventtomiris/dist/assets/ 2>/dev/null || true
fi
EOF

echo ""
echo "📤 [5/7] Деплой файлов..."
# Копируем dist (продакшн) на сервер
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "cd $PROJECT_DIR && tar -czf deploy.tar.gz -C dist . && tar -xzf deploy.tar.gz -C /var/www/eventtomiris/"

# Копируем папку assets отдельно (для корневых путей)
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "cd $PROJECT_DIR && tar -czf assets.tar.gz -C assets . && tar -xzf assets.tar.gz -C /var/www/eventtomiris/"

# Копируем public файлы
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "cd $PROJECT_DIR/public && tar -czf public.tar.gz . && cd /var/www/eventtomiris && mkdir -p public && tar -xzf ../public.tar.gz -C public && rm public.tar.gz"

# Очистка временных файлов
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "rm -f deploy.tar.gz assets.tar.gz public.tar.gz"

echo ""
echo "🔧 [6/7] Настройка nginx..."

# Создаём nginx конфиг
cat > $Nginx_Config <<'NGINX_EOF'
server {
    listen 80;
    server_name 89.207.249.82;

    root /var/www/eventtomiris/dist;
    index index.html;

    # Кэширование статики
    location /assets/ {
        alias /var/www/eventtomiris/assets/;
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri $uri/ =404;
    }

    # Статические файлы
    location /public/ {
        alias /var/www/eventtomiris/public/;
        expires 1h;
        add_header Cache-Control "public";
    }

    # SPA routing (hash-based)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API и Bot endpoint
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Bot endpoint
    location /bot/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Перенаправление старых URL
server {
    listen 80;
    server_name eventtomiris.com;

    return 301 http://$server_name$request_uri;
}
NGINX_EOF

echo "✅ Nginx конфиг создан: $Nginx_Config"

# Активируем сайт
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "ln -sf $Nginx_Config /etc/nginx/sites-enabled/eventtomiris"

# Удаляем старый конфиг, если есть
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "rm -f /etc/nginx/sites-enabled/default"

# Проверяем и перезагружаем nginx
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "nginx -t && nginx -s reload"

echo ""
echo "🤖 [7/7] Запуск бэкенда..."

# Копируем конфиг PM2
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "cp $PROJECT_DIR/ecosystem.config.cjs /root/"

# Устанавливаем зависимости
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "npm install pm2 -g || true"

# Запускаем через PM2
sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER "cd $PROJECT_DIR/server && pm2 start /root/ecosystem.config.cjs --name 'event-tomiris-server'"

echo ""
echo "======================================================================="
echo "✅ ДЕПЛОЙ УСПЕШНО ЗАВЕРШЁН!"
echo "======================================================================="
echo ""
echo "📍 Адреса для проверки:"
echo "   http://89.207.249.82/"
echo "   http://89.207.249.82/#/"
echo "   http://89.207.249.82/admin"
echo ""
echo "🔍 Проверка после деплоя:"
echo "   ping -c 1 89.207.249.82"
echo "   curl -I http://89.207.249.82/"
echo "   curl -I http://89.207.249.82/assets/index-*.js"
echo "   pm2 list"
echo "   pm2 logs"
echo ""

# === АВТОМАТИЧЕСКИЙ ЗАПУСК СКРИПТА ===
# Запуск через SSH
# bash ./deploy.sh

# === ДЛЯ АВТОМАТИЗАЦИИ ===
# Добавьте в crontab или systemd для периодического обновления