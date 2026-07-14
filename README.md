# 🏨 StayFinder AI

An AI-powered travel concierge that helps you find the perfect Airbnb or
hotel through natural conversation. It doesn't book anything for you — it
understands what you want, searches the live web, and hands you real listing
links so you can confirm price and availability yourself.

This repo has two independent pieces:

- **The web app** (`index.html` / `main.js` / `css/`) — a static frontend
  backed by a small serverless proxy (`api/chat.js`) that talks to Claude.
  This is the main product.
- **A terminal CLI** (`Python/`) — a separate, standalone chatbot that talks
  to Claude directly from your terminal. Handy for testing prompts; not part
  of the deployed web app.

## Web app

### How it works

The browser never talks to Anthropic directly. `main.js` calls same-origin
`/api/chat`, a Vercel Edge Function (`api/chat.js`) that holds the Anthropic
API key server-side, along with the system prompt and three tools:

- `update_preferences` — the model reports structured search criteria
  (destination, dates, budget, etc.) every turn; the sidebar renders it live.
- `suggest_replies` — 2-4 short tappable example answers shown above the
  input, so you don't always have to type.
- `present_listings` — 3-5 real accommodation results (found via the built-in
  `web_search` tool), rendered as cards with map pins and real
  "Search Airbnb" / "Search Booking.com" deep links.

If `/api/chat` isn't reachable (no backend deployed, or you just opened
`index.html` as a local file), the app automatically falls back to a
client-side demo mode with canned responses — so it's always clickable, even
with zero setup.

### Run it locally

**No backend, zero setup:**
```bash
open index.html
```
Runs entirely in demo mode (fake listings, no API key needed) — good for UI/design work.

**With the real backend:**
```bash
npm install -g vercel      # if you don't have it
cp .env.example .env.local # then fill in ANTHROPIC_API_KEY
vercel dev
```
Serves the static files and `/api/chat` together, usually at `localhost:3000`.

**Map (optional):** copy `config.example.js` → `config.local.js` and add a
Mapbox public token (see [DEPLOYMENT.md](DEPLOYMENT.md#step-4--mapbox-token)).
Without one, the map panel falls back to a styled list instead of breaking.

### Deploying

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full guide — Vercel setup,
required/optional environment variables, rate limiting, spend caps, and the
pre-launch checklist.

### Project layout

```
index.html               entry point
main.js                  app logic: chat, map, compare, saved searches, demo fallback
css/main.css             all styles (design tokens documented in docs/DESIGN_SYSTEM.md)
api/chat.js              Vercel Edge Function — secure Anthropic proxy
config.example.js        browser config template (copy -> config.local.js, gitignored)
.env.example             server secrets template (copy -> .env.local, gitignored)
manifest.webmanifest     PWA manifest (installable to a phone home screen)
sw.js                    service worker (offline app shell)
icons/                   PWA icons
privacy.html             short privacy/terms note, linked from the app footer
design-tokens.json       design tokens for Figma (Tokens Studio plugin)
docs/DESIGN_SYSTEM.md    design system reference
DEPLOYMENT.md            deployment + launch checklist
Python/                  separate terminal CLI (see below)
```

### Design system

See [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) for colors, typography,
spacing, and component reference. [design-tokens.json](design-tokens.json)
imports directly into Figma via the Tokens Studio plugin.

## Terminal CLI (`Python/`)

A separate, standalone chat agent that talks to Claude directly from your
terminal — no browser, no proxy needed since you provide your own API key
locally.

### Setup

```bash
cd Python
pip install -r requirements.txt
export ANTHROPIC_API_KEY="your-api-key-here"
python main.py
```

### Commands

| Command          | Description                          |
|-----------------|--------------------------------------|
| `/preferences`   | Show all gathered preferences        |
| `/reset`         | Start a new search from scratch      |
| `/help`          | Show available commands              |
| `/quit`          | Exit the application                 |

### How it works

- `agent.py` — `AccommodationAgent` manages the conversation with Claude
  using a detailed system prompt and the `web_search` tool, then parses
  `<PREFERENCES>` JSON blocks Claude emits to track structured requirements.
- `preferences.py` — `AccommodationPreferences` dataclass capturing all
  search criteria.
- `ui.py` — `CLI` handles the terminal interface: ANSI colors, streaming
  output, command handling.
- `main.py` — validates the API key and wires everything together.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
