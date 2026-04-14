// ================================================================
// StayFinder AI — main.js  
// ================================================================

 const MAPBOX_TOKEN = '';

// ── State ────────────────────────────────────────────────────────
const state = {
  prefs: {},             // user's travel preferences collected from chat
  isTyping: false,
  messageCount: 0,
  conversationHistory: [], // the full chat log sent to Claude each time
  demoCity: null,
  currentListings: [],   // Array of listing objects from latest search
  compareList: [],       // Up to 3 listing IDs the user selected for comparison
  map: null,             // Mapbox map instance
  mapOpen: false,
  markers: [],           // Pins active map markers objects
};

// ================================================================
// PHASE 3 — SAVED SEARCHES  &  SHARE LINK
// ================================================================

// ── Storage key ─────────────────────────────────────────────────
const SAVED_SEARCHES_KEY = 'sf_saved_searches';

// ── Saved Searches ───────────────────────────────────────────────
function getSavedSearches() {
  try { return JSON.parse(localStorage.getItem(SAVED_SEARCHES_KEY) || '[]'); }
  catch { return []; }
}

function saveCurrentSearch() {
  const prefs = state.prefs;
  if (!prefs.destination && !state.demoCity) {
    showToast('Start a search first before saving.');
    return;
  }

  const destination = prefs.destination || state.demoCity || 'Unknown';
  const searches = getSavedSearches();

  // Avoid exact duplicates (same destination + budget)
  const isDupe = searches.some(s =>
    s.destination === destination &&
    s.budget_max  === prefs.budget_max
  );
  if (isDupe) { showToast('This search is already saved.'); return; }

  const entry = {
    id:          Date.now(),
    savedAt:     new Date().toISOString(),
    destination,
    prefs:       { ...prefs },
    demoCity:    state.demoCity,
    label:       buildSearchLabel(prefs, state.demoCity),
  };

  searches.unshift(entry);         // newest first
  if (searches.length > 10) searches.pop(); // cap at 10
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches));
  renderSavedSearches();
  showToast('Search saved! ✓');
}

function deleteSavedSearch(id) {
  const updated = getSavedSearches().filter(s => s.id !== id);
  localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(updated));
  renderSavedSearches();
}

function loadSavedSearch(entry) {
  // Restore state
  state.prefs    = { ...entry.prefs };
  state.demoCity = entry.demoCity || entry.destination;

  // Trigger sidebar update
  updatePreferences(JSON.stringify(entry.prefs));

  // Prompt the AI (or demo) to re-run the search
  closeSidebar();
  $('chat-input').value =
    `Find me the best options in ${entry.destination} based on my saved preferences`;
  sendMessage();
}

function buildSearchLabel(prefs, demoCity) {
  const dest   = prefs.destination || demoCity || 'Somewhere';
  const guests = prefs.num_guests  ? `${prefs.num_guests} guests` : '';
  const budget = prefs.budget_max  ? `up to $${prefs.budget_max}/night` : '';
  return [dest, guests, budget].filter(Boolean).join(' · ');
}

function renderSavedSearches() {
  const list = getSavedSearches();
  const container = $('saved-searches-list');
  if (!container) return;

  const parent = $('sec-saved');
  if (!parent) return;

  if (list.length === 0) {
    parent.style.display = 'none';
    return;
  }

  parent.style.display = '';
  container.innerHTML = list.map(entry => {
    const date = new Date(entry.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `
      <div class="saved-search-item" title="Reload this search">
        <div class="saved-search-main" onclick="loadSavedSearch(${JSON.stringify(entry).replace(/"/g, '&quot;')})">
          <div class="saved-search-label">${entry.label}</div>
          <div class="saved-search-date">${date}</div>
        </div>
        <button class="saved-search-del" onclick="deleteSavedSearch(${entry.id})" title="Remove">✕</button>
      </div>`;
  }).join('');
}

// ── Share Link ───────────────────────────────────────────────────
function shareSearch() {
  const prefs = state.prefs;
  if (!prefs.destination && !state.demoCity) {
    showToast('Start a search first to share it.');
    return;
  }

  const payload = {
    ...prefs,
    destination: prefs.destination || state.demoCity,
  };

  // Encode preferences into URL param
  const encoded  = btoa(encodeURIComponent(JSON.stringify(payload)));
  const shareUrl = `${location.origin}${location.pathname}?search=${encoded}`;

  // Copy to clipboard
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showShareToast(shareUrl);
    }).catch(() => fallbackCopy(shareUrl));
  } else {
    fallbackCopy(shareUrl);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showShareToast(text);
}

