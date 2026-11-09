import * as THREE from 'three';
import { salvageSitesForSeed } from './simulation.js';

const salvageColor = resource => resource === 'credits' ? '#e5bd65' : resource === 'alloy' ? '#9c9ed9' : '#9c8870';

export class FactoryScene {
  constructor(host, { reducedMotion = false, quality = 'high' } = {}) {
    this.host = host;
    this.reducedMotion = reducedMotion;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#171914');
    this.scene.fog = new THREE.Fog('#171914', 34, 90);
    this.camera = new THREE.PerspectiveCamera(37, 1, .1, 120);
    this.cameraTarget = new THREE.Vector3(0, .6, 0);
    this.cameraGoal = this.cameraTarget.clone();
    this.cameraYaw = .53;
    this.cameraPitch = .48;
    this.cameraDistance = 27;
    this.followId = null;
    this.technologyUnlocks = new Set();
    this.technologyMeshes = new Map();
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      this.available = false;
      host.innerHTML = '<div class="scene-fallback"><b>2D workshop view</b><canvas class="scene-fallback-canvas" aria-label="Live 2D factory simulation"></canvas><span>WebGL is unavailable. Your simulation and delivery rewards continue normally.</span></div>';
      this.fallbackCanvas = host.querySelector('canvas');
      this.fallbackContext = this.fallbackCanvas?.getContext('2d');
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(host);
      this.resize();
      return;
    }
    this.available = true;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    host.append(this.renderer.domElement);
    this.renderer.domElement.addEventListener('pointerdown', event => this.beginOrbit(event));
    this.renderer.domElement.addEventListener('click', event => {
      if (!this.onGroundClick) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, this.camera);
      const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (point) this.onGroundClick(point.x, point.z);
    });
    this.renderer.domElement.addEventListener('wheel', event => {
      event.preventDefault(); this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * .015, 6, 32);
    }, { passive: false });
    this.clock = new THREE.Clock();
    this.bots = [];
    this.salvageMeshes = new Map();
    this.deliveryPulse = null;
    this.lastDeliveryId = 0;
    this.buildWorld();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
    this.setRenderQuality(quality);
  }

  buildWorld() {
    const hemi = new THREE.HemisphereLight('#e2edca', '#46493b', 2.1); this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffe3b0', 3.4); key.position.set(-4, 10, 7); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); this.scene.add(key);
    const fill = new THREE.PointLight('#91cdbb', 18, 20); fill.position.set(4, 3, -4); this.scene.add(fill);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 24), new THREE.MeshStandardMaterial({ color: '#292b22', roughness: .92 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(32, 32, '#565746', '#3a3b31'); grid.scale.z = .75; grid.position.y = .018; this.scene.add(grid);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(10, .28, 6), new THREE.MeshStandardMaterial({ color: '#3a3a2e', roughness: .72 }));
    platform.position.y = .15; platform.receiveShadow = true; platform.castShadow = true; this.scene.add(platform);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(8.1, .2, 1.55), new THREE.MeshStandardMaterial({ color: '#4c5142', metalness: .48, roughness: .52 }));
    belt.position.set(0, .43, 0); belt.castShadow = true; this.scene.add(belt);
    this.belt = belt;
    for (let i = 0; i < 10; i++) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, 1.58, 12), new THREE.MeshStandardMaterial({ color: '#858778', metalness: .75, roughness: .35 }));
      roller.rotation.z = Math.PI / 2; roller.position.set(-3.7 + i * .82, .49, 0); roller.castShadow = true; this.scene.add(roller);
    }
    this.addCrane(-3.8, -1.8);
    this.addCrane(3.8, -1.8);
    this.addCrate(-4.7, 1.7, '#ad7a4f'); this.addCrate(4.35, 1.6, '#667858'); this.addCrate(-4.4, -2.6, '#667858');
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.11, .17, 1.2, 8), new THREE.MeshStandardMaterial({ color: '#b4d17c', emissive: '#55732d', emissiveIntensity: 1.5 }));
    beacon.position.set(0, 1.05, 0); this.scene.add(beacon);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.15, .055, 8, 48), new THREE.MeshBasicMaterial({ color: '#d1e58f' })); halo.rotation.x = Math.PI / 2; halo.position.set(0, .22, 0); this.scene.add(halo);
    const depot = new THREE.Mesh(new THREE.CylinderGeometry(.78, .92, .34, 12), new THREE.MeshStandardMaterial({ color: '#596b43', metalness: .3, roughness: .56, emissive: '#27341c' }));
    depot.position.set(0, .25, 0); depot.castShadow = true; depot.receiveShadow = true; this.scene.add(depot);
    const depotLabel = new THREE.Mesh(new THREE.BoxGeometry(1.2, .13, .13), new THREE.MeshBasicMaterial({ color: '#d1e58f' }));
    depotLabel.position.set(0, .75, 0); this.scene.add(depotLabel);

    for (const site of salvageSitesForSeed()) this.addSalvageMesh(site);
  }

  addSalvageMesh(site) {
    const color = salvageColor(site.resource);
    const group = new THREE.Group(); group.position.set(site.x, .12, site.z);
    for (let piece = 0; piece < 4; piece++) {
      const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(.17 + (piece % 2) * .04, 0), new THREE.MeshStandardMaterial({ color, metalness: .55, roughness: .4 }));
      mesh.position.set((piece % 2) * .28 - .12, .12 + Math.floor(piece / 2) * .22, (piece % 3) * .14 - .12); mesh.castShadow = true; group.add(mesh);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.48, .025, 6, 24), new THREE.MeshBasicMaterial({ color: salvageColor(site.resource), transparent: true, opacity: .55 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = .02; group.add(ring);
    const stockLabel = new THREE.Mesh(new THREE.BoxGeometry(.52, .07, .08), new THREE.MeshBasicMaterial({ color: '#d5dfa8' }));
    stockLabel.position.set(0, .94, 0); group.add(stockLabel);
    group.userData = { pieces: group.children.filter(child => child !== ring && child !== stockLabel), ring, stockLabel, resource: site.resource };
    this.scene.add(group); this.salvageMeshes.set(site.id, group);
  }

  setTechnology(sceneUnlocks = []) {
    this.technologyUnlocks = new Set(sceneUnlocks);
    if (!this.available) {
      if (this.lastSnapshot) this.drawFallback(this.lastSnapshot);
      return;
    }
    for (const [id, mesh] of this.technologyMeshes) mesh.visible = this.technologyUnlocks.has(id);
    const addStructure = (id, build) => {
      if (this.technologyMeshes.has(id)) return;
      const group = build();
      this.scene.add(group); this.technologyMeshes.set(id, group);
      group.visible = this.technologyUnlocks.has(id);
    };
    addStructure('survey_beacon', () => {
      const group = new THREE.Group(); group.position.set(-3.1, 0, 1.9);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.07, .11, 1.65, 8), new THREE.MeshStandardMaterial({ color: '#a9c875', emissive: '#3f6324', emissiveIntensity: 1.1 }));
      mast.position.y = .9; mast.castShadow = true; group.add(mast);
      const dish = new THREE.Mesh(new THREE.TorusGeometry(.32, .045, 8, 24), new THREE.MeshStandardMaterial({ color: '#c8d99a', metalness: .6 }));
      dish.position.y = 1.5; group.add(dish);
      const lamp = new THREE.PointLight('#a9e77b', 4, 4); lamp.position.y = 1.7; group.add(lamp);
      return group;
    });
    addStructure('refinery', () => {
      const group = new THREE.Group(); group.position.set(3.2, 0, -1.9);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, .85, .9), new THREE.MeshStandardMaterial({ color: '#77765a', metalness: .4, roughness: .65 }));
      body.position.y = .55; body.castShadow = true; body.receiveShadow = true; group.add(body);
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(.12, .17, 1.05, 8), new THREE.MeshStandardMaterial({ color: '#c08e4c', metalness: .45 }));
      chimney.position.set(.32, 1.35, -.1); group.add(chimney);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(.42, .12, .08), new THREE.MeshBasicMaterial({ color: '#e6bd65' }));
      glow.position.set(0, .58, .47); group.add(glow);
      return group;
    });
  }

  addCrane(x, z) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.18, 2.1, .18), new THREE.MeshStandardMaterial({ color: '#77745e', metalness: .55 })); post.position.set(x, 1.2, z); post.castShadow = true; this.scene.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, .16, .18), new THREE.MeshStandardMaterial({ color: '#c08e4c', metalness: .45 })); arm.position.set(x + (x < 0 ? .6 : -.6), 2.12, z); arm.castShadow = true; this.scene.add(arm);
    const lamp = new THREE.PointLight('#f3b858', 8, 5); lamp.position.set(arm.position.x, 1.95, z); this.scene.add(lamp);
  }
  addCrate(x, z, color) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(.82, .7, .8), new THREE.MeshStandardMaterial({ color, roughness: .8 })); crate.position.set(x, .65, z); crate.castShadow = true; crate.receiveShadow = true; this.scene.add(crate);
    const band = new THREE.Mesh(new THREE.BoxGeometry(.16, .72, .82), new THREE.MeshStandardMaterial({ color: '#35372d', metalness: .42 })); band.position.set(x, .65, z); this.scene.add(band);
  }
  makeBot(index, color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, metalness: .38, roughness: .4 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(.72, .48, .62), mat); chassis.position.y = .93; chassis.castShadow = true; group.add(chassis);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.29, 16, 12), new THREE.MeshStandardMaterial({ color: '#b5d4a0', emissive: '#5d9a57', emissiveIntensity: 1.2, metalness: .3 })); dome.position.set(.03, 1.31, .08); dome.castShadow = true; group.add(dome);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.25, .075, .035), new THREE.MeshBasicMaterial({ color: '#f8f1cf' })); eye.position.set(.1, 1.32, .34); group.add(eye);
    const tool = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.09, .48, .09), new THREE.MeshStandardMaterial({ color: '#c4bf9a', metalness: .5 }));
    arm.position.set(.43, 1.02, .05); arm.rotation.z = -.45; tool.add(arm);
    const claw = new THREE.Mesh(new THREE.BoxGeometry(.2, .08, .16), new THREE.MeshStandardMaterial({ color: '#e0b35b', metalness: .55 }));
    claw.position.set(.56, .79, .05); tool.add(claw); group.add(tool);
    const jointMat = new THREE.MeshStandardMaterial({ color: '#262a23', metalness: .62, roughness: .4 });
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .13, 12), jointMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(-.2, .62, side * .3); wheel.castShadow = true; group.add(wheel);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .4, 8), jointMat); antenna.position.set(-.17, 1.48, 0); group.add(antenna);
    }
    const i = index;
    group.position.set(-2.55 + (i % 4) * 1.7, 0, i < 4 ? .1 : 1.9);
    group.userData.phase = index * 1.7;
    group.userData.tool = tool;
    group.visible = false;
    this.scene.add(group); this.bots.push(group);
  }
  setRobots(count) {
    const colors = ['#9bc86c', '#d39752', '#78b6c5', '#d06f54', '#aaa0d2'];
    while (this.bots.length < Math.min(20, count)) this.makeBot(this.bots.length, colors[this.bots.length % colors.length]);
    this.bots.forEach((bot, i) => { bot.visible = i < count; });
  }
  setSimulation(snapshot) {
    const sites = snapshot.nodes || [];
    const siteDescription = sites.map(node => `${node.resource} site at x ${node.x}, z ${node.z}`).join('; ');
    const fieldLabel = `Salvage field with ${sites.length} sites${siteDescription ? `: ${siteDescription}` : ''}.`;
    if (this.host.getAttribute('aria-label') !== fieldLabel) this.host.setAttribute('aria-label', fieldLabel);
    if (!this.available) { this.drawFallback(snapshot); return; }
    this.setRobots(snapshot.robots.length);
    snapshot.robots.forEach(robot => {
      const bot = this.bots[robot.id]; if (!bot) return;
       bot.userData.targetX = robot.x; bot.userData.targetZ = robot.z;
       bot.userData.workPhase = robot.phase;
       bot.userData.tool?.rotation.set(robot.phase === 'collect' ? .75 : robot.phase === 'scan' ? .35 : 0, 0, 0);
      if (robot.phase === 'travel' || robot.phase === 'return') {
        const target = robot.phase === 'return' ? { x: 0, z: 0 } : snapshot.nodes.find(node => node.id === robot.targetId);
        if (target) { bot.userData.targetRotation = Math.atan2(target.x - robot.x, target.z - robot.z); bot.userData.moving = true; }
      } else bot.userData.moving = false;
      bot.userData.phase = robot.id * 1.7 + (robot.phase === 'collect' ? 1 : 0);
    });
    const followed = this.followId === null ? null : snapshot.robots.find(robot => robot.id === this.followId);
    this.cameraGoal.set(followed?.x ?? 0, followed ? .6 : .6, followed?.z ?? 0);
    snapshot.nodes.forEach(node => {
      let mesh = this.salvageMeshes.get(node.id);
      if (!mesh) { this.addSalvageMesh(node); mesh = this.salvageMeshes.get(node.id); }
      mesh.position.set(node.x, .12, node.z);
      mesh.userData.resource = node.resource;
      mesh.userData.ring.material.color.set(salvageColor(node.resource));
      mesh.userData.pieces.forEach(piece => piece.material.color.set(salvageColor(node.resource)));
      mesh.visible = node.remaining > 0;
      mesh.scale.setScalar(node.stock ? .72 + .28 * node.remaining / node.stock : 1);
      mesh.userData.pieces.forEach((piece, index) => { piece.visible = index < Math.ceil(node.remaining / Math.max(1, node.stock) * mesh.userData.pieces.length); });
      mesh.userData.ring.material.color.set(node.scanned ? '#c9e68a' : salvageColor(node.resource));
      mesh.userData.ring.material.opacity = node.scanned ? .95 : .55;
      mesh.userData.stockLabel.material.color.set(node.remaining > 0 ? (node.scanned ? '#c9e68a' : '#d5dfa8') : '#665e4d');
    });
    const delivery = [...(snapshot.events || [])].reverse().find(event => event.type === 'delivery');
    if (delivery && delivery.id > this.lastDeliveryId) {
      this.lastDeliveryId = delivery.id;
      if (this.deliveryPulse) this.scene.remove(this.deliveryPulse);
      this.deliveryPulse = new THREE.Mesh(new THREE.TorusGeometry(.45, .045, 8, 32), new THREE.MeshBasicMaterial({ color: '#c9e68a', transparent: true, opacity: .95 }));
      this.deliveryPulse.rotation.x = Math.PI / 2; this.deliveryPulse.position.set(0, .16, 0); this.deliveryPulse.userData.startedAt = this.clock.getElapsedTime(); this.scene.add(this.deliveryPulse);
    }
  }
  resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    if (!this.available) {
      if (this.fallbackCanvas && this.fallbackContext) {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        this.fallbackCanvas.width = Math.round(width * ratio);
        this.fallbackCanvas.height = Math.round(height * ratio);
        this.fallbackContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        if (this.lastSnapshot) this.drawFallback(this.lastSnapshot);
      }
      return;
    }
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  drawFallback(snapshot) {
    if (!this.fallbackContext || !this.fallbackCanvas) return;
    this.lastSnapshot = snapshot;
    const ctx = this.fallbackContext;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(width / 34, height / 22);
    const px = x => width / 2 + x * scale;
    const py = z => height / 2 + z * scale;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1b1e17'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#30352a'; ctx.lineWidth = 1;
    for (let x = -16; x <= 16; x += 2) { ctx.beginPath(); ctx.moveTo(px(x), py(-10)); ctx.lineTo(px(x), py(10)); ctx.stroke(); }
    for (let z = -10; z <= 10; z += 2) { ctx.beginPath(); ctx.moveTo(px(-16), py(z)); ctx.lineTo(px(16), py(z)); ctx.stroke(); }
    ctx.fillStyle = '#454a3a'; ctx.fillRect(px(-5), py(-3), 10 * scale, 6 * scale);
    ctx.fillStyle = '#c4df86'; ctx.beginPath(); ctx.arc(px(0), py(0), .65 * scale, 0, Math.PI * 2); ctx.fill();
    if (this.technologyUnlocks.has('survey_beacon')) { ctx.fillStyle = '#a9e77b'; ctx.fillRect(px(-3.25), py(1.65), .3 * scale, .6 * scale); }
    if (this.technologyUnlocks.has('refinery')) { ctx.fillStyle = '#c08e4c'; ctx.fillRect(px(2.7), py(-2.35), .9 * scale, .65 * scale); }
    for (const node of snapshot.nodes || []) {
      if (node.remaining <= 0) continue;
      ctx.fillStyle = salvageColor(node.resource);
      ctx.beginPath(); ctx.arc(px(node.x), py(node.z), (.22 + .035 * Math.min(node.remaining, 5)) * scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9dccd'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(node.resource === 'credits' ? '¢' : node.resource === 'alloy' ? '⬡' : '▧', px(node.x), py(node.z) + 3);
    }
    for (const robot of snapshot.robots || []) {
      ctx.save(); ctx.translate(px(robot.x), py(robot.z));
      ctx.fillStyle = '#9bc86c'; ctx.fillRect(-.19 * scale, -.14 * scale, .38 * scale, .28 * scale);
      ctx.fillStyle = '#f0f1e6'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`U${String(robot.id + 1).padStart(2, '0')}`, 0, -.23 * scale);
      if (robot.cargo > 0) { ctx.fillStyle = '#e5bd65'; ctx.beginPath(); ctx.arc(.2 * scale, -.12 * scale, .07 * scale, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  setRenderQuality(quality) {
    this.quality = ['low', 'medium', 'high'].includes(quality) ? quality : 'high';
    if (!this.available) return;
    const settings = { low: { pixelRatio: 1, shadows: false }, medium: { pixelRatio: 1.25, shadows: false }, high: { pixelRatio: 1.75, shadows: true } }[this.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.pixelRatio));
    this.renderer.shadowMap.enabled = settings.shadows;
    this.resize();
  }

  setReducedMotion(enabled) {
    this.reducedMotion = Boolean(enabled);
  }
  animate() {
    if (!this.available) return;
    this.frame = requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();
       if (!this.reducedMotion) this.cameraTarget.lerp(this.cameraGoal, .08);
    const horizontal = Math.cos(this.cameraPitch) * this.cameraDistance;
    this.camera.position.set(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * horizontal,
      this.cameraTarget.y + Math.sin(this.cameraPitch) * this.cameraDistance,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * horizontal,
    );
     this.camera.lookAt(this.cameraTarget);
     this.bots.forEach(bot => {
       if (this.reducedMotion) {
         bot.position.x = bot.userData.targetX ?? bot.position.x;
         bot.position.z = bot.userData.targetZ ?? bot.position.z;
       } else {
         bot.position.x += ((bot.userData.targetX ?? bot.position.x) - bot.position.x) * .14;
         bot.position.z += ((bot.userData.targetZ ?? bot.position.z) - bot.position.z) * .14;
       }
       if (!this.reducedMotion) {
         bot.position.y = Math.abs(Math.sin(t * 2 + bot.userData.phase)) * .055;
         if (bot.userData.moving) bot.rotation.y += (bot.userData.targetRotation - bot.rotation.y) * .12;
         else bot.rotation.y = Math.sin(t * .6 + bot.userData.phase) * .08;
         if (bot.userData.tool && (bot.userData.workPhase === 'collect' || bot.userData.workPhase === 'scan')) bot.userData.tool.rotation.z = Math.sin(t * (bot.userData.workPhase === 'collect' ? 13 : 5) + bot.userData.phase) * (bot.userData.workPhase === 'collect' ? .42 : .12) + (bot.userData.workPhase === 'collect' ? .65 : .25);
       }
    });
     if (this.deliveryPulse && !this.reducedMotion) {
      const age = t - this.deliveryPulse.userData.startedAt;
      this.deliveryPulse.scale.setScalar(1 + age * 2.2); this.deliveryPulse.material.opacity = Math.max(0, 1 - age / .8);
      if (age >= .8) { this.scene.remove(this.deliveryPulse); this.deliveryPulse.geometry.dispose(); this.deliveryPulse.material.dispose(); this.deliveryPulse = null; }
    }
     if (!this.reducedMotion) this.belt.position.x = Math.sin(t * .5) * .07;
    this.renderer.render(this.scene, this.camera);
  }
  beginOrbit(event) {
    if (event.button !== 0) return;
    const canvas = this.renderer.domElement;
    let previousX = event.clientX, previousY = event.clientY;
    const move = pointer => {
      this.cameraYaw -= (pointer.clientX - previousX) * .005;
      this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + (pointer.clientY - previousY) * .004, .12, 1.35);
      previousX = pointer.clientX; previousY = pointer.clientY;
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
    canvas.setPointerCapture?.(event.pointerId);
  }
  followRobot(id) { this.followId = id === '' || id === null ? null : Number(id); }
  resetCamera() { this.cameraYaw = .53; this.cameraPitch = .48; this.cameraDistance = 27; this.followRobot(null); this.cameraGoal.set(0, .6, 0); }
}
