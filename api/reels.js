// Public: latest reels from @avital.hodaya via the Instagram API (Instagram Login).
// Needs IG_ACCESS_TOKEN in Vercel (a long-lived Instagram user token from the Meta app dashboard).
// With the Redis database connected, the token refreshes itself before its 60 days run out,
// and the reel list is cached for an hour.
//   GET /api/reels            -> { reels: [{ id, permalink, caption, timestamp, thumb }] }
//   GET /api/reels?thumb=<id> -> the reel's cover image (proxied so it always loads)
const crypto = require('crypto');
const store = require('../lib/store');
const { send } = require('../lib/util');

const GRAPH = process.env.IG_GRAPH_BASE || 'https://graph.instagram.com';
const CACHE_SECONDS = 3600;
const REFRESH_AFTER_DAYS = 7;
const MAX_REELS = 12;

function envToken() { return (process.env.IG_ACCESS_TOKEN || '').trim(); }
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

async function getToken() {
  const fromEnv = envToken();
  if (!fromEnv) return '';
  if (!store.configured()) return fromEnv;

  let saved = null;
  try { saved = JSON.parse((await store.cmd('GET', 'ig:token')) || 'null'); } catch (e) { saved = null; }
  // A new token pasted into Vercel replaces the stored one.
  if (!saved || saved.envHash !== hash(fromEnv)) saved = { token: fromEnv, envHash: hash(fromEnv), refreshedAt: Date.now() };

  if (Date.now() - saved.refreshedAt > REFRESH_AFTER_DAYS * 864e5) {
    try {
      const r = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(saved.token)}`);
      const j = await r.json();
      if (r.ok && j.access_token) saved = { token: j.access_token, envHash: saved.envHash, refreshedAt: Date.now() };
      else console.error('Instagram token refresh failed', j.error || r.status);
    } catch (e) { console.error('Instagram token refresh failed', e.message); }
  }
  await store.cmd('SET', 'ig:token', JSON.stringify(saved)).catch(() => {});
  return saved.token;
}

async function fetchReels() {
  const token = await getToken();
  if (!token) return null;
  const fields = 'id,media_type,media_product_type,thumbnail_url,permalink,caption,timestamp';
  const r = await fetch(`${GRAPH}/me/media?fields=${fields}&limit=50&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.data)) throw new Error('Instagram API error: ' + JSON.stringify(j.error || r.status));
  return j.data
    .filter(m => m.media_product_type === 'REELS' || m.media_type === 'VIDEO')
    .filter(m => m.permalink && m.thumbnail_url)
    .slice(0, MAX_REELS)
    .map(m => ({ id: String(m.id), permalink: m.permalink, caption: (m.caption || '').slice(0, 300), timestamp: m.timestamp || '', thumbnailUrl: m.thumbnail_url }));
}

// Cached list: { at, items }. Falls back to the last good list if Instagram is down.
async function reels() {
  let cached = null;
  if (store.configured()) {
    try { cached = JSON.parse((await store.cmd('GET', 'ig:reels')) || 'null'); } catch (e) { cached = null; }
    if (cached && Date.now() - cached.at < CACHE_SECONDS * 1000) return cached.items;
  }
  try {
    const items = await fetchReels();
    if (items && store.configured()) await store.cmd('SET', 'ig:reels', JSON.stringify({ at: Date.now(), items })).catch(() => {});
    return items || [];
  } catch (e) {
    console.error(e.message);
    return cached ? cached.items : [];
  }
}

function allowedImageHost(u) {
  try {
    const h = new URL(u).hostname;
    if (process.env.IG_GRAPH_BASE && h === '127.0.0.1') return true; // local testing only
    return h.endsWith('.cdninstagram.com') || h.endsWith('.fbcdn.net');
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' });
  const url = new URL(req.url, 'http://x');
  const thumbId = url.searchParams.get('thumb');

  try {
    const items = await reels();

    if (thumbId) {
      const item = items.find(i => i.id === thumbId);
      if (!item || !allowedImageHost(item.thumbnailUrl)) { res.statusCode = 404; return res.end(); }
      const img = await fetch(item.thumbnailUrl);
      if (!img.ok) { res.statusCode = 502; return res.end(); }
      res.statusCode = 200;
      res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
      return res.end(Buffer.from(await img.arrayBuffer()));
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
    res.end(JSON.stringify({
      reels: items.map(i => ({ id: i.id, permalink: i.permalink, caption: i.caption, timestamp: i.timestamp, thumb: '/api/reels?thumb=' + encodeURIComponent(i.id) })),
    }));
  } catch (e) {
    console.error(e);
    send(res, 200, { reels: [] });
  }
};