function showShareToast(url) {
  // Remove any existing share toast
  document.getElementById('share-toast')?.remove();

  const t = document.createElement('div');
  t.id = 'share-toast';
  t.style.cssText = `
    position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
    background:var(--bark);border:1px solid rgba(200,151,42,0.4);
    color:var(--cream);padding:14px 20px;border-radius:var(--radius);
    font-size:13px;z-index:200;animation:fade-in 0.2s ease;
    max-width:min(420px,90vw);box-shadow:0 8px 30px rgba(0,0,0,0.5);`;
  t.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <span style="font-size:16px;">🔗</span>
      <strong style="color:var(--gold-light);">Link copied to clipboard!</strong>
    </div>
    <div style="font-size:11px;color:var(--cream-faint);word-break:break-all;line-height:1.5;
      background:rgba(255,255,255,0.05);padding:8px 10px;border-radius:6px;">
      ${url.length > 80 ? url.slice(0, 80) + '…' : url}
    </div>
    <button onclick="this.closest('#share-toast').remove()"
      style="margin-top:10px;width:100%;background:none;border:1px solid rgba(200,151,42,0.25);
      color:var(--cream-dim);padding:6px;border-radius:6px;font-family:var(--font-body);
      font-size:12px;cursor:pointer;">Dismiss</button>`;
  document.body.appendChild(t);
  setTimeout(() => t?.remove(), 6000);
}

// ── Read shared URL on load ──────────────────────────────────────
function readSharedUrl() {
  const params = new URLSearchParams(location.search);
  const encoded = params.get('search');
  if (!encoded) return;

  try {
    const prefs = JSON.parse(decodeURIComponent(atob(encoded)));
    // Restore
    state.prefs    = prefs;
    state.demoCity = prefs.destination || null;
    updatePreferences(JSON.stringify(prefs));

    // Auto-trigger search after a tick
    setTimeout(() => {
      $('chat-input').value =
        `Find me the best options in ${prefs.destination || 'my destination'} based on the shared preferences`;
      sendMessage();
    }, 600);

    // Clean URL without reload
    history.replaceState(null, '', location.pathname);
    showToast('🔗 Shared search loaded!');
  } catch {
    // Malformed param — silently ignore
  }
}

// ── System prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are StayFinder AI — a warm, expert travel assistant that helps users find the perfect Airbnb space or hotel.

Gather preferences conversationally: destination, dates, guests, budget, type (Airbnb/hotel/both), transport needs, activities, amenities, vibe.

Ask 1-2 questions per turn. Once you have destination + guests + budget, search.

When presenting listings, format each one EXACTLY like this so the UI can parse them:
<LISTING>
{"id":"l1","title":"Property Name","location":"Neighborhood, City","lat":25.7617,"lng":-80.1918,"price":162,"rating":4.94,"reviews":203,"type":"airbnb","amenities":["Pool","Wifi","Kitchen"],"tags":["Superhost","Great location"],"tagColors":["amber","gold"]}
</LISTING>

Always include realistic lat/lng coordinates near the searched city. Include 3-5 listings.

