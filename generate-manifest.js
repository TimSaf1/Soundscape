// generate-manifest.js (в корне репозитория)
const fs = require('fs');
const path = require('path');

// Пути относительно корня репозитория
const soundsDir = path.join(__dirname, 'public', 'sounds');
const manifestPath = path.join(__dirname, 'public', 'sounds', 'manifest.json');

const manifest = [];

// Если папки со звуками еще нет, создаем пустой манифест
if (!fs.existsSync(soundsDir)) {
    console.log('⚠️ Папка sounds не найдена.');
    fs.writeFileSync(manifestPath, JSON.stringify([]));
    return;
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath); // Рекурсивно заходим в подпапки
    } else if (file.match(/\.(wav|mp3|ogg|m4a)$/i)) {
      // Сохраняем путь относительно папки sounds
      const relativePath = path.relative(soundsDir, fullPath).replace(/\\/g, '/');
      manifest.push(`sounds/${relativePath}`);
    }
  });
}

scanDir(soundsDir);

// Записываем результат
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✅ Манифест успешно создан! Найдено аудиофайлов: ${manifest.length}`);
