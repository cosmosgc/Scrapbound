const STORAGE_KEY = 'scrapbound.save.v1';
const OFFLINE_CAP_SECONDS = 8 * 60 * 60;

export const items = [
  { id: 'scavenger', name: 'Scavenger bot', role: 'Collects credits', icon: '⌕', cost: 55, currency: 'credits', creditRate: 1.3, scrapRate: 0, tint: '#a4d66d' },
  { id: 'scrap_hound', name: 'Scrap hound', role: 'Finds loose scrap', icon: '▧', cost: 35, currency: 'credits', creditRate: 0.25, scrapRate: 0.65, tint: '#e7a34f' },
  { id: 'fabricator', name: 'Auto-fabricator', role: 'Manufactures components', icon: '⚒', cost: 110, currency: 'scrap', creditRate: 3.1, scrapRate: 0, tint: '#78b7c9' },
];

export const upgrades = [
  { id: 'servo', name: 'Servo tuning', description: 'All bots produce 25% faster.', cost: 120, currency: 'credits', multiplier: 1.25, icon: '↗' },
  { id: 'magnet', name: 'Wideband magnet', description: 'Scrap collection +60%.', cost: 80, currency: 'scrap', scrapMultiplier: 1.6, icon: '⌁' },
  { id: 'routing', name: 'Smart routing', description: 'Credits from expeditions +35%.', cost: 200, currency: 'credits', missionMultiplier: 1.35, icon: '⌘' },
];

const freshSave = () => ({ version: 1, credits: 120, scrap: 18, shards: 0, sector: 1, prestigeCount: 0, owned: { scavenger: 1, scrap_hound: 0, fabricator: 0 }, bought: {}, lastSeen: Date.now(), lifetimeCredits: 0 });
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== 1) return freshSave();
    return { ...freshSave(), ...saved, owned: { ...freshSave().owned, ...saved.owned }, bought: saved.bought || {} };
  } catch { return freshSave(); }
}

export class Economy {
  constructor() {
    this.state = load();
    this.lastTick = Date.now();
    const offlineSeconds = Math.min(OFFLINE_CAP_SECONDS, Math.max(0, (Date.now() - this.state.lastSeen) / 1000));
    const earnings = this.production();
    this.state.credits += Math.max(0, earnings.credits) * offlineSeconds;
    this.state.scrap += Math.max(0, earnings.scrap) * offlineSeconds;
    this.state.lifetimeCredits += Math.max(0, earnings.credits) * offlineSeconds;
    this.offline = { seconds: offlineSeconds, credits: Math.max(0, earnings.credits) * offlineSeconds, scrap: Math.max(0, earnings.scrap) * offlineSeconds };
    this.state.lastSeen = Date.now();
    this.persist();
  }

  production() {
    let credits = 0, scrap = 0, creditMult = 1 + this.state.shards * 0.05, scrapMult = 1 + this.state.shards * 0.05;
    for (const item of items) {
      const count = this.state.owned[item.id] || 0;
      credits += count * item.creditRate;
      scrap += count * item.scrapRate;
    }
    for (const up of upgrades) {
      if (!this.state.bought[up.id]) continue;
      creditMult *= up.multiplier || 1;
      scrapMult *= up.scrapMultiplier || 1;
    }
    return { credits: credits * creditMult, scrap: scrap * scrapMult };
  }

  price(item) { return Math.ceil(item.cost * Math.pow(1.17, this.state.owned[item.id] || 0)); }
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
    return { credits: Math.round((35 + sector * 18 + crew * 12 - danger * 4) * routing), scrap: Math.max(8, Math.round(10 + sector * 7 + crew * 4 - danger * 2)) };
  }
  tick() {
    const now = Date.now(), seconds = Math.min(10, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    const rate = this.production();
    this.state.credits = Math.max(0, this.state.credits + rate.credits * seconds);
    this.state.scrap = Math.max(0, this.state.scrap + rate.scrap * seconds);
    this.state.lifetimeCredits += Math.max(0, rate.credits) * seconds;
    this.state.lastSeen = now;
    this.persist();
    return rate;
  }
  mission(sector) {
    const crew = Object.values(this.state.owned).reduce((sum, count) => sum + count, 0);
    if (!crew) return null;
    const routing = this.state.bought.routing ? 1.35 : 1;
    const danger = Math.max(0, sector - crew * 2);
    const credits = Math.round((35 + sector * 18 + crew * 12 - danger * 4) * routing);
    const scrap = Math.max(8, Math.round(10 + sector * 7 + crew * 4 - danger * 2));
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
    const keep = { shards: this.state.shards, prestigeCount: this.state.prestigeCount, version: 1 };
    Object.assign(this.state, freshSave(), keep);
    this.persist();
    return gain;
  }
  persist() { this.state.lastSeen = Date.now(); localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); }
}