After each message also include:
<PREFERENCES>
{"destination":"Miami Beach, FL","num_guests":2,"budget_min":120,"budget_max":220,"accommodation_type":"airbnb","amenities":["pool","wifi"],"activities":["beach","nightlife"]}
</PREFERENCES>`;

// ── DOM helpers ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const messages = $('messages');
function show(id) { $(id).style.display = ''; }
function hide(id) { $(id).style.display = 'none'; }

// ── Mobile sidebar ───────────────────────────────────────────────
function openSidebar()  { $('sidebar').classList.add('open');  $('sidebar-overlay').classList.add('active');  document.body.style.overflow = 'hidden'; }
function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebar-overlay').classList.remove('active'); document.body.style.overflow = ''; }

// ================================================================
// MAP
// ================================================================
function initMap(city, listings) {
  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === 'YOUR_MAPBOX_TOKEN_HERE') {
    showMapPlaceholder(city, listings);
    return;
  }

  mapboxgl.accessToken = MAPBOX_TOKEN;

  // Clear existing map
  if (state.map) { state.map.remove(); state.map = null; }
  state.markers.forEach(m => m.remove());
  state.markers = [];

  const center = listings.length
    ? [listings[0].lng, listings[0].lat]
    : getCityCoords(city);

  state.map = new mapboxgl.Map({
    container: 'mapbox-container',
    style: 'mapbox://styles/mapbox/dark-v11',
    center,
    zoom: 13,
    attributionControl: false,
  });

  state.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

  state.map.on('load', () => {
    listings.forEach((listing, i) => {
      // Custom marker element
      const el = document.createElement('button');
      el.className = 'map-marker';
      el.textContent = `$${listing.price}`;
      el.setAttribute('data-id', listing.id);

      // Popup
      const popup = new mapboxgl.Popup({ offset: 25, closeButton: true })
        .setHTML(`
          <div class="map-popup-title">${listing.title}</div>
          <div class="map-popup-price">$${listing.price}/night</div>
          <div class="map-popup-rating">★ ${listing.rating} · ${listing.reviews} reviews</div>
        `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([listing.lng, listing.lat])
        .setPopup(popup)
        .addTo(state.map);

      // Highlight card on marker click
      el.addEventListener('click', () => {
        highlightListingCard(listing.id);
        document.querySelectorAll('.map-marker').forEach(m => m.classList.remove('active'));
        el.classList.add('active');
      });

      state.markers.push(marker);
    });

    // Fit all markers in view
    if (listings.length > 1) {
      const bounds = listings.reduce((b, l) =>
        b.extend([l.lng, l.lat]),
        new mapboxgl.LngLatBounds([listings[0].lng, listings[0].lat], [listings[0].lng, listings[0].lat])
      );
      state.map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    }
  });

  $('map-count').textContent = `${listings.length} listings`;
}

function showMapPlaceholder(city, listings) {
  // No Mapbox token — show a nice placeholder with listing list
  const container = $('mapbox-container');
  container.style.overflow = 'auto';
  container.innerHTML = `
    <div style="padding:20px;">
      <div style="background:rgba(200,151,42,0.1);border:1px solid rgba(200,151,42,0.25);border-radius:10px;padding:14px 16px;margin-bottom:16px;font-size:13px;line-height:1.6;color:var(--cream-dim);">
        <div style="color:var(--gold-light);font-weight:500;margin-bottom:4px;">Add your Mapbox token to see the map</div>
        Sign up free at <a href="https://mapbox.com" style="color:var(--teal-light);" target="_blank">mapbox.com</a>, copy your public token, and paste it at the top of main.js where it says <code style="background:rgba(255,255,255,0.08);padding:1px 5px;border-radius:3px;">MAPBOX_TOKEN</code>.
      </div>
      <div style="font-size:11px;color:var(--cream-faint);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">Listings near ${city || 'your destination'}</div>
      ${listings.map((l, i) => `
        <div onclick="highlightListingCard('${l.id}')" style="background:var(--driftwood);border:1px solid rgba(200,151,42,0.15);border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='rgba(200,151,42,0.4)'" onmouseout="this.style.borderColor='rgba(200,151,42,0.15)'">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-family:var(--font-display);font-size:15px;color:var(--cream);font-weight:500;">${l.title}</div>
            <div style="font-size:14px;color:var(--gold-light);white-space:nowrap;margin-left:8px;">$${l.price}<span style="font-size:10px;color:var(--cream-faint)">/night</span></div>
          </div>
          <div style="font-size:12px;color:var(--cream-dim);margin-top:3px;">📍 ${l.location}</div>
          <div style="font-size:12px;color:var(--gold);margin-top:2px;">★ ${l.rating} · ${l.reviews} reviews</div>
        </div>`).join('')}
    </div>`;
  $('map-count').textContent = `${listings.length} listings`;
}

function toggleMap() {
  if (state.mapOpen) hideMap();
  else showMap();
}

function showMap() {
  state.mapOpen = true;
  $('map-panel').classList.add('open');
  $('map-toggle-btn').classList.add('active');
  if (state.map) setTimeout(() => state.map.resize(), 350);
}

function hideMap() {
  state.mapOpen = false;
  $('map-panel').classList.remove('open');
  $('map-toggle-btn').classList.remove('active');
}

function highlightListingCard(id) {
  // Scroll to and briefly highlight the listing card in chat
  const card = document.querySelector(`[data-listing-id="${id}"]`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.style.borderColor = 'rgba(200,151,42,0.8)';
    setTimeout(() => card.style.borderColor = '', 1500);
  }
}

// ================================================================
// COMPARISON
// ================================================================
function toggleCompare(id, checked) {
  if (checked) {
    if (state.compareList.length >= 3) {
      // Uncheck the checkbox
      const cb = document.querySelector(`#compare-cb-${id}`);
      if (cb) cb.checked = false;
      showToast('You can compare up to 3 listings at a time.');
      return;
    }
    state.compareList.push(id);
  } else {
    state.compareList = state.compareList.filter(i => i !== id);
  }
  updateCompareBar();
}

