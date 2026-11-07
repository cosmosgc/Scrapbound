import { Economy, items, upgrades } from './economy.js';
import { FactoryScene } from './factory3d.js';
import { createAppRouter } from './router.js';
import './style.css';
import './community.css';

const economy = new Economy();
const scene = new FactoryScene(document.getElementById('factory-scene'));
const $ = id => document.getElementById(id);
const compact = n => Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: n >= 1000 ? 1 : 0 }).format(Math.floor(n));
let missionBusy = false;
let brainLoaded = false;
let toastTimer;
let account = null;
let csrfToken = null;
let authMode = 'login';
let communityPosts = [];

function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
document.addEventListener('scrapbound-toast', event => toast(event.detail));

async function apiRequest(action, method = 'GET', data = null) {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api.php?action=${encodeURIComponent(action)}`, {
      method, credentials: 'same-origin',
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
      body: data ? JSON.stringify(data) : undefined,
    });
    const result = await response.json();
    return { ...result, httpStatus: response.status };
  } catch { return { ok: false, error: 'Cannot reach the Scrapbound server. Check Nginx/PHP and try again.' }; }
}

function setAuthMessage(message, isError = true) {
  const el = $('auth-message'); el.textContent = message; el.classList.toggle('error', isError);
}
function showAuth(mode = 'login') {
  authMode = mode;
  $('auth-title').textContent = mode === 'login' ? 'Join the crew.' : 'Create your callsign.';
  $('auth-submit').innerHTML = mode === 'login' ? 'Sign in <span>→</span>' : 'Create account <span>→</span>';
  $('auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('auth-mode').textContent = mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in';
  setAuthMessage(''); $('auth-overlay').classList.remove('hidden'); $('auth-username').focus();
}
function updateAuthUI() {
  $('auth-button').textContent = account ? `⌁ ${account.username}` : 'Sign in';
  $('community-compose').classList.toggle('hidden', !account);
  $('community-readonly').textContent = account ? 'A shared board for friendly requests, fair trades, and cooperative plans.' : 'Sign in to post, reply, offer help, or join a collaboration. You can browse the board without an account.';
  renderCommunity();
}
async function refreshAuth() {
  const status = await apiRequest('status');
  if (status.ok) { account = status.player || null; csrfToken = status.csrf; updateAuthUI(); }
  else {
    $('community-readonly').textContent = status.error || 'Community service unavailable.';
    $('community-feed').innerHTML = '<div class="panel community-notice">Community features need the PHP API and Scrapbound database. See README setup.</div>';
  }
}

$('auth-button').addEventListener('click', async () => {
  if (!account) { if (!csrfToken) await refreshAuth(); if (csrfToken) showAuth(); else toast('The account server is not configured yet.'); return; }
  if (!window.confirm(`Sign out as ${account.username}?`)) return;
  const result = await apiRequest('logout', 'POST', {});
  if (!result.ok) { toast(result.error || 'Could not sign out.'); return; }
  account = null; csrfToken = null; await refreshAuth(); toast('Signed out.');
});
$('auth-close').addEventListener('click', () => $('auth-overlay').classList.add('hidden'));
$('auth-overlay').addEventListener('click', event => { if (event.target === $('auth-overlay')) $('auth-overlay').classList.add('hidden'); });
$('auth-mode').addEventListener('click', () => showAuth(authMode === 'login' ? 'register' : 'login'));
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('auth-submit'); submit.disabled = true; setAuthMessage('Connecting…', false);
  const result = await apiRequest(authMode, 'POST', { username: $('auth-username').value.trim(), password: $('auth-password').value });
  submit.disabled = false;
  if (!result.ok) { setAuthMessage(result.error || 'Could not sign in.'); return; }
  account = result.player; csrfToken = result.csrf; $('auth-overlay').classList.add('hidden'); $('auth-password').value = '';
  updateAuthUI(); await loadCommunity(); toast(`Welcome, ${account.username}.`);
});

function safe(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function typeLabel(kind) { return ({ help: '🛠 HELP REQUEST', trade: '⇄ TRADE OFFER', collab: '🤝 COLLABORATION' })[kind] || 'COMMUNITY'; }
function renderCommunity() {
  const feed = $('community-feed'); if (!feed) return;
  if (!communityPosts.length) { feed.innerHTML = '<div class="panel community-notice">No open transmissions yet. Be the first to post.</div>'; return; }
  feed.innerHTML = communityPosts.map(post => {
    const statusLabel = post.status === 'matched' ? 'TRADE AGREED' : post.status === 'completed' ? 'COMPLETED' : 'OPEN';
    const trade = post.kind === 'trade' ? `<div class="trade-summary"><div><small>OFFERING</small><b>${safe(post.offering)}</b></div><span>⇄</span><div><small>LOOKING FOR</small><b>${safe(post.seeking)}</b></div></div>` : '';
    const replies = (post.replies || []).map(reply => `<div class="community-reply"><b>${safe(reply.username)}</b><span>${safe(reply.message)}</span><time>${safe(String(reply.created_at).slice(0,16))}</time></div>`).join('');
    const canJoin = account && !post.is_mine && !post.is_member && post.status === 'open';
    const actionLabel = post.kind === 'trade' ? 'Offer to trade' : post.kind === 'help' ? 'I can help' : 'Join collaboration';
    const joinAction = canJoin ? `<button class="button button-secondary" data-community-join="${post.id}">${actionLabel} <span>＋</span></button>` : post.is_member ? '<span class="joined-label">✓ YOU JOINED</span>' : '';
    const closeAction = account && post.is_mine && post.status === 'open' ? `<button class="text-action" data-community-close="${post.id}">${post.kind === 'trade' ? 'Mark trade agreed' : 'Mark complete'}</button>` : '';
    const replyForm = account && post.status === 'open' ? `<form class="reply-form" data-community-reply="${post.id}"><input name="message" maxlength="400" placeholder="Write a friendly reply…" required><button class="button button-secondary" type="submit">Reply</button></form>` : '';
    return `<article class="panel community-post"><header class="post-header"><span class="post-kind kind-${post.kind}">${typeLabel(post.kind)}</span><span class="post-status ${post.status}">${statusLabel}</span></header><h3>${safe(post.title)}</h3><p class="post-body">${safe(post.body)}</p>${trade}<div class="post-meta"><span>by <b>${safe(post.username)}</b></span><span>◌ ${post.member_count} joined</span><span>▤ ${(post.replies || []).length} replies</span><time>${safe(String(post.created_at).slice(0,16))}</time></div><div class="post-actions">${joinAction}${closeAction}</div><div class="reply-list">${replies}</div>${replyForm}</article>`;
  }).join('');
  document.querySelectorAll('[data-community-join]').forEach(button => button.addEventListener('click', async () => {
    const result = await apiRequest('community_join', 'POST', { post_id: Number(button.dataset.communityJoin) });
    if (!result.ok) toast(result.error); else { toast(result.joined ? 'You joined in. Say hello in the replies!' : 'You already joined.'); await loadCommunity(); }
  }));
  document.querySelectorAll('[data-community-close]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Close this post for new replies and participants?')) return;
    const result = await apiRequest('community_close', 'POST', { post_id: Number(button.dataset.communityClose) });
    if (!result.ok) toast(result.error); else { toast('Post updated.'); await loadCommunity(); }
  }));
  document.querySelectorAll('[data-community-reply]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault(); const message = new FormData(form).get('message');
    const result = await apiRequest('community_reply', 'POST', { post_id: Number(form.dataset.communityReply), message });
    if (!result.ok) toast(result.error); else { form.reset(); await loadCommunity(); }
  }));
}
async function loadCommunity() {
  const result = await apiRequest('community_feed');
  if (!result.ok) { $('community-feed').innerHTML = `<div class="panel community-notice">${safe(result.error || 'Could not load community posts.')}</div>`; return; }
  communityPosts = result.posts || []; renderCommunity();
}

$('post-kind').addEventListener('change', () => $('trade-fields').classList.toggle('hidden', $('post-kind').value !== 'trade'));
$('community-compose').addEventListener('submit', async event => {
  event.preventDefault(); if (!account) { showAuth(); return; }
  const message = $('compose-message'); message.textContent = 'Posting…'; message.classList.remove('error');
  const result = await apiRequest('community_post', 'POST', {
    kind: $('post-kind').value, title: $('post-title').value, body: $('post-body').value,
    offering: $('trade-offering').value, seeking: $('trade-seeking').value,
  });
  if (!result.ok) { message.textContent = result.error || 'Could not post.'; message.classList.add('error'); return; }
  event.currentTarget.reset(); $('trade-fields').classList.add('hidden'); message.textContent = '';
  toast('Posted to the community board.'); await loadCommunity();
});
$('community-refresh').addEventListener('click', loadCommunity);

function renderItems() {
  const total = Object.values(economy.state.owned).reduce((a, b) => a + b, 0);
  $('unit-count').textContent = `${total} / 20 UNITS`;
  $('scene-active').textContent = total;
  $('robots-owned').textContent = `${total} active unit${total === 1 ? '' : 's'}`;
  scene.setRobots(total);
  $('production-list').innerHTML = items.map(item => {
    const owned = economy.state.owned[item.id] || 0, price = economy.price(item);
    const affordable = economy.canAfford(price, item.currency) && total < 20;
    const rateText = [item.creditRate ? `+${item.creditRate} cr` : '', item.scrapRate ? `${item.scrapRate > 0 ? '+' : ''}${item.scrapRate} scrap` : ''].filter(Boolean).join(' · ');
    return `<div class="production-item"><div class="item-icon" style="--item-color:${item.tint}">${item.icon}</div><div class="item-copy"><b>${item.name}</b><small>${item.role} <span>· ${rateText}/sec</span></small></div><span class="owned-count">×${owned}</span><button class="button button-buy" data-buy-item="${item.id}" ${affordable ? '' : 'disabled'}>${price} ${item.currency === 'credits' ? '¢' : '▧'} <span>＋</span></button></div>`;
  }).join('');
  document.querySelectorAll('[data-buy-item]').forEach(button => button.addEventListener('click', () => {
    const item = items.find(entry => entry.id === button.dataset.buyItem);
    if (economy.buyItem(button.dataset.buyItem)) { toast(`${item.name} assembled.`); render(); } else toast(total >= 20 ? 'Your production line is full.' : 'Not enough resources yet.');
  }));
}

function renderUpgrades() {
  $('upgrade-list').innerHTML = upgrades.map(up => {
    const owned = !!economy.state.bought[up.id];
    const affordable = economy.canAfford(up.cost, up.currency);
    return `<div class="upgrade-card ${owned ? 'purchased' : ''}"><span class="upgrade-icon">${up.icon}</span><div class="upgrade-copy"><b>${up.name}</b><small>${up.description}</small></div><button class="button button-upgrade" data-buy-upgrade="${up.id}" ${owned || !affordable ? 'disabled' : ''}>${owned ? 'INSTALLED' : `${up.cost} ${up.currency === 'credits' ? '¢' : '▧'}　＋`}</button></div>`;
  }).join('');
  document.querySelectorAll('[data-buy-upgrade]').forEach(button => button.addEventListener('click', () => {
    const up = upgrades.find(entry => entry.id === button.dataset.buyUpgrade);
    if (economy.buyUpgrade(up.id)) { toast(`${up.name} installed.`); render(); } else toast('Not enough resources yet.');
  }));
}

function renderMissions() {
  const crew = Object.values(economy.state.owned).reduce((a, b) => a + b, 0);
  const current = economy.state.sector || 1;
  const sectors = [current, current + 1, current + 2];
  $('sector-number').textContent = String(current).padStart(2, '0');
  $('mission-list').innerHTML = sectors.map((sector, index) => {
    const danger = Math.max(0, sector - crew * 2);
    const rewards = economy.missionPreview(sector);
    const locked = sector > current;
    const titleIndex = index % 3;
    return `<article class="mission-card ${locked ? 'mission-locked' : ''}"><div class="mission-index">${String(sector).padStart(2, '0')}</div><div class="mission-main"><div class="eyebrow">${locked ? 'FRONTIER SIGNAL' : 'AVAILABLE CONTRACT'}</div><h3>${['Dustline salvage', 'Rusted relay', 'The green vault'][titleIndex]}</h3><p>${['Recover abandoned alloys from the outer debris field.', 'Search a collapsed comms station for usable components.', 'An overgrown depot may still have intact machine parts.'][titleIndex]}</p><div class="mission-rewards"><span>REWARD</span><b>¢ ${rewards.credits}</b><b>▧ ${rewards.scrap}</b><span class="danger ${danger > 0 ? 'high-danger' : ''}">THREAT ${danger ? '▲'.repeat(Math.min(3, danger)) : 'LOW'}</span></div></div><button class="button ${locked ? 'button-secondary' : 'button-primary'} mission-launch" data-mission="${sector}" ${!crew || missionBusy || locked ? 'disabled' : ''}>${locked ? 'Scout sector' : 'Deploy crew'} <span>→</span></button></article>`;
  }).join('');
  document.querySelectorAll('[data-mission]').forEach(button => button.addEventListener('click', () => {
    const sector = Number(button.dataset.mission);
    if (sector > current) { toast('Clear the current sector to scout farther out.'); return; }
    if (missionBusy || !crew) return;
    missionBusy = true; button.textContent = 'Deploying…'; button.disabled = true;
    toast(`Crew deployed to sector ${String(sector).padStart(2, '0')}.`);
    window.setTimeout(() => {
      const result = economy.mission(sector);
      missionBusy = false;
      const panel = $('mission-result'); panel.classList.remove('hidden');
      panel.innerHTML = `<div class="eyebrow">EXPEDITION COMPLETE · SECTOR ${String(sector).padStart(2, '0')}</div><h3>Salvage secured.</h3><p>Your ${result.crew} unit crew brought home <b>¢ ${result.credits}</b> and <b>▧ ${result.scrap} scrap</b>.</p>`;
      render();
    }, 2400);
  }));
}

function render() {
  const rate = economy.production(), s = economy.state;
  $('credits').textContent = compact(s.credits); $('scrap').textContent = compact(s.scrap); $('shards').textContent = compact(s.shards);
  $('credits-rate').textContent = `${rate.credits >= 0 ? '+' : ''}${rate.credits.toFixed(1)} / sec`;
  $('scrap-rate').textContent = `${rate.scrap >= 0 ? '+' : ''}${rate.scrap.toFixed(1)} / sec`;
  $('scene-rate').textContent = `${rate.credits.toFixed(1)} cr / sec`;
  $('rank').textContent = s.prestigeCount ? `Ascendant ${s.prestigeCount}` : s.credits > 1500 ? 'Mechanic' : 'Rookie';
  $('cycle-label').textContent = String(s.prestigeCount + 1).padStart(2, '0');
  $('prestige-preview').textContent = economy.shardPreview();
  $('prestige-button').disabled = economy.shardPreview() < 1;
  $('prestige-button').innerHTML = economy.shardPreview() ? `Synthesize ${economy.shardPreview()} shard${economy.shardPreview() > 1 ? 's' : ''} <span>→</span>` : 'Reach 1,200 lifetime credits <span>→</span>';
  renderItems(); renderUpgrades(); renderMissions();
}

function activateRoute(name) {
  document.querySelectorAll('.nav-link').forEach(link => {
    const active = link.dataset.route === `/${name}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  const titles = { factory: 'Factory floor', brains: 'Brain lab', expeditions: 'Expeditions', community: 'Community board', 'not-found': 'Sector not found' };
  $('page-title').textContent = titles[name] || titles['not-found'];
  if (name === 'brains' && !brainLoaded) {
    import('./brains.js').then(module => { module.createBrainWorkshop(); brainLoaded = true; })
      .catch(() => toast('Could not load the visual programming tools.'));
  }
  if (name === 'community') loadCommunity();
  if (name === 'brains') window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
}

