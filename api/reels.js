// Public: latest reels from @avital.hodaya via the Instagram API (Instagram Login). No database.
// Needs IG_ACCESS_TOKEN in Vercel (a long-lived token from the Meta app dashboard).
//   GET /api/reels            -> { reels: [{ id, permalink, caption, timestamp, thumb }] }
//   GET /api/reels?thumb=<id> -> the reel's cover image (proxied so it always loads)
//   GET /api/reels?refresh=1  -> weekly cron: asks Instagram to extend the token's 60 days
// Results are cached at Vercel's edge, so Instagram is asked at most a few times an hour.
const { send } = require('../lib/util');

const GRAPH = process.env.IG_GRAPH_BASE || 'https://graph.instagram.com';
const MAX_REELS = 12;
let memo = { at: 0, items: null }; // per-instance cache for thumbnail lookups

function token() { return (process.env.IG_ACCESS_TOKEN || '').trim(); }

async function fetchReels() {
  if (!token()) return [];
  if (memo.items && Date.now() - memo.at < 10 * 60e3) return memo.items;
  const fields = 'id,media_type,media_product_type,thumbnail_url,permalink,caption,timestamp';
  const r = await fetch(`${GRAPH}/me/media?fields=${fields}&limit=50&access_token=${encodeURIComponent(token())}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.data)) throw new Error('Instagram API error: ' + JSON.stringify(j.error || r.status));
  const items = j.data
    .filter(m => m.media_product_type === 'REELS' || m.media_type === 'VIDEO')
    .filter(m => m.permalink && m.thumbnail_url && allowedImageHost(m.thumbnail_url))
    .slice(0, MAX_REELS)
    .map(m => ({ id: String(m.id), permalink: m.permalink, caption: (m.caption || '').slice(0, 300), timestamp: m.timestamp || '', thumbnailUrl: m.thumbnail_url }));
  memo = { at: Date.now(), items };
  return items;
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

  if (url.searchParams.get('refresh')) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.authorization !== 'Bearer ' + secret) return send(res, 401, { error: 'Unauthorized' });
    if (!token()) return send(res, 200, { ok: false, reason: 'No IG_ACCESS_TOKEN' });
    const r = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token())}`).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    const ok = Boolean(r && r.ok && j.access_token);
    if (!ok) console.error('Instagram token refresh failed', j.error || (r && r.status));
    // If Instagram ever hands back a different token, the current one still works until it
    // expires; paste the new one into Vercel then (it shows in the function logs as a warning).
    if (ok && j.access_token !== token()) console.warn('Instagram returned a new token. Update IG_ACCESS_TOKEN in Vercel.');
    return send(res, 200, { ok, expiresInDays: ok ? Math.round((j.expires_in || 0) / 86400) : null });
  }

  try {
    const items = await fetchReels();
    const thumbId = url.searchParams.get('thumb');
    if (thumbId) {
      const item = items.find(i => i.id === thumbId);
      if (!item) { res.statusCode = 404; return res.end(); }
      const img = await fetch(item.thumbnailUrl);
      if (!img.ok) { res.statusCode = 502; return res.end(); }
      res.statusCode = 200;
      res.setHeader('Content-Type', img.headers.get('content-type') || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
      return res.end(Buffer.from(await img.arrayBuffer()));
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400');
    res.end(JSON.stringify({
      reels: items.map(i => ({ id: i.id, permalink: i.permalink, caption: i.caption, timestamp: i.timestamp, thumb: '/api/reels?thumb=' + encodeURIComponent(i.id) })),
    }));
  } catch (e) {
    console.error(e.message);
    send(res, 200, { reels: [] });
  }
};
