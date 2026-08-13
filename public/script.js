// Функция для создания кнопки проигрывания звука
function createSoundButton(filePath) {
    const button = document.createElement('button');
    // Убираем расширение файла
    button.textContent = filePath.split('/').pop().replace('.wav', '');
    
    button.addEventListener('click', () => {
        const audio = new Audio(filePath);
        audio.play();
    });

    return button;
}

// Рекурсивная функция для построения дерева
async function buildTree(container, url) {
    try {
        // Получаем содержимое папки
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Не удалось получить ${url}`);
        
        // Парсим ответ как текст (браузер возвращает HTML-список ссылок)
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');

        // Ищем все ссылки в этом документе
        const links = Array.from(doc.querySelectorAll('a'));

        for (const link of links) {
            const href = link.getAttribute('href') || '';
            
            // Пропускаем служебные ссылки типа "Parent Directory"
            if (href.includes('../')) continue;

            // Определяем полный путь до объекта
            let fullUrl = `${url}/${href}`;
            // Для корректной работы fetch нужно убрать лишний слеш
            if (fullUrl.endsWith('//')) fullUrl = fullUrl.slice(0, -1);

            // Проверяем, является ли ссылка папкой или файлом
            if (href.endsWith('/')) { // Папка
                const folderName = href.replace('/', '');
                
                // Создаем элемент для папки
                const details = document.createElement('details');
                container.appendChild(details);

                const summary = document.createElement('summary');
                summary.textContent = folderName;
                details.appendChild(summary);

                // Внутрь этой папки рекурсивно добавляем её содержимое
                const folderContainer = document.createElement('ul');
                details.appendChild(folderContainer);

                await buildTree(folderContainer, fullUrl); // Рекурсия!
            } else { // Файл
                // Мы работаем только с .wav
                if (href.toLowerCase().endsWith('.wav')) {
                    const li = document.createElement('li');
                    li.appendChild(createSoundButton(fullUrl));
                    container.appendChild(li);
                }
            }
        }
    } catch (error) {
        console.error(error);
    }
}

// Запуск скрипта
document.addEventListener('DOMContentLoaded', async () => {
    const libraryRoot = document.getElementById('sound-library');
    const rootUrl = '/Sounds/';

    // Начинаем строить дерево от корня
    await buildTree(libraryRoot, rootUrl);
});
