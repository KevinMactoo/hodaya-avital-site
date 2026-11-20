// Tiny Redis client for Upstash's REST API (no dependencies).
// Vercel's "Upstash for Redis" integration sets KV_REST_API_URL / KV_REST_API_TOKEN
// (some setups use UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN instead).

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function configured() {
  return Boolean(URL_ && TOKEN);
}

async function cmd(...args) {
  if (!configured()) throw new Error('Database is not connected');
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(args.map(String)),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error('Database error: ' + (data.error || r.status));
  return data.result;
}

// Collections are Redis hashes: field = record id, value = JSON record.
const COLLECTIONS = ['clients', 'bookings', 'payments', 'events'];

async function all(collection) {
  const flat = (await cmd('HGETALL', collection)) || [];
  const out = [];
  for (let i = 1; i < flat.length; i += 2) {
    try { out.push(JSON.parse(flat[i])); } catch (e) { /* skip bad record */ }
  }
  return out;
}

async function get(collection, id) {
  const raw = await cmd('HGET', collection, id);
  return raw ? JSON.parse(raw) : null;
}

async function put(collection, record) {
  await cmd('HSET', collection, record.id, JSON.stringify(record));
  return record;
}

async function remove(collection, id) {
  await cmd('HDEL', collection, id);
}

// Returns false once `key` has been hit more than `limit` times in `seconds`.
async function rateLimit(key, limit, seconds) {
  const n = await cmd('INCR', 'rl:' + key);
  if (Number(n) === 1) await cmd('EXPIRE', 'rl:' + key, seconds);
  return Number(n) <= limit;
}

module.exports = { configured, cmd, all, get, put, remove, rateLimit, COLLECTIONS };
