// ---------------------------------------------------------------- // 
// This is your main JavaScript file // 
// ---------------------------------------------------------------- // 

// ── State ── // 
const state = {
  prefs: {},
  isTyping: false,
  messageCount: 0,
  apiKey: null,
  conversationHistory: [],
};

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

// ── DOM helpers ── // 
const $ = id => document.getElementById(id);
const messages = $('messages');

function show(id) { $(id).style.display = ''; }
function hide(id) { $(id).style.display = 'none'; }
function showFlex(id) { $(id).style.display = 'flex'; }

// ── Message rendering ── // 
function addMessage(role, content, isHtml = false) {
  const welcome = $('welcome-screen');
  if (welcome) welcome.remove();

  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  wrap.style.animationDelay = `${Math.min(state.messageCount * 0.05, 0.1)}s`;

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

// Format Text Function // 
function formatText(text) {

  // Remove preference blocks from display // 
  text = text.replace(/<PREFERENCES>[\s\S]*?<\/PREFERENCES>/g, '').trim();

  // Basic markdown-ish formatting // 
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  return `<p>${text}</p>`;
}
// Show Typing Function // 
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

// Remove Typing Function // 
function removeTyping() {
  const t = $('typing-indicator');
  if (t) t.remove();
}

// ── Preference sidebar ── // 
function updatePreferences(jsonStr) {
  let data;
  try { data = JSON.parse(jsonStr); } catch { return; }

  Object.assign(state.prefs, data);
  const p = state.prefs;

  hide('pref-empty');
  show('pref-content');

  // Progress calculation // 
  const fields = ['destination','num_guests','budget_max','check_in','accommodation_type','amenities','transportation_needs','activities'];
  const filled = fields.filter(f => p[f] && (Array.isArray(p[f]) ? p[f].length > 0 : true)).length;
  const pct = Math.round((filled / fields.length) * 100);
  $('progress-fill').style.width = pct + '%';
  $('progress-pct').textContent = pct + '%';
  $('progress-text').textContent = pct < 30 ? 'Just getting started' : pct < 60 ? 'Looking good' : pct < 85 ? 'Almost ready' : 'Ready to search!';
  show('sec-progress');
  show('div-0');

  if (p.destination) {
    $('pref-destination').textContent = p.destination;
    $('pref-destination').classList.remove('pending');
    show('sec-destination');
  }

  if (p.check_in || p.check_out) {
    const fmt = d => { if(!d) return '?'; const [y,m,dy] = d.split('-'); return `${m}/${dy}/${y.slice(2)}`; };
    $('pref-dates').textContent = `${fmt(p.check_in)} → ${fmt(p.check_out)}`;
    show('sec-dates');
  }

  if (p.num_guests) {
    let g = `${p.num_guests} guest${p.num_guests > 1 ? 's' : ''}`;
    if (p.num_adults || p.num_children) g += ` (${p.num_adults||0} adults, ${p.num_children||0} children)`;
    $('pref-guests').textContent = g;
    show('sec-guests');
  }

  show('div-1');

  if (p.budget_max || p.budget_min) {
    const cur = p.budget_currency || 'USD';
    const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$';
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
  if (p.pet_friendly) amenityList.push('pet-friendly');
  if (p.accessible) amenityList.push('accessible');
  if (amenityList.length) {
    renderTags('pref-amenities', amenityList, 'tag-green');
    show('sec-amenities');
  }

  show('div-3');

  // Show search button when we have enough // 
  if (p.destination && p.num_guests) {
    show('search-btn');
    $('api-notice').style.display = 'block';
  }
}

// Render Tag  // 
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

// ── API call ── // 
async function callClaude(userMessage) {
  state.conversationHistory.push({ role: 'user', content: userMessage });

  const apiKey = getApiKey();
  if (!apiKey) {
    // Demo mode — simulate responses
    return simulateResponse(userMessage);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'interleaved-thinking-2025-05-14'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: state.conversationHistory,
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }
  
  const data = await response.json();
  const fullText = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  state.conversationHistory.push({ role: 'assistant', content: fullText });
  extractPreferences(fullText);
  return fullText.replace(/<PREFERENCES>[\s\S]*?<\/PREFERENCES>/g, '').trim();
}

function getApiKey() {
  // Check localStorage for saved key
  return localStorage.getItem('sf_api_key') || null;
}

// ── Demo simulation ────────────────────────────────────────────────────────
function simulateResponse(msg) {
  const m = msg.toLowerCase();

  if (m.includes('miami') || m.includes('beach')) {
    setTimeout(() => updatePreferences('{"destination":"Miami Beach, FL","accommodation_type":"airbnb"}'), 300);
    return Promise.resolve(`Welcome! **Miami Beach** is a wonderful choice — sun, sand, and incredible energy 🌴

I'd love to help you find the perfect spot. A couple of quick questions to get started:

**When are you planning to visit?** And how many guests will be staying?`);
  }

  if (m.includes('2') || m.includes('two') || m.includes('guests')) {
    setTimeout(() => updatePreferences('{"destination":"Miami Beach, FL","num_guests":2,"num_adults":2,"accommodation_type":"airbnb"}'), 300);
    return Promise.resolve(`Perfect — 2 guests in Miami Beach. 

What's your **budget per night**? And do you have dates in mind, or are you still flexible?`);
  }

  if (m.includes('$') || m.includes('budget') || m.includes('150') || m.includes('200')) {
    setTimeout(() => updatePreferences('{"destination":"Miami Beach, FL","num_guests":2,"num_adults":2,"budget_min":130,"budget_max":220,"accommodation_type":"airbnb","amenities":["pool","wifi"],"activities":["beach","nightlife"],"transportation_needs":"walkable"}'), 500);
    return Promise.resolve(`Great budget — that gives us solid options in South Beach and Mid-Beach. 

Any **must-haves** I should filter for? For example: pool, full kitchen, walkable to the beach, pet-friendly? And what's the vibe — more quiet & relaxing, or lively with easy nightlife access?`);
  }

  if (m.includes('pool') || m.includes('kitchen') || m.includes('walk') || m.includes('night')) {
    setTimeout(() => updatePreferences('{"destination":"Miami Beach, FL","num_guests":2,"num_adults":2,"budget_min":130,"budget_max":220,"accommodation_type":"airbnb","amenities":["pool","wifi","full kitchen","AC"],"activities":["beach","nightlife","restaurants"],"transportation_needs":"walkable to beach","vibe":"lively"}'), 400);
    const listingsHtml = `
I'm searching now… here are top matches for your stay in Miami Beach 🏖️

<div class="listing-card">
  <div class="listing-card-header">
    <div class="listing-title">Luxe South Beach Studio w/ Pool</div>
    <div class="listing-price">$162 <span>/ night</span></div>
  </div>
  <div class="listing-location">📍 South Beach · 2 min walk to Ocean Drive</div>
  <div class="listing-rating">★★★★★ 4.94 · 203 reviews</div>
  <div class="listing-tags">
    <span class="tag tag-green">Pool</span>
    <span class="tag tag-green">Full kitchen</span>
    <span class="tag tag-green">AC</span>
    <span class="tag tag-gold">Nightlife nearby</span>
    <span class="tag tag-amber">Superhost</span>
  </div>
</div>

<div class="listing-card">
  <div class="listing-card-header">
    <div class="listing-title">Mid-Beach Modern 1BR Retreat</div>
    <div class="listing-price">$189 <span>/ night</span></div>
  </div>
  <div class="listing-location">📍 Mid-Beach · 5 min walk to beach</div>
  <div class="listing-rating">★★★★★ 4.88 · 147 reviews</div>
  <div class="listing-tags">
    <span class="tag tag-green">Rooftop pool</span>
    <span class="tag tag-green">Gym</span>
    <span class="tag tag-gold">Quiet block</span>
    <span class="tag tag-amber">Free parking</span>
  </div>
</div>

<div class="listing-card">
  <div class="listing-card-header">
    <div class="listing-title">Collins Ave Condo, Ocean Views</div>
    <div class="listing-price">$214 <span>/ night</span></div>
  </div>
  <div class="listing-location">📍 Collins Ave · Ocean front, 10th floor</div>
  <div class="listing-rating">★★★★☆ 4.76 · 89 reviews</div>
  <div class="listing-tags">
    <span class="tag tag-green">Ocean view</span>
    <span class="tag tag-green">Pool</span>
    <span class="tag tag-gold">Steps to beach</span>
  </div>
</div>

Want me to look up more details on any of these, filter by different dates, or search for hotels instead?`;
    return Promise.resolve(listingsHtml);
  }

  // Default //
  return Promise.resolve(`Tell me more about your trip — where are you thinking of going, and when? I can help you find the perfect Airbnb or hotel once I know a bit more about what you're after. 😊`);
}

// ── Send message ── // 
async function sendMessage() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text || state.isTyping) return;

  input.value = '';
  input.style.height = 'auto';
  state.isTyping = true;
  $('send-btn').disabled = true;

  addMessage('user', text);
  showTyping();

  try {
    const reply = await callClaude(text);
    removeTyping();
    const isListing = reply.includes('listing-card');
    addMessage('assistant', reply, isListing);
  } 
  catch (err) {
    removeTyping();
    addMessage('assistant', `**Something went wrong:** ${err.message}\n\nMake sure your API key is set correctly, or use demo mode by dismissing the key prompt.`);
  }

  state.isTyping = false;
  $('send-btn').disabled = false;
  input.focus();
}

