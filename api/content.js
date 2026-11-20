// Public: the site's changing info, read live from a Google Sheet. No database.
// Set SHEET_ID in Vercel to the sheet's ID or full link. The sheet must be shared as
// "Anyone with the link: Viewer". Tabs (names matter, column order doesn't):
//   Classes:  Name | Description | Day & time | Price | Show
//   Events:   Title | Date | Time | Location | Price | Description | Show
//   Shop:     Name | Price | Description | Image | Options | Tag | Show
//   Settings: Setting | Value   (Studio location, Announcement)
// Changes show on the site within about a minute (cached at Vercel's edge).
const { send } = require('../lib/util');

function sheetId() {
  const raw = (process.env.SHEET_ID || '').trim();
  const m = raw.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  return m ? m[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(raw) ? raw : '');
}

// Minimal RFC 4180 CSV parser (quotes, commas and newlines inside quotes).
function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Rows -> objects keyed by simplified header ("Day & time" -> "daytime").
function toObjects(rows) {
  const clean = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (!clean.length) return [];
  const keys = clean[0].map(h => String(h).toLowerCase().replace(/[^a-z]/g, ''));
  return clean.slice(1).map(r => {
    const o = {};
    keys.forEach((k, i) => { if (k) o[k] = String(r[i] == null ? '' : r[i]).trim().slice(0, 600); });
    return o;
  });
}

async function tab(id, name) {
  const url = `${process.env.SHEET_BASE || 'https://docs.google.com'}/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`;
  const r = await fetch(url, { redirect: 'follow' });
  const text = await r.text();
  if (!r.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error(name + ': sheet not shared or tab missing (' + r.status + ')');
  return toObjects(parseCsv(text));
}

const shown = v => !/^(no|n|false|0|hide|hidden)$/i.test(String(v || '').trim());

// Accepts 2026-12-05, 5/12/2026 or 5.12.2026 (day first), or text like "5 Dec 2026".
function isoDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : new Date(t + 12 * 3600e3).toISOString().slice(0, 10);
}

// Public https image links only. Google Drive share links become direct image links
// (the file must be shared as "Anyone with the link").
function imageUrl(v) {
  const s = String(v || '').trim();
  const drive = s.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([a-zA-Z0-9_-]{10,})/);
  if (drive) return 'https://lh3.googleusercontent.com/d/' + drive[1];
  return /^https:\/\/[^\s"'<>]+$/.test(s) ? s : '';
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' });
  const id = sheetId();
  if (!id) return send(res, 200, { configured: false, classes: [], events: [], settings: {} });

  const [classes, events, settings, shop] = await Promise.all(['Classes', 'Events', 'Settings', 'Shop'].map(n =>
    tab(id, n).catch(e => { console.error(e.message); return null; })));

  const today = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10); // Israel is UTC+2/+3
  const out = {
    configured: true,
    classes: (classes || []).filter(c => c.name && shown(c.show)).map(c => ({
      name: c.name, description: c.description || '', when: c.daytime || c.when || '', price: c.price || '',
    })),
    events: (events || []).map(e => Object.assign({}, e, { date: isoDate(e.date) }))
      .filter(e => e.title && e.date && e.date >= today && shown(e.show))
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .map((e, i) => ({ id: 'ev' + i + '-' + e.date, title: e.title, date: e.date, time: e.time || '', location: e.location || '', price: e.price || '', description: e.description || '' })),
    shop: (shop || []).filter(p => p.name && shown(p.show)).slice(0, 48).map(p => ({
      name: p.name, price: p.price || '', description: p.description || '', image: imageUrl(p.image), tag: p.tag || '',
      options: String(p.options || '').split(',').map(o => o.trim()).filter(Boolean).slice(0, 20),
    })),
    settings: {},
  };
  for (const s of settings || []) {
    const k = (s.setting || s.key || '').toLowerCase().replace(/[^a-z]/g, '');
    if (k) out.settings[k] = s.value || '';
  }
  out.settings = { location: out.settings.studiolocation || out.settings.location || '', announcement: out.settings.announcement || '' };

  // If every tab failed, say so but keep the site's built-in content.
  if (!classes && !events && !settings && !shop) return send(res, 200, { configured: false, error: 'Could not read the sheet', classes: [], events: [], settings: {} });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
  res.end(JSON.stringify(out));
};
