/**
 * SoundScape Pro — backend-прокси для iTunes Search API
 * Node.js 18+ (встроенный fetch)
 */
const http = require('http');
const { URL } = require('url');
const PORT = process.env.PORT || 3000;

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

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, `http://${req.headers.host}`);
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
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => console.log(`SoundScape Pro API слушает порт ${PORT}`));
