import { items } from './economy.js';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brains = {
  scavenger: ['Salvage scout', 'Find a block → mine → collect → deliver'],
  scrap_hound: ['Speedy digger', 'Race to a block → break it → leave drops for collectors'],
  fabricator: ['Heavy excavator', 'Find a block → excavate → leave resources for collectors'],
  sky_miner: ['Flying prospector', 'Fly over obstacles → drill blocks → leave drops'],
  block_miner: ['Quarry driller', 'Find solid blocks → drill → leave drops for haulers'],
  cargo_hauler: ['Delivery buddy', 'Find loose drops → fill cargo → deliver'],
  buffer_bot: ['Helpful neighbor', 'Follow the crew → boost nearby workers'],
};
export class BotInspector {
  constructor(scene, simulation) {
    this.scene = scene; this.simulation = simulation;
    this.host = document.createElement('aside'); this.host.className = 'bot-inspector';
    this.host.setAttribute('aria-label', 'Robot inspector');
    document.getElementById('scene-panel').append(this.host);
    scene.onBotSelect = id => { this.selected = id; this.render(simulation.snapshot()); };
    this.host.addEventListener('change', e => {
      if (e.target.id === 'inspect-unit') { this.selected = Number(e.target.value); scene.selectedId = this.selected; this.render(simulation.snapshot()); }
    });
    this.host.addEventListener('click', e => {
      if (e.target.closest('[data-inspect-follow]')) {
        scene.followId = this.selected;
        const follow = document.getElementById('camera-follow'); follow.value = String(this.selected); follow.dispatchEvent(new Event('change'));
      }
      const edit = e.target.closest('[data-inspect-edit]');
      if (edit) {
        document.querySelector('[data-route="/brains"]').click();
        const select = document.getElementById('brain-deploy-target');
        select.value = edit.dataset.inspectEdit;
        select.dispatchEvent(new Event('change'));
        document.getElementById('brain-status').textContent = 'Build or load a routine, then Deploy to your selected target. Role brains replace the automatic role behavior.';
      }
    });
  }
  render(snapshot) {
    const robot = snapshot.robots.find(r => r.id === this.selected);
    const signature = JSON.stringify([this.selected, snapshot.robots.map(r => [r.id, r.kind]), this.simulation.robots.map(r => [r.automation, r.program]), this.simulation.upgrades]);
    if (signature === this.signature) {
      if (robot) {
        const stats = this.host.querySelectorAll('.inspector-stats b');
        stats[0].textContent = robot.status;
        stats[1].textContent = `${robot.cargo} / ${this.simulation.capacity(robot)}`;
      }
      return;
    }
    this.signature = signature;
    const options = snapshot.robots.map(r => `<option value="${r.id}" ${r.id === this.selected ? 'selected' : ''}>Bot ${r.id + 1} · ${escape(items.find(i => i.id === r.kind)?.name || r.kind)}</option>`).join('');
    if (!robot) {
      this.host.innerHTML = `<div class="inspector-welcome"><span>🤖</span><div><h3>Meet your robot buddies!</h3><p>Click a bot in the world to see its brain and what it is doing.</p></div><select id="inspect-unit" aria-label="Inspect a robot"><option value="" disabled selected>Choose a bot…</option>${options}</select></div>`; return;
    }
    const live = this.simulation.robots.find(r => r.id === robot.id);
    const automatic = live?.automation;
    const source = automatic ? 'Built-in role brain' : this.simulation.unitPrograms[robot.id] ? 'Custom unit brain' : this.simulation.rolePrograms[robot.kind] ? 'Custom role brain' : 'Custom crew brain';
    const [name, routine] = brains[robot.kind] || brains.scavenger;
    this.host.innerHTML = `<div class="inspector-title"><div><span class="eyebrow">YOUR ROBOT BUDDY</span><h3>${escape(items.find(i => i.id === robot.kind)?.name || robot.kind)} #${robot.id + 1}</h3></div><select id="inspect-unit" aria-label="Inspect a robot">${options}</select></div><div class="inspector-stats"><div><small>DOING NOW</small><b>${escape(robot.status)}</b></div><div><small>CARGO</small><b>${robot.cargo} / ${this.simulation.capacity(live)}</b></div><div><small>MOVE SPEED</small><b>${(this.simulation.movementSpeed(live) * (this.simulation.upgrades.servo ? 1.25 : 1)).toFixed(1)} m/s</b></div></div><div class="inspector-brain"><span>🧠</span><div><b>${automatic ? name : source}</b><small>${source}</small><p>${automatic ? routine : escape(live.program.map(step => step.action + (step.resource ? ` ${step.resource}` : '')).join(' → '))}</p></div></div><div class="inspector-actions"><button class="button button-secondary" data-inspect-follow>Follow bot</button><button class="button button-secondary" data-inspect-edit="unit:${robot.id}">Program this bot</button><button class="button button-primary" data-inspect-edit="role:${robot.kind}">Program this role</button></div>`;
  }
}
