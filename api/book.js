// Public: the website's booking form posts here. Saves the client and the booking.
const store = require('../lib/store');
const { send, newId, body, str, num, oneOf, isDate, phoneKey, clientIp } = require('../lib/util');

const CLASSES = ['Afro', 'Hip Hop', 'Afro & Hip Hop'];
const TYPES = ['Group class', 'Private session', 'Event'];
const TIMES = ['Morning', 'Afternoon', 'Evening'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
  if (!store.configured()) return send(res, 503, { error: 'Bookings are not being saved yet' });

  const b = body(req);
  if (str(b.website)) return send(res, 200, { ok: true }); // honeypot: bots fill hidden fields

  const name = str(b.name, 80);
  const phone = str(b.phone, 30);
  const type = oneOf(b.type, TYPES, 'Group class');
  let date = str(b.date, 10);
  const key = phoneKey(phone);
  if (!name || key.length < 7) return send(res, 400, { error: 'Please add your name and phone number.' });

  try {
    if (!(await store.rateLimit('book:' + clientIp(req), 8, 3600))) {
      return send(res, 429, { error: 'Too many requests. Please message Hodaya on WhatsApp.' });
    }

    let event = null;
    if (type === 'Event') {
      event = await store.get('events', str(b.eventId, 60));
      if (!event || !event.published) return send(res, 400, { error: 'Please choose an event.' });
      date = event.date;
    } else if (!isDate(date)) {
      return send(res, 400, { error: 'Please choose a date.' });
    }

    const now = new Date().toISOString();
    const level = oneOf(b.level, LEVELS, '');

    // Find or create the client by phone number
    let clientId = await store.cmd('HGET', 'clientByPhone', key);
    let client = clientId ? await store.get('clients', clientId) : null;
    if (!client) {
      client = { id: newId('c'), name, phone, email: '', instagram: '', level, notes: '', source: 'Website', createdAt: now };
      await store.cmd('HSET', 'clientByPhone', key, client.id);
    } else {
      client.name = client.name || name;
      if (level && !client.level) client.level = level;
    }
    client.lastBookingAt = now;
    await store.put('clients', client);

    const booking = {
      id: newId('b'),
      clientId: client.id,
      name, phone,
      cls: event ? '' : oneOf(b.cls, CLASSES, 'Afro'),
      type,
      eventId: event ? event.id : '',
      eventTitle: event ? event.title : '',
      date,
      time: event ? (event.time || '') : oneOf(b.time, TIMES, ''),
      level,
      people: num(b.people, 1, 20, 1),
      note: str(b.note, 1000),
      status: 'Requested',
      paid: false,
      source: 'Website',
      createdAt: now,
    };
    await store.put('bookings', booking);
    return send(res, 200, { ok: true, id: booking.id });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Could not save the booking.' });
  }
};
