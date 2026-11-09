import { Economy, items, setEconomyCatalog, upgrades } from './economy.js';
import { FactoryScene } from './factory3d.js';
import { BattleReplay } from './battle-replay.js';
import { createAppRouter } from './router.js';
import { SalvageSimulation, setSimulationCatalog } from './simulation.js';
import { addTechnologyPrerequisite, mutateCatalogArray, mutateTechnologyEffect, renderCatalogEditor, renameEffectMapKey, setCatalogPath } from './catalog-editor.js';
import './style.css';
import './community.css';
import './catalog-editor.css';
import './simulation.css';
import './simulation-controls.css';
import './simulation-fallback.css';
import './scene-experience.css';
import './technology-tree.css';
import { FactoryProgression } from './factory-progression.js';
import './factory-progression.css';
import { BotInspector } from './bot-inspector.js';
import './toy-factory.css';
import { enhanceResearch } from './workshop-tools.js';
import './workshop-tools.css';

const economy = new Economy();
const progression = new FactoryProgression(economy, () => render(), message => toast(message));
let accessibilitySettings = { reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false, renderQuality: 'high' };
try { accessibilitySettings = { ...accessibilitySettings, ...JSON.parse(localStorage.getItem('scrapbound.accessibility.v1') || '{}') }; } catch {}
const scene = new FactoryScene(document.getElementById('factory-scene'), {
  reducedMotion: accessibilitySettings.reducedMotion,
  quality: accessibilitySettings.renderQuality,
});
let account = null;
let localSimulationValues = { credits: economy.state.credits, scrap: economy.state.scrap };
let localSimulationAccount = null;
let worldSeed = crypto.getRandomValues(new Uint32Array(1))[0];
let technologyState = null;
let technologyPreview = [];
const simulation = new SalvageSimulation((resource, amount) => {
  if (!account) {
    economy.deliver(resource, amount);
    localSimulationValues = { credits: economy.state.credits, scrap: economy.state.scrap };
    return;
  }
  if (['credits', 'scrap'].includes(resource) && Number.isFinite(amount) && amount > 0) {
    localSimulationValues[resource] += amount;
  }
}, { seed: worldSeed });
simulation.syncCrew(economy.state.owned);
simulation.setUpgrades(economy.state.bought);
try {
  const roles = JSON.parse(localStorage.getItem('scrapbound.role-brains.v1') || '{}');
  for (const item of items) if (roles[item.id]) simulation.deployRole(item.id, roles[item.id]);
} catch {}
const inspector = new BotInspector(scene, simulation);
try {
  const assignments = JSON.parse(localStorage.getItem('scrapbound.deployed-programs.v1') || 'null');
  const legacyProgram = JSON.parse(localStorage.getItem('scrapbound.deployed-program.v1') || 'null');
  if (assignments && typeof assignments === 'object') simulation.loadAssignments(assignments);
  else if (Array.isArray(legacyProgram) && legacyProgram.length) simulation.deploy(legacyProgram);
  localStorage.setItem('scrapbound.deployed-programs.v1', JSON.stringify(simulation.assignments()));
} catch { simulation.loadAssignments(); }
const $ = id => document.getElementById(id);
document.getElementById('technology-view-host')?.append(document.querySelector('.technology-panel'));
const compact = n => Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: n >= 1000 ? 1 : 0 }).format(Math.floor(n));
let missionBusy = false;
let brainLoaded = false;
let toastTimer;
let csrfToken = null;
let playerJobs = null;
let playerMissionState = null;
let selectedCooperativeJobId = null;
let serverDeliveries = [];
let serverSimulationStatus = '';
let serverSimulationBusy = false;
let serverSimulationCooldownUntil = 0;
let walletSyncBusy = false;
let walletSyncStatus = 'Not synced yet';
const savedWalletSyncInterval = localStorage.getItem('scrapbound.wallet-sync-seconds.v1');
let walletSyncIntervalSeconds = savedWalletSyncInterval === null ? 30 : Number(savedWalletSyncInterval);
if (![0, 15, 30, 60].includes(walletSyncIntervalSeconds)) walletSyncIntervalSeconds = 30;
let lastWalletSyncAt = 0;
let localSaveBackup = null;
let localSaveCaptured = false;
let authMode = 'login';
let communityPosts = [];
let communityCanModerate = false;
let catalogStudioLoaded = false;
let catalogContentState = null;
let battleReplayScene = null;
let battleArenaRequest = 0;
let simulationPaused = false;
let simulationSpeed = 1;
const CONTROL_STORAGE = 'scrapbound.controls.v1';
const DEFAULT_CONTROL_CONFIG = { mode: 'program', bindings: { up: 'w', left: 'a', down: 's', right: 'd' } };
let controlState;
try { controlState = JSON.parse(localStorage.getItem(CONTROL_STORAGE)) || null; } catch { controlState = null; }
controlState ||= { profiles: { Default: { ...DEFAULT_CONTROL_CONFIG, bindings: { ...DEFAULT_CONTROL_CONFIG.bindings } } }, assignments: {} };
let pressedKeys = new Set();
let controlTargetId = 0;
document.addEventListener('scrapbound-control-config', event => { controlState = event.detail; });
scene.onGroundClick = (x, z) => {
  const profileName = controlState.assignments[String(controlTargetId)] || 'Default';
  if (controlState.profiles[profileName]?.mode !== 'mouse') return;
  simulation.manualDestination(controlTargetId, x, z);
};
window.addEventListener('keydown', event => {
  if (!event.key || event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
  const key = event.key.toLowerCase(); pressedKeys.add(key);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
});
window.addEventListener('keyup', event => { if (event.key) pressedKeys.delete(event.key.toLowerCase()); });
window.addEventListener('blur', () => { pressedKeys.clear(); });

function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
document.addEventListener('scrapbound-toast', event => toast(event.detail));
document.addEventListener('scrapbound-deploy-program', async event => {
  const { program, targetId } = event.detail;
  if (typeof targetId === 'string' && targetId.startsWith('role:')) {
    if (account) { toast('Role-wide brains are currently local-only. Select an individual bot for server programming.'); return; }
    const kind = targetId.slice(5);
    if (!items.some(item => item.id === kind) || !simulation.deployRole(kind, program)) return;
    localStorage.setItem('scrapbound.role-brains.v1', JSON.stringify(simulation.rolePrograms));
    localStorage.setItem('scrapbound.deployed-programs.v1', JSON.stringify(simulation.assignments()));
    toast('Role brain deployed! Future bots of this role will use it too.'); render(); return;
  }
  if (account) {
    const result = await apiRequest('robot_program', 'POST', { target: targetId === null ? 'all' : String(targetId), program });
    if (!result.ok) { toast(result.error || 'Server rejected this program.'); return; }
    applyServerJobs(result);
    document.getElementById('brain-status').textContent = `Saved and deployed ${program.length} steps to ${targetId === null ? 'the crew' : `unit ${String(targetId + 1).padStart(2, '0')}`}.`;
    toast('Program saved to your server-side robot job.');
    return;
  }
  const count = simulation.deploy(program, targetId);
  localStorage.setItem('scrapbound.role-brains.v1', JSON.stringify(simulation.rolePrograms));
  if (!count) { toast('No supported program steps to deploy.'); return; }
  localStorage.setItem('scrapbound.deployed-programs.v1', JSON.stringify(simulation.assignments()));
  const target = targetId === null ? 'the crew' : `unit ${String(targetId + 1).padStart(2, '0')}`;
  toast(`Running ${count} program steps on ${target}.`);
  render();
});

document.addEventListener('click', async event => {
  if (event.target.closest('#wallet-sync-now')) {
    await syncServerWallet();
    return;
  }
  const button = event.target.closest('[data-server-template]');
  if (!button || !account) return;
  button.disabled = true;
  const templateId = Number(button.dataset.serverTemplate);
  const result = button.dataset.unlocked === 'true'
    ? await apiRequest('template_deploy', 'POST', { template_id: templateId, target: $('control-target').value || '0' })
    : await apiRequest('template_unlock', 'POST', { template_id: templateId, idempotency_key: `template:${crypto.randomUUID()}` });
  if (!result.ok) { button.disabled = false; toast(result.error || 'Template action failed.'); return; }
  applyServerJobs(result);
  toast(button.dataset.unlocked === 'true' ? 'Template deployed to the selected bot.' : 'Brain template unlocked for your account.');
});

document.addEventListener('change', event => {
  if (event.target.id !== 'wallet-sync-interval') return;
  walletSyncIntervalSeconds = Number(event.target.value);
  localStorage.setItem('scrapbound.wallet-sync-seconds.v1', String(walletSyncIntervalSeconds));
});

async function apiRequest(action, method = 'GET', data = null) {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}api.php?action=${encodeURIComponent(action)}`, {
      method, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' && csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}) },
      body: data ? JSON.stringify(data) : undefined,
    });
    const result = await response.json();
    const validationError = result.errors ? Object.values(result.errors).flat()[0] : null;
    return { ...result, error: result.error || result.message || validationError, httpStatus: response.status };
  } catch { return { ok: false, error: 'Cannot reach the Scrapbound server. Check Nginx/PHP and try again.' }; }
}

function renderInventory(data) {
  $('inventory-items').innerHTML = data?.items?.length ? data.items.map(item => `<article class="battle-entry"><div><b>${safe(item.name)}</b><span>${item.available} available${item.reserved ? ` · ${item.reserved} reserved` : ''}</span><small>${item.quantity} owned${item.tradable ? ' · tradeable' : ''}</small></div></article>`).join('') : '<div class="panel-note">No catalog items yet. Successful salvage missions award items.</div>';
  $('inventory-receipts').textContent = data?.receipts?.length ? `Latest item activity: ${data.receipts.map(receipt => `${receipt.action} ${receipt.quantity} ${receipt.item_id}`).join(' · ')}` : '';
  const tradeable = (data?.items || []).filter(item => item.tradable && item.available > 0);
  $('trade-item').innerHTML = tradeable.length ? tradeable.map(item => `<option value="${safe(item.id)}">${safe(item.name)} · ${item.available} available</option>`).join('') : '<option value="">No available tradeable items</option>';
  $('trade-create').disabled = !account || !tradeable.length;
}

function renderItemTrades(trades, players) {
  $('trade-recipient').innerHTML = players.length ? players.map(player => `<option value="${player.id}">${safe(player.username)}</option>`).join('') : '<option value="">No other pilots</option>';
  $('trade-list').innerHTML = trades.length ? trades.map(trade => `<article class="battle-entry"><div><b>${safe(trade.seller)} offers ${trade.quantity} ${safe(trade.item_name)}</b><span>${safe(trade.recipient)} · ${trade.credit_price} credits · ${safe(trade.status)}</span><small>${trade.status === 'open' ? `Expires ${new Date(trade.expires_at).toLocaleString()}` : `Trade #${trade.id}`}</small></div><div>${trade.can_accept ? `<button class="button button-primary" data-trade-accept="${trade.id}">Accept</button><button class="button button-secondary" data-trade-decline="${trade.id}">Decline</button>` : ''}${trade.can_cancel ? `<button class="button button-secondary" data-trade-cancel="${trade.id}">Cancel</button>` : ''}</div></article>`).join('') : '<div class="panel-note">No item trade offers yet.</div>';
  for (const [attribute, action] of [['data-trade-accept', 'item_trade_accept'], ['data-trade-decline', 'item_trade_decline'], ['data-trade-cancel', 'item_trade_cancel']]) {
    $('trade-list').querySelectorAll(`[${attribute}]`).forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      const result = await apiRequest(action, 'POST', { trade_id: Number(button.getAttribute(attribute)) });
      $('trade-status').textContent = result.ok ? `Trade ${result.trade.status}.` : result.error || 'Trade action failed.';
      await loadInventory();
    }));
  }
}

async function loadInventory() {
  if (!account) { renderInventory(null); return; }
  const [result, players, trades] = await Promise.all([apiRequest('inventory'), apiRequest('trade_players'), apiRequest('item_trades')]);
  if (result.ok) renderInventory(result);
  else $('inventory-items').textContent = result.error || 'Item inventory unavailable.';
  if (players.ok && trades.ok) renderItemTrades(trades.trades, players.players);
}

$('inventory-refresh').addEventListener('click', loadInventory);
$('trade-create').addEventListener('click', async () => {
  if (!account) { openAuth('login'); return; }
  const result = await apiRequest('item_trade_create', 'POST', {
    recipient_id: Number($('trade-recipient').value), item_id: $('trade-item').value,
    quantity: Number($('trade-quantity').value), credit_price: Number($('trade-price').value), request_key: crypto.randomUUID(),
  });
  $('trade-status').textContent = result.ok ? `Offer #${result.trade.id} created; the items are now reserved in escrow.` : result.error || 'Could not create trade offer.';
  if (result.ok) await loadInventory();
});

