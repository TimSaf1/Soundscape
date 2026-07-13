// Unit tests for the localStorage-backed Database module.

function createLocalStorageMock() {
    let store = {};
    return {
        getItem: jest.fn((key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
        setItem: jest.fn((key, value) => { store[key] = String(value); }),
        removeItem: jest.fn((key) => { delete store[key]; }),
        clear: jest.fn(() => { store = {}; }),
        _dump: () => store
    };
}

describe('Database (data-structure.js)', () => {
    let Database;
    let DB_SCHEMA;
    let localStorageMock;

    beforeEach(() => {
        jest.resetModules();
        localStorageMock = createLocalStorageMock();
        global.localStorage = localStorageMock;
        // Silence noisy console logging from the module.
        jest.spyOn(console, 'log').mockImplementation(() => {});
        ({ Database, DB_SCHEMA } = require('../data-structure'));
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete global.localStorage;
    });

    describe('init', () => {
        test('returns the default schema when nothing is stored', () => {
            const result = Database.init();
            expect(result).toEqual(DB_SCHEMA);
            expect(localStorageMock.getItem).toHaveBeenCalledWith('soundscape_user');
        });

        test('returns parsed stored data when present', () => {
            const stored = { userId: 42, username: 'neo', totalHours: 3, achievements: [], visitedCities: [], genreProgress: {} };
            localStorageMock.setItem('soundscape_user', JSON.stringify(stored));
            expect(Database.init()).toEqual(stored);
        });
    });

    describe('save / load', () => {
        test('save writes serialized data to localStorage', () => {
            const data = { username: 'trinity', totalHours: 1 };
            Database.save(data);
            expect(localStorageMock.setItem).toHaveBeenCalledWith('soundscape_user', JSON.stringify(data));
        });

        test('load reads back what save wrote', () => {
            const data = { userId: 7, username: 'morpheus', totalHours: 9, achievements: ['a1'], visitedCities: [], genreProgress: {} };
            Database.save(data);
            expect(Database.load()).toEqual(data);
        });
    });

    describe('addListeningTime', () => {
        test('accumulates minutes as hours and persists', () => {
            const data = { userId: 1, username: 'u', totalHours: 0, achievements: [], visitedCities: [], genreProgress: {} };
            Database.save(data);
            Database.addListeningTime(90);
            expect(Database.load().totalHours).toBeCloseTo(1.5, 5);
        });
    });

    describe('checkAchievement', () => {
        test('unlocks a new achievement and returns true', () => {
            const data = { userId: 1, username: 'u', totalHours: 0, achievements: [], visitedCities: [], genreProgress: {} };
            Database.save(data);
            expect(Database.checkAchievement('first_song')).toBe(true);
            expect(Database.load().achievements).toContain('first_song');
        });

        test('does not duplicate an existing achievement and returns false', () => {
            const data = { userId: 1, username: 'u', totalHours: 0, achievements: ['first_song'], visitedCities: [], genreProgress: {} };
            Database.save(data);
            expect(Database.checkAchievement('first_song')).toBe(false);
            expect(Database.load().achievements).toEqual(['first_song']);
        });
    });

    describe('becomeMayor', () => {
        test('marks an existing genre as mayor', () => {
            const data = {
                userId: 1, username: 'u', totalHours: 0, achievements: [], visitedCities: [],
                genreProgress: { synthwave: { listened: 0, total: 10, isMayor: false } }
            };
            Database.save(data);
            Database.becomeMayor('synthwave');
            expect(Database.load().genreProgress.synthwave.isMayor).toBe(true);
        });

        test('is a no-op for an unknown genre', () => {
            const data = {
                userId: 1, username: 'u', totalHours: 0, achievements: [], visitedCities: [],
                genreProgress: { synthwave: { listened: 0, total: 10, isMayor: false } }
            };
            Database.save(data);
            Database.becomeMayor('jazz');
            expect(Database.load().genreProgress.jazz).toBeUndefined();
            expect(Database.load().genreProgress.synthwave.isMayor).toBe(false);
        });
    });

    describe('visitCity', () => {
        test('adds a newly visited city', () => {
            const data = { userId: 1, username: 'u', totalHours: 0, achievements: [], visitedCities: [], genreProgress: {} };
            Database.save(data);
            Database.visitCity('tokyo');
            expect(Database.load().visitedCities).toContain('tokyo');
        });

        test('does not add a city twice', () => {
            const data = { userId: 1, username: 'u', totalHours: 0, achievements: [], visitedCities: ['tokyo'], genreProgress: {} };
            Database.save(data);
            Database.visitCity('tokyo');
            expect(Database.load().visitedCities).toEqual(['tokyo']);
        });
    });
});
