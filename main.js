
// ================================================================
// StayFinder AI — main.js
// ================================================================

// ── State ──────────────────────────────────────────────────────
const state = {
  prefs: {},
  isTyping: false,
  messageCount: 0,
  conversationHistory: [],
  demoStep: 0,        // tracks where we are in demo conversation
  demoCity: null,     // detected city in demo mode
};

// ── System prompt ───────────────────────────────────────────────
const SYSTEM_PROMPT = `You are StayFinder AI — a warm, expert travel assistant that helps users find the perfect Airbnb space or hotel. Your job is twofold:

1. Gather preferences through natural, conversational questions
2. Search and recommend real accommodations using web search

Conversation Flow:
Start warmly and ask for destination + travel dates. Then progressively collect:
- Number of guests (adults, children)
- Budget per night (min/max)
- Accommodation preference: Airbnb / hotel / both
- Transportation needs (public transit, walkable, need parking)
- Nearby activities or areas of interest
- Must-have amenities (wifi, pool, kitchen, AC, washer, pet-friendly, accessible)
- Vibe preference (quiet, lively, family-friendly, romantic)

Ask 1-2 questions per turn naturally. Once you have destination + guests + budget, start searching.

Searching: When you have enough info, use web search to find real current listings.

Presenting Results: Show 3-5 options with name, location, price, rating, highlights, transport info, and booking links.

After each message, include a JSON block like this EXACTLY (it updates the UI sidebar):
<PREFERENCES>
{"destination":"Miami Beach, FL","num_guests":2,"budget_min":120,"budget_max":220,"check_in":"2025-07-04","check_out":"2025-07-09","accommodation_type":"airbnb","amenities":["pool","wifi"],"transportation_needs":"walkable","activities":["beach","nightlife"],"pet_friendly":false}
</PREFERENCES>

Only include fields explicitly mentioned. Omit null/empty fields. Keep the JSON on one line.`;

// ── DOM helpers ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const messages = $('messages');

function show(id)     { $(id).style.display = ''; }
function hide(id)     { $(id).style.display = 'none'; }

// ── Mobile sidebar ───────────────────────────────────────────────
function openSidebar() {
  $('sidebar').classList.add('open');
  $('sidebar-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  $('sidebar').classList.remove('open');
  $('sidebar-overlay').classList.remove('active');
  document.body.style.overflow = '';
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
  else bubble.innerHTML = formatText(content);

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
  state.messageCount++;
  return bubble;
}

// Text Formatter Function // 
function formatText(text) {
  text = text.replace(/<PREFERENCES>[\s\S]*?<\/PREFERENCES>/g, '').trim();
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  return `<p>${text}</p>`;
}

// ── Typing indicator ─────────────────────────────────────────────
function showTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.id = 'typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-ai';
  avatar.textContent = '✦';

  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.innerHTML = '<span></span><span></span><span></span>';

  wrap.appendChild(avatar);
  wrap.appendChild(typing);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
}

function removeTyping() {
  const t = $('typing-indicator');
  if (t) t.remove();
}

// ── Animated search progress indicator ──────────────────────────
const SEARCH_STEPS = [
  'Reading your preferences',
  'Scanning listings',
  'Comparing prices',
  'Checking availability',
  'Ranking best matches',
];

function showSearchProgress(city) {
  removeTyping();

  const wrap = document.createElement('div');
  wrap.className = 'message assistant';
  wrap.id = 'search-progress-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'avatar avatar-ai';
  avatar.textContent = '✦';

  const box = document.createElement('div');
  box.className = 'search-progress';
  box.innerHTML = `
    <div class="search-progress-label">Searching ${city ? `in ${city}` : 'for stays'}…</div>
    <div class="search-steps" id="search-steps-list">
      ${SEARCH_STEPS.map((s, i) => `
        <div class="search-step" id="sstep-${i}">
          <span class="step-dot"></span>
          <span class="step-check">✓</span>
          ${s}
        </div>`).join('')}
    </div>`;

  wrap.appendChild(avatar);
  wrap.appendChild(box);
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;

  // Animate steps progressing
  let current = 0;
  const interval = setInterval(() => {
    const prev = document.getElementById(`sstep-${current - 1}`);
    const cur  = document.getElementById(`sstep-${current}`);
    if (prev) prev.className = 'search-step done';
    if (cur)  cur.className  = 'search-step active';
    current++;
    if (current > SEARCH_STEPS.length) clearInterval(interval);
  }, 600);

  // Store interval so we can clear it when done
  wrap._interval = interval;
  return wrap;
}

