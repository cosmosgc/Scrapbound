import * as THREE from 'three';

const MAX_REPLAY_EVENTS = 22;

export class BattleReplay {
  constructor(host, events, { reducedMotion = false } = {}) {
    this.host = host;
    this.events = this.validate(events);
    this.reducedMotion = reducedMotion;
    this.index = 0;
    this.speed = 1;
    this.playing = false;
    this.elapsed = 0;
    this.lastFrame = 0;
    this.host.replaceChildren();
    try {
      this.initThree();
    } catch {
      this.disposeRenderer();
      this.initFallback();
    }
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.renderFrame = this.renderFrame.bind(this);
    this.frameHandle = requestAnimationFrame(this.renderFrame);
    this.renderEvent();
  }

  validate(events) {
    if (!Array.isArray(events)) return [];
    return events.slice(0, MAX_REPLAY_EVENTS).filter(event =>
      event && ['deploy', 'strike', 'result'].includes(event.type) &&
      Number.isInteger(event.round) && typeof event.label === 'string',
    ).map(event => ({
      type: event.type,
      round: Math.max(0, Math.min(10, event.round)),
      attacker: event.attacker === 'defender' ? 'defender' : 'challenger',
      damage: Number.isFinite(event.damage) ? Math.max(0, Math.min(100, event.damage)) : 0,
      remaining_hp: Number.isFinite(event.remaining_hp) ? Math.max(0, Math.min(200, event.remaining_hp)) : 0,
      label: event.label.slice(0, 120),
    }));
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#171914');
    this.scene.fog = new THREE.Fog('#171914', 12, 30);
    this.camera = new THREE.PerspectiveCamera(38, 1, .1, 50);
    this.camera.position.set(0, 8, 13);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.host.append(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#e2edca', '#46493b', 2));
    const light = new THREE.DirectionalLight('#ffe3b0', 2.4);
    light.position.set(-3, 9, 6);
    this.scene.add(light);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, .35, 48), new THREE.MeshStandardMaterial({ color: '#34372b', roughness: .8 }));
    floor.position.y = -.22;
    this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.8, .06, 8, 64), new THREE.MeshBasicMaterial({ color: '#84975f' }));
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);
    this.robots = [this.makeRobot('#a9d674'), this.makeRobot('#d6a25c')];
    this.robots[0].position.set(-2.5, 0, 0);
    this.robots[1].position.set(2.5, 0, 0);
    this.scene.add(...this.robots);
    this.bars = [this.makeHealthBar('#a9d674'), this.makeHealthBar('#d6a25c')];
    this.bars[0].position.set(-2.5, 2.25, 0);
    this.bars[1].position.set(2.5, 2.25, 0);
    this.scene.add(...this.bars);
    this.flash = new THREE.Mesh(new THREE.TorusGeometry(.68, .075, 8, 32), new THREE.MeshBasicMaterial({ color: '#f2c66e', transparent: true, opacity: 0 }));
    this.flash.rotation.x = Math.PI / 2;
    this.scene.add(this.flash);
  }

  makeRobot(color) {
    const robot = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, .8, 1), new THREE.MeshStandardMaterial({ color, metalness: .3, roughness: .45 }));
    body.position.y = .55;
    robot.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.38, 16, 12), new THREE.MeshStandardMaterial({ color: '#d7e1c1', emissive: color, emissiveIntensity: .45 }));
    dome.position.set(0, 1.15, 0);
    robot.add(dome);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.4, .1, .07), new THREE.MeshBasicMaterial({ color: '#f6efcf' }));
    eye.position.set(0, 1.17, .37);
    robot.add(eye);
    return robot;
  }

  makeHealthBar(color) {
    const group = new THREE.Group();
    const background = new THREE.Mesh(new THREE.BoxGeometry(1.8, .12, .06), new THREE.MeshBasicMaterial({ color: '#171914' }));
    const fill = new THREE.Mesh(new THREE.BoxGeometry(1.76, .08, .08), new THREE.MeshBasicMaterial({ color }));
    fill.position.z = .05;
    group.add(background, fill);
    group.userData.fill = fill;
    group.userData.maxWidth = 1.76;
    return group;
  }

  initFallback() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'battle-replay-canvas';
    this.canvas.setAttribute('aria-label', '2D battle replay');
    this.host.append(this.canvas);
    this.context = this.canvas.getContext('2d');
  }

  disposeRenderer() {
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }

  resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    if (this.renderer) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    } else if (this.canvas && this.context) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.renderFallback();
    }
  }

  renderFrame(time) {
    if (this.renderer) this.renderer.render(this.scene, this.camera);
    if (this.playing && this.index < this.events.length) {
      if (time - this.lastFrame >= 1100 / this.speed) {
        this.lastFrame = time;
        this.advance();
      }
    }
    this.frameHandle = requestAnimationFrame(this.renderFrame);
  }

  advance() {
    if (this.index >= this.events.length - 1) {
      this.playing = false;
      return;
    }
    this.index++;
    this.renderEvent();
    this.updateControls();
  }

  seek(index) {
    this.index = Math.max(0, Math.min(this.events.length - 1, Number(index) || 0));
    this.renderEvent();
    this.updateControls();
  }

  renderEvent() {
    const event = this.events[this.index];
    if (!event) return;
    this.host.dispatchEvent(new CustomEvent('battle-replay-event', { detail: { index: this.index, total: this.events.length, label: event.label } }));
    if (this.robots) {
      this.robots[0].position.x = -2.5;
      this.robots[1].position.x = 2.5;
      for (const bar of this.bars) {
        bar.userData.fill.scale.x = 1;
        bar.userData.fill.position.x = 0;
      }
      let lastStrike = null;
      for (const previous of this.events.slice(0, this.index + 1)) {
        if (previous.type !== 'strike') continue;
        lastStrike = previous;
        const target = previous.attacker === 'defender' ? 0 : 1;
        const width = Math.max(0, this.bars[target].userData.maxWidth * previous.remaining_hp / 100);
        this.bars[target].userData.fill.scale.x = width / this.bars[target].userData.maxWidth;
        this.bars[target].userData.fill.position.x = -(this.bars[target].userData.maxWidth - width) / 2;
      }
      if (lastStrike && this.flash) {
        const target = lastStrike.attacker === 'defender' ? 0 : 1;
        this.flash.position.copy(this.robots[target].position);
        this.flash.position.y = .1;
        this.flash.material.opacity = event.type === 'strike' && !this.reducedMotion ? .9 : 0;
      }
    }
    if (event.type === 'result') this.playing = false;
    this.renderFallback();
  }

  renderFallback() {
    if (!this.context || !this.canvas) return;
    const ctx = this.context;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1b1e17'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#77815c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(width / 2, height / 2, width * .35, height * .38, 0, 0, Math.PI * 2); ctx.stroke();
    const event = this.events[this.index];
    for (const [index, x] of [width * .34, width * .66].entries()) {
      ctx.fillStyle = index === 0 ? '#a9d674' : '#d6a25c';
      ctx.fillRect(x - 24, height * .48, 48, 36);
      ctx.fillStyle = '#d9dccd'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(index === 0 ? 'CHALLENGER' : 'DEFENDER', x, height * .43);
    }
    if (event?.type === 'strike' && !this.reducedMotion) {
      ctx.strokeStyle = '#f2c66e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(width * .34, height * .51); ctx.lineTo(width * .66, height * .51); ctx.stroke();
    }
  }

  setSpeed(speed) {
    this.speed = [1, 2, 4].includes(Number(speed)) ? Number(speed) : 1;
  }

  updateControls() {
    const container = this.host.closest('.battle-entry');
    container?.querySelector('[data-replay-seek]')?.setAttribute('value', String(this.index));
    const toggle = container?.querySelector('[data-replay-toggle]');
    if (toggle) toggle.textContent = this.playing ? 'Pause' : (this.index >= this.events.length - 1 ? 'Replay' : 'Play');
  }

  destroy() {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect();
    this.scene?.traverse(object => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose();
    });
    this.disposeRenderer();
    this.host.replaceChildren();
  }
}
