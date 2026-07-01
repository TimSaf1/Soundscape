/**
 * SoundScape Pro — backend-прокси для iTunes + YouTube
 */
const http = require('http');
const { URL } = require('url');
const PORT = process.env.PORT || 3000;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const allowed =
    origin.endsWith('.github.io') ||
    origin === 'https://github.io' ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1');
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function fetchItunes(term, limit, country) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=${limit}&country=${encodeURIComponent(country)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`iTunes HTTP ${response.status}`);
  return response.json();
}

async function fetchYoutube(query, limit) {
  if (!YOUTUBE_API_KEY) throw new Error('YouTube API key not configured');
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=${limit}&q=${encodeURIComponent(query)}&relevanceLanguage=ru&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`YouTube HTTP ${response.status}`);
  return response.json();
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // iTunes поиск
  if (url.pathname === '/api/search' && req.method === 'GET') {
    const term = url.searchParams.get('term') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
    const country = url.searchParams.get('country') || 'RU';
    try {
      const data = await fetchItunes(term, limit, country);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ resultCount: 0, results: [] }));
    }
    return;
  }

  // YouTube поиск
  if (url.pathname === '/api/youtube/search' && req.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
    try {
      const data = await fetchYoutube(q, limit);
      const items = (data.items || []).map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ items, totalResults: data.pageInfo?.totalResults || 0 }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message, items: [] }));
    }
    return;
  }

  // Health check
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', youtubeConfigured: !!YOUTUBE_API_KEY }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => console.log(`SoundScape Pro API on port ${PORT}`));