function removeSearchProgress() {
  const el = $('search-progress-indicator');
  if (el) {
    if (el._interval) clearInterval(el._interval);
    el.remove();
  }
}

// ── Preference sidebar ───────────────────────────────────────────
function updatePreferences(jsonStr) {
  let data;
  try { data = JSON.parse(jsonStr); } catch { return; }

  Object.assign(state.prefs, data);
  const p = state.prefs;

  hide('pref-empty');
  show('pref-content');

  // Progress
  const fields = ['destination','num_guests','budget_max','check_in','accommodation_type','amenities','transportation_needs','activities'];
  const filled = fields.filter(f => p[f] && (Array.isArray(p[f]) ? p[f].length > 0 : true)).length;
  const pct = Math.round((filled / fields.length) * 100);
  $('progress-fill').style.width = pct + '%';
  $('progress-pct').textContent = pct + '%';
  $('progress-text').textContent =
    pct < 25 ? 'Just getting started' :
    pct < 55 ? 'Looking good' :
    pct < 80 ? 'Almost ready' : 'Ready to search!';
  show('sec-progress');
  show('div-0');

  if (p.destination) {
    $('pref-destination').textContent = p.destination;
    $('pref-destination').classList.remove('pending');
    show('sec-destination');
  }

  if (p.check_in || p.check_out) {
    const fmt = d => {
      if (!d) return '?';
      const [y, m, dy] = d.split('-');
      return `${m}/${dy}/${y.slice(2)}`;
    };
    $('pref-dates').textContent = `${fmt(p.check_in)} → ${fmt(p.check_out)}`;
    show('sec-dates');
  }

  if (p.num_guests) {
    let g = `${p.num_guests} guest${p.num_guests > 1 ? 's' : ''}`;
    if (p.num_adults || p.num_children)
      g += ` (${p.num_adults || 0} adults, ${p.num_children || 0} children)`;
    $('pref-guests').textContent = g;
    show('sec-guests');
  }

  show('div-1');

  if (p.budget_max || p.budget_min) {
    const cur = p.budget_currency || 'USD';
    const sym = cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$';
    let html = '';
    if (p.budget_min) html += `<span>${sym}${p.budget_min}</span><span class="sep">–</span>`;
    html += `<span>${sym}${p.budget_max || p.budget_min}</span>`;
    $('pref-budget').innerHTML = html;
    show('sec-budget');
  }

  if (p.accommodation_type) {
    const labels = { airbnb: '🏠 Airbnb', hotel: '🏨 Hotel', both: '🏠🏨 Both' };
    $('pref-type').textContent = labels[p.accommodation_type] || p.accommodation_type;
    show('sec-type');
  }

  show('div-2');

  if (p.transportation_needs) {
    $('pref-transport').textContent = p.transportation_needs;
    show('sec-transport');
  }

  if (p.activities && p.activities.length) {
    renderTags('pref-activities', p.activities, 'tag-gold');
    show('sec-activities');
  }

  const amenityList = [...(p.amenities || [])];
  if (p.pet_friendly)  amenityList.push('pet-friendly');
  if (p.accessible)    amenityList.push('accessible');
  if (amenityList.length) {
    renderTags('pref-amenities', amenityList, 'tag-green');
    show('sec-amenities');
  }

  show('div-3');

  if (p.destination && p.num_guests) {
    show('search-btn');
    $('api-notice').style.display = 'block';
  }
}