function updateCompareBar() {
  let bar = $('compare-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'compare-bar';
    bar.className = 'compare-bar';
    bar.innerHTML = `
      <span class="compare-bar-text"><strong id="compare-bar-count">0</strong> selected</span>
      <button class="compare-bar-btn" onclick="openCompare()">Compare</button>
      <button class="compare-bar-clear" onclick="clearCompare()" title="Clear">✕</button>`;
    document.body.appendChild(bar);
  }

  const count = state.compareList.length;
  $('compare-bar-count').textContent = count;

  if (count >= 2) {
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

function clearCompare() {
  state.compareList = [];
  document.querySelectorAll('.listing-compare-check input').forEach(cb => cb.checked = false);
  const bar = $('compare-bar');
  if (bar) bar.classList.remove('visible');
}

function openCompare() {
  const selected = state.currentListings.filter(l => state.compareList.includes(l.id));
  if (selected.length < 2) return;

  const rows = [
    { label: 'Price / night', key: l => `<span class="compare-price">$${l.price}<span>/night</span></span>` },
    { label: 'Rating',        key: l => `<span class="compare-rating">★ ${l.rating}</span> <span style="font-size:12px;color:var(--cream-faint)">${l.reviews} reviews</span>` },
    { label: 'Type',          key: l => l.type === 'airbnb' ? '🏠 Airbnb' : '🏨 Hotel' },
    { label: 'Location',      key: l => l.location },
    { label: 'Amenities',     key: l => `<div class="compare-tags">${(l.amenities||[]).map(a => `<span class="tag tag-green">${a}</span>`).join('')}</div>` },
    { label: 'Highlights',    key: l => `<div class="compare-tags">${(l.tags||[]).map((t,i) => `<span class="tag tag-${(l.tagColors||[])[i]||'gold'}">${t}</span>`).join('')}</div>` },
  ];

  // Find best price (lowest) and best rating
  const bestPrice  = Math.min(...selected.map(l => l.price));
  const bestRating = Math.max(...selected.map(l => l.rating));

  const html = `
    <table class="compare-table">
      <thead>
        <tr>
          <th></th>
          ${selected.map(l => `<th class="listing-col">${l.title}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${row.label}</td>
            ${selected.map(l => {
              let cell = row.key(l);
              // Add "best value" / "top rated" badge
              if (row.label === 'Price / night' && l.price === bestPrice)
                cell += `<div class="compare-win">Best price</div>`;
              if (row.label === 'Rating' && l.rating === bestRating)
                cell += `<div class="compare-win">Top rated</div>`;
              return `<td>${cell}</td>`;
            }).join('')}
          </tr>`).join('')}
      </tbody>
    </table>`;

  $('compare-body').innerHTML = html;
  $('compare-overlay').classList.add('active');
  $('compare-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCompare() {
  $('compare-overlay').classList.remove('active');
  $('compare-modal').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Toast notification ───────────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--driftwood);border:1px solid rgba(200,151,42,0.3);color:var(--cream-dim);padding:10px 18px;border-radius:20px;font-size:13px;z-index:100;animation:fade-in 0.2s ease;white-space:nowrap;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ── Listing parsing ──────────────────────────────────────────────
function parseListings(text) {
  const listings = [];
  const regex = /<LISTING>([\s\S]*?)<\/LISTING>/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      listings.push(JSON.parse(match[1].trim()));
    } catch {}
  }
  return listings;
}

// ── Build listing card HTML ──────────────────────────────────────
function buildListingCard(listing) {
  const tagHtml = (listing.tags || []).map((t, i) => {
    const color = (listing.tagColors || [])[i] || 'gold';
    return `<span class="tag tag-${color}">${t}</span>`;
  }).join('');

  return `
    <div class="listing-card" data-listing-id="${listing.id}">
      <label class="listing-compare-check">
        <input type="checkbox" id="compare-cb-${listing.id}" onchange="toggleCompare('${listing.id}', this.checked)"> Compare
      </label>
      <div class="listing-card-header">
        <div class="listing-title">${listing.title}</div>
        <div class="listing-price">$${listing.price} <span>/ night</span></div>
      </div>
      <div class="listing-location">📍 ${listing.location}</div>
      <div class="listing-rating">★ ${listing.rating} · ${listing.reviews} reviews</div>
      <div class="listing-tags">${tagHtml}</div>
    </div>`;
}

// ── Message rendering ────────────────────────────────────────────
function addMessage(role, content, isHtml = false) {
  const welcome = $('welcome-screen');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  wrap.style.animationDelay = `${Math.min(state.messageCount * 0.04, 0.1)}s`;

  const avatar = document.createElement('div');
  avatar.className = `avatar avatar-${role === 'assistant' ? 'ai' : 'user'}`;
  avatar.textContent = role === 'assistant' ? '✦' : 'You';

  const bubble = document.createElement('div');
  bubble.className = `bubble bubble-${role === 'assistant' ? 'ai' : 'user'}`;

  if (isHtml) bubble.innerHTML = content;
  else        bubble.innerHTML = formatText(content);

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
  state.messageCount++;
  return bubble;
}

function formatText(text) {
  text = text.replace(/<PREFERENCES>[\s\S]*?<\/PREFERENCES>/g, '').trim();
  text = text.replace(/<LISTING>[\s\S]*?<\/LISTING>/g, '').trim();
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  return `<p>${text}</p>`;
}

// ── Typing / search progress ──────────────────────────────────────
function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant'; wrap.id = 'typing-indicator';
  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-ai'; avatar.textContent = '✦';
  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(avatar); wrap.appendChild(typing);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}
function removeTyping() { const t = $('typing-indicator'); if (t) t.remove(); }

const SEARCH_STEPS = ['Reading your preferences','Scanning listings','Comparing prices','Checking availability','Ranking best matches'];

