import * as THREE from 'three';
export const BOT_COLORS = { scavenger: '#58cc91', scrap_hound: '#ffa54f', fabricator: '#668dff', sky_miner: '#42d3e2', block_miner: '#fb7c73', cargo_hauler: '#f5cc50', buffer_bot: '#b493f4' };
export const resourceColor = id => id === 'credits' ? '#ffc857' : id === 'alloy' ? '#b493f4' : '#65bddc';
export function box(parent, size, position, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: .05 }));
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function label(text, color = '#365776', width = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffffee'; ctx.beginPath(); ctx.roundRect(2, 2, width - 4, 60, 16); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 25px sans-serif'; ctx.fillText(text, width / 2, 33, width - 20);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false })); sprite.scale.set(width / 110, .58, 1); return sprite;
}
export function createRobot(robot) {
  const root = new THREE.Group(), color = BOT_COLORS[robot.kind] || BOT_COLORS.scavenger;
  const wide = robot.kind === 'cargo_hauler';
  const chassis = box(root, [wide ? 1.1 : .75, .48, .78], [0, .62, 0], color);
  box(root, [.62, .46, .5], [0, 1.08, .12], '#f3f6ff');
  box(root, [.51, .27, .04], [0, 1.1, .39], '#304868');
  for (const x of [-.14, .14]) box(root, [.09, .09, .035], [x, 1.13, .42], '#aaf5fa');
  box(root, [.12, .035, .035], [0, 1.02, .42], '#aaf5fa');
  const wheels = [];
  for (const x of [-.43, .43]) for (const z of [-.23, .23]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .12, 12), new THREE.MeshStandardMaterial({color:'#3e5071'}));
    wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .23, z); root.add(wheel); wheels.push(wheel);
  }
  const tool = new THREE.Group(); root.add(tool);
  if (['block_miner', 'sky_miner', 'scrap_hound'].includes(robot.kind)) {
    const bit = new THREE.Mesh(new THREE.ConeGeometry(.2, .55, 8), new THREE.MeshStandardMaterial({color:'#e6ecf8'}));
    bit.rotation.x = Math.PI / 2; bit.position.set(.38, .65, .65); tool.add(bit);
    box(root, [.27,.28,.32], [.38,.65,.38], color);
  } else if (robot.kind === 'buffer_bot') {
    box(root, [.07,.65,.07], [0,1.55,0], '#8061be');
    const dish = new THREE.Mesh(new THREE.TorusGeometry(.32,.055,8,24), new THREE.MeshStandardMaterial({color})); dish.position.y=1.8; tool.add(dish);
  } else {
    for (const x of [-.53,.53]) { box(tool,[.12,.45,.12],[x,.7,.15],color); box(tool,[.22,.12,.28],[x,.48,.3],'#405779'); }
  }
  if (robot.kind === 'sky_miner') {
    for (const x of [-.6,.6]) { const rotor = box(tool,[.65,.04,.12],[x,1.5,0],'#4a6d8d'); rotor.userData.rotor = true; }
    wheels.forEach(w => w.visible = false);
  }
  if (wide) box(root,[.9,.12,.5],[0,.88,-.48], '#a58233');
  const cargo = new THREE.Group(); root.add(cargo);
  for (let i=0;i<4;i++) box(cargo,[.23,.23,.23],[(i%2-.5)*.26,.99+Math.floor(i/2)*.24,-.35],'#ffcd68');
  cargo.visible = false;
  const badge = label(`${robot.id + 1}`, '#365776', 80); badge.position.y = 2.05; root.add(badge);
  const cap=box(root,[.62,.2,.58],[0,1.42,.12],'#ef7187'); cap.userData.cosmetic='cap';
  const star=new THREE.Mesh(new THREE.IcosahedronGeometry(.22,0),new THREE.MeshStandardMaterial({color:'#ffce4f',emissive:'#ffce4f',emissiveIntensity:.5}));star.position.set(0,1.72,.12);root.add(star);star.userData.cosmetic='antenna';
  const trail=new THREE.Group();['#ff718a','#ffcf58','#72d9b4'].forEach((c,i)=>{const bead=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.2}));bead.position.set((i-1)*.23,.34,-.68);trail.add(bead);});trail.visible=false;root.add(trail);
  root.userData = { id: robot.id, kind: robot.kind, tool, wheels, cargo, badge, chassis, cap, star, trail, target: new THREE.Vector3(robot.x || 0, 0, robot.z || 0) };
  root.position.copy(root.userData.target);
  return root;
}
export function disposeObject(object) {
  object.traverse(child => {
    child.geometry?.dispose();
    for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) {
      material.map?.dispose(); material.dispose();
    }
  });
  object.removeFromParent();
}
