# hodayaavital.com

Booking site and CRM for Afro & Hip Hop dance classes with Hodaya Avital.

- `index.html`: the public website (classes, gallery, posters, events, booking form)
- `admin/`: the private CRM at **/admin** (bookings, clients, payments, events)
- `api/`: Vercel serverless functions
  - `book.js`: saves website bookings (and creates/updates the client by phone number)
  - `events.js`: upcoming events for the website, managed in the CRM
  - `login.js`: CRM sign-in / sign-out
  - `admin.js`: CRM data (sign-in required)
  - `reels.js`: latest Instagram reels for the gallery (cached 1 hour, token auto-refreshes)
- `lib/`: shared code (Upstash Redis over REST, auth, helpers). No npm dependencies.

## Setup on Vercel

1. **Database:** Project → Storage → add **Upstash for Redis** (free) and connect it to this project.
   This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. **Password:** Project → Settings → Environment Variables → add `ADMIN_PASSWORD`
   (at least 8 characters) for Production.
3. **Instagram reels (optional):** add `IG_ACCESS_TOKEN`, a long-lived Instagram user token from the
   Meta app dashboard (Instagram → API setup with Instagram business login → Generate token).
   The account must be a Professional (Creator or Business) account. With the database connected,
   the token refreshes itself every 7 days, so it never hits Instagram's 60-day expiry.
4. Redeploy. Sign in at `https://hodayaavital.com/admin/`.

Every push to `main` deploys automatically. Framework preset: **Other**, no build command.
