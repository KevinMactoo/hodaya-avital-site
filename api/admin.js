// CRM data API. Every request needs the signed-in session cookie.
// GET            -> { clients, bookings, payments, events }
// POST {action:"save", collection, record}   -> creates or updates a record
// POST {action:"delete", collection, id}     -> deletes a record
const store = require('../lib/store');
const auth = require('../lib/auth');
const { send, newId, body, str, num, oneOf, isDate, phoneKey } = require('../lib/util');

const STATUSES = ['Requested', 'Confirmed', 'Attended', 'No-show', 'Cancelled'];
const CLASSES = ['Afro', 'Hip Hop', 'Afro & Hip Hop', ''];
const TYPES = ['Group class', 'Private session', 'Event'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', ''];
const METHODS = ['Cash', 'Bit', 'PayBox', 'Bank transfer', 'Card', 'Other'];
const PREFIX = { clients: 'c', bookings: 'b', payments: 'p', events: 'e' };

// Turn untrusted input into a clean record for each collection.
const clean = {
  clients(r) {
    const name = str(r.name, 80);
    if (!name) throw new Error('Name is required.');
    return { name, phone: str(r.phone, 30), email: str(r.email, 120), instagram: str(r.instagram, 60), level: oneOf(r.level, LEVELS, ''), notes: str(r.notes, 3000) };
  },
  async bookings(r) {
    const client = await store.get('clients', str(r.clientId, 60));
    if (!client) throw new Error('Choose a client.');
    const type = oneOf(r.type, TYPES, 'Group class');
    let event = null;
    if (type === 'Event') {
      event = await store.get('events', str(r.eventId, 60));
      if (!event) throw new Error('Choose an event.');
    }
    const date = event ? event.date : str(r.date, 10);
    if (!isDate(date)) throw new Error('Choose a date.');
    return {
      clientId: client.id, name: client.name, phone: client.phone,
      cls: event ? '' : oneOf(r.cls, CLASSES, 'Afro'), type,
      eventId: event ? event.id : '', eventTitle: event ? event.title : '',
      date, time: event ? (event.time || '') : str(r.time, 20),
      level: oneOf(r.level, LEVELS, client.level || ''), people: num(r.people, 1, 20, 1),
      note: str(r.note, 1000), status: oneOf(r.status, STATUSES, 'Confirmed'), paid: r.paid === true,
    };
  },
  async payments(r) {
    const client = await store.get('clients', str(r.clientId, 60));
    if (!client) throw new Error('Choose a client.');
    const amount = num(r.amount, 0, 1000000, NaN);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount.');
    const date = str(r.date, 10);
    if (!isDate(date)) throw new Error('Choose a date.');
    return { clientId: client.id, name: client.name, bookingId: str(r.bookingId, 60), amount, method: oneOf(r.method, METHODS, 'Cash'), date, note: str(r.note, 500) };
  },
  events(r) {
    const title = str(r.title, 100);
    if (!title) throw new Error('Title is required.');
    const date = str(r.date, 10);
    if (!isDate(date)) throw new Error('Choose a date.');
    return { title, date, time: str(r.time, 20), location: str(r.location, 120), description: str(r.description, 600), price: str(r.price, 40), capacity: num(r.capacity, 0, 5000, 0), published: r.published === true };
  },
};

module.exports = async (req, res) => {
  if (!auth.isAuthed(req)) return send(res, 401, { error: 'Please sign in.' });
  if (!store.configured()) return send(res, 503, { error: 'Database is not connected. Add Upstash Redis in Vercel → Storage.' });

  try {
    if (req.method === 'GET') {
      const [clients, bookings, payments, events] = await Promise.all(store.COLLECTIONS.map(c => store.all(c)));
      return send(res, 200, { clients, bookings, payments, events });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

    const b = body(req);
    const collection = oneOf(b.collection, store.COLLECTIONS, null);
    if (!collection) return send(res, 400, { error: 'Unknown collection.' });

    if (b.action === 'delete') {
      const id = str(b.id, 60);
      if (collection === 'clients') {
        const c = await store.get('clients', id);
        if (c && c.phone) {
          const key = phoneKey(c.phone);
          if ((await store.cmd('HGET', 'clientByPhone', key)) === id) await store.cmd('HDEL', 'clientByPhone', key);
        }
      }
      await store.remove(collection, id);
      return send(res, 200, { ok: true });
    }

    if (b.action === 'save') {
      const input = b.record || {};
      let fields;
      try { fields = await clean[collection](input); }
      catch (e) { return send(res, 400, { error: e.message }); }

      const id = str(input.id, 60);
      const existing = id ? await store.get(collection, id) : null;
      const now = new Date().toISOString();
      const record = existing
        ? Object.assign({}, existing, fields, { updatedAt: now })
        : Object.assign({ id: newId(PREFIX[collection]), createdAt: now, source: 'CRM' }, fields);

      if (collection === 'clients') {
        const oldKey = existing && existing.phone ? phoneKey(existing.phone) : '';
        const newKey = record.phone ? phoneKey(record.phone) : '';
        if (oldKey && oldKey !== newKey && (await store.cmd('HGET', 'clientByPhone', oldKey)) === record.id) {
          await store.cmd('HDEL', 'clientByPhone', oldKey);
        }
        if (newKey.length >= 7) {
          const owner = await store.cmd('HGET', 'clientByPhone', newKey);
          if (owner && owner !== record.id && (await store.get('clients', owner))) {
            return send(res, 409, { error: 'Another client already has this phone number.' });
          }
          await store.cmd('HSET', 'clientByPhone', newKey, record.id);
        }
      }

      await store.put(collection, record);
      return send(res, 200, { ok: true, record });
    }

    return send(res, 400, { error: 'Unknown action.' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Something went wrong. Please try again.' });
  }
};
