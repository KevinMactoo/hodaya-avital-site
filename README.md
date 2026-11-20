# hodayaavital.com

Booking site for Afro & Hip Hop dance classes with Hodaya Avital. No database.

- `index.html`: the website (classes, gallery with Instagram reels, posters, events, booking form).
  Bookings are sent to Hodaya on WhatsApp.
- `api/content.js`: reads classes, events, shop items and the announcement live from a Google Sheet.
- `api/reels.js`: latest Instagram reels for the gallery.
- `lib/util.js`: small shared helper. No npm dependencies.

## Settings on Vercel (Settings → Environment Variables)

| Variable | What it is |
| --- | --- |
| `SHEET_ID` | The Google Sheet's link or ID. Share the sheet as "Anyone with the link: Viewer". Tabs: `Classes`, `Events`, `Shop`, `Settings`. |
| `IG_ACCESS_TOKEN` | Optional. Long-lived Instagram token (Meta app dashboard → Instagram → API setup with Instagram business login → Generate token). The account must be Professional. |
| `CRON_SECRET` | Optional. Protects the weekly job that extends the Instagram token. |

Redeploy after changing a variable. Sheet edits need no redeploy: the site picks them up within about a minute.
Every push to `main` deploys automatically. Framework preset: **Other**, no build command.