function showSearchProgress(city) {
  removeTyping();
  const wrap = document.createElement('div');
  wrap.className = 'message assistant'; wrap.id = 'search-progress-indicator';
  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-ai'; avatar.textContent = '✦';
  const box = document.createElement('div');
  box.className = 'search-progress';
  box.innerHTML = `
    <div class="search-progress-label">Searching ${city ? `in ${city}` : 'for stays'}…</div>
    <div class="search-steps">
      ${SEARCH_STEPS.map((s,i) => `<div class="search-step" id="sstep-${i}"><span class="step-dot"></span><span class="step-check">✓</span>${s}</div>`).join('')}
    </div>`;
  wrap.appendChild(avatar); wrap.appendChild(box);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;

  let cur = 0;
  const interval = setInterval(() => {
    const prev = document.getElementById(`sstep-${cur-1}`);
    const el   = document.getElementById(`sstep-${cur}`);
    if (prev) prev.className = 'search-step done';
    if (el)   el.className   = 'search-step active';
    cur++;
    if (cur > SEARCH_STEPS.length) clearInterval(interval);
  }, 600);
  wrap._interval = interval;
}

function removeSearchProgress() {
  const el = $('search-progress-indicator');
  if (el) { if (el._interval) clearInterval(el._interval); el.remove(); }
}

// ── Preference sidebar ───────────────────────────────────────────
function updatePreferences(jsonStr) {
  let data; try { data = JSON.parse(jsonStr); } catch { return; }
  Object.assign(state.prefs, data);
  const p = state.prefs;

  hide('pref-empty'); show('pref-content');

  const fields = ['destination','num_guests','budget_max','check_in','accommodation_type','amenities','transportation_needs','activities'];
  const filled = fields.filter(f => p[f] && (Array.isArray(p[f]) ? p[f].length > 0 : true)).length;
  const pct = Math.round((filled / fields.length) * 100);
  $('progress-fill').style.width = pct + '%';
  $('progress-pct').textContent = pct + '%';
  $('progress-text').textContent = pct < 25 ? 'Just getting started' : pct < 55 ? 'Looking good' : pct < 80 ? 'Almost ready' : 'Ready to search!';
  show('sec-progress'); show('div-0');

  if (p.destination) { $('pref-destination').textContent = p.destination; $('pref-destination').classList.remove('pending'); show('sec-destination'); }
  if (p.check_in || p.check_out) {
    const fmt = d => { if(!d) return '?'; const [y,m,dy]=d.split('-'); return `${m}/${dy}/${y.slice(2)}`; };
    $('pref-dates').textContent = `${fmt(p.check_in)} → ${fmt(p.check_out)}`; show('sec-dates');
  }
  if (p.num_guests) { let g=`${p.num_guests} guest${p.num_guests>1?'s':''}`; if(p.num_adults||p.num_children) g+=` (${p.num_adults||0} adults, ${p.num_children||0} children)`; $('pref-guests').textContent=g; show('sec-guests'); }
  show('div-1');
  if (p.budget_max || p.budget_min) {
    const sym = (p.budget_currency==='EUR')?'€':(p.budget_currency==='GBP')?'£':'$';
    let html = p.budget_min ? `<span>${sym}${p.budget_min}</span><span class="sep">–</span>` : '';
    html += `<span>${sym}${p.budget_max||p.budget_min}</span>`;
    $('pref-budget').innerHTML = html; show('sec-budget');
  }
  if (p.accommodation_type) { const labels={airbnb:'🏠 Airbnb',hotel:'🏨 Hotel',both:'🏠🏨 Both'}; $('pref-type').textContent=labels[p.accommodation_type]||p.accommodation_type; show('sec-type'); }
  show('div-2');
  if (p.transportation_needs) { $('pref-transport').textContent=p.transportation_needs; show('sec-transport'); }
  if (p.activities&&p.activities.length) { renderTags('pref-activities',p.activities,'tag-gold'); show('sec-activities'); }
  const al=[...(p.amenities||[])]; if(p.pet_friendly) al.push('pet-friendly'); if(p.accessible) al.push('accessible');
  if (al.length) { renderTags('pref-amenities',al,'tag-green'); show('sec-amenities'); }
  show('div-3');
  if (p.destination && p.num_guests) { show('search-btn'); $('api-notice').style.display='block'; }
}

function renderTags(containerId, items, cls) {
  const el = $(containerId); el.innerHTML = '';
  items.forEach((item, i) => {
    const tag = document.createElement('span');
    tag.className = `tag ${cls} pref-tag`;
    tag.style.animationDelay = `${i*0.05}s`;
    tag.textContent = item;
    el.appendChild(tag);
  });
}

function extractPreferences(text) {
  const match = text.match(/<PREFERENCES>([\s\S]*?)<\/PREFERENCES>/);
  if (match) updatePreferences(match[1].trim());
}

// ── API call ─────────────────────────────────────────────────────
async function callClaude(userMessage) {
  state.conversationHistory.push({ role: 'user', content: userMessage });
  const apiKey = getApiKey();
  if (!apiKey) return simulateResponse(userMessage);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: state.conversationHistory,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const fullText = data.content.filter(b => b.type==='text').map(b => b.text).join('');
  state.conversationHistory.push({ role: 'assistant', content: fullText });
  extractPreferences(fullText);

  // Parse and register any listings
  const listings = parseListings(fullText);
  if (listings.length) registerListings(listings, state.demoCity || state.prefs.destination);

  return fullText.replace(/<PREFERENCES>[\s\S]*?<\/PREFERENCES>/g,'').replace(/<LISTING>[\s\S]*?<\/LISTING>/g,'').trim();
}

