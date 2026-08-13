function loadSoundLibrary() {
    const soundsPanel = document.getElementById('cpSoundsList');
    
    async function fetchDirectory(url) {
        try {
            // Получаем HTML-список файлов/папок по URL (браузер так возвращает содержимое статической директории)
            const response = await fetch(url);
            if (!response.ok) return [];
            
            const text = await response.text();
            const parser = new DOMParser().parseFromString(text, 'text/html');
            const links = Array.from(parser.querySelectorAll('a'));
            
            for (const link of links) {
                let href = link.getAttribute('href') || '';
                
                // Пропускаем служебные ссылки типа "Parent Directory"
                if (href.includes('../')) continue;
                
                // Полный путь до объекта
                let fullUrl = `${url}/${href}`;
                if (fullUrl.endsWith('//')) fullUrl = fullUrl.slice(0, -1); // Убираем лишний слеш
                
                // Определяем имя без расширения
                const name = decodeURIComponent(href.replace('/', ''));
                
                // Если это папка — рекурсивно вызываем функцию для неё
                if (href.endsWith('/')) {
                    const folderEl = createFolder(name);
                    soundsPanel.appendChild(folderEl);
                    
                    // Внутри этой папки добавляем список её содержимого
                    const innerContainer = folderEl.querySelector('.inner-list');
                    const filesAndFolders = await fetchDirectory(fullUrl);
                    filesAndFolders.forEach(item => innerContainer.appendChild(item));
                } else {
                    // Это файл .wav — делаем кнопку проигрывания
                    if (href.toLowerCase().endsWith('.wav')) {
                        const soundItem = createSoundButton(fullUrl, name);
                        soundsPanel.appendChild(soundItem);
                    }
                }
            }
        } catch (error) { console.error(error); }
    }

    function createFolder(name) {
        const details = document.createElement('details');
        details.className = 'cp-sound-item cp-folder';
        
        const summary = document.createElement('summary');
        summary.textContent = name + '/';
        details.appendChild(summary);
        
        const innerList = document.createElement('div');
        innerList.className = 'inner-list';
        details.appendChild(innerList);
        
        return details;
    }

    function createSoundButton(filePath, displayName) {
        const item = document.createElement('div');
        item.className = 'cp-sound-item';
        item.dataset.filePath = filePath; // Сохраняем полный путь как атрибут
        item.textContent = displayName;
        
        item.addEventListener('click', () => selectSound(item));
        
        return item;
    }

    // Функция выбора звука при клике на элемент
    function selectSound(el) {
        // Снимаем выделение с предыдущего элемента
        const prevSelected = soundsPanel.querySelector('.cp-sound-item.active');
        if (prevSelected) prevSelected.classList.remove('active');
        
        el.classList.add('active');
        
        currentSoundFile = el.dataset.filePath;
        currentSoundName = el.textContent.trim();
        currentFolderPath = ''; // Для твоей структуры не используется явно, но можно расширить
        
        // Обновляем название трека (если нужно)
        updateTrackLabel(currentSoundName);
    }

    // Вспомогательная функция для обновления лейбла текущего трека
    function updateTrackLabel(name) {
        const trackLabels = document.querySelectorAll('.cp-track-label');
        trackLabels.forEach(label => label.textContent = name);
    }

    // Запускаем загрузку корневой папки Sounds/
    fetchDirectory('/Sounds/');
}
