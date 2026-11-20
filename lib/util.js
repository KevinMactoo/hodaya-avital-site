const crypto = require('crypto');

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return {}; } }
  return b;
}

// Trimmed string, capped in length; '' for anything that is not a string or number.
function str(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).trim().slice(0, max || 200);
}

function num(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function oneOf(v, list, fallback) {
  return list.includes(v) ? v : fallback;
}

function isDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// Phone numbers are matched on digits only, so "+972 58-565-3466" and "0585653466" differ
// but repeat bookings typed the same way land on the same client.
function phoneKey(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return '972' + d.slice(1);
  return d;
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (Array.isArray(xf) ? xf[0] : String(xf || '')).split(',')[0].trim() || 'unknown';
}

module.exports = { send, newId, body, str, num, oneOf, isDate, phoneKey, clientIp };