function quickSend(el) {
  $('chat-input').value = el.textContent.slice(2); // strip emoji
  sendMessage();
}

function triggerSearch() {
  const dest = state.prefs.destination || 'my destination';
  $('chat-input').value = `Please search for the best options now based on all my preferences for ${dest}`;
  sendMessage();
}

function resetChat() {
  if (!confirm('Start a new search?')) return;
  state.prefs = {};
  state.conversationHistory = [];
  state.messageCount = 0;
  messages.innerHTML = '';

  const welcome = document.createElement('div');
  welcome.className = 'welcome';
  welcome.id = 'welcome-screen';
  welcome.innerHTML = `
    <div class="welcome-eyebrow">Powered by Claude AI</div>
    <div class="welcome-title">Find your perfect<br><em>place to stay</em></div>
    <div class="welcome-sub">Tell me where you're headed and I'll find the best Airbnbs and hotels — matched to your budget, style, and every preference.</div>
    <div class="quick-prompts">
      <div class="quick-prompt" onclick="quickSend(this)">🌴 Beach trip for 2 in Miami</div>
      <div class="quick-prompt" onclick="quickSend(this)">🏙️ NYC hotel under $200/night</div>
      <div class="quick-prompt" onclick="quickSend(this)">🐾 Pet-friendly Airbnb in Portland</div>
      <div class="quick-prompt" onclick="quickSend(this)">🎿 Ski cabin in Colorado, 6 guests</div>
    </div>`;
  messages.appendChild(welcome);

  hide('pref-content');
  show('pref-empty');
}

