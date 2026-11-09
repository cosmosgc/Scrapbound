import * as THREE from 'three';
import { salvageSitesForSeed } from './simulation.js';

const salvageColor = resource => resource === 'credits' ? '#ffce55' : resource === 'alloy' ? '#aa88f5' : '#69b9de';

export class FactoryScene {
  constructor(host, { reducedMotion = false, quality = 'high' } = {}) {
    this.host = host;
    this.reducedMotion = reducedMotion;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#a8ddfa');
    this.scene.fog = new THREE.Fog('#a8ddfa', 42, 95);
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
      if (this.orbitDragged) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, this.camera);
      const hit = raycaster.intersectObjects(this.bots.filter(bot => bot.visible), true)[0];
      if (hit) {
        let bot = hit.object;
        while (bot.parent && !this.bots.includes(bot)) bot = bot.parent;
        this.selectedId = this.bots.indexOf(bot);
        this.onBotSelect?.(this.selectedId);
        return;
      }
      const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (point) this.onGroundClick?.(point.x, point.z);
    });
    this.renderer.domElement.addEventListener('wheel', event => {
      event.preventDefault(); this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + event.deltaY * .015, 6, 32);
    }, { passive: false });
    this.clock = new THREE.Clock();
    this.bots = [];
    this.salvageMeshes = new Map();
    this.dropMeshes = new Map();
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
    const hemi = new THREE.HemisphereLight('#e5f7ff', '#6ca77a', 2.6); this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffe3b0', 3.4); key.position.set(-4, 10, 7); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); this.scene.add(key);
    const fill = new THREE.PointLight('#91cdbb', 18, 20); fill.position.set(4, 3, -4); this.scene.add(fill);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 24), new THREE.MeshStandardMaterial({ color: '#89cf92', roughness: .92 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(32, 32, '#a9e3b2', '#99dba4'); grid.scale.z = .75; grid.position.y = .018; this.scene.add(grid);

    const platform = new THREE.Mesh(new THREE.BoxGeometry(10, .28, 6), new THREE.MeshStandardMaterial({ color: '#e4edf6', roughness: .72 }));
    platform.position.y = .15; platform.receiveShadow = true; platform.castShadow = true; this.scene.add(platform);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(8.1, .2, 1.55), new THREE.MeshStandardMaterial({ color: '#526fbc', metalness: .12, roughness: .52 }));
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

    // Chunky toy-island foundation and distant, low-poly trees.
    const island = new THREE.Mesh(new THREE.BoxGeometry(36, 1.2, 24), new THREE.MeshStandardMaterial({ color: '#65ac7a', roughness: .9 }));
    island.position.y = -.64; island.receiveShadow = true; this.scene.add(island);
    for (let i = 0; i < 16; i++) {
      const x = -17 + i * 2.25, z = i % 2 ? -11.3 : 11.3;
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(.3, .8, .3), new THREE.MeshStandardMaterial({color: '#be885c'}));
      trunk.position.set(x, .4, z); this.scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.85, 0), new THREE.MeshStandardMaterial({color: i % 3 ? '#39b783' : '#ffbf70', flatShading: true}));
      crown.position.set(x, 1.35, z); crown.castShadow = true; this.scene.add(crown);
    }
    this.selectionRing = new THREE.Mesh(new THREE.TorusGeometry(.7, .065, 8, 40), new THREE.MeshBasicMaterial({color: '#ffe36e', depthTest: false}));
    this.selectionRing.rotation.x = -Math.PI / 2; this.selectionRing.renderOrder = 10; this.selectionRing.visible = false; this.scene.add(this.selectionRing);
    for (const site of salvageSitesForSeed()) this.addSalvageMesh(site);
  }

  addSalvageMesh(site) {
    const color = salvageColor(site.resource);
    const group = new THREE.Group(); group.position.set(site.x, .12, site.z);
    const pieces = [];
    for (let piece = 0; piece < 8; piece++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(.76, .54, .76), new THREE.MeshStandardMaterial({ color, metalness: .38, roughness: .58 }));
      mesh.position.set((piece % 2) * .72 - .36, .22 + Math.floor(piece / 4) * .43, (Math.floor(piece / 2) % 2) * .72 - .36); mesh.scale.setScalar(.8); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); pieces.push(mesh);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, .025, 6, 24), new THREE.MeshBasicMaterial({ color: salvageColor(site.resource), transparent: true, opacity: .55 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = .02; group.add(ring);
    const stockLabel = new THREE.Mesh(new THREE.BoxGeometry(.52, .07, .08), new THREE.MeshBasicMaterial({ color: '#d5dfa8' }));
    stockLabel.position.set(0, 1.03, 0); group.add(stockLabel);
    const countdownCanvas = document.createElement('canvas'); countdownCanvas.width = 384; countdownCanvas.height = 80;
    const countdownContext = countdownCanvas.getContext('2d');
    const countdownTexture = new THREE.CanvasTexture(countdownCanvas);
    countdownTexture.minFilter = THREE.LinearFilter;
    const countdownSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: countdownTexture, transparent: true, depthWrite: false }));
    countdownSprite.position.set(0, 2.05, 0); countdownSprite.scale.set(1.9, .48, 1); countdownSprite.visible = false; group.add(countdownSprite);
    group.userData = { pieces, ring, stockLabel, resource: site.resource, countdownCanvas, countdownContext, countdownTexture, countdownSprite, countdownText: '' };
    this.scene.add(group); this.salvageMeshes.set(site.id, group);
  }

  addDropMesh(drop) {
    const group = new THREE.Group(); group.position.set(drop.x, .12, drop.z);
    const color = salvageColor(drop.resource);
    const count = Math.min(4, Math.max(1, drop.amount));
    for (let index = 0; index < count; index++) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(.24, .2, .24), new THREE.MeshStandardMaterial({ color, metalness: .62, roughness: .3, emissive: color, emissiveIntensity: .12 }));
      piece.position.set((index % 2) * .25 - .12, .12 + Math.floor(index / 2) * .16, .08); piece.castShadow = true; group.add(piece);
    }
    this.scene.add(group); this.dropMeshes.set(drop.id, group);
  }

  updateRespawnLabel(mesh, seconds) {
    const label = mesh.userData;
    const text = seconds > 0 ? `${seconds}s` : '';
    label.countdownSprite.visible = seconds > 0;
    if (label.countdownText === text) return;
    label.countdownText = text;
    if (!text) {
      label.countdownContext.clearRect(0, 0, label.countdownCanvas.width, label.countdownCanvas.height);
      label.countdownTexture.needsUpdate = true;
      return;
    }
    const { countdownContext: ctx, countdownCanvas: canvas } = label;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(23, 25, 20, .9)';
    ctx.beginPath(); ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 18); ctx.fill();
    ctx.strokeStyle = '#d6aa62'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#f1d38a'; ctx.font = 'bold 44px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`RESPAWN ${text}`, canvas.width / 2, canvas.height / 2 + 2);
    label.countdownTexture.needsUpdate = true;
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
  makeBot(index, kind, color) {
    const group = new THREE.Group();
    const chassisMat = new THREE.MeshStandardMaterial({ color, metalness: .42, roughness: .38 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#252a23', metalness: .68, roughness: .34 });
    const accentMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .42, metalness: .35, roughness: .32 });
    const chassisSize = kind === 'cargo_hauler' ? [.98, .48, .78] : kind === 'sky_miner' ? [.62, .38, .58] : kind === 'buffer_bot' ? [.62, .5, .62] : [.72, .48, .62];
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(...chassisSize), chassisMat); chassis.position.y = kind === 'sky_miner' ? 1.12 : .82; chassis.castShadow = true; chassis.receiveShadow = true; group.add(chassis);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(kind === 'cargo_hauler' ? .24 : .29, 16, 12), new THREE.MeshStandardMaterial({ color: '#b5d4a0', emissive: '#5d9a57', emissiveIntensity: 1.2, metalness: .3 })); dome.position.set(.03, kind === 'sky_miner' ? 1.48 : 1.2, .08); dome.castShadow = true; group.add(dome);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(.25, .075, .035), new THREE.MeshBasicMaterial({ color: '#f8f1cf' })); eye.position.set(.1, 1.32, .34); group.add(eye);
    eye.scale.set(0.45, 1.6, 1); eye.position.x = -.12;
    const secondEye = eye.clone(); secondEye.position.x = .12; group.add(secondEye);
    const smile = new THREE.Mesh(new THREE.BoxGeometry(.13, .035, .04), new THREE.MeshBasicMaterial({color: '#f8f1cf'}));
    smile.position.set(0, 1.22, .34); group.add(smile);
    const tool = new THREE.Group();
    if (kind === 'block_miner') {
      const housing = new THREE.Mesh(new THREE.BoxGeometry(.26, .34, .42), darkMat); housing.position.set(0, .87, .46); group.add(housing);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .58, 10), accentMat); shaft.rotation.x = Math.PI / 2; shaft.position.set(0, .88, .88); group.add(shaft);
      const bit = new THREE.Mesh(new THREE.ConeGeometry(.2, .32, 6), new THREE.MeshStandardMaterial({ color: '#e2bd68', metalness: .75, roughness: .28 })); bit.rotation.x = Math.PI / 2; bit.position.set(0, .88, 1.28); group.add(bit);
      tool.add(new THREE.Mesh(new THREE.BoxGeometry(.1, .5, .1), accentMat));
    } else if (kind === 'sky_miner') {
      for (const x of [-.43, .43]) for (const z of [-.36, .36]) {
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(.11, .15, .35, 8), darkMat); pod.position.set(x, .78, z); group.add(pod);
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .08, 8), new THREE.MeshBasicMaterial({ color: '#6be2e7' })); glow.position.set(x, .58, z); group.add(glow);
      }
      const rotor = new THREE.Mesh(new THREE.TorusGeometry(.48, .045, 8, 24), accentMat); rotor.position.y = 1.78; rotor.rotation.x = Math.PI / 2; group.add(rotor);
      const drill = new THREE.Mesh(new THREE.ConeGeometry(.16, .42, 8), new THREE.MeshStandardMaterial({ color: '#d8e8df', metalness: .72 })); drill.position.set(.36, 1.05, .3); drill.rotation.z = -.35; group.add(drill);
      tool.add(drill.clone());
    } else if (kind === 'cargo_hauler') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(.66, .18, .55), darkMat); bed.position.set(0, 1.16, -.43); group.add(bed);
      for (const x of [-.23, .23]) for (const z of [-.58, -.28]) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(.24, .27, .24), new THREE.MeshStandardMaterial({ color: '#d6bd83', metalness: .2, roughness: .8 })); crate.position.set(x, 1.36, z); group.add(crate);
      }
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(.72, .13, .12), accentMat); bumper.position.set(0, .72, .47); group.add(bumper);
      tool.add(new THREE.Mesh(new THREE.BoxGeometry(.18, .16, .34), accentMat));
    } else if (kind === 'buffer_bot') {
      for (const y of [1.45, 1.62]) {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(.43 + (y - 1.45) * .3, .035, 8, 28), accentMat); halo.position.y = y; halo.rotation.x = Math.PI / 2; group.add(halo);
      }
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .42, 8), darkMat); mast.position.y = 1.48; group.add(mast);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), new THREE.MeshBasicMaterial({ color: '#cfb1ff' })); beacon.position.y = 1.72; group.add(beacon);
    } else if (kind === 'fabricator') {
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(.1, .48, .1), accentMat); arm.position.set(side * .48, 1, .12); arm.rotation.z = side * -.42; group.add(arm);
        const claw = new THREE.Mesh(new THREE.BoxGeometry(.22, .1, .18), darkMat); claw.position.set(side * .62, .76, .25); group.add(claw);
      }
      tool.add(new THREE.Mesh(new THREE.BoxGeometry(.14, .46, .14), accentMat));
    } else {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.09, .48, .09), accentMat); arm.position.set(.43, .94, .05); arm.rotation.z = -.45; tool.add(arm);
      const claw = new THREE.Mesh(new THREE.BoxGeometry(.2, .08, .16), new THREE.MeshStandardMaterial({ color: '#e0b35b', metalness: .55 })); claw.position.set(.56, .71, .05); tool.add(claw);
      if (kind === 'scrap_hound') {
        for (const side of [-1, 1]) {
          const tusk = new THREE.Mesh(new THREE.ConeGeometry(.09, .36, 5), new THREE.MeshStandardMaterial({ color: '#e3a653', metalness: .4 })); tusk.rotation.x = -Math.PI / 2; tusk.position.set(side * .23, .68, .54); group.add(tusk);
        }
      }
    }
    group.add(tool);
    if (kind !== 'sky_miner') for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(kind === 'cargo_hauler' ? .24 : .2, kind === 'cargo_hauler' ? .24 : .2, .13, 12), darkMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(-.2, .52, side * (kind === 'cargo_hauler' ? .39 : .3)); wheel.castShadow = true; group.add(wheel);
      if (kind === 'scrap_hound' || kind === 'cargo_hauler') {
        const rearWheel = wheel.clone(); rearWheel.position.x = -.52; group.add(rearWheel);
      }
    }
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .34, 8), darkMat); antenna.position.set(-.17, 1.48, 0); group.add(antenna);
    const i = index;
    group.position.set(-2.55 + (i % 4) * 1.7, 0, i < 4 ? .1 : 1.9);
    group.userData.phase = index * 1.7;
    group.userData.tool = tool;
    group.userData.kind = kind;
    group.visible = false;
    this.scene.add(group);
    return group;
  }
  setRobots(robotsOrCount) {
    const robots = Array.isArray(robotsOrCount)
      ? robotsOrCount
      : Array.from({ length: Math.min(20, robotsOrCount) }, (_, id) => ({ id, kind: 'scavenger' }));
    const colors = { scavenger: '#65da88', scrap_hound: '#ffb548', fabricator: '#569dff', sky_miner: '#49deef', block_miner: '#ff7861', cargo_hauler: '#f3d84d', buffer_bot: '#b28aff' };
    while (this.bots.length < Math.min(20, robots.length)) {
      const robot = robots[this.bots.length]; this.bots.push(this.makeBot(this.bots.length, robot?.kind || 'scavenger', colors[robot?.kind] || colors.scavenger));
    }
    this.bots.forEach((bot, i) => {
      const robot = robots[i];
      if (robot && bot.userData.kind !== robot.kind) {
        this.scene.remove(bot);
        this.bots[i] = this.makeBot(i, robot.kind, colors[robot.kind] || colors.scavenger);
      }
      if (this.bots[i]) this.bots[i].visible = i < robots.length;
    });
  }
  setSimulation(snapshot) {
    const sites = snapshot.nodes || [];
    const siteDescription = sites.map(node => `${node.resource} block at x ${node.x}, z ${node.z}`).join('; ');
    const fieldLabel = `Voxel mining field with ${sites.length} resource blocks and ${(snapshot.drops || []).length} dropped resource piles${siteDescription ? `: ${siteDescription}` : ''}.`;
    if (this.host.getAttribute('aria-label') !== fieldLabel) this.host.setAttribute('aria-label', fieldLabel);
    if (!this.available) { this.drawFallback(snapshot); return; }
    this.setRobots(snapshot.robots);
    const selected = snapshot.robots.find(robot => robot.id === this.selectedId);
    this.selectionRing.visible = !!selected;
    if (selected) this.selectionRing.position.set(selected.x, .12, selected.z);
    snapshot.robots.forEach(robot => {
      const bot = this.bots[robot.id]; if (!bot) return;
       bot.userData.targetX = robot.x; bot.userData.targetZ = robot.z;
       bot.userData.workPhase = robot.phase;
        bot.userData.tool?.rotation.set(['collect', 'mining', 'pickup'].includes(robot.phase) ? .75 : robot.phase === 'scan' ? .35 : 0, 0, 0);
       if (robot.phase === 'travel' || robot.phase === 'return') {
         const target = robot.phase === 'return' ? { x: 0, z: 0 }
           : snapshot.nodes.find(node => node.id === robot.targetId)
             || (snapshot.drops || []).find(drop => drop.id === robot.targetId);
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
      const respawnRemaining = Math.max(0, Math.ceil(node.respawnRemaining || 0));
      mesh.visible = node.remaining > 0 || respawnRemaining > 0;
      mesh.scale.setScalar(node.remaining > 0 && node.stock ? .72 + .28 * node.remaining / node.stock : 1);
      mesh.userData.pieces.forEach((piece, index) => { piece.visible = index < Math.ceil(node.remaining / Math.max(1, node.stock) * mesh.userData.pieces.length); });
      mesh.userData.ring.material.color.set(node.scanned ? '#c9e68a' : salvageColor(node.resource));
      mesh.userData.ring.material.opacity = node.remaining <= 0 ? .9 : node.scanned ? .95 : .55;
      mesh.userData.stockLabel.material.color.set(node.remaining > 0 ? (node.scanned ? '#c9e68a' : '#d5dfa8') : '#665e4d');
      mesh.userData.stockLabel.visible = node.remaining > 0;
      this.updateRespawnLabel(mesh, respawnRemaining);
    });
    const activeDrops = new Set();
    for (const drop of snapshot.drops || []) {
      activeDrops.add(drop.id);
      let mesh = this.dropMeshes.get(drop.id);
      if (!mesh) { this.addDropMesh(drop); mesh = this.dropMeshes.get(drop.id); }
      mesh.visible = drop.amount > 0;
      mesh.position.set(drop.x, .12, drop.z);
    }
    for (const [id, mesh] of this.dropMeshes) if (!activeDrops.has(id)) mesh.visible = false;
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
      const size = (1.55 + .04 * Math.min(node.remaining, 5)) * scale;
      if (node.remaining > 0) {
        ctx.fillStyle = salvageColor(node.resource);
        ctx.fillRect(px(node.x) - size / 2, py(node.z) - size / 2, size, size);
        ctx.strokeStyle = '#171914'; ctx.strokeRect(px(node.x) - size / 2, py(node.z) - size / 2, size, size);
      } else {
        const seconds = Math.max(0, Math.ceil(node.respawnRemaining || 0));
        if (!seconds) continue;
        ctx.strokeStyle = '#d6aa62'; ctx.lineWidth = 2; ctx.strokeRect(px(node.x) - size / 2, py(node.z) - size / 2, size, size);
        ctx.fillStyle = '#171914'; ctx.fillRect(px(node.x) - .5 * scale, py(node.z) - .22 * scale, scale, .44 * scale);
        ctx.fillStyle = '#f1d38a'; ctx.font = `bold ${Math.max(8, Math.round(scale * .42))}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${seconds}s`, px(node.x), py(node.z));
      }
    }
    for (const drop of snapshot.drops || []) {
      if (!drop.amount) continue;
      ctx.fillStyle = salvageColor(drop.resource);
      ctx.fillRect(px(drop.x) - .12 * scale, py(drop.z) - .12 * scale, .24 * scale, .24 * scale);
    }
    for (const robot of snapshot.robots || []) {
      ctx.save(); ctx.translate(px(robot.x), py(robot.z));
      const botColor = { scavenger: '#9bc86c', scrap_hound: '#e7a34f', fabricator: '#78b6c5', sky_miner: '#8ad8df', block_miner: '#d69d65', cargo_hauler: '#a9c875', buffer_bot: '#b4a0dc' }[robot.kind] || '#9bc86c';
      ctx.fillStyle = botColor;
      if (robot.kind === 'sky_miner') {
        ctx.beginPath(); ctx.moveTo(0, -.24 * scale); ctx.lineTo(.24 * scale, .18 * scale); ctx.lineTo(-.24 * scale, .18 * scale); ctx.closePath(); ctx.fill();
      } else if (robot.kind === 'buffer_bot') {
        ctx.beginPath(); ctx.arc(0, 0, .2 * scale, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#e0ceff'; ctx.beginPath(); ctx.arc(0, 0, .29 * scale, 0, Math.PI * 2); ctx.stroke();
      } else {
        const width = robot.kind === 'cargo_hauler' ? .52 : .38;
        ctx.fillRect(-width / 2 * scale, -.14 * scale, width * scale, .28 * scale);
        if (robot.kind === 'block_miner') { ctx.fillStyle = '#f2d18a'; ctx.fillRect(-.05 * scale, .16 * scale, .1 * scale, .24 * scale); }
        if (robot.kind === 'scrap_hound') { ctx.fillStyle = '#f2d18a'; ctx.beginPath(); ctx.moveTo(-.12 * scale, .1 * scale); ctx.lineTo(0, .3 * scale); ctx.lineTo(.12 * scale, .1 * scale); ctx.fill(); }
        if (robot.kind === 'cargo_hauler') { ctx.fillStyle = '#e6d9ae'; ctx.fillRect(-.18 * scale, -.35 * scale, .36 * scale, .12 * scale); }
        if (robot.kind === 'fabricator') { ctx.fillStyle = '#daf5ee'; ctx.fillRect(-.32 * scale, -.03 * scale, .1 * scale, .22 * scale); ctx.fillRect(.22 * scale, -.03 * scale, .1 * scale, .22 * scale); }
      }
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
    this.orbitDragged = false;
    const startX = event.clientX, startY = event.clientY;
    if (event.button !== 0) return;
    const canvas = this.renderer.domElement;
    let previousX = event.clientX, previousY = event.clientY;
    const move = pointer => {
      if (Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 5) this.orbitDragged = true;
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