function renderTags(containerId, items, cls) {
  const el = $(containerId);
  el.innerHTML = '';
  items.forEach((item, i) => {
    const tag = document.createElement('span');
    tag.className = `tag ${cls} pref-tag`;
    tag.style.animationDelay = `${i * 0.05}s`;
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
  const fullText = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  state.conversationHistory.push({ role: 'assistant', content: fullText });
  extractPreferences(fullText);
  return fullText.replace(/<PREFERENCES>[\s\S]*?<\/PREFERENCES>/g, '').trim();
}

function getApiKey() {
  return localStorage.getItem('sf_api_key') || null;
}

// ================================================================
// EXPANDED DEMO MODE
// Handles any city, multiple conversation turns, varied listings
// ================================================================

// Well-known city nicknames → canonical names
const CITY_ALIASES = {
  'nyc': 'New York City, NY', 'new york': 'New York City, NY',
  'la': 'Los Angeles, CA', 'los angeles': 'Los Angeles, CA',
  'sf': 'San Francisco, CA', 'san francisco': 'San Francisco, CA',
  'miami': 'Miami Beach, FL', 'miami beach': 'Miami Beach, FL',
  'chicago': 'Chicago, IL',
  'portland': 'Portland, OR',
  'denver': 'Denver, CO', 'colorado': 'Denver, CO',
  'austin': 'Austin, TX',
  'nashville': 'Nashville, TN',
  'seattle': 'Seattle, WA',
  'boston': 'Boston, MA',
  'new orleans': 'New Orleans, LA',
  'las vegas': 'Las Vegas, NV', 'vegas': 'Las Vegas, NV',
  'hawaii': 'Honolulu, HI', 'honolulu': 'Honolulu, HI',
  'barcelona': 'Barcelona, Spain',
  'paris': 'Paris, France',
  'london': 'London, UK',
  'tokyo': 'Tokyo, Japan',
  'rome': 'Rome, Italy',
  'amsterdam': 'Amsterdam, Netherlands',
};

// Generic neighborhood descriptions per vibe
const NEIGHBORHOOD_VIBES = {
  beach:    ['beachfront', 'steps from the sand', 'oceanfront block'],
  city:     ['downtown', 'walking distance to major sights', 'central district'],
  ski:      ['ski-in/ski-out', 'mountain views', 'near the slopes'],
  cultural: ['arts district', 'walkable to galleries and museums', 'historic center'],
};

function detectCity(msg) {
  const lower = msg.toLowerCase();
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias)) return canonical;
  }
  // Generic fallback: look for "in [Word]" pattern
  const match = lower.match(/\bin\s+([a-z\s]+?)(?:\s+for|\s+with|\s*[,\.!?]|$)/);
  if (match) {
    const candidate = match[1].trim();
    if (candidate.length > 2 && candidate.length < 40) {
      return candidate.charAt(0).toUpperCase() + candidate.slice(1);
    }
  }
  return null;
}

function detectGuests(msg) {
  const lower = msg.toLowerCase();
  const numWords = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8 };
  for (const [word, num] of Object.entries(numWords)) {
    if (lower.includes(word)) return num;
  }
  const match = lower.match(/(\d+)\s*(?:guest|person|people|adult)/);
  return match ? parseInt(match[1]) : null;
}

function detectBudget(msg) {
  const lower = msg.toLowerCase();
  const match = lower.match(/\$?(\d+)(?:\s*[-–to]+\s*\$?(\d+))?/);
  if (match) {
    const min = parseInt(match[1]);
    const max = match[2] ? parseInt(match[2]) : null;
    if (min >= 30 && min <= 2000) return { min, max: max || min + 100 };
  }
  if (lower.includes('cheap') || lower.includes('budget'))  return { min: 60,  max: 120  };
  if (lower.includes('luxury') || lower.includes('splurge')) return { min: 300, max: 600 };
  if (lower.includes('mid'))                                 return { min: 120, max: 220 };
  return null;
}