function getApiKey() { return localStorage.getItem('sf_api_key') || null; }

// ── Register listings (map + compare state) ───────────────────────
function registerListings(listings, city) {
  state.currentListings = listings;
  state.compareList     = [];

  // Show map button
  $('map-toggle-btn').style.display = '';

  // Init / refresh map
  initMap(city || '', listings);

  // Show map automatically on first search
  if (!state.mapOpen) showMap();
}

// ================================================================
// EXPANDED DEMO MODE  (same city detection as Phase 1)
// ================================================================
const CITY_ALIASES = {
  'nyc':'New York City, NY','new york':'New York City, NY',
  'la':'Los Angeles, CA','los angeles':'Los Angeles, CA',
  'sf':'San Francisco, CA','san francisco':'San Francisco, CA',
  'miami':'Miami Beach, FL','miami beach':'Miami Beach, FL',
  'chicago':'Chicago, IL','portland':'Portland, OR',
  'denver':'Denver, CO','colorado':'Denver, CO',
  'austin':'Austin, TX','nashville':'Nashville, TN',
  'seattle':'Seattle, WA','boston':'Boston, MA',
  'new orleans':'New Orleans, LA',
  'las vegas':'Las Vegas, NV','vegas':'Las Vegas, NV',
  'hawaii':'Honolulu, HI','honolulu':'Honolulu, HI',
  'barcelona':'Barcelona, Spain','paris':'Paris, France',
  'london':'London, UK','tokyo':'Tokyo, Japan',
  'rome':'Rome, Italy','amsterdam':'Amsterdam, Netherlands',
};

const CITY_COORDS = {
  'Miami Beach, FL':    [-80.13, 25.79],
  'New York City, NY':  [-74.00, 40.71],
  'Los Angeles, CA':    [-118.24, 34.05],
  'San Francisco, CA':  [-122.42, 37.77],
  'Chicago, IL':        [-87.63, 41.88],
  'Portland, OR':       [-122.68, 45.52],
  'Denver, CO':         [-104.99, 39.74],
  'Austin, TX':         [-97.74, 30.27],
  'Nashville, TN':      [-86.78, 36.17],
  'Seattle, WA':        [-122.33, 47.61],
  'Las Vegas, NV':      [-115.14, 36.17],
  'Barcelona, Spain':   [2.17, 41.39],
  'Paris, France':      [2.35, 48.86],
  'London, UK':         [-0.12, 51.51],
  'Tokyo, Japan':       [139.69, 35.69],
};

function getCityCoords(city) {
  return CITY_COORDS[city] || [-74.00, 40.71];
}

function detectCity(msg) {
  const lower = msg.toLowerCase();
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  const match = lower.match(/\bin\s+([a-z\s]+?)(?:\s+for|\s+with|\s*[,\.!?]|$)/);
  if (match) { const c = match[1].trim(); if (c.length>2&&c.length<40) return c.charAt(0).toUpperCase()+c.slice(1); }
  return null;
}
function detectGuests(msg) {
  const numWords={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8};
  for(const [w,n] of Object.entries(numWords)) if(msg.toLowerCase().includes(w)) return n;
  const m=msg.match(/(\d+)\s*(?:guest|person|people|adult)/); return m?parseInt(m[1]):null;
}
function detectBudget(msg) {
  const lower=msg.toLowerCase();
  const m=lower.match(/\$?(\d+)(?:\s*[-–to]+\s*\$?(\d+))?/);
  if(m){const min=parseInt(m[1]);const max=m[2]?parseInt(m[2]):null;if(min>=30&&min<=2000)return{min,max:max||min+100};}
  if(lower.includes('cheap')||lower.includes('budget'))return{min:60,max:120};
  if(lower.includes('luxury')||lower.includes('splurge'))return{min:300,max:600};
  return null;
}
function detectType(msg) {
  const lower=msg.toLowerCase();
  if(lower.includes('airbnb')||lower.includes('rental')||lower.includes('house'))return'airbnb';
  if(lower.includes('hotel'))return'hotel';
  if(lower.includes('both')||lower.includes('either'))return'both';
  return null;
}
function detectAmenities(msg) {
  const lower=msg.toLowerCase(); const found=[];
  const map={pool:['pool'],kitchen:['kitchen','cook'],wifi:['wifi'],parking:['parking'],'pet-friendly':['pet','dog'],'hot tub':['hot tub','jacuzzi'],gym:['gym']};
  for(const [a,ks] of Object.entries(map)) if(ks.some(k=>lower.includes(k))) found.push(a);
  return found;
}

