# hodayaavital.com

Booking site and CRM for Afro & Hip Hop dance classes with Hodaya Avital.

- `index.html`: the public website (classes, gallery, posters, events, booking form)
- `admin/`: the private CRM at **/admin** (bookings, clients, payments, events)
- `api/`: Vercel serverless functions
  - `book.js`: saves website bookings (and creates/updates the client by phone number)
  - `events.js`: upcoming events for the website, managed in the CRM
  - `login.js`: CRM sign-in / sign-out
  - `admin.js`: CRM data (sign-in required)
- `lib/`: shared code (Upstash Redis over REST, auth, helpers). No npm dependencies.

## Setup on Vercel

1. **Database:** Project → Storage → add **Upstash for Redis** (free) and connect it to this project.
   This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. **Password:** Project → Settings → Environment Variables → add `ADMIN_PASSWORD`
   (at least 8 characters) for Production.
3. Redeploy. Sign in at `https://hodayaavital.com/admin/`.

Every push to `main` deploys automatically. Framework preset: **Other**, no build command.