function applyServerJobs(data) {
  playerJobs = data;
  const owned = Object.fromEntries(items.map(item => [item.id, 0]));
  const units = {};
  for (const robot of data.robots || []) {
    owned[robot.kind] = (owned[robot.kind] || 0) + 1;
    units[robot.id] = robot.program || [];
  }
  economy.state.owned = owned;
  if (data.wallet) {
    economy.state.credits = data.wallet.credits;
    economy.state.scrap = data.wallet.scrap;
    walletSyncStatus = `Server wallet loaded · ${new Date().toLocaleTimeString()}`;
    if (account && localSimulationAccount !== account.username) {
      localSimulationValues = { credits: Number(data.wallet.credits), scrap: Number(data.wallet.scrap) };
      localSimulationAccount = account.username;
    }
  }
  simulation.syncCrew(owned);
  simulation.rolePrograms = {};
  simulation.loadAssignments({ crew: [], units });
  render();
}

async function loadPlayerJobs() {
  if (!account) { playerJobs = null; playerMissionState = null; technologyState = null; selectedCooperativeJobId = null; serverDeliveries = []; serverSimulationStatus = ''; walletSyncStatus = 'Not synced yet'; lastWalletSyncAt = 0; localSimulationAccount = null; localSimulationValues = { credits: economy.state.credits, scrap: economy.state.scrap }; render(); renderInventory(null); await loadCooperativeJobs(); return; }
  if (!localSaveCaptured) { localSaveBackup = localStorage.getItem('scrapbound.save.v1'); localSaveCaptured = true; }
  const result = await apiRequest('jobs');
  if (!result.ok) { toast(result.error || 'Could not load saved robot jobs.'); return; }
  applyServerJobs(result);
  await settleOfflineProgress();
  await loadInventory();
  lastWalletSyncAt = Date.now();
  await loadPlayerMissions();
}

async function settleOfflineProgress() {
  if (!account) return;
  const result = await apiRequest('idle_settle', 'POST', { request_key: crypto.randomUUID() });
  if (!result.ok) {
    serverSimulationStatus = `Offline progress unavailable: ${result.error || 'server response missing settlement.'}`;
    render();
    return false;
  }
  if (result.technology) {
    technologyState = result.technology;
    simulation.setResourceDefinitions(result.technology.resources || []);
    simulation.setTechnologyEffects(result.technology.effects || {});
    scene.setTechnology(result.technology.effects?.sceneUnlocks || []);
  }
  if (Number.isInteger(result.world_seed) && simulation.setWorldSeed(result.world_seed)) worldSeed = result.world_seed;
  if (result.snapshot?.nodes) simulation.applyWorldSnapshot(result.snapshot.nodes, result.snapshot.drops || []);
  scene.setSimulation(simulation.snapshot());
  if (result.wallet) {
    economy.state.credits = Number(result.wallet.credits);
    economy.state.scrap = Number(result.wallet.scrap);
    localSimulationValues = { credits: economy.state.credits, scrap: economy.state.scrap };
  }
  const payouts = (result.payouts || []).filter(payout => payout.amount > 0).map(payout => ({
    resource: payout.resource, amount: payout.amount, cargo: payout.deliveries,
    deliveryCount: payout.deliveries,
  }));
  if (payouts.length) serverDeliveries = [...payouts, ...serverDeliveries].slice(0, 3);
  lastWalletSyncAt = Date.now();
  const credited = Number(result.credited_seconds) || 0;
  serverSimulationStatus = credited > 0
    ? `Offline bots worked ${Math.floor(credited / 60)}m · ${payouts.reduce((sum, payout) => sum + payout.deliveryCount, 0)} depot deliveries${result.capped ? ' · catch-up capped' : ''}.`
    : 'Offline systems ready · bots earn only after depot delivery.';
  render();
  return true;
}

async function syncServerWallet() {
  if (!account || walletSyncBusy) return;
  walletSyncBusy = true;
  lastWalletSyncAt = Date.now();
  try {
    const result = await apiRequest('wallet');
    if (!result.ok || !result.wallet) {
      walletSyncStatus = `Wallet sync failed: ${result.error || 'server response missing wallet'}`;
      return;
    }
    economy.state.credits = Number(result.wallet.credits);
    economy.state.scrap = Number(result.wallet.scrap);
    lastWalletSyncAt = Date.now();
    walletSyncStatus = `Server wallet synced · ¢${compact(economy.state.credits)} · ▧${compact(economy.state.scrap)} · ${new Date(lastWalletSyncAt).toLocaleTimeString()}`;
  } catch (error) {
    walletSyncStatus = `Wallet sync failed: ${error.message || 'network error'}`;
  } finally {
    walletSyncBusy = false;
    render();
  }
}

async function loadPlayerMissions() {
  if (!account) { playerMissionState = null; return; }
  const result = await apiRequest('missions');
  if (!result.ok) { toast(result.error || 'Could not load mission status.'); return; }
  playerMissionState = result;
  renderMissions();
  await loadCooperativeJobs();
  await loadBattleArena();
}

async function loadCooperativeJobs() {
  const list = $('cooperative-jobs');
  if (!list) return;
  if (!account) {
    list.innerHTML = '<div class="panel-note">Sign in to create or join a co-op salvage job.</div>';
    $('cooperative-notifications').innerHTML = '';
    $('cooperative-create').disabled = true;
    return;
  }
  $('cooperative-create').disabled = false;
  const result = await apiRequest('cooperative_jobs');
  if (!result.ok) { list.textContent = result.error || 'Co-op jobs unavailable.'; return; }
  if (playerMissionState) playerMissionState.cooperative_jobs = result.jobs;
  const sectors = (playerMissionState?.contracts || []).filter(contract => contract.unlocked);
  $('cooperative-sector').innerHTML = sectors.map(contract => `<option value="${contract.sector}">Sector ${String(contract.sector).padStart(2, '0')}</option>`).join('') || '<option value="1">Sector 01</option>';
  const open = result.jobs.filter(job => job.status === 'open' && Number(job.contribution || 0) === 0 && job.member_id);
  if (selectedCooperativeJobId && !open.some(job => Number(job.id) === Number(selectedCooperativeJobId))) selectedCooperativeJobId = null;
  list.innerHTML = result.jobs.length ? result.jobs.map(job => {
    const isMember = !!job.member_id;
    const contributed = Number(job.contribution || 0) > 0;
    const selected = Number(selectedCooperativeJobId) === Number(job.id);
    const roster = job.members.map(member => `${safe(member.username)}${member.contribution ? ' ✓' : ''}`).join(', ');
    let action = '';
    if (job.status === 'open' && !isMember) action = `<button class="button button-secondary" data-cooperative-join="${job.id}">Join</button>`;
    else if (job.status === 'open' && isMember && !contributed) action = `<button class="button ${selected ? 'button-primary' : 'button-secondary'}" data-cooperative-select="${job.id}">${selected ? 'Selected' : 'Contribute'}</button>${Number(job.owner_id) !== Number(account.id) ? `<button class="button button-secondary" data-cooperative-leave="${job.id}">Leave</button>` : ''}`;
    else if (contributed) action = '<span class="panel-note">Contribution recorded</span>';
    return `<article class="battle-entry"><div><b>${safe(job.owner)} · Sector ${String(job.sector).padStart(2, '0')}</b><span>${job.progress}/${job.goal} contributions · ${job.status} · ${job.member_count}/4 pilots</span><small>${roster || 'No other pilots yet'}</small></div>${action}</article>`;
  }).join('') : '<div class="panel-note">No co-op jobs yet. Start one and invite other pilots.</div>';
  $('cooperative-notifications').innerHTML = result.notifications.length ? result.notifications.map(note => `<article class="battle-entry"><div><b>${safe(note.kind.replaceAll('_', ' '))}</b><span>${note.data.username ? `${safe(note.data.username)} · ` : ''}${note.data.progress ? `${note.data.progress}/${note.data.goal} contributions` : note.data.reward ? `Reward: ${note.data.reward} credits` : 'Co-op job update'}</span></div></article>`).join('') : '<div class="panel-note">No co-op notifications yet.</div>';
  if (playerMissionState) renderServerMissions();
  list.querySelectorAll('[data-cooperative-join]').forEach(button => button.addEventListener('click', async () => {
    const joined = await apiRequest('cooperative_join', 'POST', { job_id: Number(button.dataset.cooperativeJoin) });
    if (!joined.ok) { $('cooperative-notice').textContent = joined.error || 'Could not join that job.'; return; }
    await loadCooperativeJobs();
  }));
  list.querySelectorAll('[data-cooperative-leave]').forEach(button => button.addEventListener('click', async () => {
    const left = await apiRequest('cooperative_leave', 'POST', { job_id: Number(button.dataset.cooperativeLeave) });
    if (!left.ok) { $('cooperative-notice').textContent = left.error || 'Could not leave that job.'; return; }
    if (Number(selectedCooperativeJobId) === Number(button.dataset.cooperativeLeave)) selectedCooperativeJobId = null;
    await loadCooperativeJobs();
  }));
  list.querySelectorAll('[data-cooperative-select]').forEach(button => button.addEventListener('click', async () => {
    selectedCooperativeJobId = Number(button.dataset.cooperativeSelect);
    $('cooperative-notice').textContent = 'Selected co-op job. Launch the matching sector mission below to contribute.';
    await loadCooperativeJobs();
  }));
}

$('cooperative-refresh').addEventListener('click', loadCooperativeJobs);
$('cooperative-create').addEventListener('click', async () => {
  if (!account) { openAuth('login'); return; }
  const result = await apiRequest('cooperative_create', 'POST', { sector: Number($('cooperative-sector').value || 1), goal: Number($('cooperative-goal').value || 3) });
  if (!result.ok) { $('cooperative-notice').textContent = result.error || 'Could not create a co-op job.'; return; }
  selectedCooperativeJobId = result.job_id;
  $('cooperative-notice').textContent = 'Co-op job created. Select its contract mission below to contribute.';
  await loadCooperativeJobs();
});

