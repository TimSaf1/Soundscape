const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

// ========== MIDDLEWARE ==========
app.use(cors({
    origin: function (origin, callback) {
        const allowed = [
            'http://localhost:3000',
            'http://localhost:5000',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:5000',
            /^https:\/\/.*\.github\.io$/,
            'https://melnikovvitalij02-hub.github.io'
        ];
        if (!origin || allowed.some(a => (typeof a === 'string' ? a === origin : a.test(origin)))) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

app.use(express.static(__dirname));
app.use(express.json());

// ========== КОНСТАНТЫ ==========
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const INVIDIOUS_INSTANCES = [
    'https://inv.nadeko.net',
    'https://invidious.privacydev.net',
    'https://invidious.lunar.icu'
];

// ========== ЛОГИРОВАНИЕ ==========
const log = {
    info: (msg) => console.log(`✅ [INFO] ${msg}`),
    warn: (msg) => console.warn(`⚠️  [WARN] ${msg}`),
    error: (msg) => console.error(`❌ [ERROR] ${msg}`)
};

log.info('SoundScape Pro Backend инициализирован');
if (YOUTUBE_API_KEY) {
    log.info('YouTube API Key загружен');
} else {
    log.warn('YouTube API Key НЕ найден. Используется Invidious API как fallback');
}

// ========== ПОИСК ЧЕРЕЗ I TUNES (FALLBACK) ==========
async function searchITunes(query, limit) {
    try {
        const response = await axios.get('https://itunes.apple.com/search', {
            params: {
                term: query,
                media: 'music',
                limit: Math.min(limit, 20),
                country: 'RU'
            },
            timeout: 5000
        });

        if (!response.data || !response.data.results || response.data.results.length === 0) {
            return null;
        }

        return response.data.results.map(item => ({
            videoId: item.trackId.toString(),
            title: item.trackName || item.collectionName || 'Unknown',
            channelTitle: item.artistName || 'Unknown Artist',
            thumbnail: item.artworkUrl100 ? item.artworkUrl100.replace('100x100', '300x300') : 'https://via.placeholder.com/320x180?text=No+Image',
            publishedAt: item.releaseDate || new Date().toISOString(),
            source: 'itunes',
            previewUrl: item.previewUrl
        }));
    } catch (error) {
        log.warn(`iTunes API failed: ${error.message}`);
        return null;
    }
}

// ========== ПОИСК МУЗЫКИ ЧЕРЕЗ YOUTUBE API ==========
async function searchYouTubeOfficial(query, limit) {
    try {
        if (!YOUTUBE_API_KEY) {
            throw new Error('YouTube API Key not configured');
        }

        const response = await axios.get(YOUTUBE_SEARCH_URL, {
            params: {
                q: `${query} audio full`,
                part: 'snippet',
                type: 'video',
                maxResults: limit,
                videoCategoryId: '10', // Music
                relevanceLanguage: 'en',
                order: 'relevance',
                key: YOUTUBE_API_KEY
            },
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.data.items || response.data.items.length === 0) {
            return null;
        }

        return response.data.items.map(item => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle || 'Unknown Artist',
            thumbnail: item.snippet.thumbnails.medium?.url || 
                       item.snippet.thumbnails.default?.url ||
                       'https://via.placeholder.com/320x180?text=No+Image',
            publishedAt: item.snippet.publishedAt,
            source: 'youtube_official'
        }));
    } catch (error) {
        log.warn(`YouTube Official API failed: ${error.message}`);
        return null;
    }
}

// ========== ПОИСК ЧЕРЕЗ INVIDIOUS (FALLBACK) ==========
async function searchInvidious(query, limit) {
    try {
        const results = await Promise.any(INVIDIOUS_INSTANCES.map(async (instance) => {
            const response = await axios.get(`${instance}/api/v1/search`, {
                params: {
                    q: query,
                    type: 'video',
                    limit: limit,
                    sort_by: 'relevance'
                },
            timeout: 2500,
            headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (!response.data) {
                throw new Error('No data');
            }

            const items = Array.isArray(response.data) ? response.data : (response.data.items || response.data.videos || []);
            if (items.length === 0) {
                throw new Error('Empty results');
            }

            return items.map(item => ({
                videoId: item.videoId,
                title: item.title,
                channelTitle: item.author || 'Unknown Artist',
                thumbnail: `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`,
                publishedAt: item.publishedDate ? new Date(item.publishedDate * 1000).toISOString() : new Date().toISOString(),
                source: `invidious_${instance.replace('https://', '')}`
            }));
        }));

        return results.length > 0 ? results : null;
    } catch (error) {
        log.warn(`All Invidious instances failed`);
        return null;
    }
}

// ========== ГЛАВНЫЙ ПОИСК ENDPOINT ==========
app.get('/api/youtube/search', async (req, res) => {
    try {
        const query = req.query.q?.trim();
        const limit = Math.min(parseInt(req.query.limit) || 10, 20);

        // Валидация
        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Query must be at least 2 characters',
                items: []
            });
        }

        log.info(`🔍 Search query: "${query}" (limit: ${limit})`);

        // Пробуем YouTube API первым
        let results = null;
        
        if (YOUTUBE_API_KEY) {
            results = await searchYouTubeOfficial(query, limit);
            if (results) {
                log.info(`Found ${results.length} results via YouTube Official API`);
                return res.json({
                    success: true,
                    items: results,
                    source: 'youtube_official',
                    totalResults: results.length
                });
            }
        }

        // Fallback на Invidious
        log.info('Falling back to Invidious API...');
        results = await searchInvidious(query, limit);

        if (results) {
            log.info(`Found ${results.length} results via Invidious API`);
            return res.json({
                success: true,
                items: results,
                source: 'invidious',
                totalResults: results.length
            });
        }

        // Fallback на iTunes
        log.info('Falling back to iTunes API...');
        results = await searchITunes(query, limit);

        if (results) {
            log.info(`Found ${results.length} results via iTunes API`);
            return res.json({
                success: true,
                items: results,
                source: 'itunes',
                totalResults: results.length
            });
        }

        // Если ничего не найдено
        log.warn(`No results found for query: "${query}"`);
        return res.status(404).json({
            success: false,
            error: 'No results found',
            items: []
        });

    } catch (error) {
        log.error(`Search error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message,
            items: []
        });
    }
});

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'OK',
        youtubeApiConfigured: !!YOUTUBE_API_KEY,
        timestamp: new Date().toISOString(),
        serverTime: new Date().toLocaleString()
    });
});

// ========== GET VIDEO INFO ==========
app.get('/api/youtube/info/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;

        if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid video ID'
            });
        }

        // Пробуем YouTube API
        if (YOUTUBE_API_KEY) {
            try {
                const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
                    params: {
                        id: videoId,
                        part: 'snippet,contentDetails,statistics',
                        key: YOUTUBE_API_KEY
                    },
                    timeout: 5000
                });

                if (response.data.items && response.data.items.length > 0) {
                    const item = response.data.items[0];
                    return res.json({
                        success: true,
                        videoId: videoId,
                        title: item.snippet.title,
                        artist: item.snippet.channelTitle,
                        thumbnail: item.snippet.thumbnails.high?.url,
                        duration: parseDuration(item.contentDetails.duration),
                        viewCount: item.statistics.viewCount,
                        source: 'youtube_official'
                    });
                }
            } catch (error) {
                log.warn(`YouTube info API failed for ${videoId}`);
            }
        }

        // Fallback - вернём базовую информацию
        res.json({
            success: true,
            videoId: videoId,
            thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            source: 'youtube_web'
        });

    } catch (error) {
        log.error(`Video info error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ========== УТИЛИТЫ ==========
function parseDuration(duration) {
    // Преобразует ISO 8601 duration в секунды
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}

// ========== 404 HANDLER ==========
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        availableEndpoints: [
            'GET /api/youtube/search?q=...&limit=10',
            'GET /api/youtube/info/:videoId',
            'GET /api/health'
        ]
    });
});

// ========== ERROR HANDLER ==========
app.use((err, req, res, next) => {
    log.error(`Unhandled error: ${err.message}`);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log.info(`🎵 SoundScape Pro Server запущен на http://localhost:${PORT}`);
    log.info(`📝 Endpoints:`);
    log.info(`   - GET /api/youtube/search?q=...&limit=10`);
    log.info(`   - GET /api/youtube/info/:videoId`);
    log.info(`   - GET /api/health`);
});

module.exports = app;
