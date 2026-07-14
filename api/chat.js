// ============================================================================
// api/chat.js  —  StayFinder AI secure proxy (Vercel Edge Function)
// ----------------------------------------------------------------------------
// The browser calls THIS, never api.anthropic.com. The Anthropic key lives
// only here, in an environment variable — it never reaches the client bundle.
// The system prompt + tool schema live here too, so the client can't tamper
// with them. Non-streaming by design: the client tools below (present_listings,
// update_preferences, suggest_replies) require a strict tool_use/tool_result
// handshake, which is far easier to get right — and to debug — as a single
// JSON round trip than as a hand-parsed SSE stream. The UI's typing/search
// indicators cover the perceived latency.
//
// Deploy: this file at /api/chat.js becomes https://yoursite/api/chat on
// Vercel automatically. Set ANTHROPIC_API_KEY in the project's Environment
// Variables (Vercel dashboard) — never commit it.
// ============================================================================

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const config = { runtime: 'edge' };

// --- Per-IP rate limiting (edge-safe, HTTP-based) ---------------------------
// Off by default so a fresh deploy never breaks. Turns on automatically once
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set (see DEPLOYMENT.md).
const ratelimit = process.env.UPSTASH_REDIS_REST_URL
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, '60 s'),
      prefix: 'sf_rl',
    })
  : null;

// --- Origin allowlist ---------------------------------------------------
// Off by default (any origin allowed) so the first deploy works before you
// know your final URL. Set ALLOWED_ORIGINS (comma-separated, e.g.
// "https://stayfinder.vercel.app,https://stayfinder.ai") once you have a
// real domain to lock the proxy down — see DEPLOYMENT.md step 1.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// --- System prompt -----------------------------------------------------
const SYSTEM_PROMPT = `You are StayFinder AI — a warm, patient travel concierge that helps people find the perfect Airbnb or hotel through conversation.

IMPORTANT — BE HONEST ABOUT WHAT YOU ARE
You are a concierge, not a booking engine. You point people to real, current listings but you never claim to book anything or guarantee availability/price. When you present listings, make clear the user should confirm final price and availability on the actual site before booking.

UNDERSTANDING THE USER
- Understand the user no matter how they write: typos, no capitals, no punctuation, short fragments, run-on voice-to-text, slang, abbreviations, or non-native / mixed-language English. Always read for intent, not form.
- Never correct, "fix," mock, or comment on the user's spelling, grammar, or word choice. Just understand and help.
- If something is truly unclear, ask ONE short, simple question — not several at once.

HOW TO TALK BACK
- Use plain, friendly language. Short sentences. Everyday words. One idea per sentence.
- Avoid travel jargon; if you must use a term, explain it briefly.
- Avoid idioms, sarcasm, and figures of speech — they confuse non-native speakers and translation tools.
- Reply in the SAME language the user writes in. If they switch languages, switch with them.
- Confirm what you understood in one simple line, e.g. "Okay — Miami, 2 people, June 10 to 15. Did I get that right?"
- Never talk down to anyone.

GATHERING PREFERENCES (one or two things at a time, never an interrogation)
- Collect: destination, dates, guests, budget, type (airbnb / hotel / both), amenities, vibe.
- EVERY turn, call update_preferences with everything you know so far, even if nothing changed. The app shows this in a live panel so the user can confirm at a glance.
- EVERY turn, call suggest_replies with 2-4 short example answers the user can tap instead of typing (e.g. "just me", "2 of us", "a family of 4").

SHOWING PLACES
- Once you know destination + guests + budget, use web_search to find real, current options, then call present_listings with 3-5 results. Include realistic lat/lng near the searched city, plus price, rating, reviews, type, a few amenities and tags.
- Always put your friendly message in normal text FIRST, then call the tools.`;

// --- Tools: structured output instead of regex-parsed sentinel tags --------
const TOOLS = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  {
    name: 'present_listings',
    description: 'Show 3-5 accommodation results to the user as cards and map pins.',
    input_schema: {
      type: 'object',
      properties: {
        listings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              location: { type: 'string' },
              lat: { type: 'number' },
              lng: { type: 'number' },
              price: { type: 'number' },
              rating: { type: 'number' },
              reviews: { type: 'integer' },
              type: { type: 'string', enum: ['airbnb', 'hotel'] },
              amenities: { type: 'array', items: { type: 'string' } },
              tags: { type: 'array', items: { type: 'string' } },
              url: { type: 'string', description: 'Direct listing or search URL if found via web_search' },
            },
            required: ['id', 'title', 'location', 'lat', 'lng', 'price', 'type'],
          },
        },
      },
      required: ['listings'],
    },
  },
  {
    name: 'update_preferences',
    description: "Record the user's structured search criteria as they emerge. Send everything known so far each time.",
    input_schema: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        check_in: { type: 'string' }, check_out: { type: 'string' },
        num_guests: { type: 'integer' }, num_adults: { type: 'integer' }, num_children: { type: 'integer' },
        budget_min: { type: 'number' }, budget_max: { type: 'number' }, budget_currency: { type: 'string' },
        accommodation_type: { type: 'string', enum: ['airbnb', 'hotel', 'both'] },
        transportation_needs: { type: 'string' },
        activities: { type: 'array', items: { type: 'string' } },
        amenities: { type: 'array', items: { type: 'string' } },
        pet_friendly: { type: 'boolean' }, accessible: { type: 'boolean' },
      },
    },
  },
  {
    name: 'suggest_replies',
    description: 'Offer 2-4 short, tappable example answers so the user can reply without typing a full sentence.',
    input_schema: {
      type: 'object',
      properties: { options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 } },
      required: ['options'],
    },
  },
];

const json = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(500, { error: 'Server misconfigured: ANTHROPIC_API_KEY is not set.' });
  }

  // 1) origin allowlist (no-op until ALLOWED_ORIGINS is configured)
  const origin = req.headers.get('origin') || '';
  if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) {
    return json(403, { error: 'Forbidden origin' });
  }

  // 2) parse + sanity-cap the payload (cheap abuse guard)
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return json(400, { error: 'No messages' });
  if (JSON.stringify(messages).length > 80_000) return json(413, { error: 'Conversation too large' });

  // 3) per-IP rate limit (no-op until Upstash env vars are set)
  if (ratelimit) {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'anon';
    try {
      const { success, reset } = await ratelimit.limit(ip);
      if (!success) {
        const retry = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        return new Response(
          JSON.stringify({ error: 'Too many requests — give it a few seconds.' }),
          { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(retry) } },
        );
      }
    } catch (e) {
      // Fail OPEN: an Upstash hiccup shouldn't take the app down. The Anthropic
      // Console spend cap is the hard backstop against runaway usage.
      console.error('ratelimit error', e);
    }
  }

  // 4) forward to Anthropic with the server-side key + prompt caching on the system prompt
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
      stream: false,
    }),
  });

  const data = await upstream.json().catch(() => null);
  if (!upstream.ok || !data) {
    const detail = typeof data === 'object' ? JSON.stringify(data).slice(0, 400) : '';
    return json(upstream.status || 502, { error: 'Upstream error', detail });
  }

  // 5) pass the Anthropic message straight back to the browser
  return json(200, data);
}
