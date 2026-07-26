// ============================================================================
// api/config.js  —  StayFinder AI public runtime config (Vercel Edge Function)
// ----------------------------------------------------------------------------
// Serves browser-safe config values — currently just the Mapbox token — from
// a real Vercel Environment Variable, the same way ANTHROPIC_API_KEY works in
// api/chat.js. MAPBOX_TOKEN is a *public* token by design (Mapbox protects it
// via URL-restriction, not secrecy), so it's safe to hand to any client.
//
// Set MAPBOX_TOKEN in Vercel -> Project -> Settings -> Environment Variables,
// same place ANTHROPIC_API_KEY already lives, then redeploy.
// ============================================================================

export const config = { runtime: 'edge' };

export default function handler() {
  const body = `window.STAYFINDER_CONFIG = ${JSON.stringify({
    MAPBOX_TOKEN: process.env.MAPBOX_TOKEN || '',
    API_BASE: '/api/chat',
  })};`;

  return new Response(body, {
    headers: { 'content-type': 'application/javascript; charset=utf-8' },
  });
}