function detectType(msg) {
  const lower = msg.toLowerCase();
  if (lower.includes('airbnb') || lower.includes('rental') || lower.includes('house') || lower.includes('apartment')) return 'airbnb';
  if (lower.includes('hotel'))  return 'hotel';
  if (lower.includes('both') || lower.includes('either')) return 'both';
  return null;
}

function detectAmenities(msg) {
  const lower = msg.toLowerCase();
  const found = [];
  const map = {
    pool: ['pool'], kitchen: ['kitchen', 'cook'], wifi: ['wifi', 'internet'],
    parking: ['parking', 'car'], gym: ['gym', 'fitness'], washer: ['washer', 'laundry'],
    'pet-friendly': ['pet', 'dog', 'cat'], ac: ['ac', 'air con'], balcony: ['balcony', 'patio'],
    accessible: ['accessible', 'wheelchair'], 'hot tub': ['hot tub', 'jacuzzi'],
  };
  for (const [amenity, keywords] of Object.entries(map)) {
    if (keywords.some(k => lower.includes(k))) found.push(amenity);
  }
  return found;
}

function generateListings(city, budget, type) {
  const shortCity = city ? city.split(',')[0] : 'the area';
  const min  = budget?.min  || 100;
  const max  = budget?.max  || 200;
  const mid  = Math.round((min + max) / 2);
  const high = Math.round(max * 0.95);
  const low  = Math.round(min * 1.05);

  const isAirbnb = !type || type === 'airbnb' || type === 'both';
  const isHotel  = type === 'hotel' || type === 'both';

  const listing1Type = isAirbnb ? 'airbnb' : 'hotel';
  const listing3Type = isHotel  ? 'hotel'  : 'airbnb';

  return `
<div class="listing-card">
  <div class="listing-card-header">
    <div class="listing-title">${shortCity} ${isAirbnb ? 'Cozy Studio' : 'Boutique Hotel'} — Central</div>
    <div class="listing-price">$${low} <span>/ night</span></div>
  </div>
  <div class="listing-location">📍 Downtown ${shortCity} · Walkable to top attractions</div>
  <div class="listing-rating">★★★★★ 4.91 · 184 reviews</div>
  <div class="listing-tags">
    <span class="tag tag-green">Wifi</span>
    <span class="tag tag-green">Kitchen</span>
    <span class="tag tag-gold">Great location</span>
    <span class="tag tag-amber">${isAirbnb ? 'Superhost' : 'Free breakfast'}</span>
  </div>
</div>

<div class="listing-card">
  <div class="listing-card-header">
    <div class="listing-title">${shortCity} ${isAirbnb ? 'Modern 1BR w/ Views' : 'Design Hotel'}</div>
    <div class="listing-price">$${mid} <span>/ night</span></div>
  </div>
  <div class="listing-location">📍 ${shortCity} — quiet neighborhood, 10 min to center</div>
  <div class="listing-rating">★★★★☆ 4.78 · 97 reviews</div>
  <div class="listing-tags">
    <span class="tag tag-green">Pool</span>
    <span class="tag tag-green">AC</span>
    <span class="tag tag-gold">City views</span>
  </div>
</div>

<div class="listing-card">
  <div class="listing-card-header">
    <div class="listing-title">${shortCity} ${listing3Type === 'hotel' ? 'Premium Hotel' : 'Spacious Apartment'}</div>
    <div class="listing-price">$${high} <span>/ night</span></div>
  </div>
  <div class="listing-location">📍 Prime ${shortCity} location · Near transit</div>
  <div class="listing-rating">★★★★★ 4.95 · 312 reviews</div>
  <div class="listing-tags">
    <span class="tag tag-green">Top rated</span>
    <span class="tag tag-green">Fast wifi</span>
    <span class="tag tag-amber">Most popular</span>
  </div>
</div>

<p style="margin-top:14px; font-size:13px; color:var(--cream-dim);">Want me to filter by specific dates, amenities, or a different part of ${shortCity}?</p>`;
}

