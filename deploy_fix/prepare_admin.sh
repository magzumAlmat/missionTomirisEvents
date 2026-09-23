#!/bin/bash
# Скрипт для подготовки dist/admin/

echo "🔧 Подготовка dist/admin/..."

# Очистка
rm -rf dist/admin

# Создать структуру
mkdir -p dist/admin
mkdir -p dist/admin/components
mkdir -p dist/admin/lib
mkdir -p dist/admin/pages

# Копирование основных файлов React из src/
echo "Копируем React компоненты..."
cp -r src/pages/Admin.jsx dist/admin/
cp -r src/pages/AdminProgress.jsx dist/admin/
cp -r src/components/PasswordGate.jsx dist/admin/
cp -r src/lib/api.js dist/admin/lib/
cp -r src/lib/phone.js dist/admin/lib/
cp -r src/lib/team.js dist/admin/lib/
cp -r src/lib/text.js dist/admin/lib/
cp -r src/main.jsx dist/admin/main.jsx
cp -r src/styles.css dist/admin/styles.css

# Создать index.html для admin
echo "Создаю index.html..."
cat > dist/admin/index.html << 'ADMINEOF'
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#0e1220" />
    <title>Администратор - EventTomiris</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.jsx"></script>
  </body>
</html>
ADMINEOF

# Копия папок
cp -r src/pages/dist/admin/pages/
cp -r src/components/dist/admin/components/
cp -r src/lib/dist/admin/lib/

echo "✓ dist/admin/ готов!"
echo ""
echo "Структура:"
find dist/admin -type f | head -20