// Generate demo listings with proper lat/lng
function generateDemoListings(city, budget, type) {
  const coords = getCityCoords(city) || [-74, 40.71];
  const shortCity = (city||'the area').split(',')[0];
  const min  = budget?.min  || 100;
  const max  = budget?.max  || 200;
  const isAirbnb = !type || type === 'airbnb' || type === 'both';

  const spread = 0.02; // lat/lng jitter for markers

  return [
    { id:'l1', title:`${shortCity} ${isAirbnb?'Cozy Studio':'Boutique Hotel'} — Central`,
      location:`Downtown ${shortCity}`, lat:coords[1]+spread*0.2, lng:coords[0]-spread*0.3,
      price:Math.round(min*1.05), rating:4.91, reviews:184, type:isAirbnb?'airbnb':'hotel',
      amenities:['Wifi','Kitchen','AC'], tags:['Great location',isAirbnb?'Superhost':'Free breakfast'], tagColors:['gold','amber'] },
    { id:'l2', title:`${shortCity} Modern 1BR w/ Views`,
      location:`${shortCity} — near center`, lat:coords[1]-spread*0.3, lng:coords[0]+spread*0.4,
      price:Math.round((min+max)/2), rating:4.78, reviews:97, type:isAirbnb?'airbnb':'hotel',
      amenities:['Pool','AC','Washer'], tags:['City views','Quiet block'], tagColors:['gold','green'] },
    { id:'l3', title:`${shortCity} ${type==='hotel'?'Premium Hotel':'Spacious Apartment'}`,
      location:`Prime ${shortCity}`, lat:coords[1]+spread*0.5, lng:coords[0]+spread*0.1,
      price:Math.round(max*0.95), rating:4.95, reviews:312, type:type==='hotel'?'hotel':'airbnb',
      amenities:['Fast Wifi','Gym','Concierge'], tags:['Top rated','Most popular'], tagColors:['amber','gold'] },
  ];
}

function getCityBlurb(city) {
  const blurbs={'New York City':'One of the most exciting cities in the world.','Miami Beach':'Sun, sand, and incredible energy 🌴','Los Angeles':'Endless sunshine and so much to explore 🌅','San Francisco':'Stunning views everywhere 🌉','Chicago':'Amazing architecture, food, and lakefront 🌆','Paris':'La Ville Lumière — there is truly nowhere like it 🥐','London':'A world-class city with something for everyone 🇬🇧','Tokyo':'One of the most fascinating cities on earth 🗾'};
  return blurbs[city] || 'Sounds like a wonderful trip!';
}

async function simulateResponse(msg) {
  const city     = detectCity(msg);
  const guests   = detectGuests(msg);
  const budget   = detectBudget(msg);
  const type     = detectType(msg);
  const amenities = detectAmenities(msg);

  if (city)    state.demoCity = city;
  if (guests)  state.prefs.num_guests = guests;
  if (budget)  { state.prefs.budget_min=budget.min; state.prefs.budget_max=budget.max; }
  if (type)    state.prefs.accommodation_type = type;
  if (amenities.length) state.prefs.amenities = amenities;

  const currentCity   = state.demoCity;
  const currentGuests = state.prefs.num_guests;
  const currentBudget = state.prefs.budget_min ? {min:state.prefs.budget_min,max:state.prefs.budget_max} : null;
  const currentType   = state.prefs.accommodation_type;

  const prefJson = JSON.stringify({
    ...(currentCity   && {destination:currentCity}),
    ...(currentGuests && {num_guests:currentGuests}),
    ...(currentBudget && {budget_min:currentBudget.min,budget_max:currentBudget.max}),
    ...(currentType   && {accommodation_type:currentType}),
    ...(amenities.length && {amenities}),
  });
  if (Object.keys(JSON.parse(prefJson)).length > 0) setTimeout(()=>updatePreferences(prefJson), 200);

  if (!currentCity) return `Welcome to **StayFinder AI**! 🌍\n\nWhere are you headed? Tell me the destination and we'll find the perfect stay.`;

  const shortCity = currentCity.split(',')[0];
  if (!currentGuests) return `**${currentCity}** — great choice! ${getCityBlurb(shortCity)}\n\nHow many guests will be staying, and do you have travel dates in mind?`;
  if (!currentBudget) return `Perfect — **${currentGuests} guest${currentGuests>1?'s':''}** in ${shortCity}.\n\nWhat's your **budget per night**? Also, any preference for **Airbnb** vs **hotel**?`;
  if (!state.prefs._askedAmenities) {
    state.prefs._askedAmenities = true;
    return `$${currentBudget.min}–$${currentBudget.max}/night in ${shortCity} gives us solid options.\n\nAny must-haves? Pool, kitchen, parking, pet-friendly? Or say **"find me something"** and I'll search now!`;
  }

  // Show listings with search animation
  await new Promise(resolve => {
    showSearchProgress(shortCity);
    setTimeout(() => { removeSearchProgress(); resolve(); }, 3200);
  });

  const listings = generateDemoListings(currentCity, currentBudget, currentType);
  registerListings(listings, currentCity);

  const cardsHtml = listings.map(l => buildListingCard(l)).join('');
  return `Here are the top matches for your stay in **${shortCity}** 🏡\n\nSelect up to 3 listings to compare side-by-side, or open the map to see locations.\n\n${cardsHtml}`;
}

