const STORAGE_KEY = 'scrapbound.save.v1';
export const items = [
  { id: 'scavenger', name: 'Scavenger bot', role: 'General-purpose salvage runner', icon: '⌕', cost: 55, currency: 'credits', tint: '#a4d66d' },
  { id: 'scrap_hound', name: 'Scrap hound', role: 'Quick salvage specialist', icon: '▧', cost: 35, currency: 'credits', tint: '#e7a34f' },
  { id: 'fabricator', name: 'Auto-fabricator', role: 'Heavy-duty collection unit', icon: '⚒', cost: 110, currency: 'scrap', tint: '#78b7c9' },
];

export const upgrades = [
  { id: 'servo', name: 'Servo tuning', description: 'Robot movement and collection speed +25%.', cost: 120, currency: 'credits', multiplier: 1.25, icon: '↗' },
  { id: 'magnet', name: 'Wideband magnet', description: 'Delivered scrap haul +60%.', cost: 80, currency: 'scrap', scrapMultiplier: 1.6, icon: '⌁' },
  { id: 'routing', name: 'Smart routing', description: 'Credits from expeditions +35%.', cost: 200, currency: 'credits', missionMultiplier: 1.35, icon: '⌘' },
];
let rewardCatalog = {
  missionBaseCredits: 35, missionCreditsPerSector: 18, missionCreditsPerRobot: 12,
  missionBaseScrap: 10, missionScrapPerSector: 7, missionScrapPerRobot: 4,
};

export function setEconomyCatalog(catalog) {
  if (catalog?.rewards) rewardCatalog = { ...rewardCatalog, ...catalog.rewards };
}

const freshSave = () => ({ version: 2, credits: 120, scrap: 18, shards: 0, sector: 1, prestigeCount: 0, owned: { scavenger: 1, scrap_hound: 0, fabricator: 0 }, bought: {}, lastSeen: Date.now(), lifetimeCredits: 0 });
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || ![1, 2].includes(saved.version)) return freshSave();
    return { ...freshSave(), ...saved, owned: { ...freshSave().owned, ...saved.owned }, bought: saved.bought || {} };
  } catch { return freshSave(); }
}

export class Economy {
  constructor() {
    this.state = load();
    this.lastTick = Date.now();
    // Version 1 granted idle/offline currency. Do not convert those elapsed
    // seconds into a payout: all new earnings come from an active robot job.
    this.offline = { seconds: 0, credits: 0, scrap: 0 };
    this.state.lastSeen = Date.now();
    this.state.version = 2;
    this.persist();
  }

  production() {
    return { credits: 0, scrap: 0 };
  }

  deliver(resource, amount) {
    if (!['credits', 'scrap'].includes(resource) || !Number.isFinite(amount) || amount <= 0) return 0;
    const bonus = 1 + this.state.shards * 0.05;
    const delivered = Math.max(1, Math.floor(amount * bonus));
    this.state[resource] += delivered;
    if (resource === 'credits') this.state.lifetimeCredits += delivered;
    this.persist();
    return delivered;
  }

  price(item) { return Math.ceil(item.cost * Math.pow(item.priceGrowth || 1.17, this.state.owned[item.id] || 0)); }
  canAfford(cost, currency) { return this.state[currency] >= cost; }
  buyItem(id) {
    const item = items.find(entry => entry.id === id);
    if (!item) return false;
    const cost = this.price(item);
    if (!this.canAfford(cost, item.currency)) return false;
    this.state[item.currency] -= cost;
    this.state.owned[id] = (this.state.owned[id] || 0) + 1;
    this.persist();
    return true;
  }
  buyUpgrade(id) {
    const up = upgrades.find(entry => entry.id === id);
    if (!up || this.state.bought[id] || !this.canAfford(up.cost, up.currency)) return false;
    this.state[up.currency] -= up.cost;
    this.state.bought[id] = true;
    this.persist();
    return true;
  }
  missionPreview(sector) {
    const crew = Object.values(this.state.owned).reduce((sum, count) => sum + count, 0);
    const danger = Math.max(0, sector - crew * 2);
    const routing = this.state.bought.routing ? 1.35 : 1;
    return { credits: Math.round((rewardCatalog.missionBaseCredits + sector * rewardCatalog.missionCreditsPerSector + crew * rewardCatalog.missionCreditsPerRobot - danger * 4) * routing), scrap: Math.max(8, Math.round(rewardCatalog.missionBaseScrap + sector * rewardCatalog.missionScrapPerSector + crew * rewardCatalog.missionScrapPerRobot - danger * 2)) };
  }
  tick() {
    const now = Date.now();
    this.lastTick = now;
    this.state.lastSeen = now;
    return this.production();
  }
  mission(sector) {
    const crew = Object.values(this.state.owned).reduce((sum, count) => sum + count, 0);
    if (!crew) return null;
    const routing = this.state.bought.routing ? 1.35 : 1;
    const danger = Math.max(0, sector - crew * 2);
    const credits = Math.round((rewardCatalog.missionBaseCredits + sector * rewardCatalog.missionCreditsPerSector + crew * rewardCatalog.missionCreditsPerRobot - danger * 4) * routing);
    const scrap = Math.max(8, Math.round(rewardCatalog.missionBaseScrap + sector * rewardCatalog.missionScrapPerSector + crew * rewardCatalog.missionScrapPerRobot - danger * 2));
    this.state.credits += credits;
    this.state.scrap += scrap;
    this.state.sector = Math.max(this.state.sector, sector + 1);
    this.state.lifetimeCredits += credits;
    this.persist();
    return { credits, scrap, crew, danger };
  }
  shardPreview() { return Math.floor(Math.sqrt(Math.max(0, this.state.lifetimeCredits) / 1200)); }
  prestige() {
    const gain = this.shardPreview();
    if (!gain) return 0;
    this.state.shards += gain;
    this.state.prestigeCount += 1;
    const keep = { shards: this.state.shards, prestigeCount: this.state.prestigeCount, version: 2 };
    Object.assign(this.state, freshSave(), keep);
    this.persist();
    return gain;
  }
  persist() { this.state.lastSeen = Date.now(); localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
}