// Core demo response logic — handles any city and multi-turn flow
async function simulateResponse(msg) {
  const lower = msg.toLowerCase();

  // Detect what the user provided
  const city    = detectCity(msg);
  const guests  = detectGuests(msg);
  const budget  = detectBudget(msg);
  const type    = detectType(msg);
  const amenities = detectAmenities(msg);

  // Update state with anything new
  if (city)    state.demoCity = city;
  if (guests)  state.prefs.num_guests = guests;
  if (budget)  { state.prefs.budget_min = budget.min; state.prefs.budget_max = budget.max; }
  if (type)    state.prefs.accommodation_type = type;
  if (amenities.length) state.prefs.amenities = amenities;

  const currentCity   = state.demoCity;
  const currentGuests = state.prefs.num_guests;
  const currentBudget = state.prefs.budget_min ? { min: state.prefs.budget_min, max: state.prefs.budget_max } : null;
  const currentType   = state.prefs.accommodation_type;

  // Build the preference JSON for sidebar
  const prefJson = JSON.stringify({
    ...(currentCity   && { destination: currentCity }),
    ...(currentGuests && { num_guests: currentGuests }),
    ...(currentBudget && { budget_min: currentBudget.min, budget_max: currentBudget.max }),
    ...(currentType   && { accommodation_type: currentType }),
    ...(amenities.length && { amenities }),
  });
  if (Object.keys(JSON.parse(prefJson)).length > 0) {
    setTimeout(() => updatePreferences(prefJson), 200);
  }

  // ── Step 0: No city yet — ask for it ──────────────────────────
  if (!currentCity) {
    return `Welcome to **StayFinder AI**! 🌍

I'm here to find you the perfect place to stay — Airbnb, hotel, or both.

Where are you headed? Just tell me the city or destination and we'll get started.`;
  }

  const shortCity = currentCity.split(',')[0];

  // ── Step 1: Have city, need guests ────────────────────────────
  if (!currentGuests) {
    return `**${currentCity}** — great choice! ${getCityBlurb(shortCity)}

How many guests will be staying? And do you have travel dates in mind?`;
  }

  // ── Step 2: Have city + guests, need budget ───────────────────
  if (!currentBudget) {
    return `Perfect — **${currentGuests} guest${currentGuests > 1 ? 's' : ''}** in ${shortCity}.

What's your **budget per night**? Even a rough range helps — for example "$100–200" or "under $150". 

Also, any preference between **Airbnb** or **hotel**?`;
  }

  // ── Step 3: Have city + guests + budget — ask about amenities ─
  if (!state.prefs._askedAmenities) {
    state.prefs._askedAmenities = true;
    return `Great — **$${currentBudget.min}–$${currentBudget.max}/night** in ${shortCity} gives us solid options.

Any **must-haves** I should filter for? For example:
- Pool, full kitchen, fast wifi
- Walkable to transit or a specific area
- Pet-friendly, accessible, parking

Or just say **"find me something"** and I'll pick the best matches now!`;
  }

  // ── Step 4: Enough info — show listings with search animation ─
  await new Promise(resolve => {
    const progress = showSearchProgress(shortCity);
    setTimeout(() => {
      removeSearchProgress();
      resolve();
    }, 3500);
  });

  const listingsHtml = `Here are the top matches for your stay in **${shortCity}** 🏡

${generateListings(currentCity, currentBudget, currentType)}`;

  return listingsHtml;
}

