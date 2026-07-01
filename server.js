/**
 * SoundScape Pro — backend-прокси iTunes + Piped (YouTube без ключа!)
 */
const http = require('http');
const { URL } = require('url');
const PORT = process.env.PORT || 3000;

// Публичные Piped инстансы (бесплатный YouTube API без ключа!)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.in.projectsegfau.lt',
  'https://piped-api.privacy.com.de',
  'https://api.piped.yt'
];

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

// Поиск через Piped (бесплатно, без ключа, без VPN!)
async function fetchPiped(query, limit) {
  let lastError = null;
  
  for (const instance of PIPED_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query + ' official audio')}&filter=music_songs`;
      console.log('Trying Piped instance:', instance);
      
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'SoundScapePro/1.0' }
      });
      
      if (!response.ok) {
        lastError = new Error(`Piped HTTP ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        lastError = new Error('No results');
        continue;
      }
      
      // Преобразуем в формат совместимый с frontend
      const items = data.items.slice(0, limit).map(item => {
        // Извлекаем videoId из URL (/watch?v=XXXXX)
        let videoId = '';
        if (item.url) {
          const match = item.url.match(/[?&]v=([^&]+)/);
          if (match) videoId = match[1];
        }
        
        return {
          videoId: videoId,
          title: item.title || 'Без названия',
          channelTitle: item.uploaderName || item.uploader || 'Неизвестно',
          thumbnail: item.thumbnail || ''
        };
      }).filter(item => item.videoId); // Убираем элементы без videoId
      
      console.log('Piped OK from', instance, '- found', items.length, 'items');
      return { items, totalResults: items.length };
      
    } catch (err) {
      console.log('Piped instance failed:', instance, err.message);
      lastError = err;
      continue;
    }
  }
  
  throw lastError || new Error('All Piped instances failed');
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

  // YouTube поиск через Piped (БЕЗ КЛЮЧА!)
  if (url.pathname === '/api/youtube/search' && req.method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);
    try {
      const data = await fetchPiped(q, limit);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err) {
      console.error('Piped error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message, items: [] }));
    }
    return;
  }

  // Health check
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'OK', 
      pipedConfigured: true,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => console.log(`SoundScape Pro API on port ${PORT} (using Piped - no API key needed!)`));
