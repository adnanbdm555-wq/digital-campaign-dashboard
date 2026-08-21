# Digital Campaign Dashboard

A small Node.js web app that:
- The **first person to sign up becomes the admin**. After that, self-signup
  closes — the admin creates every other account from `/admin.html`, sets
  their username and password directly, and shares it with them.
- Every account has its own login, its own connected Facebook/Google/LinkedIn
  accounts, and its own dashboard — nobody sees or uses anybody else's
  connected accounts, and nobody can self-promote to admin.
- The admin can see, from `/admin.html`: everyone's name, which platforms
  they've connected, when they last synced, and a read-only view of their
  actual dashboard (`/dashboard.html?as={userId}`) — never their password
  or raw OAuth tokens, even as admin.
- Gives everyone real "Connect Facebook & Instagram" / "Connect Google" /
  "Connect LinkedIn" login buttons (OAuth — no passwords ever touch this app).
- Auto-pulls Reach, Spend, platform/gender/age/location breakdowns from
  Meta, views/sessions/users from YouTube + GA4, and impressions from
  LinkedIn Ad Analytics, on a schedule — per user.
- Lets you type in TikTok numbers manually until TikTok's API is approved
  — they persist across syncs exactly like an automated field would.

Nothing here fakes a connection — every pull is a real API call. It just
can't run until you plug in your own app credentials, because OAuth apps
have to be registered by an account owner (that's a platform requirement,
not something any tool can do on your behalf).

## 1. Prerequisites

- Node.js 18 or newer.
- A Meta Ad Account you (or your client) have access to.
- A Google Analytics 4 property + YouTube channel, if you want those too.
- A LinkedIn Company Page + Sponsored ad account, if you want that too.
- For real deployment: any host that gives you a public HTTPS URL
  (Render, Railway, a VPS, etc.) — OAuth callbacks need a real reachable
  address. For local testing, `http://localhost:3000` is fine with Meta,
  Google, and LinkedIn as long as each app stays in development/testing mode.

## 2. Create a Meta App