// ── Send message ─────────────────────────────────────────────────
async function sendMessage() {
  const input = $('chat-input');
  const text  = input.value.trim();
  if (!text || state.isTyping) return;

  input.value = ''; input.style.height = 'auto';
  state.isTyping = true; $('send-btn').disabled = true;
  addMessage('user', text);

  const hasEnough = state.demoCity && state.prefs.num_guests && state.prefs.budget_max;
  const apiKey    = getApiKey();

  if (apiKey) showSearchProgress(state.demoCity || '');
  else if (!hasEnough || !state.prefs._askedAmenities) {
    showTyping();
    await new Promise(r => setTimeout(r, 600+Math.random()*400));
    removeTyping();
  }

  try {
    const reply = await callClaude(text);
    removeTyping(); removeSearchProgress();
    const isHtml = reply.includes('listing-card') || reply.includes('<div');
    addMessage('assistant', reply, isHtml);
  } catch(err) {
    removeTyping(); removeSearchProgress();
    addMessage('assistant', `**Something went wrong:** ${err.message}\n\nCheck your API key or dismiss to use demo mode.`);
  }

  state.isTyping = false; $('send-btn').disabled = false; input.focus();
}

function quickSend(el) {
  $('chat-input').value = el.textContent.replace(/^[\u{1F300}-\u{1FFFF}\s]+/u,'').trim();
  sendMessage();
}

function triggerSearch() {
  const dest = state.demoCity || state.prefs.destination || 'my destination';
  $('chat-input').value = `Find me the best options in ${dest} based on everything we discussed`;
  sendMessage();
}

function resetChat() {
  if (!confirm('Start a new search?')) return;
  state.prefs = {}; state.conversationHistory = []; state.messageCount = 0;
  state.demoCity = null; state.currentListings = []; state.compareList = [];
  if (state.map) { state.map.remove(); state.map = null; }
  state.markers = []; hideMap();
  $('map-toggle-btn').style.display = 'none';
  const bar = $('compare-bar'); if(bar) bar.classList.remove('visible');

  messages.innerHTML = '';
  const welcome = document.createElement('div');
  welcome.className = 'welcome'; welcome.id = 'welcome-screen';
  welcome.innerHTML = `
    <div class="welcome-eyebrow">Powered by Claude AI</div>
    <div class="welcome-title">Find your perfect<br><em>place to stay</em></div>
    <div class="welcome-sub">Tell me where you're headed and I'll find the best Airbnbs and hotels — matched to your budget, style, and every preference.</div>
    <div class="quick-prompts">
      <div class="quick-prompt" onclick="quickSend(this)">🌴 Beach trip for 2 in Miami</div>
      <div class="quick-prompt" onclick="quickSend(this)">🏙️ NYC hotel under $200/night</div>
      <div class="quick-prompt" onclick="quickSend(this)">🐾 Pet-friendly Airbnb in Portland</div>
      <div class="quick-prompt" onclick="quickSend(this)">🎿 Ski cabin in Colorado, 6 guests</div>
      <div class="quick-prompt" onclick="quickSend(this)">🌆 Business trip to Chicago, near transit</div>
    </div>`;
  messages.appendChild(welcome);
  hide('pref-content'); show('pref-empty'); closeSidebar();
}

function handleKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }

// ── API Key setup ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const key = localStorage.getItem('sf_api_key');
  if (!key) {
    const notice = document.createElement('div');
    notice.style.cssText='position:fixed;bottom:80px;right:24px;background:var(--driftwood);border:1px solid rgba(200,151,42,0.3);border-radius:var(--radius);padding:14px 18px;z-index:100;max-width:290px;font-size:13px;color:var(--cream-dim);line-height:1.6;';
    notice.innerHTML=`
      <div style="font-weight:500;color:var(--gold-light);margin-bottom:6px;">Connect your API key</div>
      <div style="margin-bottom:10px;">Add your Anthropic key for live AI search. Demo mode works without one.</div>
      <input id="key-input" type="password" placeholder="sk-ant-..." style="width:100%;background:var(--bark);border:1px solid rgba(200,151,42,0.2);border-radius:6px;padding:7px 10px;color:var(--cream);font-family:var(--font-body);font-size:12px;outline:none;margin-bottom:8px;">
      <div style="display:flex;gap:8px;">
        <button onclick="saveKey()" style="flex:1;background:linear-gradient(135deg,var(--gold),var(--amber));border:none;color:var(--espresso);padding:7px;border-radius:6px;font-family:var(--font-body);font-size:12px;font-weight:500;cursor:pointer;">Save</button>
        <button onclick="this.closest('div[style]').remove()" style="background:none;border:1px solid rgba(200,151,42,0.2);color:var(--cream-dim);padding:7px 12px;border-radius:6px;font-family:var(--font-body);font-size:12px;cursor:pointer;">Demo</button>
      </div>`;
    document.body.appendChild(notice);
  }
});

function saveKey() {
  const val = $('key-input')?.value.trim();
  if (val) { localStorage.setItem('sf_api_key',val); document.querySelector('#key-input')?.closest('div[style]')?.remove(); }
}