// Short city flavor text for step 1 response
function getCityBlurb(city) {
  const blurbs = {
    'New York City': "You're in for an incredible trip — one of the most exciting cities in the world.",
    'Miami Beach':   "Sun, sand, and incredible energy — you chose well 🌴",
    'Los Angeles':   "Great pick — endless sunshine and so much to explore 🌅",
    'San Francisco': "One of the most beautiful cities in the country — stunning views everywhere 🌉",
    'Chicago':       "An underrated gem — amazing architecture, food, and lakefront 🌆",
    'Portland':      "Such a unique, walkable city — great food and coffee scene ☕",
    'Austin':        "Live music, amazing BBQ, and a fantastic vibe — great choice 🎸",
    'Nashville':     "Music City! You're going to love it 🎵",
    'Las Vegas':     "Vegas, baby! Endless options at every budget 🎰",
    'Paris':         "La Ville Lumière — there's truly nowhere like it 🥐",
    'London':        "A world-class city with something for everyone 🇬🇧",
    'Tokyo':         "One of the most fascinating cities on earth 🗾",
    'Barcelona':     "Architecture, beaches, and incredible food — perfect destination 🌊",
  };
  return blurbs[city] || "Sounds like a wonderful trip!";
}

// ── Send message ─────────────────────────────────────────────────
async function sendMessage() {
  const input  = $('chat-input');
  const text   = input.value.trim();
  if (!text || state.isTyping) return;

  input.value = '';
  input.style.height = 'auto';
  state.isTyping  = true;
  $('send-btn').disabled = true;

  addMessage('user', text);

  // Show typing briefly, then search progress if we have enough info
  const hasEnough = state.demoCity && state.prefs.num_guests && state.prefs.budget_max;
  const apiKey    = getApiKey();

  if (!apiKey) {
    // Demo: show search progress only when we're about to show listings
    if (hasEnough && state.prefs._askedAmenities) {
      // simulateResponse will handle the progress animation itself
    } else {
      showTyping();
      await new Promise(r => setTimeout(r, 700 + Math.random() * 500));
      removeTyping();
    }
  } else {
    showSearchProgress(state.demoCity || 'your destination');
  }

  try {
    const reply = await callClaude(text);
    removeTyping();
    removeSearchProgress();
    const isHtml = reply.includes('listing-card') || reply.includes('<div');
    addMessage('assistant', reply, isHtml);
  } catch (err) {
    removeTyping();
    removeSearchProgress();
    addMessage('assistant',
      `**Something went wrong:** ${err.message}\n\nCheck your API key or click Demo mode to explore without one.`
    );
  }

  state.isTyping        = false;
  $('send-btn').disabled = false;
  input.focus();
}

function quickSend(el) {
  $('chat-input').value = el.textContent.replace(/^[\u{1F300}-\u{1FFFF}\s]+/u, '').trim();
  sendMessage();
}

function triggerSearch() {
  const dest = state.demoCity || state.prefs.destination || 'my destination';
  $('chat-input').value = `Find me the best options in ${dest} based on everything we've discussed`;
  sendMessage();
}

function resetChat() {
  if (!confirm('Start a new search?')) return;
  state.prefs             = {};
  state.conversationHistory = [];
  state.messageCount      = 0;
  state.demoStep          = 0;
  state.demoCity          = null;

  messages.innerHTML = '';

  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.id        = 'welcome-screen';
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

  hide('pref-content');
  show('pref-empty');
  closeSidebar();
}

// ── Keyboard & textarea resize ────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── API Key setup ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const key = localStorage.getItem('sf_api_key');
  if (!key) {
    const notice = document.createElement('div');
    notice.style.cssText = 'position:fixed;bottom:80px;right:24px;background:var(--driftwood);border:1px solid rgba(200,151,42,0.3);border-radius:var(--radius);padding:14px 18px;z-index:100;max-width:290px;font-size:13px;color:var(--cream-dim);line-height:1.6;';
    notice.innerHTML = `
      <div style="font-weight:500;color:var(--gold-light);margin-bottom:6px;">Connect your API key</div>
      <div style="margin-bottom:10px;">Add your Anthropic key for live AI search. Demo mode is active without one.</div>
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
  if (val) {
    localStorage.setItem('sf_api_key', val);
    document.querySelector('#key-input')?.closest('div[style]')?.remove();
  }
}