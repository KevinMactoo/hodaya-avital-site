// Public: upcoming published events for the website's Events section.
const store = require('../lib/store');
const { send } = require('../lib/util');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' });
  if (!store.configured()) return send(res, 200, { events: [] });
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [events, bookings] = await Promise.all([store.all('events'), store.all('bookings')]);
    const taken = {};
    for (const b of bookings) {
      if (b.eventId && b.status !== 'Cancelled') taken[b.eventId] = (taken[b.eventId] || 0) + (Number(b.people) || 1);
    }
    const list = events
      .filter(e => e.published && e.date >= today)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .map(e => ({
        id: e.id, title: e.title, date: e.date, time: e.time, location: e.location,
        description: e.description, price: e.price,
        spotsLeft: e.capacity ? Math.max(0, e.capacity - (taken[e.id] || 0)) : null,
      }));
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ events: list }));
  } catch (e) {
    console.error(e);
    send(res, 200, { events: [] });
  }
};
