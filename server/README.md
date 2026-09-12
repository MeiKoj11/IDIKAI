# Server setup

This is the backend behind the whole app now — it still does the
Claude-powered dictionary lookups (clean translations, plus gender/
article for Spanish nouns) and every other AI feature, and it also
holds accounts and everyone's synced data (so the same data follows
you to any device you log into, instead of living in one browser's
localStorage).

## One-time local setup

1. Get an API key: go to https://platform.claude.com, sign in, add a
   payment method (pay-as-you-go), then create an API key.
2. In the `server` folder, copy `.env.example` to a new file named
   `.env` (same folder).
3. Open `.env` and fill in:
   - `ANTHROPIC_API_KEY` — your real key.
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the login for your own
     account. The very first time the server starts with an empty
     database, it creates exactly one account from these two values
     (and only that one time — once any account exists, these two
     variables are ignored, so it's safe to leave them set).
4. `node server.js` (or `npm start`) from inside the `server` folder.
5. Go to `login.html` and log in with `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

Requires Node 22.12 or newer (for the built-in `node:sqlite` module —
no separate database software or npm package needed).

## Accounts — how it works

- **Invite-only.** There's no public sign-up page anywhere in the app.
  The only way to create an account is `admin.html`, which only works
  if you're already logged in as an admin (that's you, from the
  bootstrap step above).
- To give someone else access (e.g. a tester), log in, go to
  `admin.html`, and create an account for them there — you pick their
  email and password and share it with them directly.
- Each account only ever sees its own data in the app. As the person
  running the server, you technically still have the same access to
  the raw database file any developer has to their own server — see
  the in-chat explanation of the privacy model for more on that.
- If you were using the app before accounts existed, your old data is
  still sitting in that browser's localStorage. Log in on that same
  browser, then visit `migrate-data.html` once and click the import
  button — it copies everything from that browser into your account.
  Safe to run more than once; it never overwrites anything.

## Deploying (Render)

The app is already deployed as a single Render Web Service (one
server serving both the API and every page). Accounts need one
additional thing beyond what was already set up: **a persistent disk**,
so the SQLite database file survives redeploys instead of resetting
every time (Render's regular filesystem is wiped on every deploy).

1. In the Render dashboard, open the service → **Disks** → **Add Disk**.
   - Name: anything, e.g. `data`.
   - Mount path: `/var/data`.
   - Size: 1 GB is enormous overkill for two accounts' worth of text
     data — the smallest size Render offers is fine.
2. Add environment variables (Settings → Environment):
   - `ANTHROPIC_API_KEY` — same as local.
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — same as local (this is what
     creates your account on the live server the first time it boots
     with the new disk attached).
   - `DB_PATH` — `/var/data/app.db` (must be somewhere under the disk's
     mount path, or it won't persist).
3. Redeploy. Check the logs for `Created admin account for ...` on
   that first boot — if you don't see it, ADMIN_EMAIL/ADMIN_PASSWORD
   weren't picked up (check for typos in the env var names).
4. Log in at `https://<your-render-url>/login.html`.

Cost-wise this adds Render's persistent-disk price (currently $0.25/GB/
month, billed per GB provisioned regardless of how much is actually
used) on top of the existing Web Service plan — see the cost breakdown
already discussed for the current total.

## Storage Locker file uploads (Cloudflare R2)

The Main Hub's Storage Locker can save real files (PDFs, Word docs),
not just links — those files are stored in Cloudflare R2 (not on
Render's disk, and not in the SQLite database, which is sized for
small text data only). This is optional: without it configured, the
Storage Locker's link-saving still works fine, and uploads just show
a friendly "not set up yet" message.

1. Sign up / log in at https://dash.cloudflare.com and open **R2** in
   the left sidebar (you may need to enable R2 once — it has its own
   free tier, currently ~10GB storage with no egress fees).
2. **Create a bucket** — any name (e.g. `idikai-storage-locker`). Note
   the name; it's `R2_BUCKET_NAME`.
3. Find your **Account ID** — shown on the R2 overview page, on the
   right side. That's `R2_ACCOUNT_ID`.
4. **Create an API token**: R2 → Manage R2 API Tokens → Create API
   Token. Give it **Object Read & Write** permission, scoped to just
   the bucket you created if you want to be strict. Creating it shows
   an **Access Key ID** and a **Secret Access Key** exactly once — copy
   both immediately (Cloudflare won't show the secret again). These
   are `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
5. Set all four as env vars — locally in `server/.env`, and on Render
   under Settings → Environment (same names). Redeploy on Render for
   the new env vars to take effect.
6. Never paste these values into a chat with an AI assistant (including
   this one) — set them directly in your `.env` file or the Render
   dashboard.

## If a feature that calls the AI doesn't work

- Check the Render logs (or your local terminal) for an error message
  — it'll usually say exactly what's wrong (e.g. missing API key, or a
  network problem).
- Accounts/login/data-sync don't depend on the Claude API at all — if
  those are broken but AI features work, the problem is somewhere in
  the database/session code instead, not the API key.