async function loadBattleArena() {
  const list = $('battle-defenses');
  if (!list) return;
  const requestId = ++battleArenaRequest;
  battleReplayScene?.destroy();
  battleReplayScene = null;
  const defenses = await apiRequest('battle_defenses');
  if (requestId !== battleArenaRequest) return;
  if (!defenses.ok) { list.textContent = defenses.error || 'Arena is unavailable.'; return; }
  $('battle-unit').innerHTML = (playerJobs?.robots || []).map(robot => `<option value="${robot.id}">Unit ${String(robot.id + 1).padStart(2, '0')} · ${safe(robot.kind)}</option>`).join('');
  const encounters = await apiRequest('pve_encounters');
  if (requestId !== battleArenaRequest) return;
  $('pve-encounter').innerHTML = encounters.ok ? encounters.encounters.map(encounter => `<option value="${safe(encounter.id)}">Tier ${encounter.tier} · ${safe(encounter.name)} · rating ${encounter.rating}+ · win +${encounter.credits} credits</option>`).join('') : '<option value="">NPC encounters unavailable</option>';
  list.innerHTML = defenses.defenses.length ? defenses.defenses.map(defense => `<article class="battle-entry"><div><b>${safe(defense.username)}</b><span>${safe(defense.robot.kind)} · catalog v${defense.catalog_version}</span><small>${safe(defense.robot.program.map(step => step.action).join(' → '))}</small></div><button class="button button-secondary" data-battle-challenge="${defense.user_id}">Challenge</button></article>`).join('') : '<div class="panel-note">No defense snapshots have been published yet.</div>';
  $('battle-status').textContent = account ? 'Challenge a published defense. The server calculates the winner and credits.' : 'Sign in to publish a defense or challenge another pilot.';
  list.querySelectorAll('[data-battle-challenge]').forEach(button => button.addEventListener('click', async () => {
    if (!account) { openAuth('login'); return; }
    button.disabled = true;
    const result = await apiRequest('battle_challenge', 'POST', {
      defender_id: Number(button.dataset.battleChallenge),
      unit_index: Number($('battle-unit').value || 0),
      run_key: crypto.randomUUID(),
    });
    if (!result.ok) { $('battle-status').textContent = result.error || 'Challenge failed.'; button.disabled = false; return; }
    const outcome = result.battle.result;
    await Promise.all([loadBattleArena(), syncServerWallet()]);
    $('battle-status').textContent = `${outcome.winner_side === 'challenger' ? 'Victory' : 'Defense held'} · ${outcome.rounds} rounds · server-seeded replay saved. Winner received ${outcome.rewards.winner_credits} server credits.`;
  }));
  if (account) {
    const pveHistory = await apiRequest('pve_history');
    if (requestId !== battleArenaRequest) return;
    $('pve-history').innerHTML = pveHistory.ok && pveHistory.battles.length ? pveHistory.battles.map(battle => `<details class="battle-entry"><summary><b>${safe(battle.encounter)} · ${battle.result.winner_side === 'challenger' ? 'Victory' : 'Defeat'}</b><span>${battle.result.rounds} rounds · seed ${battle.result.seed} · +${battle.result.rewards.winner_credits} credits</span></summary><ol class="battle-replay">${battle.result.events.map(event => `<li>${safe(event.label)}</li>`).join('')}</ol></details>`).join('') : '<div class="panel-note">No NPC arena battles yet. Your PvP build is ready to deploy.</div>';
    const progression = await apiRequest('battle_progression');
    if (requestId !== battleArenaRequest) return;
    $('battle-progression').innerHTML = progression.ok ? `<article class="battle-entry"><div><b>${safe(progression.progression.season)} · Tier ${progression.progression.tier}</b><span>${progression.progression.rating} rating · ${progression.progression.wins}W / ${progression.progression.losses}L · next tier at ${progression.progression.next_rating}</span><small>${progression.progression.milestones.map(item => safe(item.name)).join(' · ') || 'No milestones claimed yet'}</small></div></article>${progression.standings.map((pilot, index) => `<article class="battle-entry"><div><b>#${index + 1} ${safe(pilot.username)}</b><span>${pilot.rating} rating · ${pilot.wins}W / ${pilot.losses}L</span></div></article>`).join('')}` : '<div class="panel-note">Season standings unavailable.</div>';
    const history = await apiRequest('battle_history');
    if (requestId !== battleArenaRequest) return;
    $('battle-history').innerHTML = history.ok && history.battles.length ? history.battles.map(battle => `<details class="battle-entry"><summary><b>Match #${battle.id} · ${safe(battle.result.resolver_version || 'battle-v1')}</b><span>${battle.result.winner_side === 'challenger' ? 'Challenger won' : 'Defense held'} · ${battle.result.rounds} rounds · seed ${battle.result.seed}</span></summary><section class="battle-replay-panel"><div class="battle-replay-controls"><button class="button button-secondary" data-replay-toggle="${battle.id}">Play</button><label>Speed<select data-replay-speed="${battle.id}" aria-label="Replay speed"><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><input data-replay-seek="${battle.id}" type="range" min="0" max="${battle.result.events.length - 1}" value="0" aria-label="Replay event"><span data-replay-label="${battle.id}">Ready to replay</span></div><div class="battle-replay-canvas-host" data-replay-canvas="${battle.id}"></div></section><ol class="battle-replay">${battle.result.events.map(event => `<li>${safe(event.label)}</li>`).join('')}</ol></details>`).join('') : '<div class="panel-note">No matches yet.</div>';
    $('battle-history').querySelectorAll('[data-replay-toggle]').forEach(button => button.addEventListener('click', () => {
      const battle = history.battles.find(item => String(item.id) === button.dataset.replayToggle);
      const panel = button.closest('.battle-entry').querySelector('.battle-replay-panel');
      panel.classList.remove('hidden');
      if (!battleReplayScene) {
        const host = panel.querySelector('[data-replay-canvas]');
        battleReplayScene = new BattleReplay(host, battle.result.events, { reducedMotion: accessibilitySettings.reducedMotion });
        host.addEventListener('battle-replay-event', event => {
          panel.querySelector('[data-replay-label]').textContent = `${event.detail.index + 1}/${event.detail.total} · ${event.detail.label}`;
          panel.querySelector('[data-replay-seek]').value = event.detail.index;
        });
      }
      if (battleReplayScene.index >= battleReplayScene.events.length - 1) battleReplayScene.seek(0);
      battleReplayScene.playing = !battleReplayScene.playing;
      battleReplayScene.updateControls();
    }));
    $('battle-history').querySelectorAll('[data-replay-seek]').forEach(input => input.addEventListener('input', () => battleReplayScene?.seek(input.value)));
    $('battle-history').querySelectorAll('[data-replay-speed]').forEach(select => select.addEventListener('change', () => battleReplayScene?.setSpeed(select.value)));
  } else { $('battle-history').innerHTML = '<div class="panel-note">Sign in to view your match history.</div>'; $('battle-progression').innerHTML = '<div class="panel-note">Sign in to join the active season league.</div>'; $('pve-history').innerHTML = '<div class="panel-note">Sign in to deploy your PvP build against NPCs.</div>'; }
  $('battle-publish').disabled = !account || !(playerJobs?.robots?.length);
}

$('battle-refresh').addEventListener('click', loadBattleArena);
$('battle-publish').addEventListener('click', async () => {
  const result = await apiRequest('battle_publish_defense', 'POST', { unit_index: Number($('battle-unit').value || 0) });
  if (!result.ok) { $('battle-status').textContent = result.error || 'Could not publish defense.'; return; }
  await loadBattleArena();
  $('battle-status').textContent = 'Your immutable defense snapshot is now public.';
});

$('pve-fight').addEventListener('click', async () => {
  if (!account) { openAuth('login'); return; }
  const button = $('pve-fight');
  button.disabled = true;
  const result = await apiRequest('pve_challenge', 'POST', {
    unit_index: Number($('battle-unit').value || 0),
    encounter_id: $('pve-encounter').value,
    run_key: crypto.randomUUID(),
  });
  if (!result.ok) { $('pve-status').textContent = result.error || 'NPC battle failed.'; button.disabled = false; return; }
  const outcome = result.battle.result;
  $('pve-status').textContent = `${outcome.winner_side === 'challenger' ? 'Victory' : 'Defeat'} · ${result.battle.encounter} · ${outcome.rounds} rounds · ${outcome.rewards.winner_credits} credits earned. PvP rating is unchanged.`;
  await Promise.all([loadBattleArena(), syncServerWallet()]);
  button.disabled = false;
});

function restoreLocalSave() {
  if (localSaveCaptured) {
    if (localSaveBackup) localStorage.setItem('scrapbound.save.v1', localSaveBackup);
    else localStorage.removeItem('scrapbound.save.v1');
    localSaveBackup = null;
    localSaveCaptured = false;
    window.location.reload();
  }
}

async function runServerSimulation() {
  if (!account || serverSimulationBusy || simulationPaused || document.visibilityState !== 'visible') return;
  if (Date.now() < serverSimulationCooldownUntil) {
    return;
  }
  serverSimulationBusy = true;
  serverSimulationCooldownUntil = Date.now() + 65_000;
  serverSimulationStatus = 'Requesting a server delivery check…';
  render();
  try {
    const result = await apiRequest('robot_simulate', 'POST', {
      run_key: `b:${crypto.randomUUID()}`,
      seed: worldSeed,
      ticks: Math.min(6000, 1200 * simulationSpeed),
    });
    if (!result.ok) {
      if (result.httpStatus === 429) serverSimulationCooldownUntil = Math.max(serverSimulationCooldownUntil, Date.now() + 60_000);
      serverSimulationStatus = result.httpStatus === 429
        ? 'Delivery check is cooling down; it will retry automatically.'
        : `Server delivery run failed: ${result.error || 'unknown error'}`;
      render();
      if (result.httpStatus !== 429) toast(result.error || 'Server simulation failed.');
      return;
    }
    if (result.snapshot?.nodes) {
      simulation.applyWorldSnapshot(result.snapshot.nodes, result.snapshot.drops || []);
      scene.setSimulation(simulation.snapshot());
    }
    if (Array.isArray(result.payouts) && result.payouts.length) {
      serverDeliveries = [...result.payouts.map(payout => ({
        robotId: payout.robot_id,
        resource: payout.resource,
        cargo: payout.cargo,
        amount: payout.amount,
      })), ...serverDeliveries].slice(0, 3);
    }
    if (result.wallet) {
      economy.state.credits = result.wallet.credits; economy.state.scrap = result.wallet.scrap;
      serverSimulationStatus = '';
      walletSyncStatus = `Server wallet synced · ${new Date().toLocaleTimeString()}`;
      lastWalletSyncAt = Date.now();
      render();
    }
  } finally { serverSimulationBusy = false; }
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
  $('admin-catalog-nav').classList.toggle('hidden', !account?.can_manage_catalog);
  $('admin-technology-nav').classList.toggle('hidden', !account?.can_manage_catalog);
  $('community-compose').classList.toggle('hidden', !account);
  $('community-readonly').textContent = account ? 'A shared board for friendly requests, fair trades, and cooperative plans.' : 'Sign in to post, reply, offer help, or join a collaboration. You can browse the board without an account.';
  renderCommunity();
}
async function refreshAuth() {
  const status = await apiRequest('status');
  if (status.ok) {
    const wasSignedIn = !!account;
    account = status.player || null; csrfToken = status.csrf; updateAuthUI();
    if (account) await loadPlayerJobs();
    else if (wasSignedIn) restoreLocalSave();
  }
  else {
    $('community-readonly').textContent = status.error || 'Community service unavailable.';
    $('community-feed').innerHTML = '<div class="panel community-notice">Community features need the Laravel database to be configured. See README setup.</div>';
  }
}

