/**
 * SoundScape Pro — backend-прокси
 * Node.js 18+ (встроенный fetch, без зависимостей)
 *
 *   /api/search      — iTunes Search API (30-сек превью, для метаданных)
 *   /api/sc/search   — поиск ПОЛНЫХ треков на SoundCloud
 *   /api/sc/stream   — получить прямую ссылку на поток трека SoundCloud
 */
const http = require('http');
const { URL } = require('url');
const PORT = process.env.PORT || 3000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const allowed =
    origin.endsWith('.github.io') ||
    origin.endsWith('telegram.org') ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1');
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, obj, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/* ===================== iTunes (как было) ===================== */
async function fetchItunes(term, limit, country) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=${limit}&country=${encodeURIComponent(country)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`iTunes HTTP ${r.status}`);
  return r.json();
}

/* ===================== SoundCloud ===================== */
// SoundCloud не выдаёт новые API-ключи, поэтому client_id вытаскиваем
// из публичных JS-ассетов сайта (так же делает soundcloud-lib) и кешируем.
let SC_CID = null;

async function getClientId(force = false) {
  if (SC_CID && !force) return SC_CID;
  const html = await (await fetch('https://soundcloud.com/', { headers: { 'User-Agent': UA } })).text();
  const assets = [...html.matchAll(/src="(https:\/\/[^"]*sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
  for (const u of assets.reverse()) {
    try {
      const js = await (await fetch(u, { headers: { 'User-Agent': UA } })).text();
      const m = js.match(/client_id\s*[:=]\s*"([a-zA-Z0-9]{32})"/);
      if (m) { SC_CID = m[1]; return SC_CID; }
    } catch (_) {}
  }
  throw new Error('SoundCloud client_id не найден');
}

// Запрос к внутреннему api-v2 с авто-обновлением client_id при 401
async function scApi(path) {
  let cid = await getClientId();
  const sep = path.includes('?') ? '&' : '?';
  const call = c => fetch(`https://api-v2.soundcloud.com${path}${sep}client_id=${c}`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000)
  });
  let r = await call(cid);
  if (r.status === 401) { cid = await getClientId(true); r = await call(cid); }
  if (!r.ok) throw new Error(`SoundCloud HTTP ${r.status}`);
  return r.json();
}

async function scSearch(q, limit) {
  const d = await scApi(`/search/tracks?q=${encodeURIComponent(q)}&limit=${limit}`);
  return (d.collection || [])
    .filter(t => t && t.media && t.streamable !== false && (t.media.transcodings || []).length)
    .map(t => ({
      id: t.id,
      t: t.title,
      a: t.user && t.user.username,
      img: (t.artwork_url || '').replace('-large', '-t300x300'),
      // прямой mp3 (progressive) проще; если его нет — только hls (нужен hls.js)
      hls: !(t.media.transcodings || []).some(x => x.format.protocol === 'progressive')
    }));
}

async function scStream(id) {
  const t = await scApi(`/tracks/${encodeURIComponent(id)}`);
  const trans = (t.media && t.media.transcodings) || [];
  const pick = trans.find(x => x.format.protocol === 'progressive') || trans[0];
  if (!pick) throw new Error('нет транскодинга');
  const cid = await getClientId();
  const sep = pick.url.includes('?') ? '&' : '?';
  const j = await (await fetch(`${pick.url}${sep}client_id=${cid}`, { headers: { 'User-Agent': UA } })).json();
  return { url: j.url, protocol: pick.format.protocol }; // url с поддержкой Range → перемотка работает
}

/* ===================== Роутер ===================== */
const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'GET') { res.writeHead(404); res.end('Not Found'); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    if (p === '/api/search') {
      const term = url.searchParams.get('term') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
      const country = url.searchParams.get('country') || 'RU';
      try { return sendJson(res, await fetchItunes(term, limit, country)); }
      catch { return sendJson(res, { resultCount: 0, results: [] }); }
    }

    if (p === '/api/sc/search') {
      const q = url.searchParams.get('q') || '';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
      if (!q) return sendJson(res, { results: [] });
      try { return sendJson(res, { results: await scSearch(q, limit) }); }
      catch (e) { return sendJson(res, { results: [], error: e.message }); }
    }

    if (p === '/api/sc/stream') {
      const id = url.searchParams.get('id');
      if (!id) return sendJson(res, { error: 'no id' }, 400);
      try { return sendJson(res, await scStream(id)); }
      catch (e) { return sendJson(res, { error: e.message }, 502); }
    }
  } catch (e) {
    return sendJson(res, { error: e.message }, 500);
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => console.log(`SoundScape Pro API слушает порт ${PORT}`));