1. Go to [developers.facebook.com](https://developers.facebook.com) →
   **My Apps → Create App** → choose **Business**.
2. Add the **Marketing API** product.
3. **App Settings → Basic**: copy the **App ID** and **App Secret**.
4. **Facebook Login for Business → Settings**: add your redirect URI —
   `http://localhost:3000/auth/meta/callback` for local testing, or
   `https://yourdomain.com/auth/meta/callback` once deployed.
5. While the app is in **Development mode**, only admins/testers of the
   app can log in — that's fine for your own agency use. Submitting for
   App Review is only needed if you want other people's ad accounts to
   connect without being added as a tester.

## 3. Create a Google Cloud OAuth Client

1. Go to [console.cloud.google.com](https://console.cloud.google.com) →
   create a project.
2. **APIs & Services → Library**: enable **YouTube Analytics API** and
   **Google Analytics Data API**.
3. **APIs & Services → OAuth consent screen**: set it up, add your own
   Google account under **Test users** (keeps it in Testing mode, which
   is enough for internal use — no Google verification review needed).
4. **APIs & Services → Credentials → Create Credentials → OAuth client
   ID** → type **Web application**.
5. Add an **Authorized redirect URI**:
   `http://localhost:3000/auth/google/callback` (or your real domain).
6. Copy the **Client ID** and **Client Secret**.

> ⚠️ **Important:** while the app stays in Testing mode, Google expires
> the Google connection after exactly 7 days, regardless of use — this is
> a Google policy on unverified apps, not a bug here. When it expires,
> YouTube/GA4 syncing will show an error in the control panel until
> someone clicks **Connect Google** again. Meta and LinkedIn don't have
> this limitation. To stop needing weekly reconnects, submit the app for
> [Google's OAuth verification](https://support.google.com/cloud/answer/13463073)
> (usually 2–6 weeks since Analytics scopes count as "sensitive") — after
> approval, the connection lasts indefinitely as long as it's used at
> least once every 6 months.

## 4. Create a LinkedIn App

1. Go to [developer.linkedin.com](https://developer.linkedin.com) → **Create App**,
   linked to a LinkedIn Company Page you admin.
2. **Products** tab: request the **Marketing Developer Platform** product.
   LinkedIn reviews this before it's active — usually a straightforward approval
   for a real business use case, but it isn't instant, similar in spirit to
   Meta's App Review. You won't get real ad data back until it's approved.
3. **Auth** tab: copy the **Client ID** and **Client Secret**, and add a
   redirect URL — `http://localhost:3000/auth/linkedin/callback` for local
   testing, or your real domain once deployed.
4. Note the **Sponsored Ad Account ID** you want to pull from (LinkedIn
   Campaign Manager → Account Settings).

## 5. Configure and run

```bash
cp .env.example .env
# open .env and paste in your Meta + Google + LinkedIn credentials
npm install
npm start
```

Then open `http://localhost:3000/` — it'll redirect to `/signup.html` the
first time. Whoever creates that first account becomes the admin. Once
logged in, click **Connect Facebook & Instagram**, **Connect Google**, and
**Connect LinkedIn**, fill in your own Ad Account ID / GA4 Property ID /
YouTube Channel ID / LinkedIn Ad Account ID, and click **Sync Now**.

Open `http://localhost:3000/dashboard.html` — that's your live campaign
dashboard, pulling from your own connected accounts only.

As admin, open `http://localhost:3000/admin.html` to create accounts for
the rest of the team — set a username and password for each person and
share it with them directly (there's no email/invite step). Each of them
logs in, connects their own accounts, and shows up in your admin list with
a "View dashboard" link so you can check on any campaign without needing
their password.

## 6. Deploying so it runs unattended

Right now this only pulls data while `npm start` is running and reachable.
To make it fully automated:

1. Deploy this folder to a host with a public HTTPS URL (Render, Railway,
   a small VPS with `pm2`, etc.).
2. Set `BASE_URL` in `.env` to that real URL.
3. Update the redirect URIs in the Meta App, Google OAuth Client, and
   LinkedIn App to match the new domain (`https://yourdomain.com/auth/meta/callback`,
   `.../auth/google/callback`, `.../auth/linkedin/callback`).
4. Re-connect all three accounts once from the deployed control panel —
   tokens are tied to the redirect URI they were issued against.
5. `CRON_SCHEDULE` in `.env` controls how often it auto-pulls (default:
   every 6 hours). The dashboard also has its own **⟳ Sync Live Data**
   button for pulling on demand.

## 7. TikTok

TikTok's Marketing API needs an approved developer app + advertiser
access before any automated pull is possible — there's no way around
that approval step, and it's outside what any tool can do for you. Until
you're approved, use the **TikTok Reach** field on the control panel;
it's stored the same way as automated data and survives every sync.
Once you do get access, `src/services/tiktokService.js` has the real
endpoint and docs link ready — wire it in and nothing else changes.

## Notes on accuracy

- **Token lifetimes**: Meta connections last ~60 days and effectively
  renew themselves as long as the scheduler keeps calling the API (which
  it does every `CRON_SCHEDULE` run). Google connections expire after
  exactly 7 days while the app is in Testing mode — see the warning in
  step 3 above. LinkedIn access tokens last ~60 days; refresh tokens are
  only issued to apps with the right Marketing Developer Platform
  approval, so reconnecting periodically is the safe assumption there too.
- **Cost Per Result**: Meta's "a result" depends on your campaign
  objective (leads, purchases, link clicks, etc.). Set
  `metaResultActionType` in the control panel to the right action type
  for accurate numbers — left blank, it falls back to a cost-per-1000-
  reached proxy instead.
- **Location breakdown**: Meta returns whichever region names actually
  appear in your ad data, not a fixed Punjab/KP/Sindh/Balochistan list.
  Check `/api/status` after a sync for the real breakdown
  (`_regionBreakdown`, sorted by spend share) and copy the right values
  into the dashboard's location rows.
- **LinkedIn Reach**: LinkedIn's Ad Analytics API doesn't expose a true
  "reach" metric for most campaign types — `liReach` uses impressions as
  the closest available proxy, same spirit as the Meta CPM fallback above.
- **Accounts**: only the very first signup is self-serve — every account
  after that is created by the admin from `/admin.html`. If you ever need
  a second admin (e.g. you're out and someone else needs to manage the
  team), promote them from the same page with the "Make admin" button.
- **Storage**: tokens and settings are stored as plain JSON files under
  `/data/user-data/{userId}/` — fine for a small team.
  If this ever needs to serve multiple clients or multiple logged-in
  users, swap `src/store.js` for a real database and a secrets manager;
  nothing else in the app talks to storage directly, so that's the only
  file that would need to change.
