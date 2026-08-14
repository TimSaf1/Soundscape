const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/youtube/search', async (req, res) => {
    const query = String(req.query.q || '').trim();

    if (!query) {
        return res.json({ items: [] });
    }

    if (!API_KEY) {
        return res.status(500).json({
            error: 'YOUTUBE_API_KEY не задан. Сначала настрой API key.'
        });
    }

    try {
        const params = new URLSearchParams({
            part: 'snippet',
            q: query,
            type: 'video',
            videoCategoryId: '10',
            maxResults: '10',
            key: API_KEY
        });

        const response = await fetch(
            `https://www.googleapis.com/youtube/v3/search?${params}`
        );

        const data = await response.json();

        if (!response.ok) {
            console.error('YouTube API:', data);
            return res.status(response.status).json({
                error: data?.error?.message || 'YouTube API error'
            });
        }

        const items = (data.items || [])
            .filter(item => item.id && item.id.videoId)
            .map(item => ({
                videoId: item.id.videoId,
                title: item.snippet?.title || 'Без названия',
                artist: item.snippet?.channelTitle || 'YouTube',
                cover:
                    item.snippet?.thumbnails?.high?.url ||
                    item.snippet?.thumbnails?.medium?.url ||
                    item.snippet?.thumbnails?.default?.url ||
                    `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`
            }));

        res.json({ items });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: 'Сервер не смог обратиться к YouTube.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`\nSOUNDSCAPE запущен: http://localhost:${PORT}`);
    console.log('Для поиска музыки нужен YOUTUBE_API_KEY.\n');
});
