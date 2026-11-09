import * as THREE from 'three';
import './world-controls.css';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NAVIGATION_OBSTACLES } from './simulation-core.js';
import { box, label, createRobot, disposeObject, resourceColor, BOT_COLORS } from './factory-models.js';

// Presentation consumes simulation snapshots; it never produces currency or moves simulation bots.
export class FactoryScene {
  constructor(host, { reducedMotion = false, quality = 'high' } = {}) {
    this.host = host; this.reducedMotion = reducedMotion; this.quality = quality;
    this.bots = []; this.dropMeshes = new Map(); this.technologyMeshes = new Map(); this.technologyUnlocks = new Set();
    this.followId = null; this.selectedId = null; this.lastDeliveryId = 0; this.effects = []; this.snapshot = null;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#b8e5fb'); this.scene.fog = new THREE.Fog('#b8e5fb', 48, 100);
    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 140);
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { this.setupFallback(); return; }
    this.available = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive robot factory. Drag to orbit, scroll to zoom, click a robot to inspect.');
    this.renderer.domElement.style.touchAction = 'none'; host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !reducedMotion; this.controls.dampingFactor = .09;
    this.controls.minDistance = 8; this.controls.maxDistance = 48;
    this.controls.minPolarAngle = .18; this.controls.maxPolarAngle = Math.PI / 2.25;
    this.controls.maxTargetRadius = 18; this.controls.screenSpacePanning = false;
    this.resetCamera(); this.buildWorld();
    const views = document.createElement('div'); views.className = 'world-view-controls';
    views.innerHTML = '<button type="button" data-view="overview">Island view</button><button type="button" data-view="close">Close-up</button><button type="button" data-view="top">Top view</button><small>Right-drag to pan · pinch to zoom</small>';
    host.append(views);
    this.resourceInfo = document.createElement('div'); this.resourceInfo.className = 'world-resource-info'; this.resourceInfo.hidden = true; host.append(this.resourceInfo);
    views.addEventListener('click', event => {
      const view = event.target.closest('[data-view]')?.dataset.view; if (!view) return;
      if (view === 'overview') { this.resetCamera(); return; }
      this.followId = null;
      const bot = this.bots.find(b => b.userData.id === this.selectedId);
      const target = view === 'close' && bot ? bot.position : new THREE.Vector3();
      this.controls.target.set(target.x, .5, target.z);
      this.camera.position.copy(this.controls.target).add(view === 'top' ? new THREE.Vector3(0, 39, .1) : new THREE.Vector3(8, 10, 12));
      this.controls.update();
    });
    this.renderer.domElement.addEventListener('pointerdown', e => { this.pointerStart = {x:e.clientX,y:e.clientY}; this.dragged = false; });
    this.renderer.domElement.addEventListener('pointermove', e => {
      if (this.pointerStart && Math.hypot(e.clientX-this.pointerStart.x,e.clientY-this.pointerStart.y)>6) this.dragged = true;
    });
    this.renderer.domElement.addEventListener('pointercancel', () => { this.dragged = true; });
    this.renderer.domElement.addEventListener('click', e => this.pick(e));
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    this.setRenderQuality(quality); this.previousTime = performance.now(); this.animate();
  }
  buildWorld() {
    this.scene.add(new THREE.HemisphereLight('#effaff','#8bb79a',1.8));
    const sun = new THREE.DirectionalLight('#fff2d9',2.2); sun.position.set(-12,24,12); sun.castShadow=true;
    Object.assign(sun.shadow.camera,{left:-23,right:23,top:20,bottom:-20,near:1,far:65}); sun.shadow.mapSize.set(2048,2048); sun.shadow.normalBias=.04; this.scene.add(sun);
    box(this.scene,[36,1.4,24],[0,-.77,0],'#7cba94');
    box(this.scene,[36,.12,24],[0,-.03,0],'#a4d9a4');
    // The raised depot is cosmetic; all interactive objects retain simulation coordinates.
    box(this.scene,[10,.18,6],[0,.08,0],'#eaf2fc');
    for (const x of [-5.1,5.1]) box(this.scene,[.14,.1,6.2],[x,.1,0],'#7d9ad6');
    for (const z of [-3.1,3.1]) box(this.scene,[10.3,.1,.14],[0,.1,z],'#7d9ad6');
    for (let i=-4;i<=4;i++) box(this.scene,[.7,.035,.18],[i,.19,2.5],'#a5bce2');
    // Depot intake stays visibly open; no conveyor intersects robot routes.
    const depot = new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.18,.23,32),new THREE.MeshStandardMaterial({color:'#7484ea'})); depot.position.y=.26; depot.receiveShadow=true; this.scene.add(depot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.88,.06,8,40),new THREE.MeshBasicMaterial({color:'#d4faff'})); ring.rotation.x=-Math.PI/2; ring.position.y=.4; this.scene.add(ring);
    const depotSign = label('DELIVERY DEPOT'); depotSign.position.set(0,2.8,-1); this.scene.add(depotSign);
    for (const obstacle of NAVIGATION_OBSTACLES) {
      if (obstacle.radius > .5) { box(this.scene,[.82,.65,.8],[obstacle.x,.48,obstacle.z],'#f7bf6b'); box(this.scene,[.13,.67,.82],[obstacle.x,.48,obstacle.z],'#f8e4af'); }
      else { box(this.scene,[.25,1.8,.25],[obstacle.x,.95,obstacle.z],'#6a83bd'); box(this.scene,[1.1,.22,.3],[obstacle.x,1.85,obstacle.z],'#ffd779'); }
    }
    for (let i=0;i<20;i++) {
      const x=-17+i*1.8,z=i%2 ? -11.4 : 11.4;
      box(this.scene,[.22,.65,.22],[x,.34,z],'#bd926a');
      const crown=new THREE.Mesh(new THREE.IcosahedronGeometry(.65+(i%3)*.1,0),new THREE.MeshStandardMaterial({color:i%4 ? '#54b789':'#f6c579',flatShading:true})); crown.position.set(x,1.05,z); crown.castShadow=true; this.scene.add(crown);
    }
    for (const [text,x,z] of [['SCRAP GARDEN',-11,-10.5],['SUNNY QUARRY',11,10.5]]) { const sign=label(text); sign.position.set(x,2,z); this.scene.add(sign); }
    this.selectionRing=new THREE.Mesh(new THREE.TorusGeometry(.8,.065,8,40),new THREE.MeshBasicMaterial({color:'#fff273',depthTest:false}));
    this.selectionRing.rotation.x=-Math.PI/2; this.selectionRing.renderOrder=8; this.selectionRing.visible=false; this.scene.add(this.selectionRing);
    const routeGeometry = new THREE.BufferGeometry();
    routeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.route=new THREE.Line(routeGeometry,new THREE.LineDashedMaterial({color:'#7367db',dashSize:.3,gapSize:.18,transparent:true,opacity:.75})); this.scene.add(this.route);
  }
  rebuildResources(nodes) {
    if (this.ore) disposeObject(this.ore);
    if (this.pads) disposeObject(this.pads);
    const count=Math.max(1,nodes.length);
    this.ore=new THREE.InstancedMesh(new THREE.BoxGeometry(1.2,1,1.2),new THREE.MeshStandardMaterial({roughness:.7}),count);
    this.ore.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.ore.castShadow=true; this.ore.receiveShadow=true;
    this.pads=new THREE.InstancedMesh(new THREE.CylinderGeometry(.78,.78,.055,6),new THREE.MeshStandardMaterial({color:'#c0dfb6'}),count);
    this.scene.add(this.ore,this.pads); this.resourceCount=nodes.length;
  }
  setRobots(robotsOrCount) {
    const robots=Array.isArray(robotsOrCount)?robotsOrCount:Array.from({length:Math.min(20,robotsOrCount)},(_,id)=>({id,kind:'scavenger'}));
    while(this.bots.length>robots.length) disposeObject(this.bots.pop());
    robots.forEach((robot,i)=>{
      if(this.bots[i]?.userData.kind!==robot.kind){ if(this.bots[i])disposeObject(this.bots[i]); this.bots[i]=createRobot(robot); this.scene.add(this.bots[i]); }
    });
  }
  setSimulation(snapshot) {
    this.snapshot=snapshot;
    this.host.setAttribute('aria-label',`Live factory: ${snapshot.robots.length} robots, ${snapshot.nodes.length} resource blocks, ${(snapshot.drops||[]).length} dropped resource piles.`);
    if(!this.available){this.drawFallback();return;}
    this.setRobots(snapshot.robots);
    const nodes=snapshot.nodes;
    const inspected = nodes.find(node => node.id === this.selectedResource);
    if (this.resourceInfo) {
      this.resourceInfo.hidden = !inspected;
      if (inspected) this.resourceInfo.textContent = inspected.remaining > 0 ? `${inspected.resource.toUpperCase()} · ${inspected.remaining} / ${inspected.stock} left · Bots mine this into collectible drops` : `${inspected.resource.toUpperCase()} · Growing back in ${Math.ceil(inspected.respawnRemaining || 0)}s`;
    }
    if(this.resourceCount!==nodes.length)this.rebuildResources(nodes);
    const dummy=new THREE.Object3D(), color=new THREE.Color();
    nodes.forEach((node,i)=>{
      const fraction=node.remaining/Math.max(1,node.stock), height=.22+.75*fraction;
      dummy.position.set(node.x,height/2+.05,node.z); dummy.scale.set(1,node.remaining>0?height:.025,1); dummy.updateMatrix(); this.ore.setMatrixAt(i,dummy.matrix);
      color.set(resourceColor(node.resource)); if(!node.remaining)color.lerp(new THREE.Color('#d7e4ce'),.8); this.ore.setColorAt(i,color);
      dummy.position.set(node.x,.04,node.z); dummy.scale.set(1,1,1); dummy.updateMatrix();this.pads.setMatrixAt(i,dummy.matrix);
    });
    this.ore.instanceMatrix.needsUpdate=true; if(this.ore.instanceColor)this.ore.instanceColor.needsUpdate=true; this.pads.instanceMatrix.needsUpdate=true;
    this.ore.computeBoundingSphere(); this.pads.computeBoundingSphere();
    snapshot.robots.forEach(robot=>{
      const bot=this.bots[robot.id]; if(!bot)return;
      const data=bot.userData; const dx=robot.x-data.target.x,dz=robot.z-data.target.z;
      if(Math.hypot(dx,dz)>.005)data.heading=Math.atan2(dx,dz);
      data.target.set(robot.x,robot.kind==='sky_miner'?.65:0,robot.z); data.phase=robot.phase; data.moving=Math.hypot(dx,dz)>.005;
      data.cargo.visible=robot.cargo>0; data.cargo.children.forEach((piece,i)=>{piece.visible=i<robot.cargo;piece.material.color.set(resourceColor(robot.cargoType));});
    });
    const dropIds=new Set();
    for(const drop of snapshot.drops||[]){
      if(drop.amount<=0)continue;dropIds.add(drop.id);
      let mesh=this.dropMeshes.get(drop.id);
      if(!mesh){mesh=new THREE.Group();box(mesh,[.42,.32,.42],[0,.2,0],resourceColor(drop.resource));this.scene.add(mesh);this.dropMeshes.set(drop.id,mesh);}
      mesh.position.set(drop.x,.05,drop.z);
    }
    for(const [id,mesh]of this.dropMeshes)if(!dropIds.has(id)){disposeObject(mesh);this.dropMeshes.delete(id);}
    const latest=(snapshot.events||[]).filter(e=>e.type==='delivery'&&e.id>this.lastDeliveryId);
    if(latest.length){this.lastDeliveryId=Math.max(...latest.map(e=>e.id));if(!this.reducedMotion)this.deliveryEffect(latest.at(-1));}
  }
  deliveryEffect(event) {
    const sprite=label(`+${event.amount} ${event.resource === 'credits'?'coins':'scrap'}`,'#268468');sprite.position.set(0,1.4,0);this.scene.add(sprite);
    this.effects.push({object:sprite,age:0});
    while(this.effects.length>6)disposeObject(this.effects.shift().object);
  }
  pick(event) {
    if(this.dragged)return;
    const rect=this.renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);
    const hits=ray.intersectObjects(this.bots,true).filter(hit=>hit.object.type!=='Sprite');
    if(hits.length){let bot=hits[0].object;while(bot.parent&&!this.bots.includes(bot))bot=bot.parent;this.selectedId=bot.userData.id;this.selectedResource=null;this.resourceInfo.hidden=true;this.onBotSelect?.(this.selectedId);return;}
    const resourceHit = this.ore ? ray.intersectObject(this.ore)[0] : null;
    this.selectedResource = resourceHit ? this.snapshot?.nodes[resourceHit.instanceId]?.id : null;
    const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
    if(point)this.onGroundClick?.(point.x,point.z);
  }
  setBuddyStyle(color='mint', cosmetics=[]) {
    if(!this.available)return;
    const palette={mint:'#58cc91',berry:'#f278aa',sunshine:'#f5c94e',ocean:'#53a9ef',lilac:'#a582eb'};
    const tint=palette[color]||palette.mint,owned=new Set(cosmetics);
    for(const bot of this.bots){const d=bot.userData;d.chassis.material.color.set(tint);d.cap.visible=owned.has('cap');d.star.visible=owned.has('antenna');d.trail.visible=owned.has('trail');}
  }
  setTechnology(unlocks=[]) {
    this.technologyUnlocks=new Set(unlocks);if(!this.available)return;
    for(const [id,mesh]of this.technologyMeshes)mesh.visible=this.technologyUnlocks.has(id);
    for(const [id,x,color]of [['survey_beacon',-2.8,'#8fd3bd'],['refinery',2.8,'#b7a0ed']]){
      if(this.technologyMeshes.has(id))continue;
      const group=new THREE.Group();box(group,[.8,.7,.8],[0,.5,0],color);box(group,[.2,.8,.2],[0,1.2,0],color);
      const sign=label(id==='refinery'?'REFINERY':'SURVEY');sign.position.y=1.9;group.add(sign);group.position.set(x,0,-2.3);group.visible=this.technologyUnlocks.has(id);this.scene.add(group);this.technologyMeshes.set(id,group);
    }
  }
  animate(now=performance.now()) {
    if(this.disposed)return;
    this.frame=requestAnimationFrame(t=>this.animate(t));
    const dt=Math.min(.05,(now-this.previousTime)/1000||0);this.previousTime=now;
    if(!this.host.clientWidth||document.hidden)return;
    const blend=this.reducedMotion?1:1-Math.exp(-14*dt),t=now/1000;
    for(const bot of this.bots){const d=bot.userData;bot.position.lerp(d.target,blend);
      if(Number.isFinite(d.heading))bot.rotation.y+=Math.atan2(Math.sin(d.heading-bot.rotation.y),Math.cos(d.heading-bot.rotation.y))*blend;
      if(!this.reducedMotion && !this.paused){
        if(d.kind==='sky_miner')bot.position.y=d.target.y+Math.sin(t*3+d.id)*.07;
        const working=['mining','collect','pickup'].includes(d.phase);
        d.tool.rotation.z=working?Math.sin(t*18)*.14:0;
        d.tool.children.filter(c=>c.userData.rotor).forEach(c=>{c.rotation.y=t*18;});
        if(d.moving)d.wheels.forEach(w=>{w.rotation.x+=dt*7;});
      }
      d.badge.visible=this.quality!=='low'||d.id===this.selectedId;
    }
    const selected=this.bots.find(b=>b.userData.id===this.selectedId);this.selectionRing.visible=!!selected;
    if(selected)this.selectionRing.position.set(selected.position.x,.12,selected.position.z);
    const robot=this.snapshot?.robots.find(r=>r.id===this.selectedId);
    const target=robot?.phase==='return'?{x:0,z:0}:this.snapshot?.nodes.find(n=>n.id===robot?.targetId)||(this.snapshot?.drops||[]).find(n=>n.id===robot?.targetId);
    this.route.visible=!!selected&&!!target;
    if(this.route.visible){const positions=this.route.geometry.attributes.position;positions.setXYZ(0,selected.position.x,.12,selected.position.z);positions.setXYZ(1,target.x,.12,target.z);positions.needsUpdate=true;this.route.geometry.computeBoundingSphere();this.route.computeLineDistances();}
    const followed=this.bots.find(b=>b.userData.id===this.followId);
    if(followed){const next=new THREE.Vector3(followed.position.x,.5,followed.position.z);const delta=next.clone().sub(this.controls.target);this.camera.position.add(delta);this.controls.target.copy(next);}
    this.effects=this.effects.filter(effect=>{effect.age+=dt;effect.object.position.y+=dt*.8;effect.object.material.opacity=Math.max(0,1-effect.age/1.8);if(effect.age<1.8)return true;disposeObject(effect.object);return false;});
    this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  followRobot(id){
    this.followId=id===''||id===null?null:Number(id);
    const bot=this.bots.find(b=>b.userData.id===this.followId);
    if(bot&&this.controls){this.controls.target.copy(bot.position);this.camera.position.copy(bot.position).add(new THREE.Vector3(8,10,12));this.controls.update();}
  }
  resetCamera(){if(!this.controls)return;this.followId=null;this.camera.position.set(22,26,30);this.controls.target.set(0,0,0);this.controls.update();}
  setReducedMotion(enabled){this.reducedMotion=Boolean(enabled);if(this.controls)this.controls.enableDamping=!enabled;if(enabled)this.bots.forEach(bot=>{bot.userData.tool.rotation.z=0;});}
  setRenderQuality(quality){this.quality=['low','medium','high'].includes(quality)?quality:'high';if(!this.available)return;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,{low:1,medium:1.25,high:1.75}[this.quality]));this.renderer.shadowMap.enabled=this.quality==='high';this.resize();}
  resize(){const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);if(!this.available){if(this.fallbackCanvas){this.fallbackCanvas.width=w;this.fallbackCanvas.height=h;this.drawFallback();}return;}this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  setupFallback(){
    this.available=false;this.host.innerHTML='<div class="scene-fallback"><b>Factory map · 2D mode</b><canvas class="scene-fallback-canvas" aria-label="Interactive factory map"></canvas><span>Your robots keep working. Select a bot on the map or in the inspector.</span></div>';
    this.fallbackCanvas=this.host.querySelector('canvas');this.fallbackContext=this.fallbackCanvas.getContext('2d');
    this.fallbackCanvas.addEventListener('click',e=>{const r=this.fallbackCanvas.getBoundingClientRect(),s=Math.min(r.width/38,r.height/26);const x=(e.clientX-r.left-r.width/2)/s,z=(e.clientY-r.top-r.height/2)/s;const bot=this.snapshot?.robots.find(b=>Math.hypot(b.x-x,b.z-z)<.9);if(bot){this.selectedId=bot.id;this.onBotSelect?.(bot.id);this.drawFallback();}else this.onGroundClick?.(x,z);});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.host);this.resize();
  }
  drawFallback(){
    const ctx=this.fallbackContext,snapshot=this.snapshot;if(!ctx||!snapshot)return;
    const w=this.fallbackCanvas.width,h=this.fallbackCanvas.height,s=Math.min(w/38,h/26),x=v=>w/2+v*s,z=v=>h/2+v*s;
    ctx.fillStyle='#b8e5fb';ctx.fillRect(0,0,w,h);ctx.fillStyle='#a4d9a4';ctx.fillRect(x(-18),z(-12),36*s,24*s);ctx.fillStyle='#eaf2fc';ctx.fillRect(x(-5),z(-3),10*s,6*s);
    for(const node of snapshot.nodes){ctx.fillStyle=node.remaining?resourceColor(node.resource):'#d7e4ce';ctx.fillRect(x(node.x)-.6*s,z(node.z)-.6*s,1.2*s,1.2*s);}
    for(const drop of snapshot.drops||[]){ctx.fillStyle=resourceColor(drop.resource);ctx.fillRect(x(drop.x)-.2*s,z(drop.z)-.2*s,.4*s,.4*s);}
    for(const bot of snapshot.robots){ctx.beginPath();ctx.fillStyle=BOT_COLORS[bot.kind]||'#58cc91';ctx.arc(x(bot.x),z(bot.z),.45*s,0,Math.PI*2);ctx.fill();ctx.strokeStyle=bot.id===this.selectedId?'#ffec72':'#395779';ctx.lineWidth=bot.id===this.selectedId?4:1;ctx.stroke();ctx.fillStyle='#253d60';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(String(bot.id+1),x(bot.x),z(bot.z)+3);}
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver?.disconnect();this.controls?.dispose();disposeObject(this.scene);this.renderer?.dispose();this.renderer?.domElement.remove();}
}