$('auth-button').addEventListener('click', async () => {
  if (!account) { if (!csrfToken) await refreshAuth(); if (csrfToken) showAuth(); else toast('The account server is not configured yet.'); return; }
  if (!window.confirm(`Sign out as ${account.username}?`)) return;
  const result = await apiRequest('logout', 'POST', {});
  if (!result.ok) { toast(result.error || 'Could not sign out.'); return; }
  csrfToken = null; await refreshAuth(); toast('Signed out.');
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
  updateAuthUI(); await loadPlayerJobs(); await loadCommunity(); toast(`Welcome, ${account.username}.`);
});

function safe(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
async function loadGameCatalog() {
  const response = await apiRequest('catalog');
  if (!response.ok || !response.catalog) return;
  const catalog = response.catalog;
  technologyPreview = (catalog.technologyNodes || []).map(node => ({ ...node, owned: false, available: false }));
  setEconomyCatalog(catalog); setSimulationCatalog(catalog);
  simulation.setResourceDefinitions(catalog.resources || []);
  if (Array.isArray(catalog.items) && catalog.items.length) items.splice(0, items.length, ...catalog.items);
  if (Array.isArray(catalog.upgrades) && catalog.upgrades.length) upgrades.splice(0, upgrades.length, ...catalog.upgrades);
  render();
}

function syncCatalogJson() {
  if (catalogContentState) $('catalog-content').value = JSON.stringify(catalogContentState, null, 2);
}

function renderAdminTechnologyGraph() {
  const host = $('admin-tech-graph');
  const nodes = catalogContentState?.technologyNodes || [];
  if (!host) return;
  if (!nodes.length) { host.innerHTML = '<div class="panel-note">Add a technology node to begin a progression graph.</div>'; return; }
  const byId = new Map(nodes.map(node => [node.id, node]));
  const depth = (node, seen = new Set()) => {
    if (!node.prerequisites?.length || seen.has(node.id)) return 0;
    seen.add(node.id);
    return 1 + Math.max(...node.prerequisites.map(id => depth(byId.get(id) || { id }, new Set(seen))));
  };
  const levels = new Map();
  for (const node of nodes) {
    const level = depth(node);
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(node);
  }
  const cardWidth = 184, cardHeight = 112, gapQ = 250, gapR = 145, padding = 32;
  const axial = new Map();
  for (const [levelIndex, level] of levels) {
    level.forEach((node, index) => axial.set(node.id, node.gridPosition && Number.isInteger(node.gridPosition.q) && Number.isInteger(node.gridPosition.r)
      ? { q: node.gridPosition.q, r: node.gridPosition.r }
      : { q: levelIndex, r: index - Math.floor((level.length - 1) / 2) }));
  }
  const qs = [...axial.values()].map(point => point.q), rs = [...axial.values()].map(point => point.r);
  const minQ = Math.min(...qs), maxQ = Math.max(...qs), minR = Math.min(...rs), maxR = Math.max(...rs);
  const positions = new Map(nodes.map(node => {
    const point = axial.get(node.id);
    return [node.id, { x: padding + (point.q - minQ) * gapQ + (point.r - minR) * gapQ / 2, y: padding + (point.r - minR) * gapR }];
  }));
  const width = padding * 2 + (maxQ - minQ + 1) * gapQ + (maxR - minR) * gapQ / 2;
  const height = Math.max(180, padding * 2 + (maxR - minR + 1) * gapR);
  const edges = nodes.flatMap(node => (node.prerequisites || []).flatMap(parentId => {
    const parent = positions.get(parentId), child = positions.get(node.id);
    if (!parent || !child) return [];
    const fromX = parent.x + cardWidth, fromY = parent.y + cardHeight / 2;
    const toX = child.x, toY = child.y + cardHeight / 2;
    const curve = (fromX + toX) / 2;
    return [`<path class="admin-tech-edge" d="M${fromX} ${fromY} C${curve} ${fromY},${curve} ${toY},${toX} ${toY}"/>`];
  })).join('');
  const gridCells = [];
  for (let q = minQ - 2; q <= maxQ + 2; q++) {
    for (let r = minR - 2; r <= maxR + 2; r++) {
      const centerX = padding + (q - minQ) * gapQ + (r - minR) * gapQ / 2 + cardWidth / 2;
      const centerY = padding + (r - minR) * gapR + cardHeight / 2;
      if (centerX < -cardWidth || centerY < -cardHeight || centerX > width + cardWidth || centerY > height + cardHeight) continue;
      const points = Array.from({ length: 6 }, (_, index) => {
        const angle = Math.PI / 3 * index;
        return `${(centerX + Math.cos(angle) * cardWidth / 2).toFixed(1)},${(centerY + Math.sin(angle) * cardHeight / 2).toFixed(1)}`;
      }).join(' ');
      gridCells.push(`<polygon class="admin-tech-grid-cell ${q === 0 && r === 0 ? 'admin-tech-grid-origin' : ''}" points="${points}"/>`);
    }
  }
  const cards = nodes.map(node => {
    const position = positions.get(node.id);
    const parentNames = (node.prerequisites || []).map(id => byId.get(id)?.name || id);
    return `<button type="button" draggable="true" class="admin-tech-graph-node" data-tech-focus="${safe(node.id)}" style="left:${position.x}px;top:${position.y}px"><span>${node.prerequisites?.length ? 'BRANCH NODE · DRAG TO MOVE' : 'FOUNDATION · DRAG TO MOVE'}</span><b>${safe(node.name || node.id)}</b><small>${parentNames.length ? `Requires ${safe(parentNames.join(', '))}` : 'Starting point'}</small></button>`;
  }).join('');
  host.innerHTML = `<div class="admin-tech-grid-hint">HONEYCOMB SNAP GRID <span>Drag a node; it snaps to the nearest cell</span></div><div class="admin-tech-graph-scroll"><div class="admin-tech-graph-canvas" style="width:${width}px;height:${height}px"><svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${gridCells.join('')}${edges}</svg>${cards}</div></div>`;
  const canvas = host.querySelector('.admin-tech-graph-canvas');
  host.querySelectorAll('[data-tech-focus]').forEach(button => button.addEventListener('dragstart', event => {
    event.dataTransfer.setData('text/plain', button.dataset.techFocus);
    event.dataTransfer.effectAllowed = 'move';
  }));
  canvas.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
  canvas.addEventListener('drop', event => {
    event.preventDefault();
    const node = nodes.find(entry => entry.id === event.dataTransfer.getData('text/plain'));
    if (!node) return;
    const bounds = canvas.getBoundingClientRect();
    const localX = (event.clientX - bounds.left) * canvas.offsetWidth / bounds.width - padding;
    const localY = (event.clientY - bounds.top) * canvas.offsetHeight / bounds.height - padding;
    const r = Math.round(localY / gapR) + minR;
    const q = Math.round((localX - (r - minR) * gapQ / 2) / gapQ) + minQ;
    node.gridPosition = { q: Math.max(-20, Math.min(20, q)), r: Math.max(-20, Math.min(20, r)) };
    renderCatalogForms();
    $('technology-message').textContent = `Moved ${node.name || node.id}. Placement is part of the draft; validate and create a draft to save it.`;
  });
  host.querySelectorAll('[data-tech-focus]').forEach(button => button.addEventListener('click', () => {
    const node = nodes.find(entry => entry.id === button.dataset.techFocus);
    const section = $('technology-structured-editor').querySelector(`[data-editor-section="technologyNodes"]`);
    section?.open && section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const entry = [...($('technology-structured-editor').querySelectorAll('.structured-entry'))]
      .find(element => element.querySelector('input[data-editor-path]')?.value === node?.id);
    if (entry) { entry.hidden = false; entry.open = true; }
    entry?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
}

function renderCatalogForms() {
  if (!catalogContentState) return;
  renderCatalogEditor($('catalog-structured-editor'), catalogContentState);
  renderCatalogEditor($('technology-structured-editor'), catalogContentState, 'technologyNodes');
  renderAdminTechnologyGraph();
  syncCatalogJson();
}

function applyCatalogEditorChange(event) {
  const target = event.target;
  if (target.closest('.studio-toolbar, .studio-section-nav')) return;
  // Both dropdowns apply their selection immediately; process them before the
  // normal form handler rerenders the editor and resets the select element.
  if (target.matches('[data-effect-choice]')) {
    if (!target.value) return;
    const added = Boolean(mutateTechnologyEffect(
      catalogContentState,
      JSON.parse(target.dataset.effectPath),
      'add-effect',
      target.value,
    ));
    const messageId = target.closest('#technology-structured-editor') ? 'technology-message' : 'catalog-message';
    renderCatalogForms();
    $(messageId).textContent = added
      ? 'Gameplay effect added. Configure its IDs or resource multipliers, then validate the catalog.'
      : 'That gameplay effect is already configured or unavailable.';
    return;
  }
  if (target.matches('[data-prerequisite-choice]')) {
    if (!target.value) return;
    const added = addTechnologyPrerequisite(
      catalogContentState,
      JSON.parse(target.dataset.prerequisitePath),
      target.value,
    );
    renderCatalogForms();
    $('technology-message').textContent = added
      ? 'Prerequisite added. Validate the tree to check for missing links or cycles.'
      : 'That prerequisite is unavailable or already selected.';
    return;
  }
  let operationMessage = '';
  if (target.matches('[data-editor-path][data-editor-type]')) {
    const path = JSON.parse(target.dataset.editorPath);
    const type = target.dataset.editorType;
    let value = target.type === 'checkbox' ? target.checked : target.value;
    if (type === 'number') value = Number(value);
    if (type === 'map-key') {
      renameEffectMapKey(catalogContentState, path, value.trim());
      renderCatalogForms();
      return;
    }
    if (type === 'list' || type === 'list-number') {
      value = value.split(',').map(entry => entry.trim()).filter(Boolean);
      if (type === 'list-number') value = value.map(Number);
    }
    setCatalogPath(catalogContentState, path, value);
  }
  const operation = target.closest('[data-editor-op]');
  if (operation) {
    const path = JSON.parse(operation.dataset.editorPath);
    const op = operation.dataset.editorOp;
    if (op === 'add-effect') {
      const choice = operation.closest('.effect-picker')?.querySelector('[data-effect-choice]');
      mutateTechnologyEffect(catalogContentState, path, op, choice?.value.trim());
    } else if (op.startsWith('add-effect') || op.startsWith('remove-effect')) {
      mutateTechnologyEffect(catalogContentState, path, op);
    } else if (op === 'remove-prerequisite') {
      mutateCatalogArray(catalogContentState, path, 'remove');
    } else mutateCatalogArray(catalogContentState, path, op);
  }
  renderCatalogForms();
  if (operationMessage) $('technology-message').textContent = operationMessage;
}

function catalogEditorContent() {
  if (!catalogContentState) throw new Error('Catalog has not loaded yet.');
  return JSON.parse(JSON.stringify(catalogContentState));
}

async function previewCatalog(target = 'catalog') {
  if (!catalogContentState) return;
  const content = catalogEditorContent();
  const result = await apiRequest('catalog_preview', 'POST', { content });
  const message = $(target === 'technology' ? 'technology-message' : 'catalog-message');
  const output = $(target === 'technology' ? 'technology-preview-output' : 'catalog-preview-output');
  message.textContent = result.ok ? 'Validation passed. Preview is read-only; no content was saved or published.' : result.error || 'Catalog preview rejected.';
  output.classList.toggle('hidden', !result.ok);
  if (result.ok) output.textContent = JSON.stringify(result.preview, null, 2);
  return result;
}

async function createCatalogDraft(target = 'catalog') {
  if (!catalogContentState) return;
  const content = catalogEditorContent();
  const result = await apiRequest('catalog_draft', 'POST', { content });
  const message = $(target === 'technology' ? 'technology-message' : 'catalog-message');
  message.textContent = result.ok ? `Created immutable draft version ${result.version}. Review it in Catalog Studio before publishing.` : result.error || 'Draft was rejected.';
  if (result.ok) await loadCatalogStudio();
}

async function loadCatalogStudio() {
  const message = $('catalog-message');
  const result = await apiRequest('catalog_studio');
  if (!result.ok) {
    message.textContent = result.error || 'Catalog studio access denied.';
    $('technology-message').textContent = result.error || 'Technology editor access denied.';
    for (const id of ['catalog-preview', 'catalog-create-draft', 'technology-preview', 'technology-create-draft', 'technology-add-node']) $(id).disabled = true;
    return;
  }
  if (!catalogStudioLoaded) {
    const { version, ...content } = result.active;
    catalogContentState = content;
    catalogStudioLoaded = true;
    renderCatalogForms();
  }
  message.textContent = `Active catalog version ${result.active.version}. Draft content is immutable after creation.`;
  $('technology-message').textContent = `Editing the technology nodes inside active catalog version ${result.active.version}. Changes remain drafts until published.`;
  $('catalog-version-list').innerHTML = result.versions.length ? result.versions.map(version => `<article class="catalog-version"><div><b>VERSION ${version.version}</b><span>${safe(version.status.toUpperCase())}${version.rollback_of ? ` · ROLLBACK OF ${version.rollback_of}` : ''}</span></div><div>${version.status === 'draft' ? `<button class="button button-secondary" data-catalog-action="publish" data-version-id="${version.id}">Publish</button>` : ''}${version.status === 'published' ? `<button class="button button-secondary" data-catalog-action="disable" data-version-id="${version.id}">Disable</button>` : ''}${version.status !== 'published' ? `<button class="text-action" data-catalog-action="rollback" data-version-id="${version.id}">Rollback to this version</button>` : ''}</div></article>`).join('') : '<div class="panel-note">No persisted versions yet; active values are using the bundled defaults.</div>';
  $('catalog-version-list').querySelectorAll('[data-catalog-action]').forEach(button => button.addEventListener('click', async () => {
    const action = button.dataset.catalogAction;
    const payload = action === 'rollback'
      ? { source_version_id: Number(button.dataset.versionId) }
      : { version_id: Number(button.dataset.versionId) };
    const response = await apiRequest(`catalog_${action}`, 'POST', payload);
    if (!response.ok) { message.textContent = response.error || `Could not ${action} catalog.`; return; }
    message.textContent = `Catalog action complete · active version ${response.version}.`;
    await Promise.all([loadCatalogStudio(), loadGameCatalog()]);
  }));
}

$('catalog-refresh').addEventListener('click', loadCatalogStudio);
$('catalog-preview').addEventListener('click', () => previewCatalog('catalog'));
$('technology-preview').addEventListener('click', () => previewCatalog('technology'));
$('catalog-create-draft').addEventListener('click', () => createCatalogDraft('catalog'));
$('technology-create-draft').addEventListener('click', () => createCatalogDraft('technology'));
$('technology-add-node').addEventListener('click', () => {
  if (!catalogContentState) return;
  mutateCatalogArray(catalogContentState, ['technologyNodes'], 'add');
  renderCatalogForms();
  $('technology-message').textContent = 'New unsaved node added. Give it a unique ID and configure its prerequisites and effects.';
});
$('catalog-apply-json').addEventListener('click', () => {
  try {
    const content = JSON.parse($('catalog-content').value);
    if (!content || Array.isArray(content) || typeof content !== 'object') throw new Error('Catalog JSON must be an object.');
    catalogContentState = content;
    renderCatalogForms();
    $('catalog-message').textContent = 'Advanced JSON applied to the structured editor. Validate before creating a draft.';
  } catch (error) {
    $('catalog-message').textContent = `Invalid JSON: ${error.message}`;
  }
});
for (const host of [$('catalog-structured-editor'), $('technology-structured-editor')]) {
  host.addEventListener('change', applyCatalogEditorChange);
  host.addEventListener('click', event => {
    if (event.target.closest('[data-editor-op]')) applyCatalogEditorChange(event);
  });
}
function typeLabel(kind) { return ({ help: '🛠 HELP REQUEST', trade: '⇄ TRADE OFFER', collab: '🤝 COLLABORATION' })[kind] || 'COMMUNITY'; }
function renderCommunity() {
  const feed = $('community-feed'); if (!feed) return;
  const moderationPanel = communityCanModerate
    ? '<section class="panel moderation-tools"><div><b>MODERATION</b><small>Reports are private to moderators.</small></div><button class="button button-secondary" id="load-moderation-queue">Open report queue</button><div id="moderation-reports"></div></section>'
    : '';
  if (!communityPosts.length) {
    feed.innerHTML = `${moderationPanel}<div class="panel community-notice">No open transmissions yet. Be the first to post.</div>`;
    $('load-moderation-queue')?.addEventListener('click', loadModerationQueue);
    return;
  }
  feed.innerHTML = moderationPanel + communityPosts.map(post => {
    const statusLabel = post.status === 'matched' ? 'TRADE AGREED' : post.status === 'completed' ? 'COMPLETED' : 'OPEN';
    const trade = post.kind === 'trade' ? `<div class="trade-summary"><div><small>OFFERING</small><b>${safe(post.offering)}</b></div><span>⇄</span><div><small>LOOKING FOR</small><b>${safe(post.seeking)}</b></div></div>` : '';
    const replies = (post.replies || []).map(reply => `<div class="community-reply"><b>${safe(reply.username)}</b><span>${safe(reply.message)}</span><time>${safe(String(reply.created_at).slice(0,16))}</time></div>`).join('');
    const canJoin = account && !post.is_mine && !post.is_member && post.status === 'open';
    const actionLabel = post.kind === 'trade' ? 'Offer to trade' : post.kind === 'help' ? 'I can help' : 'Join collaboration';
    const joinAction = canJoin ? `<button class="button button-secondary" data-community-join="${post.id}">${actionLabel} <span>＋</span></button>` : post.is_member ? '<span class="joined-label">✓ YOU JOINED</span>' : '';
    const closeAction = account && post.is_mine && post.status === 'open' ? `<button class="text-action" data-community-close="${post.id}">${post.kind === 'trade' ? 'Mark trade agreed' : 'Mark complete'}</button>` : '';
    const safetyActions = account && !post.is_mine ? `<button class="text-action" data-community-report="${post.id}">Report</button><button class="text-action" data-community-block="${post.player_id}">Block player</button>` : '';
    const replyForm = account && post.status === 'open' ? `<form class="reply-form" data-community-reply="${post.id}"><input name="message" maxlength="400" placeholder="Write a friendly reply…" required><button class="button button-secondary" type="submit">Reply</button></form>` : '';
    return `<article class="panel community-post"><header class="post-header"><span class="post-kind kind-${post.kind}">${typeLabel(post.kind)}</span><span class="post-status ${post.status}">${statusLabel}</span></header><h3>${safe(post.title)}</h3><p class="post-body">${safe(post.body)}</p>${trade}<div class="post-meta"><span>by <b>${safe(post.username)}</b></span><span>◌ ${post.member_count} joined</span><span>▤ ${(post.replies || []).length} replies</span><time>${safe(String(post.created_at).slice(0,16))}</time></div><div class="post-actions">${joinAction}${closeAction}${safetyActions}</div><div class="reply-list">${replies}</div>${replyForm}</article>`;
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
  document.querySelectorAll('[data-community-report]').forEach(button => button.addEventListener('click', async () => {
    const details = window.prompt('Briefly explain why you are reporting this post (optional):');
    if (details === null) return;
    const result = await apiRequest('community_report', 'POST', { post_id: Number(button.dataset.communityReport), reason: 'other', details });
    toast(result.ok ? 'Report sent to the moderation team.' : result.error || 'Could not send report.');
  }));
  document.querySelectorAll('[data-community-block]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm('Block this player? Their posts and replies will be hidden from you.')) return;
    const result = await apiRequest('community_block', 'POST', { user_id: Number(button.dataset.communityBlock) });
    if (!result.ok) { toast(result.error || 'Could not block player.'); return; }
    toast(result.blocked ? 'Player blocked.' : 'Player was already blocked.');
    await loadCommunity();
  }));
  $('load-moderation-queue')?.addEventListener('click', loadModerationQueue);
}

async function loadModerationQueue() {
  const target = $('moderation-reports');
  if (!target) return;
  target.textContent = 'Loading reports…';
  const result = await apiRequest('moderation_queue');
  if (!result.ok) { target.textContent = result.error || 'Could not load reports.'; return; }
  target.innerHTML = result.reports.length ? result.reports.map(report => `<article class="moderation-report"><b>${safe(report.reason)} · ${safe(report.post.username)} · ${safe(report.post.title)}</b><p>${safe(report.details || 'No additional details.')}</p><div><button class="text-action" data-report-id="${report.id}" data-moderation-action="hide_post">Hide post</button><button class="text-action" data-report-id="${report.id}" data-moderation-action="dismiss">Dismiss</button></div></article>`).join('') : '<small>No pending reports.</small>';
  target.querySelectorAll('[data-moderation-action]').forEach(button => button.addEventListener('click', async () => {
    const note = window.prompt('Add a short private moderation note:') ?? '';
    const resolved = await apiRequest('moderation_resolve', 'POST', { report_id: Number(button.dataset.reportId), decision: button.dataset.moderationAction, note });
    if (!resolved.ok) { toast(resolved.error || 'Could not resolve report.'); return; }
    toast('Moderation action recorded.');
    await Promise.all([loadCommunity(), loadModerationQueue()]);
  }));
}
async function loadCommunity() {
  const result = await apiRequest('community_feed');
  if (!result.ok) { $('community-feed').innerHTML = `<div class="panel community-notice">${safe(result.error || 'Could not load community posts.')}</div>`; return; }
  communityPosts = result.posts || [];
  communityCanModerate = Boolean(result.can_moderate);
  renderCommunity();
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
  scene.setRobots(simulation.robots);
  $('production-list').innerHTML = items.map(item => {
    const owned = economy.state.owned[item.id] || 0, price = economy.price(item);
    const locked = Boolean(item.unlockNode && !technologyState?.effects?.unlockBotKinds?.includes(item.id));
    const affordable = economy.canAfford(price, item.currency) && total < 20 && !locked;
    const label = locked ? 'RESEARCH TO UNLOCK' : `${price} ${item.currency === 'credits' ? '¢' : '▧'} ＋`;
    return `<div class="production-item ${locked ? 'production-locked' : ''}"><div class="item-icon" style="--item-color:${safe(item.tint)}">${safe(item.icon)}</div><div class="item-copy"><b>${safe(item.name)}</b><small>${safe(item.role)}${locked ? ` · Requires ${safe(item.unlockNode.replaceAll('_', ' '))}` : ''}</small></div><span class="owned-count">×${owned}</span><button class="button button-buy" data-buy-item="${item.id}" ${affordable ? '' : 'disabled'}>${label}</button></div>`;
  }).join('');
  $('fullscreen-shop').innerHTML = `<div class="scene-quickshop-title">ASSEMBLE · ${total}/20 UNITS</div>${items.map(item => {
    const owned = economy.state.owned[item.id] || 0, price = economy.price(item);
    const locked = Boolean(item.unlockNode && !technologyState?.effects?.unlockBotKinds?.includes(item.id));
    const affordable = economy.canAfford(price, item.currency) && total < 20 && !locked;
    return `<button class="scene-buy-button" data-buy-item="${item.id}" ${affordable ? '' : 'disabled'}><span>${safe(item.icon)}</span><b>${safe(item.name)}</b><small>${locked ? 'RESEARCH TO UNLOCK' : `×${owned} · ${price} ${item.currency === 'credits' ? '¢' : '▧'}`}</small></button>`;
  }).join('')}`;
  document.querySelectorAll('[data-buy-item]').forEach(button => button.addEventListener('click', () => {
    const item = items.find(entry => entry.id === button.dataset.buyItem);
    if (account) {
      apiRequest('robot_purchase', 'POST', { kind: item.id, idempotency_key: `browser:${crypto.randomUUID()}` }).then(result => {
        if (!result.ok) { toast(result.error || 'Robot purchase failed.'); return; }
        applyServerJobs(result); toast(`${item.name} assembled and saved to your account.`);
      });
      return;
    }
    if (economy.buyItem(button.dataset.buyItem)) { toast(`${item.name} assembled.`); render(); } else toast(total >= 20 ? 'Your production line is full.' : 'Not enough resources yet.');
  }));
}

function renderUpgrades() {
  $('upgrade-list').innerHTML = upgrades.map(up => {
    const owned = !!economy.state.bought[up.id];
    const affordable = economy.canAfford(up.cost, up.currency);
    return `<div class="upgrade-card ${owned ? 'purchased' : ''}"><span class="upgrade-icon">${safe(up.icon)}</span><div class="upgrade-copy"><b>${safe(up.name)}</b><small>${safe(up.description)}</small></div><button class="button button-upgrade" data-buy-upgrade="${up.id}" ${account || owned || !affordable ? 'disabled' : ''}>${account ? 'SERVER CATALOG NEXT' : owned ? 'INSTALLED' : `${up.cost} ${up.currency === 'credits' ? '¢' : '▧'}　＋`}</button></div>`;
  }).join('');
  document.querySelectorAll('[data-buy-upgrade]').forEach(button => button.addEventListener('click', () => {
    const up = upgrades.find(entry => entry.id === button.dataset.buyUpgrade);
    if (economy.buyUpgrade(up.id)) { toast(`${up.name} installed.`); render(); } else toast('Not enough resources yet.');
  }));
}

function renderTechnologyTree() {
  const host = $('technology-tree');
  if (account && !technologyState) {
    delete host.dataset.renderKey;
    host.innerHTML = '<div class="panel-note">Loading server technology…</div>';
    return;
  }
  const nodes = account ? technologyState.nodes || [] : technologyPreview;
  const renderKey = JSON.stringify([!!account, nodes, economy.state.credits, economy.state.scrap]);
  if (host.dataset.renderKey === renderKey) return;
  host.dataset.renderKey = renderKey;
  if (!nodes.length) {
    host.innerHTML = '<div class="panel-note">No technology nodes are published yet.</div>';
    return;
  }
  const byId = new Map(nodes.map(node => [node.id, node]));
  const depthFor = (node, visiting = new Set()) => {
    if (!node.prerequisites?.length) return 0;
    if (visiting.has(node.id)) return 0;
    visiting.add(node.id);
    return 1 + Math.max(...node.prerequisites.map(id => depthFor(byId.get(id) || { id, prerequisites: [] }, new Set(visiting))));
  };
  const sortedNodes = [...nodes].sort((a, b) => depthFor(a) - depthFor(b) || nodes.indexOf(a) - nodes.indexOf(b));
  const axialDistance = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
  const axialRing = radius => {
    const points = [];
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === radius) points.push({ q, r });
      }
    }
    return points.sort((a, b) => Math.atan2(a.r * 1.5, (a.q + a.r / 2) * Math.sqrt(3)) - Math.atan2(b.r * 1.5, (b.q + b.r / 2) * Math.sqrt(3)));
  };
  const axialPositions = new Map(), occupied = new Set();
  for (const node of sortedNodes) {
    if (!Number.isInteger(node.gridPosition?.q) || !Number.isInteger(node.gridPosition?.r)) continue;
    const point = { q: node.gridPosition.q, r: node.gridPosition.r };
    axialPositions.set(node.id, point);
    occupied.add(`${point.q},${point.r}`);
  }
  for (const node of sortedNodes) {
    if (axialPositions.has(node.id)) continue;
    const depth = depthFor(node);
    const parents = (node.prerequisites || []).map(id => axialPositions.get(id)).filter(Boolean);
    if (depth === 0 && !occupied.has('0,0')) {
      axialPositions.set(node.id, { q: 0, r: 0 });
      occupied.add('0,0');
      continue;
    }
    const candidates = axialRing(Math.max(1, depth)).filter(point => !occupied.has(`${point.q},${point.r}`)
      && (!parents.length || parents.some(parent => axialDistance(point, parent) === 1)));
    const fallback = axialRing(Math.max(1, depth)).filter(point => !occupied.has(`${point.q},${point.r}`));
    const point = candidates[0] || fallback[0] || { q: depth, r: sortedNodes.indexOf(node) };
    axialPositions.set(node.id, point);
    occupied.add(`${point.q},${point.r}`);
  }
  const hexSize = 100, hexWidth = Math.sqrt(3) * hexSize, hexHeight = 2 * hexSize, mapMargin = 160;
  const raw = new Map(sortedNodes.map(node => {
    const point = axialPositions.get(node.id);
    return [node.id, { x: hexSize * Math.sqrt(3) * (point.q + point.r / 2), y: hexSize * 1.5 * point.r }];
  }));
  const xs = [...raw.values()].map(point => point.x), ys = [...raw.values()].map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = maxX - minX + hexWidth + mapMargin * 2;
  const height = maxY - minY + hexHeight + mapMargin * 2;
  const positions = new Map(sortedNodes.map(node => {
    const point = raw.get(node.id);
    return [node.id, { x: mapMargin + hexWidth / 2 + point.x - minX, y: mapMargin + hexHeight / 2 + point.y - minY }];
  }));
  const connectorDistance = vector => {
    const length = Math.hypot(vector.x, vector.y) || 1;
    const ux = Math.abs(vector.x / length), uy = Math.abs(vector.y / length);
    return Math.min((hexWidth / 2) / (ux || Number.EPSILON), (hexHeight / 2) / (uy || Number.EPSILON), hexWidth / (ux + Math.sqrt(3) * uy));
  };
  const connections = nodes.flatMap(node => (node.prerequisites || []).flatMap(prerequisiteId => {
    const from = positions.get(prerequisiteId), to = positions.get(node.id);
    if (!from || !to) return [];
    const direction = { x: to.x - from.x, y: to.y - from.y };
    const startOffset = connectorDistance(direction), endOffset = connectorDistance(direction);
    const length = Math.hypot(direction.x, direction.y) || 1;
    const startX = from.x + direction.x / length * startOffset;
    const startY = from.y + direction.y / length * startOffset;
    const endX = to.x - direction.x / length * endOffset;
    const endY = to.y - direction.y / length * endOffset;
    const active = node.owned || node.available;
    return [`<path class="technology-link ${active ? 'technology-link-active' : ''}" d="M ${startX} ${startY} L ${endX} ${endY}"/>`];
  })).join('');
  const nodeCards = nodes.map(node => {
    const effects = node.effects || {};
    const unlocks = [...(effects.unlockResources || []).map(id => `Unlocks ${id}`), ...(effects.unlockZones || []).map(id => `Opens ${id} zone`), ...(effects.unlockCapabilities || []).map(id => `Enables ${id.replaceAll('_', ' ')}`), ...(effects.unlockPrograms || []).map(id => `Unlocks ${id.replaceAll('_', ' ')} program`), ...(effects.unlockModules || []).map(id => `Unlocks ${id.replaceAll('_', ' ')} module`), ...(effects.unlockBotKinds || []).map(id => `Unlocks ${id.replaceAll('_', ' ')} bot`), ...(effects.sceneUnlocks || []).map(id => `Builds ${id.replaceAll('_', ' ')}`),
      ...Object.entries(effects.spawnWeightMultipliers || {}).map(([id, multiplier]) => `${id} spawn ×${multiplier}`),
      ...Object.entries(effects.deliveryValueMultipliers || {}).map(([id, multiplier]) => `${id} value ×${multiplier}`),
      ...Object.entries(effects.stockMultipliers || {}).map(([id, multiplier]) => `${id} stock ×${multiplier}`),
      ...Object.entries(effects.respawnTimeMultipliers || {}).map(([id, multiplier]) => `${id} restock time ×${multiplier}`)];
    const prereqs = node.prerequisites?.length ? `Requires ${node.prerequisites.join(', ')}` : 'Foundation node';
    const affordable = (economy.state[node.currency] || 0) >= node.cost;
    const position = positions.get(node.id);
    const status = node.owned ? 'RESEARCHED' : node.available ? affordable ? 'READY TO RESEARCH' : 'NEED MORE RESOURCES' : 'LOCKED';
    const glyph = ({ prospecting: '⌕', refinery: '⚒', deep_veins: '◈', sorting_rig: '✧' })[node.id] || '⬡';
    const tooltipId = `technology-tip-${safe(node.id)}`;
    return `<article class="technology-node ${node.owned ? 'technology-owned' : ''} ${node.available ? 'technology-available' : ''}" data-tech-node="${safe(node.id)}" tabindex="0" aria-describedby="${tooltipId}" style="left:${position.x - hexWidth / 2}px;top:${position.y - hexHeight / 2}px"><button class="technology-hex" data-tech-purchase="${safe(node.id)}" aria-label="${safe(node.name)}: ${status}" ${!node.available || node.owned || !affordable ? 'disabled' : ''}><span class="technology-glyph">${glyph}</span><strong>${safe(node.name)}</strong><small>${status}</small><span class="technology-hex-cost">${node.owned ? '✓ COMPLETE' : `${node.cost} ${node.currency === 'credits' ? '¢' : '▧'}`}</span></button><div class="technology-tooltip" id="${tooltipId}" role="tooltip"><b>${safe(node.name)}</b><p>${safe(node.description)}</p><small>${safe(prereqs)}</small>${unlocks.length ? `<ul>${unlocks.map(effect => `<li>${safe(effect)}</li>`).join('')}</ul>` : ''}<span class="technology-tooltip-cost">${node.owned ? 'Already researched' : `${node.cost} ${node.currency === 'credits' ? 'credits' : 'scrap'}${!node.available ? ' · unlock prerequisite first' : !affordable ? ' · insufficient resources' : ' · select node to research'}`}</span></div></article>`;
  }).join('');
  host.innerHTML = `<div class="technology-legend"><span><i class="technology-legend-dot owned"></i> Researched</span><span><i class="technology-legend-dot available"></i> Available</span><span><i class="technology-legend-dot locked"></i> Locked by prerequisites</span><span class="subtle">Hover or focus a node for details</span></div><div class="technology-map-scroll"><div class="technology-map technology-honeycomb" style="width:${width}px;height:${height}px"><svg class="technology-connections" viewBox="0 0 ${width} ${height}" aria-hidden="true">${connections}</svg>${nodeCards}</div></div>`;
  enhanceResearch(host, nodes, !!account);
  host.querySelectorAll('[data-tech-purchase]').forEach(button => button.addEventListener('click', async () => {
    if (!account || button.disabled) return;
    button.disabled = true;
    if (!await settleOfflineProgress()) { button.disabled = false; toast('Settle current bot deliveries before researching.'); return; }
    const nodeId = button.dataset.techPurchase;
    const result = await apiRequest('technology_purchase', 'POST', { node_id: nodeId, request_key: crypto.randomUUID() });
    if (!result.ok) { button.disabled = false; toast(result.error || 'Research purchase failed.'); render(); return; }
    technologyState = result.technology;
    economy.state.credits = Number(result.wallet.credits);
    economy.state.scrap = Number(result.wallet.scrap);
    simulation.setResourceDefinitions(technologyState.resources || []);
    simulation.setTechnologyEffects(technologyState.effects || {});
    scene.setTechnology(technologyState.effects?.sceneUnlocks || []);
    simulation.setWorldSeed(worldSeed);
    render();
    toast(`${result.technology.nodes.find(node => node.id === nodeId)?.name || 'Technology'} researched. New world content is active.`);
  }));
}

function renderMissions() {
  if (account) {
    renderServerMissions();
    return;
  }
  const crew = Object.values(economy.state.owned).reduce((a, b) => a + b, 0);
  const current = economy.state.sector || 1;
  const sectors = [current, current + 1, current + 2];
  $('sector-number').textContent = String(current).padStart(2, '0');
  $('mission-list').innerHTML = sectors.map((sector, index) => {
    const danger = Math.max(0, sector - crew * 2);
    const rewards = economy.missionPreview(sector);
    const locked = sector > current;
    const titleIndex = index % 3;
    return `<article class="mission-card ${locked ? 'mission-locked' : ''}"><div class="mission-index">${String(sector).padStart(2, '0')}</div><div class="mission-main"><div class="eyebrow">${locked ? 'FRONTIER SIGNAL' : 'AVAILABLE CONTRACT'}</div><h3>${['Dustline salvage', 'Rusted relay', 'The green vault'][titleIndex]}</h3><p>${['Recover abandoned alloys from the outer debris field.', 'Search a collapsed comms station for usable components.', 'An overgrown depot may still have intact machine parts.'][titleIndex]}</p><div class="mission-rewards"><span>REWARD</span><b>¢ ${rewards.credits}</b><b>▧ ${rewards.scrap}</b><span class="danger ${danger > 0 ? 'high-danger' : ''}">THREAT ${danger ? '▲'.repeat(Math.min(3, danger)) : 'LOW'}</span></div></div><button class="button ${locked ? 'button-secondary' : 'button-primary'} mission-launch" data-mission="${sector}" ${account || !crew || missionBusy || locked ? 'disabled' : ''}>${account ? 'SERVER MISSIONS NEXT' : locked ? 'Scout sector' : 'Deploy crew'} <span>→</span></button></article>`;
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

function renderServerMissions() {
  const state = playerMissionState;
  if (!state) {
    $('mission-list').innerHTML = '<div class="panel mission-result">Loading your server mission roster…</div>';
    return;
  }
  const current = Number(state.unlocked_sector || 1);
  const active = state.active_run;
  const contracts = state.contracts || [];
  $('sector-number').textContent = String(current).padStart(2, '0');
  $('mission-list').innerHTML = contracts.map((contract, index) => {
    const sector = Number(contract.sector);
    const locked = !contract.unlocked;
    const activeRun = active?.sector === sector;
    const ready = activeRun && Date.now() >= Date.parse(active.completes_at);
    const secondsLeft = activeRun ? Math.max(0, Math.ceil((Date.parse(active.completes_at) - Date.now()) / 1000)) : 0;
    const rewards = contract.reward_preview || { credits: 0, scrap: 0 };
    const titleIndex = (sector - 1) % 3;
    const actionText = activeRun ? (ready ? 'Claim results' : `In progress · ${secondsLeft}s`) : locked ? 'Sector locked' : 'Launch mission';
    const disabled = missionBusy || (activeRun ? !ready : (!!active || locked || Number(state.crew_count) < Number(contract.crew_required)));
    const cooperativeRun = activeRun && active.cooperative_job_id;
    const selectedCoop = Number(selectedCooperativeJobId) > 0 && Number(state.cooperative_jobs?.find(job => Number(job.id) === Number(selectedCooperativeJobId))?.sector) === sector;
    return `<article class="mission-card ${locked ? 'mission-locked' : ''}"><div class="mission-index">${String(sector).padStart(2, '0')}</div><div class="mission-main"><div class="eyebrow">${cooperativeRun ? 'CO-OP CREW DEPLOYED' : activeRun ? 'CREW DEPLOYED' : locked ? 'FRONTIER SIGNAL' : 'AVAILABLE CONTRACT'}</div><h3>${['Dustline salvage', 'Rusted relay', 'The green vault'][titleIndex]}</h3><p>${activeRun ? `Your ${state.crew_count} programmed robot(s) are on a server-timed ${contract.duration_seconds}-second deployment${cooperativeRun ? ' for the shared co-op contract' : ''}.` : ['Recover abandoned alloys from the outer debris field.', 'Search a collapsed comms station for usable components.', 'An overgrown depot may still have intact machine parts.'][titleIndex]}${selectedCoop && !activeRun ? ' · Selected co-op job contribution' : ''}</p><div class="mission-rewards"><span>${activeRun ? `COMPLETES ${new Date(active.completes_at).toLocaleTimeString()}` : `~${contract.duration_seconds}s`}</span><b>¢ ${rewards.credits}</b><b>▧ ${rewards.scrap}</b></div></div><button class="button ${locked ? 'button-secondary' : 'button-primary'} mission-launch" data-server-mission="${sector}" ${activeRun ? `data-mission-claim="${safe(active.run_key)}"` : ''} ${disabled ? 'disabled' : ''}>${actionText} <span>→</span></button></article>`;
  }).join('');

  document.querySelectorAll('[data-server-mission]').forEach(button => button.addEventListener('click', async () => {
    if (missionBusy || !account) return;
    missionBusy = true;
    button.disabled = true;
    try {
      if (button.dataset.missionClaim) {
        const claimed = await apiRequest('mission_claim', 'POST', { run_key: button.dataset.missionClaim });
        if (!claimed.ok) { toast(claimed.error || 'Mission is not ready to claim.'); return; }
        economy.state.credits = claimed.wallet.credits;
        economy.state.scrap = claimed.wallet.scrap;
        const panel = $('mission-result');
        panel.classList.remove('hidden');
        panel.innerHTML = `<div class="eyebrow">${claimed.success ? 'EXPEDITION COMPLETE' : 'EXPEDITION RECOVERY'} · SECTOR ${String(claimed.sector).padStart(2, '0')}</div><h3>${claimed.success ? 'Salvage secured.' : 'The crew returned safely.'}</h3><p>${claimed.success ? `Your ${claimed.crew_count} robot crew earned <b>¢ ${claimed.rewards.credits}</b> and <b>▧ ${claimed.rewards.scrap}</b>.` : 'The mission encountered a hazard; no resources were awarded.'}</p><ol class="mission-replay">${claimed.events.map(event => `<li><time>${String(event.at_second).padStart(2, '0')}s</time> ${safe(event.label)}</li>`).join('')}</ol>`;
        if (claimed.cooperative?.contributed) {
          panel.insertAdjacentHTML('afterbegin', `<p class="panel-note">Co-op progress: ${claimed.cooperative.progress}/${claimed.cooperative.goal}${claimed.cooperative.completed ? ` · Contract complete · +${claimed.cooperative.reward_credits} bonus credits` : ' · Contribution recorded'}</p>`);
        }
        if (claimed.inventory) renderInventory(claimed.inventory);
        toast(claimed.success ? 'Mission rewards settled to your server wallet.' : 'Mission resolved without a payout.');
      } else {
        const started = await apiRequest('mission_start', 'POST', {
          sector: Number(button.dataset.serverMission),
          run_key: `m:${crypto.randomUUID()}`,
          ...(selectedCooperativeJobId ? { cooperative_job_id: Number(selectedCooperativeJobId) } : {}),
        });
        if (!started.ok) { toast(started.error || 'Mission could not be launched.'); return; }
        toast(`Sector ${String(started.run.sector).padStart(2, '0')} crew deployed.`);
      }
      await loadPlayerMissions();
      render();
    } finally {
      missionBusy = false;
    }
  }));
}

function render() {
  const s = economy.state;
  const displayValues = account ? localSimulationValues : s;
  $('credits').textContent = compact(displayValues.credits); $('scrap').textContent = compact(displayValues.scrap); $('shards').textContent = compact(s.shards);
  $('credits-rate').textContent = account ? 'LOCAL SIMULATION · NOT SPENDABLE' : 'ROBOT DELIVERIES';
  $('scrap-rate').textContent = account ? 'LOCAL SIMULATION · NOT SPENDABLE' : 'ROBOT DELIVERIES';
  $('credits-server').classList.toggle('hidden', !account);
  $('scrap-server').classList.toggle('hidden', !account);
  if (account) {
    $('credits-server').textContent = `SERVER ¢${compact(s.credits)}`;
    $('scrap-server').textContent = `SERVER ▧${compact(s.scrap)}`;
  }
  simulation.syncCrew(s.owned);
  simulation.setUpgrades(s.bought);
  updateProgramTargets();
  const snapshot = simulation.snapshot();
  scene.setSimulation(snapshot);
  progression.render(snapshot, account);
  inspector.render(snapshot);
  $('scene-credits').textContent = compact(displayValues.credits);
  $('scene-scrap').textContent = compact(displayValues.scrap);
  $('scene-crew-status').innerHTML = snapshot.robots.length
    ? snapshot.robots.slice(0, 5).map(robot => `<div><b>U${String(robot.id + 1).padStart(2, '0')}</b> ${safe(robot.status)}</div>`).join('')
    : 'Build a bot to start the simulation.';
  const working = snapshot.robots.filter(robot => robot.phase !== 'idle').length;
  const carrying = snapshot.robots.filter(robot => robot.cargo > 0).length;
  $('scene-rate').textContent = snapshot.robots.length ? `${working} working · ${carrying} carrying` : 'No robots';
  $('crew-status').innerHTML = snapshot.robots.length
    ? snapshot.robots.map(robot => `<div class="crew-status-row"><b>UNIT ${String(robot.id + 1).padStart(2, '0')}</b><span>${safe(robot.status)}</span>${robot.cargo ? `<em>${robot.cargo} ${robot.cargoType}</em>` : ''}</div>`).join('')
    : '<div class="crew-status-empty">Build a robot, then deploy a program to assign its work.</div>';
  const deliveries = account
    ? serverDeliveries
    : snapshot.events.filter(event => event.type === 'delivery').slice(-3).reverse();
  const deliveryRows = deliveries.length
    ? `<div class="delivery-feed-title">${account ? 'SERVER-SETTLED DELIVERIES' : 'RECENT DELIVERIES'}</div>${deliveries.map(event => `<div class="delivery-event"><b>${event.deliveryCount ? `${event.deliveryCount} depot runs` : `UNIT ${String(event.robotId + 1).padStart(2, '0')}`}</b><span>+${event.amount} ${safe(event.resource)}</span><small>${event.deliveryCount ? 'offline deliveries' : `${event.cargo} recovered`}</small></div>`).join('')}`
    : `<div class="delivery-feed-empty">${account ? serverSimulationStatus || 'No server run completed yet · delivery checks run while this page is visible and unpaused.' : 'No deliveries yet · return cargo to the bay to earn.'}</div>`;
  $('delivery-feed').innerHTML = `${deliveryRows}${account ? `<div class="delivery-feed-empty">${serverSimulationStatus || walletSyncStatus}</div><div class="delivery-feed-actions"><button class="button button-secondary" id="wallet-sync-now" ${walletSyncBusy ? 'disabled' : ''}>${walletSyncBusy ? 'Syncing…' : 'Sync wallet'}</button><label>Auto-sync <select id="wallet-sync-interval" aria-label="Wallet auto-sync interval"><option value="15" ${walletSyncIntervalSeconds === 15 ? 'selected' : ''}>15s</option><option value="30" ${walletSyncIntervalSeconds === 30 ? 'selected' : ''}>30s</option><option value="60" ${walletSyncIntervalSeconds === 60 ? 'selected' : ''}>60s</option><option value="0" ${walletSyncIntervalSeconds === 0 ? 'selected' : ''}>Off</option></select></label></div>` : ''}`;
  $('rank').textContent = s.prestigeCount ? `Ascendant ${s.prestigeCount}` : s.credits > 1500 ? 'Mechanic' : 'Rookie';
  $('cycle-label').textContent = String(s.prestigeCount + 1).padStart(2, '0');
  $('prestige-preview').textContent = economy.shardPreview();
  $('prestige-button').disabled = account || economy.shardPreview() < 1;
  $('prestige-button').innerHTML = account ? 'SERVER PROGRESSION NEXT' : economy.shardPreview() ? `Synthesize ${economy.shardPreview()} shard${economy.shardPreview() > 1 ? 's' : ''} <span>→</span>` : 'Reach 1,200 lifetime credits <span>→</span>';
  renderItems(); renderUpgrades(); renderMissions();
  renderTechnologyTree();
}

function updateProgramTargets() {
  const select = $('brain-deploy-target');
  if (!select) return;
  const robots = simulation.snapshot().robots;
  const signature = robots.map(robot => `${robot.id}:${robot.kind}`).join('|');
  if (select.dataset.crewSignature !== signature) {
    const selected = select.value;
    const labels = Object.fromEntries(items.map(item => [item.id, item.name]));
    select.innerHTML = `<option value="all">Entire crew (${robots.length})</option>${items.map(item => `<option value="role:${item.id}">${safe(item.name)} role · local</option>`).join('')}${robots.map(robot => `<option value="unit:${robot.id}">Unit ${String(robot.id + 1).padStart(2, '0')} · ${labels[robot.kind]}</option>`).join('')}`;
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
    select.dataset.crewSignature = signature;
  }
  const follow = $('camera-follow');
  if (follow.dataset.crewSignature !== signature) {
    const followSelected = follow.value;
    follow.innerHTML = `<option value="">Free camera</option>${robots.map(robot => `<option value="${robot.id}">Follow unit ${String(robot.id + 1).padStart(2, '0')}</option>`).join('')}`;
    if ([...follow.options].some(option => option.value === followSelected)) follow.value = followSelected;
    follow.dataset.crewSignature = signature;
  }
  const controlTarget = $('control-target');
  if (controlTarget && controlTarget.dataset.crewSignature !== signature) {
    const controlSelected = controlTarget.value;
    controlTarget.innerHTML = robots.map(robot => `<option value="${robot.id}">Unit ${String(robot.id + 1).padStart(2, '0')}</option>`).join('') || '<option value="">No bots owned</option>';
    if ([...controlTarget.options].some(option => option.value === controlSelected)) controlTarget.value = controlSelected;
    controlTargetId = Number(controlTarget.value) || 0;
    controlTarget.dataset.crewSignature = signature;
  }
  const profiles = $('control-profile');
  if (profiles) {
    const profileSelected = profiles.value || 'Default';
    profiles.innerHTML = Object.keys(controlState.profiles).map(name => `<option value="${safe(name)}">${safe(name)}</option>`).join('');
    if ([...profiles.options].some(option => option.value === profileSelected)) profiles.value = profileSelected;
  }
  const templateList = $('server-template-list');
  if (templateList) {
    if (!account) templateList.innerHTML = '<div class="panel-note">Sign in to sync robot jobs and brain templates.</div>';
    else if (!playerJobs?.templates?.length) templateList.innerHTML = '<div class="panel-note">No server templates are available yet.</div>';
    else templateList.innerHTML = playerJobs.templates.map(template => `<div class="server-template-card"><b>${safe(template.name)} · v${template.version}</b><small>${safe(template.category)} · ${safe(template.compatible_kinds.join(', '))}</small><button class="button ${template.unlocked ? 'button-secondary' : 'button-primary'}" data-server-template="${template.id}" data-unlocked="${template.unlocked}" ${!template.unlocked && template.price > economy.state[template.currency] ? 'disabled' : ''}>${template.unlocked ? 'Deploy to selected bot' : `Unlock · ${template.price} ${template.currency}`}</button></div>`).join('');
  }
}

function activateRoute(name) {
  if (name !== 'expeditions' && battleReplayScene) {
    battleReplayScene.destroy();
    battleReplayScene = null;
  }
  document.querySelectorAll('.nav-link').forEach(link => {
    const routePaths = { 'admin-catalog': '/admin/catalog', 'admin-technology': '/admin/technology' };
    const active = link.dataset.route === (routePaths[name] || `/${name}`);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  const titles = { factory: 'Factory floor', brains: 'Brain lab', technology: 'Technology tree', expeditions: 'Expeditions', community: 'Community board', 'admin-catalog': 'Catalog studio', 'admin-technology': 'Technology graph editor', 'not-found': 'Sector not found' };
  $('page-title').textContent = titles[name] || titles['not-found'];
  if (name === 'brains' && !brainLoaded) {
    import('./brains.js').then(module => { module.createBrainWorkshop(); brainLoaded = true; })
      .catch(() => toast('Could not load the visual programming tools.'));
  }
  if (name === 'community') loadCommunity();
  if (name === 'expeditions') loadBattleArena();
  if (name === 'admin-catalog' || name === 'admin-technology') loadCatalogStudio();
  if (name === 'brains') window.setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
}

const router = createAppRouter(activateRoute);
document.addEventListener('keydown', event => {
  if (event.target.matches('input,textarea')) return;
  if (event.key === '1') router.navigate('/factory'); if (event.key === '2') router.navigate('/brains'); if (event.key === '3') router.navigate('/technology'); if (event.key === '4') router.navigate('/expeditions'); if (event.key === '5') router.navigate('/community');
});
$('camera-button').addEventListener('click', () => scene.resetCamera());
$('render-quality').value = accessibilitySettings.renderQuality;
$('render-quality').addEventListener('change', event => {
  accessibilitySettings.renderQuality = event.currentTarget.value;
  localStorage.setItem('scrapbound.accessibility.v1', JSON.stringify(accessibilitySettings));
  scene.setRenderQuality(accessibilitySettings.renderQuality);
});
$('reduced-motion').checked = Boolean(accessibilitySettings.reducedMotion);
$('reduced-motion').addEventListener('change', event => {
  accessibilitySettings.reducedMotion = event.currentTarget.checked;
  localStorage.setItem('scrapbound.accessibility.v1', JSON.stringify(accessibilitySettings));
  scene.setReducedMotion(accessibilitySettings.reducedMotion);
});
$('camera-follow').addEventListener('change', event => {
  scene.followRobot(event.currentTarget.value);
  $('camera-mode').textContent = event.currentTarget.value === '' ? 'FREE CAMERA' : `FOLLOWING UNIT ${String(Number(event.currentTarget.value) + 1).padStart(2, '0')}`;
});
$('control-target').addEventListener('change', event => { controlTargetId = Number(event.currentTarget.value) || 0; });
$('scene-fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $('scene-panel').requestFullscreen();
  } catch { toast('Fullscreen is unavailable in this browser.'); }
  window.dispatchEvent(new Event('resize'));
});
document.addEventListener('fullscreenchange', () => {
  $('scene-fullscreen').textContent = document.fullscreenElement ? '⛶ Exit full screen' : '⛶ Full screen';
  window.dispatchEvent(new Event('resize'));
});
$('simulation-toggle').addEventListener('click', event => {
  simulationPaused = !simulationPaused;
  scene.paused = simulationPaused;
  event.currentTarget.textContent = simulationPaused ? '▶ Resume' : 'Ⅱ Pause';
  event.currentTarget.setAttribute('aria-pressed', String(simulationPaused));
  $('scene-rate').textContent = simulationPaused ? 'Paused' : `${simulationSpeed}× speed`;
});
$('simulation-speed').addEventListener('click', event => {
  simulationSpeed = simulationSpeed === 1 ? 2 : simulationSpeed === 2 ? 4 : 1;
  event.currentTarget.textContent = `${simulationSpeed}× Speed`;
  if (!simulationPaused) $('scene-rate').textContent = `${simulationSpeed}× speed`;
});
$('settings-button').addEventListener('click', () => account?.can_manage_catalog ? router.navigate('/admin/catalog') : toast('Settings and cloud sync are coming in a later milestone.'));
$('prestige-button').addEventListener('click', () => {
  const gain = economy.shardPreview();
  if (!gain) return;
  if (!window.confirm(`Synthesize ${gain} Core Shard${gain > 1 ? 's' : ''}? Your current factory and cycle resources reset. Permanent shards remain.`)) return;
  const awarded = economy.prestige(); toast(`Cycle complete. +${awarded} Core Shard${awarded > 1 ? 's' : ''}.`); render();
});

render();
loadGameCatalog();
refreshAuth().then(loadCommunity);
let simClock = performance.now();
let simAccumulator = 0;
window.setInterval(() => {
  const now = performance.now(), elapsed = Math.min(.25, Math.max(0, (now - simClock) / 1000)); simClock = now;
  if (!simulationPaused) {
    simAccumulator += elapsed * simulationSpeed;
    while (simAccumulator >= .1) { simulation.tick(.1); simAccumulator -= .1; }
  }
  const robots = simulation.robots;
  robots.forEach(robot => {
    const profile = controlState.profiles[controlState.assignments[String(robot.id)] || 'Default'];
    if (profile?.mode !== 'keyboard') { simulation.manualInput(robot.id, 0, 0); return; }
    const bindings = profile.bindings || {};
    const dx = Number(pressedKeys.has(String(bindings.right || '').toLowerCase())) - Number(pressedKeys.has(String(bindings.left || '').toLowerCase()));
    const dz = Number(pressedKeys.has(String(bindings.down || '').toLowerCase())) - Number(pressedKeys.has(String(bindings.up || '').toLowerCase()));
    simulation.manualInput(robot.id, dx, dz);
  });
  scene.setSimulation(simulation.snapshot());
}, 100);
window.setInterval(() => { economy.tick(); render(); $('save-label').textContent = 'Saved locally'; }, 1000);
window.addEventListener('beforeunload', () => { if (!account) economy.persist(); });
window.setInterval(runServerSimulation, 65_000);
window.setInterval(() => {
  if (account && walletSyncIntervalSeconds && Date.now() - lastWalletSyncAt >= walletSyncIntervalSeconds * 1000) syncServerWallet();
}, 5_000);
window.setInterval(() => { if (account && playerMissionState?.active_run) renderMissions(); }, 1_000);