const router = createAppRouter(activateRoute);
document.addEventListener('keydown', event => {
  if (event.target.matches('input,textarea')) return;
  if (event.key === '1') router.navigate('/factory'); if (event.key === '2') router.navigate('/brains'); if (event.key === '3') router.navigate('/expeditions'); if (event.key === '4') router.navigate('/community');
});
$('camera-button').addEventListener('click', () => scene.resetCamera());
$('settings-button').addEventListener('click', () => toast('Settings and cloud sync are coming in a later milestone.'));
$('prestige-button').addEventListener('click', () => {
  const gain = economy.shardPreview();
  if (!gain) return;
  if (!window.confirm(`Synthesize ${gain} Core Shard${gain > 1 ? 's' : ''}? Your current factory and cycle resources reset. Permanent shards remain.`)) return;
  const awarded = economy.prestige(); toast(`Cycle complete. +${awarded} Core Shard${awarded > 1 ? 's' : ''}.`); render();
});

render();
refreshAuth().then(loadCommunity);
if (economy.offline.seconds > 20 && (economy.offline.credits > .5 || economy.offline.scrap > .5)) {
  toast(`Welcome back. Your bots earned ¢ ${compact(economy.offline.credits)} and ▧ ${compact(economy.offline.scrap)} while you were away.`);
}
window.setInterval(() => { economy.tick(); render(); $('save-label').textContent = 'Saved locally'; }, 1000);
window.addEventListener('beforeunload', () => economy.persist());
