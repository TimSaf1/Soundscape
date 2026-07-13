// ==================== DATABASE STRUCTURE & ALGORITHM ====================
// Временная реализация на localStorage (потом заменим на Firebase)

const DB_SCHEMA = {
    userId: null,
    username: "",
    totalHours: 0,
    achievements: [],
    visitedCities: [],
    genreProgress: {
        synthwave: { listened: 0, total: 10, isMayor: false },
        lofi: { listened: 0, total: 8, isMayor: false },
        rock: { listened: 0, total: 12, isMayor: false },
        electronic: { listened: 0, total: 10, isMayor: false }
    }
};

// Функции для работы с БД (заглушки)
const Database = {
    // Инициализация
    init: function() {
        console.log("🔌 DB initialized");
        const saved = localStorage.getItem('soundscape_user');
        if (saved) {
            return JSON.parse(saved);
        }
        return DB_SCHEMA;
    },

    // Сохранение прогресса
    save: function(data) {
        console.log("💾 Saving progress:", data);
        localStorage.setItem('soundscape_user', JSON.stringify(data));
    },

    // Загрузка прогресса
    load: function() {
        console.log("📥 Loading progress...");
        return this.init();
    },

    // Обновление часов
    addListeningTime: function(minutes) {
        let data = this.load();
        data.totalHours += minutes / 60;
        this.save(data);
        console.log(`⏱️ Added ${minutes} min. Total: ${data.totalHours.toFixed(1)}h`);
    },

    // Проверка ачивок
    checkAchievement: function(achievementId) {
        let data = this.load();
        if (!data.achievements.includes(achievementId)) {
            data.achievements.push(achievementId);
            this.save(data);
            console.log(`🏆 Achievement unlocked: ${achievementId}`);
            return true;
        }
        return false;
    },

    // Стать мэром
    becomeMayor: function(genre) {
        let data = this.load();
        if (data.genreProgress[genre]) {
            data.genreProgress[genre].isMayor = true;
            this.save(data);
            console.log(`👑 Now mayor of ${genre}!`);
        }
    },

    // Посетить город
    visitCity: function(cityId) {
        let data = this.load();
        if (!data.visitedCities.includes(cityId)) {
            data.visitedCities.push(cityId);
            this.save(data);
            console.log(` Visited: ${cityId}`);
        }
    }
};

// Инициализация при загрузке
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('load', () => {
        Database.init();
        console.log("✅ SoundScape DB ready");
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Database, DB_SCHEMA };
}
