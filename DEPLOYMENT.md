# StayFinder AI — Deployment Guide

What's actually in this repo and how to get it live. This supersedes any
earlier `DEPLOY.md`/`LAUNCH.md` drafts you may have floating around — those
described a plan; this describes what's built.

## What's here

| Path | Role |
|---|---|
| `index.html`, `main.js`, `css/main.css` | The frontend (static, no build step). |
| `api/chat.js` | Vercel Edge Function proxy. Holds the Anthropic key + system prompt + tool schema server-side; the browser never talks to Anthropic directly. |
| `config.example.js` → `config.local.js` | Browser config (Mapbox token, API base). **Gitignored** — copy it locally. |
| `.env.example` → `.env.local` | Server secrets (`ANTHROPIC_API_KEY`, etc). **Gitignored.** |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA — installable to a phone home screen, offline app shell. |
| `design-tokens.json`, `docs/DESIGN_SYSTEM.md` | Design system reference / Figma import. |
| `privacy.html` | Minimal privacy/terms note, linked from the app footer. |
| `Python/` | A separate terminal chatbot (CLI), not part of the web app. See its own section in the README. |

## Step 1 — Deploy the frontend + proxy (Vercel)

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Go to [vercel.com](https://vercel.com) → **Add New... → Project** → import
   the `AiAirbnbFinder` repo. No build settings needed — it's static +
   `api/chat.js`, which Vercel detects automatically.
3. Before the first deploy (or right after, then redeploy), add environment
   variables under **Project → Settings → Environment Variables**:
   - `ANTHROPIC_API_KEY` — required. Get one at [console.anthropic.com](https://console.anthropic.com).
   - `ALLOWED_ORIGINS` — optional at first; add once you know your final URL
     (comma-separated, e.g. `https://stayfinder.vercel.app`). Leave unset for
     the first deploy so it isn't self-blocking.
4. Deploy. You'll get a `https://<something>.vercel.app` URL with the proxy
   live at `/api/chat`.

## Step 2 — Set a spend cap (do this before sharing the link)

In the [Anthropic Console](https://console.anthropic.com), set a monthly
spend limit. This is the backstop if rate limiting ever fails open or gets
misconfigured — non-negotiable before the link goes public.

## Step 3 — Rate limiting (recommended before public launch)

`api/chat.js` has per-IP rate limiting wired but **off by default** so a
fresh deploy never breaks:
1. Create a free Redis DB at [upstash.com](https://upstash.com) (pick a
   region near your Vercel region).
2. Copy the **REST URL** and **REST token** (not the `redis://` URL).
3. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel env
   vars, then redeploy. Default: 20 requests / 60s per IP — tune in
   `api/chat.js`.

Local `vercel dev` stays unthrottled (no Upstash keys needed for development).

## Step 4 — Mapbox token

`config.example.js` ships with an empty `MAPBOX_TOKEN`. Without one, the map
panel gracefully falls back to a styled list instead of a live map — the app
fully works either way. To enable the real map:
1. Sign up free at [mapbox.com](https://mapbox.com), copy your public token
   (`pk.…`).
2. In the Mapbox dashboard, **URL-restrict** the token to your real domain(s).
3. Copy `config.example.js` → `config.local.js` and paste the token in.
   `config.local.js` is gitignored — it never gets committed.

> **Note on the repo's git history:** an earlier commit hardcoded a live
> Mapbox token directly in `main.js`. That token should be treated as
> burned — rotate/delete it in your Mapbox account and use a fresh
> URL-restricted one going forward. Scrubbing it from git history entirely
> (`git filter-repo` + force-push) is a separate, destructive step — only do
> that deliberately, and rotate the key regardless of whether you scrub history.

## Step 5 — Lock the origin

Once you know your real domain, set `ALLOWED_ORIGINS` in Vercel (see Step 1)
so only your site can call the proxy — otherwise anyone who finds the
`/api/chat` URL can spend your Anthropic budget from another site.

## Run it locally

- **No backend:** open `index.html` directly (or serve the folder with any
  static server). With no reachable `/api/chat`, the app automatically drops
  into demo mode (`simulateResponse` in `main.js`) — fully clickable, fake
  data, no API key needed.
- **With backend:** install the [Vercel CLI](https://vercel.com/docs/cli),
  copy `.env.example` → `.env.local` and fill in `ANTHROPIC_API_KEY`, then
  run `vercel dev`. Serves the static files and `/api/chat` together, usually
  at `localhost:3000`.

## Go-live checklist

- [ ] `ANTHROPIC_API_KEY` set in Vercel, not committed anywhere
- [ ] Spend cap set in the Anthropic Console
- [ ] Rate limiting live (Upstash env vars set)
- [ ] `ALLOWED_ORIGINS` set to your real domain
- [ ] Mapbox token rotated + URL-restricted (see Step 4 note above)
- [ ] `.env*` and `config.local.js` stay out of git (already in `.gitignore`)
- [ ] Installs to home screen on a phone (Lighthouse → PWA check passes)
- [ ] Privacy note (`privacy.html`) linked and accurate for what you actually ship

## Honesty note (why there's no "Book Now" button)

Real booking requires affiliate/partner API access (Airbnb, Booking.com,
Expedia) that isn't available same-day. Rather than fake a booking flow,
every listing card links to a real search on the actual site
(`Search Airbnb` / `Search Booking.com`) so the user always confirms live
price and availability before booking. This is a permanent product decision,
not a launch-week shortcut — keep it even after adding real inventory later.
