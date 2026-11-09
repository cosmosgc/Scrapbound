// Cycle-local commissions: rewards never touch a signed-in, server-owned wallet.
const crew = s => Object.values(s.owned).reduce((a, b) => a + b, 0);
export const commissions = [
  { id: 'crew', title: 'You are not alone', text: 'Build a second robot. More hands means more salvage runs.', target: 2, value: crew, reward: [25, 15], action: 'Build a robot', anchor: 'item-list' },
  { id: 'income', title: 'First profitable shift', text: 'Let your bots bring home 100 lifetime credits. Cargo only pays when it reaches the depot.', target: 100, value: s => s.lifetimeCredits, reward: [40, 25], action: 'Watch the depot', anchor: 'scene-panel' },
  { id: 'servo', title: 'Work smarter', text: 'Install Servo tuning to speed up every robot in the fleet.', target: 1, value: s => Number(!!s.bought.servo), reward: [50, 35], action: 'Open upgrades', anchor: 'upgrade-list' },
  { id: 'fleet', title: 'Small machines. Big plans.', text: 'Grow your operation to five robots. Try mixing different roles.', target: 5, value: crew, reward: [90, 50], action: 'Expand the fleet', anchor: 'item-list' },
  { id: 'magnet', title: 'Leave nothing behind', text: 'Install the Wideband magnet for bigger scrap deliveries.', target: 1, value: s => Number(!!s.bought.magnet), reward: [100, 45], action: 'Open upgrades', anchor: 'upgrade-list' },
  { id: 'industry', title: 'An industry of your own', text: 'Earn 600 lifetime credits from your operation.', target: 600, value: s => s.lifetimeCredits, reward: [150, 80], action: 'Watch your factory', anchor: 'scene-panel' },
  { id: 'swarm', title: 'Swarm intelligence', text: 'Operate ten robots in a single production cycle.', target: 10, value: crew, reward: [200, 120], action: 'Build the swarm', anchor: 'item-list' },
  { id: 'core', title: 'A new beginning', text: 'Earn 1,200 lifetime credits to unlock Core synthesis. Rebuild with a permanent output bonus.', target: 1200, value: s => s.lifetimeCredits, reward: [250, 150], action: 'Inspect synthesis', anchor: 'prestige-button' },
];
export function currentCommission(state) {
  return commissions.find(c => !state.commissions?.includes(c.id)) || null;
}
export function claimCommission(economy, id) {
  const c = currentCommission(economy.state);
  if (!c || c.id !== id || c.value(economy.state) < c.target) return false;
  economy.state.commissions = [...(economy.state.commissions || []), c.id];
  economy.state.credits += c.reward[0];
  economy.state.scrap += c.reward[1];
  economy.persist();
  return true;
}
export class FactoryProgression {
  constructor(economy, refresh, notify) {
    this.economy = economy; this.refresh = refresh; this.notify = notify;
    this.host = document.createElement('section');
    this.host.className = 'operations-deck';
    this.host.setAttribute('aria-label', 'Factory operations');
    document.querySelector('.factory-layout').before(this.host);
    this.host.addEventListener('click', e => {
      const claim = e.target.closest('[data-commission]');
      if (claim && !this.account && claimCommission(economy, claim.dataset.commission)) {
        notify('Commission complete — supplies delivered to your factory!'); refresh();
      }
      const link = e.target.closest('[data-focus]');
      if (link) {
        const target = document.getElementById(link.dataset.focus === 'item-list' ? 'production-list' : link.dataset.focus) || document.getElementById('scene-panel');
        target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
      }
    });
  }
  render(snapshot, account) {
    this.account = account;
    const s = this.economy.state, c = currentCommission(s);
    const total = snapshot.robots.length;
    const active = snapshot.robots.filter(r => r.phase !== 'idle').length;
    const cargo = snapshot.robots.reduce((sum, r) => sum + (Number(r.cargo) || 0), 0);
    const completed = s.commissions?.length || 0;
    const ready = c && c.value(s) >= c.target;
    const progress = c ? Math.min(c.target, c.value(s)) : 1;
    this.host.innerHTML = `<div class="operations-heading"><div><span class="eyebrow">SCRAPBOUND / SECTOR ${String(s.sector).padStart(2, '0')}</span><h1>From scrap to an empire.</h1><p>Build your crew. Tune the routine. Let the machines work.</p></div><span class="operations-badge">CYCLE ${String(s.prestigeCount + 1).padStart(2, '0')} · ${total} UNITS</span></div>
      <div class="operations-grid"><article class="commission-card"><div class="commission-top"><span class="eyebrow">${account ? 'FACTORY ADVISOR' : `COMMISSION ${Math.min(completed + 1, commissions.length)} / ${commissions.length}`}</span><span>${ready ? 'READY TO COMPLETE' : 'NEXT OBJECTIVE'}</span></div><h2>${c?.title || 'Your factory, your rules.'}</h2><p>${c?.text || 'All commissions complete. Expand your crew or synthesize a Core to start a stronger cycle.'}</p><div class="commission-progress"><progress aria-label="Commission progress" max="${c?.target || 1}" value="${progress}"></progress><b>${Math.floor(progress)} / ${c?.target || 1}</b></div><div class="commission-bottom"><span>${account ? 'Advisor only · wallet remains server-owned' : c ? `REWARD  ¢ ${c.reward[0]}  +  ▧ ${c.reward[1]}` : 'All cycle rewards collected'}</span>${c ? ready && !account ? `<button class="button button-primary" data-commission="${c.id}">Claim supplies →</button>` : `<button class="button button-secondary" data-focus="${c.anchor}">${c.action} ↗</button>` : ''}</div></article>
      <article class="operations-telemetry"><span class="eyebrow">LIVE PRODUCTION</span><div class="telemetry-number">${active}<small> / ${total} working</small></div><div class="telemetry-bars" aria-hidden="true">${Array.from({length: Math.min(total, 40)}, (_, i) => `<i class="${i < active ? 'on' : ''}"></i>`).join('')}</div><div class="telemetry-line"><span>Cargo in transit</span><b>${cargo} units</b></div><div class="telemetry-line"><span>Core output bonus</span><b>+${Math.round(s.shards * 5)}%</b></div><p>${!total ? 'Build your first bot to start production.' : active < total ? 'Idle bots? Check their routine and available resource targets.' : 'Your crew is running. Buy upgrades while they collect.'}</p></article></div>`;
  }
}
