import * as THREE from 'three';

export class FactoryScene {
  constructor(host) {
    this.host = host;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#171914');
    this.scene.fog = new THREE.Fog('#171914', 18, 40);
    this.camera = new THREE.PerspectiveCamera(37, 1, .1, 80);
    this.camera.position.set(7, 7.8, 12);
    this.camera.lookAt(0, .6, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    host.append(this.renderer.domElement);
    this.clock = new THREE.Clock();
    this.bots = [];
    this.buildWorld();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.animate();
  }

  buildWorld() {
    const hemi = new THREE.HemisphereLight('#e2edca', '#46493b', 2.1); this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffe3b0', 3.4); key.position.set(-4, 10, 7); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); this.scene.add(key);
    const fill = new THREE.PointLight('#91cdbb', 18, 20); fill.position.set(4, 3, -4); this.scene.add(fill);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: '#292b22', roughness: .92 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const grid = new THREE.GridHelper(30, 30, '#565746', '#3a3b31'); grid.position.y = .018; this.scene.add(grid);

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
    beacon.position.set(0, 1.05, -2.3); this.scene.add(beacon);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.34, .035, 8, 32), new THREE.MeshBasicMaterial({ color: '#d1e58f' })); halo.position.set(0, 1.6, -2.3); this.scene.add(halo);
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
    const jointMat = new THREE.MeshStandardMaterial({ color: '#262a23', metalness: .62, roughness: .4 });
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .13, 12), jointMat); wheel.rotation.z = Math.PI / 2; wheel.position.set(-.2, .62, side * .3); wheel.castShadow = true; group.add(wheel);
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, .4, 8), jointMat); antenna.position.set(-.17, 1.48, 0); group.add(antenna);
    }
    const i = index;
    group.position.set(-2.55 + (i % 4) * 1.7, 0, i < 4 ? .1 : 1.9);
    group.userData.phase = index * 1.7;
    group.visible = false;
    this.scene.add(group); this.bots.push(group);
  }
  setRobots(count) {
    const colors = ['#9bc86c', '#d39752', '#78b6c5', '#d06f54', '#aaa0d2'];
    while (this.bots.length < Math.min(20, count)) this.makeBot(this.bots.length, colors[this.bots.length % colors.length]);
    this.bots.forEach((bot, i) => { bot.visible = i < count; });
  }
  resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }
  animate() {
    this.frame = requestAnimationFrame(() => this.animate());
    const t = this.clock.getElapsedTime();
    this.bots.forEach(bot => { bot.position.y = Math.abs(Math.sin(t * 2 + bot.userData.phase)) * .055; bot.rotation.y = Math.sin(t * .6 + bot.userData.phase) * .08; });
    this.belt.position.x = Math.sin(t * .5) * .07;
    this.renderer.render(this.scene, this.camera);
  }
  resetCamera() { this.camera.position.set(7, 7.8, 12); this.camera.lookAt(0, .6, 0); }
}