// ── Keyboard & resize ── // 
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// Resize function //
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

//  API Key setup  //
window.addEventListener('DOMContentLoaded', () => {
  const key = localStorage.getItem('sf_api_key');
  if (!key) {
    // Prompt for API key (optional — demo works without) //
    const notice = document.createElement('div');
    notice.style.cssText = 'position:fixed;bottom:80px;right:24px;background:var(--driftwood);border:1px solid rgba(200,151,42,0.3);border-radius:var(--radius);padding:14px 18px;z-index:100;max-width:300px;font-size:13px;color:var(--cream-dim);line-height:1.6;';
    notice.innerHTML = `
      <div style="font-weight:500;color:var(--gold-light);margin-bottom:6px;">Connect your API key</div>
      <div style="margin-bottom:10px;">Add your Anthropic key for live AI search. <br>Otherwise, demo mode is active.</div>
      <input id="key-input" type="password" placeholder="sk-ant-..." style="width:100%;background:var(--bark);border:1px solid rgba(200,151,42,0.2);border-radius:6px;padding:7px 10px;color:var(--cream);font-family:var(--font-body);font-size:12px;outline:none;margin-bottom:8px;">
      <div style="display:flex;gap:8px;">
        <button onclick="saveKey()" style="flex:1;background:linear-gradient(135deg,var(--gold),var(--amber));border:none;color:var(--espresso);padding:7px;border-radius:6px;font-family:var(--font-body);font-size:12px;font-weight:500;cursor:pointer;">Save</button>
        <button onclick="this.closest('div[style]').remove()" style="background:none;border:1px solid rgba(200,151,42,0.2);color:var(--cream-dim);padding:7px 12px;border-radius:6px;font-family:var(--font-body);font-size:12px;cursor:pointer;">Demo</button>
      </div>`;
    document.body.appendChild(notice);
  }
});

/* Save Key function */
function saveKey() {
  const val = $('key-input').value.trim();
  if (val) {
    localStorage.setItem('sf_api_key', val);
    document.querySelector('[id="key-input"]')?.closest('div[style]')?.remove();
  }
}