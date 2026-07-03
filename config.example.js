// StayFinder AI — local browser config.
// Copy this file to config.local.js (already gitignored) and fill in your
// own values. config.local.js is loaded before main.js if present; if it's
// missing, main.js falls back to same-origin /api/chat with no map token
// (the map panel shows a listing-list placeholder instead of a live map).
window.STAYFINDER_CONFIG = {
  // Public Mapbox token (starts with "pk."). Get one free at mapbox.com,
  // then URL-restrict it to your domain in the Mapbox dashboard.
  MAPBOX_TOKEN: '',

  // Leave as '/api/chat' unless the proxy is deployed somewhere else.
  API_BASE: '/api/chat',
};
