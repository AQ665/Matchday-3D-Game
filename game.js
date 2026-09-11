import * as THREE from 'three';

/* Matchday 3D — original browser football game. Rendering, match logic, AI and input live here. */

const canvas = document.querySelector('#game-canvas');
const $ = (q) => document.querySelector(q);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const lerp = (a, b, t) => a + (b - a) * t;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const PITCH = { x: 52, z: 34, goalW: 7.32 / 2, goalH: 2.55, ballR: .31 };
const TICK = 1 / 60;

const TEAMS = [
  { id:'royals', name:'Harbor Royals', short:'ROYALS', primary:'#1765c1', secondary:'#f3f8ff', accent:'#f7cf36', attack:82, defense:79, pace:84 },
  { id:'comets', name:'Orion Comets', short:'COMETS', primary:'#ef4b43', secondary:'#1e2430', accent:'#f8e16c', attack:86, defense:75, pace:88 },
  { id:'verde', name:'Verde Athletic', short:'VERDE', primary:'#1f9f6c', secondary:'#f3f7e9', accent:'#182d27', attack:77, defense:84, pace:78 },
  { id:'forge', name:'Iron Forge', short:'FORGE', primary:'#d7562c', secondary:'#252c34', accent:'#e9dfbd', attack:85, defense:81, pace:73 },
  { id:'north', name:'Northbridge FC', short:'NORTH', primary:'#332e84', secondary:'#f4e85a', accent:'#e4e8f6', attack:80, defense:82, pace:80 },
  { id:'rangers', name:'Capital Rangers', short:'RANGERS', primary:'#f2f3ea', secondary:'#173555', accent:'#d13845', attack:78, defense:78, pace:86 },
  { id:'sol', name:'Sol City', short:'SOL', primary:'#e1ae1b', secondary:'#202d57', accent:'#fff4c4', attack:83, defense:72, pace:90 },
  { id:'rivers', name:'Riverside 1908', short:'RIVERS', primary:'#3a9ccf', secondary:'#ffffff', accent:'#193e61', attack:74, defense:85, pace:76 },
  { id:'nebula', name:'Nebula United', short:'NEBULA', primary:'#932f99', secondary:'#0e1e35', accent:'#e7c4ef', attack:88, defense:70, pace:82 },
  { id:'falcons', name:'Falcon Sporting', short:'FALCONS', primary:'#153f2c', secondary:'#e7f1da', accent:'#d7a62e', attack:76, defense:86, pace:79 },
];
const FIRST = ['Ari','Milo','Jules','Leon','Noah','Theo','Kai','Sam','Nico','Ezra','Rafa'];
const LAST = ['Morrison','Santos','Ibrahim','Kovač','Okoro','Tavares','Cole','Vega','Moretti','Hughes','Bennett'];
const FORMATION = [
  ['GK', -47, 0],
  ['RB', -32, 22], ['RCB', -35, 7], ['LCB', -35, -7], ['LB', -32, -22],
  ['RM', -10, 22], ['RCM', -13, 7], ['LCM', -13, -7], ['LM', -10, -22],
  ['RF', 7, 9], ['LF', 8, -9],
];

let scene, camera, renderer, clock;
let players = [], ball, ballMesh, teamDefs = [TEAMS[0], TEAMS[1]];
let homeChoice = 0, awayChoice = 1, controlled = null;
let currentRestart = null, animationId = 0;
let lastTime = 0, pendingShot = null;
const input = { down: new Set(), shotStart: 0, just: new Set() };
const state = {
  phase: 'menu', paused:false, duration:240, elapsed:0, half:1, resetTimer:0, bannerTimer:0,
  score:[0,0], stats:{ shots:[0,0], possession:[0,0], fouls:[0,0] }, lastTouch:0, difficulty:'hard',
  actionLock:0, shotCharge:0, whistleReady:true, kickoffTeam:0, restartText:'KICK-OFF', frame:0
};

function hex(value){ return new THREE.Color(value); }
function configTeamCards(){
  const makeGrid = (target, type) => {
    target.innerHTML = '';
    TEAMS.forEach((t, idx) => {
      const card = document.createElement('button'); card.type='button'; card.className='team-card'; card.dataset.id=idx;
      card.innerHTML = `<i class="kit" style="background:linear-gradient(90deg,${t.primary} 0 38%,${t.secondary} 38% 62%,${t.primary} 62%)"></i><b>${t.short}</b><small>${t.attack}/${t.defense}/${t.pace}</small>`;
      card.addEventListener('click', () => { if(type==='home') homeChoice=idx; else awayChoice=idx; refreshTeamCards(); });
      target.append(card);
    });
  };
  makeGrid($('#home-team-grid'),'home'); makeGrid($('#away-team-grid'),'away'); refreshTeamCards();
}
function refreshTeamCards(){
  document.querySelectorAll('#home-team-grid .team-card').forEach((e,i)=>e.classList.toggle('selected',i===homeChoice));
  document.querySelectorAll('#away-team-grid .team-card').forEach((e,i)=>e.classList.toggle('selected',i===awayChoice));
  const t=TEAMS[homeChoice]; $('#preview-home').textContent=t.name; $('#preview-home-kit').style.background=`linear-gradient(90deg,${t.primary} 0 38%,${t.secondary} 38% 62%,${t.primary} 62%)`;
  $('#preview-stats').textContent=`ATT ${t.attack} · DEF ${t.defense} · PAC ${t.pace}`;
}

function buildScene(){
  scene = new THREE.Scene(); scene.background = new THREE.Color('#74a4ba'); scene.fog = new THREE.Fog('#79a5b4', 87, 205);
  camera = new THREE.PerspectiveCamera(43, innerWidth/innerHeight, .1, 300);
  camera.position.set(-3, 46, 57); camera.lookAt(0,0,0);
  renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
  renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace;
  clock = new THREE.Clock();
  scene.add(new THREE.HemisphereLight('#dbeaff','#1a3b2c', 2.3));
  const sun=new THREE.DirectionalLight('#fff4dd',2.2); sun.position.set(-30,55,25); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-70; sun.shadow.camera.right=70; sun.shadow.camera.top=60; sun.shadow.camera.bottom=-60; scene.add(sun);
  buildPitch(); buildStadium(); buildBall();
  window.addEventListener('resize', resize);
}
function resize(){ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); }
function makeMat(c, opts={}){ return new THREE.MeshStandardMaterial({color:c, roughness:opts.roughness ?? .76, metalness:opts.metalness ?? 0, transparent:opts.transparent ?? false, opacity:opts.opacity ?? 1, side:opts.side ?? THREE.FrontSide}); }
function box(w,h,d,mat,x=0,y=0,z=0){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m; }
function buildPitch(){
  const grassA=makeMat('#2f7a44'),grassB=makeMat('#367f48');
  for(let i=0;i<12;i++) box(PITCH.x*2,.05,PITCH.z*2/12, i%2?grassA:grassB,0,-.035,-PITCH.z+(i+.5)*(PITCH.z*2/12));
  const trim=box(122,.06,90,makeMat('#1d5431'),0,-.08,0); trim.receiveShadow=true;
  const white=new THREE.LineBasicMaterial({color:'#f4f5e9'});
  const line=(points)=>{const geo=new THREE.BufferGeometry().setFromPoints(points.map(p=>v3(p[0],.035,p[1]))); const l=new THREE.Line(geo,white);scene.add(l);};
  line([[-52,-34],[52,-34],[52,34],[-52,34],[-52,-34]]); line([[0,-34],[0,34]]);
  const ellipse=(cx,cz,rx,rz,start=0,end=Math.PI*2)=>{let arr=[];for(let a=start;a<=end+.01;a+=.1)arr.push([cx+Math.cos(a)*rx,cz+Math.sin(a)*rz]);line(arr);};
  ellipse(0,0,9.15,9.15); const spot=(x,z)=>{const c=new THREE.Mesh(new THREE.CircleGeometry(.22,12),makeMat('#f5f5ed'));c.rotation.x=-Math.PI/2;c.position.set(x,.045,z);scene.add(c);};spot(0,0);spot(-41,0);spot(41,0);
  [-1, 1].forEach(sign=>{ const x=sign*52; const six=sign*46.5, boxX=sign*35.5; line([[x,-20.16],[boxX,-20.16],[boxX,20.16],[x,20.16]]);line([[x,-9.16],[six,-9.16],[six,9.16],[x,9.16]]); ellipse(sign*41,0,9.15,9.15, sign>0?Math.PI/2:-Math.PI/2,sign>0?Math.PI*1.5:Math.PI/2); });
  [[-52,-34],[-52,34],[52,-34],[52,34]].forEach(([x,z])=>ellipse(x,z,1,1, x>0?(z>0?Math.PI:Math.PI*1.5):(z>0?Math.PI/2:0), x>0?(z>0?Math.PI*1.5:Math.PI*2):(z>0?Math.PI:Math.PI/2)));
  buildGoal(-1); buildGoal(1);
}
function buildGoal(sign){
  const g=new THREE.Group(), mat=makeMat('#f5f7ee',{roughness:.45}), net=new THREE.LineBasicMaterial({color:'#e5f0e7',transparent:true,opacity:.5}); const x=sign*52.15, back=sign*2.4;
  const post=(x1,y1,z1,x2,y2,z2)=>{const a=v3(x1,y1,z1),b=v3(x2,y2,z2),d=b.clone().sub(a);const m=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,d.length(),7),mat);m.position.copy(a.clone().add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(v3(0,1,0),d.normalize());g.add(m);};
  post(x,0,-PITCH.goalW,x,PITCH.goalH,-PITCH.goalW);post(x,0,PITCH.goalW,x,PITCH.goalH,PITCH.goalW);post(x,PITCH.goalH,-PITCH.goalW,x,PITCH.goalH,PITCH.goalW);post(x,PITCH.goalH,-PITCH.goalW,x+back,PITCH.goalH,-PITCH.goalW);post(x,PITCH.goalH,PITCH.goalW,x+back,PITCH.goalH,PITCH.goalW);post(x+back,0,-PITCH.goalW,x+back,PITCH.goalH,-PITCH.goalW);post(x+back,0,PITCH.goalW,x+back,PITCH.goalH,PITCH.goalW);
  for(let y=.25;y<PITCH.goalH;y+=.35){ const geo=new THREE.BufferGeometry().setFromPoints([v3(x,y,-PITCH.goalW),v3(x+back,y,-PITCH.goalW),v3(x+back,y,PITCH.goalW),v3(x,y,PITCH.goalW)]);g.add(new THREE.Line(geo,net));} for(let z=-PITCH.goalW;z<=PITCH.goalW;z+=.55){const geo=new THREE.BufferGeometry().setFromPoints([v3(x,0,z),v3(x+back,PITCH.goalH,z)]);g.add(new THREE.Line(geo,net));} scene.add(g);
}
function buildStadium(){
  // Vast tiled stands, floodlights and a suggestion of thousands of spectators.
  const concrete=makeMat('#56646a'), rail=makeMat('#d8dfd7',{roughness:.45}), dark=makeMat('#18282c');
  box(118,4,3,concrete,0,2,-42);box(118,4,3,concrete,0,2,42);box(4,4,80,concrete,-59,2,0);box(4,4,80,concrete,59,2,0);
  const crowdColors=['#e5ded5','#6f89aa','#ca4d4d','#314e6b','#dcad44','#6d8a76','#e7e4d4']; const crowdMat=crowdColors.map(c=>makeMat(c));
  const geo=new THREE.SphereGeometry(.20,7,5); const positions=[];
  const crowd=new THREE.Group(); const addCrowd=(isSide, edge)=>{ for(let row=0;row<15;row++){ for(let col=0;col<94;col++){ if(Math.random()>.68)continue; let x=isSide?-54+col*1.15:edge; let z=isSide?edge:-36+col*.77; if(isSide)z+=Math.random()*.7;else x+=Math.random()*.7; const m=new THREE.Mesh(geo,crowdMat[(row*7+col*5)%crowdMat.length]);m.position.set(x,4.2+row*.38,z);crowd.add(m); } } };addCrowd(true,-43.3);addCrowd(true,43.3);addCrowd(false,-60);addCrowd(false,59);scene.add(crowd);
  [-57,57].forEach(x=>box(1.2,16,1.2,rail,x,8,-39));[-57,57].forEach(x=>box(1.2,16,1.2,rail,x,8,39));[-39,39].forEach(z=>box(1.2,16,1.2,rail,-57,8,z));[-39,39].forEach(z=>box(1.2,16,1.2,rail,57,8,z));
  const boardMat=makeMat('#15313a',{roughness:.4});box(110,1.15,.32,boardMat,0,.7,-36);box(110,1.15,.32,boardMat,0,.7,36);box(.32,1.15,70,boardMat,-54,.7,0);box(.32,1.15,70,boardMat,54,.7,0);
  const skyRing=new THREE.Mesh(new THREE.CylinderGeometry(136,136,3,64,1,true),makeMat('#49798c',{side:THREE.BackSide,roughness:1}));skyRing.position.y=25;scene.add(skyRing);
}
function buildBall(){
  const m=new THREE.Mesh(new THREE.SphereGeometry(PITCH.ballR,18,12),makeMat('#f4f2df',{roughness:.55}));m.castShadow=true;m.receiveShadow=true;scene.add(m); ball={pos:v3(0,PITCH.ballR,0),vel:v3(),owner:null,lastPlayer:null,air:0,protect:0};ballMesh=m;
}

function kitMaterial(team, stripe=false){
  const base=new THREE.MeshStandardMaterial({color:team.primary,roughness:.68}); const light=new THREE.MeshStandardMaterial({color:team.secondary,roughness:.65}); return {base,light};
}
function buildPlayer(teamIndex,index){
  const team=teamDefs[teamIndex], f=FORMATION[index], g=new THREE.Group();const mats=kitMaterial(team); const skin=makeMat(index%4===0?'#5d3828':index%3===0?'#b86d45':'#d89a72');
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.52,12),new THREE.MeshBasicMaterial({color:'#092215',transparent:true,opacity:.28}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.012;g.add(shadow);
  const legMat=mats.light; [-.17,.17].forEach(z=>{const leg=new THREE.Mesh(new THREE.CylinderGeometry(.105,.115,.52,7),legMat);leg.position.set(0,.45,z);leg.castShadow=true;g.add(leg);const boot=new THREE.Mesh(new THREE.BoxGeometry(.24,.12,.31),makeMat('#161d22'));boot.position.set(.08,.18,z);boot.castShadow=true;g.add(boot);});
  const torso=new THREE.Mesh(new THREE.CylinderGeometry(.27,.34,.66,10),mats.base);torso.position.y=.98;torso.castShadow=true;g.add(torso);
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(.12,.55,.012),mats.light);stripe.position.set(-.12,.99,-.276);g.add(stripe);
  [-.36,.36].forEach(z=>{const arm=new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,.54,7),mats.base);arm.position.set(0,.99,z);arm.rotation.x=Math.PI/2.6*(z<0?1:-1);arm.castShadow=true;g.add(arm);});
  const head=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),skin);head.position.set(0,1.48,0);head.castShadow=true;g.add(head);const hair=new THREE.Mesh(new THREE.SphereGeometry(.20,10,5,0,Math.PI*2,0,Math.PI*.42),makeMat(index%3===0?'#211712':'#463020'));hair.position.set(0,1.53,0);g.add(hair);
  const label=document.createElement('div');
  const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.font='700 24px Arial';ctx.textAlign='center';ctx.fillStyle='white';ctx.shadowColor='black';ctx.shadowBlur=4;ctx.fillText(`${f[0]}  ${index+1}`,128,32);const tex=new THREE.CanvasTexture(c);const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));tag.position.y=2.2;tag.scale.set(1.55,.39,1);g.add(tag);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.52,.63,20),new THREE.MeshBasicMaterial({color:'#d8ff3f',side:THREE.DoubleSide,transparent:true,opacity:0}));ring.rotation.x=-Math.PI/2;ring.position.y=.025;g.add(ring);
  g.position.set(0,0,0);scene.add(g);
  return { team:teamIndex,index,name:`${FIRST[index]} ${LAST[(index+teamIndex*3)%LAST.length]}`,role:f[0],home:v3(f[1]*(teamIndex? -1:1),0,f[2]*(teamIndex? -1:1)),pos:v3(),vel:v3(),facing:teamIndex?Math.PI:0,mesh:g,ring, stamina:100, speed:0, action:'idle', actionTimer:0, aiTimer:Math.random(), down:0, hasBall:false, goalKeeper:index===0, target:v3(), lastPass:0 };
}
function createSquads(){
  players.forEach(p=>scene.remove(p.mesh)); players=[];
  for(let t=0;t<2;t++)for(let i=0;i<11;i++)players.push(buildPlayer(t,i));
  resetFormation(0); controlled=players.find(p=>p.team===0&&p.index===7); updateControlUI();
}
function resetFormation(kickoffTeam=0){
  players.forEach(p=>{p.pos.copy(p.home);p.vel.set(0,0,0);p.facing=p.team?Math.PI:0;p.down=0;p.action='idle';p.hasBall=false;p.stamina=100;});
  const taker=players.find(p=>p.team===kickoffTeam&&p.role==='RCM');taker.pos.set(kickoffTeam?-1:1,0,0);taker.facing=kickoffTeam?Math.PI:0; ball.pos.set(0,PITCH.ballR,0);ball.vel.set(0,0,0);ball.owner=taker;ball.lastPlayer=taker; ball.protect=2;
}

function startMatch(){
  teamDefs=[TEAMS[homeChoice],TEAMS[awayChoice]];state.duration=Number($('#match-length').value);state.difficulty=$('#difficulty').value;state.elapsed=0;state.half=1;state.score=[0,0];state.stats={shots:[0,0],possession:[0,0],fouls:[0,0]};state.phase='kickoff';state.resetTimer=2.2;state.kickoffTeam=0;state.bannerTimer=0;state.actionLock=0;currentRestart=null;
  createSquads(); resetFormation(0);$('#menu').classList.add('hidden');$('#result-card').classList.add('hidden');$('#pause-card').classList.add('hidden');$('#hud').classList.remove('hidden');$('#help-tip').classList.remove('hidden');$('#hud-home-name').textContent=teamDefs[0].short;$('#hud-away-name').textContent=teamDefs[1].short;showBanner('KICK-OFF',1.5);whistle();
}
function backToMenu(){ state.phase='menu';$('#hud').classList.add('hidden');$('#help-tip').classList.add('hidden');$('#pause-card').classList.add('hidden');$('#result-card').classList.add('hidden');$('#menu').classList.remove('hidden'); }

function moveHuman(p,dt){
  let dx=(input.down.has('KeyD')||input.down.has('ArrowRight')?1:0)-(input.down.has('KeyA')||input.down.has('ArrowLeft')?1:0); let dz=(input.down.has('KeyS')||input.down.has('ArrowDown')?1:0)-(input.down.has('KeyW')||input.down.has('ArrowUp')?1:0);
  const sprint=input.down.has('ShiftLeft')||input.down.has('ShiftRight'); let len=Math.hypot(dx,dz); if(len){dx/=len;dz/=len; const base=5.0*(teamDefs[p.team].pace/82);const run=base*(sprint&&p.stamina>3?1.42:1); p.vel.x=lerp(p.vel.x,dx*run,.16);p.vel.z=lerp(p.vel.z,dz*run,.16);p.facing=Math.atan2(-dz,dx);p.stamina=clamp(p.stamina-(sprint?13:3)*dt,0,100); } else { p.vel.multiplyScalar(.76);p.stamina=clamp(p.stamina+11*dt,0,100); }
  p.action=len?'run':'idle';
}
function aiMove(p,dt){
  const attacking=p.team===0?1:-1; const owner=ball.owner; const isOwner=owner===p; const skill=state.difficulty==='hard'?1:.8; let target=p.home.clone();
  const ownTeam=players.filter(q=>q.team===p.team), opp=players.filter(q=>q.team!==p.team); const nearest=nearestPlayer(p,ball.pos,opp);
  if(p.goalKeeper){ target.set(p.team?47:-47,0,clamp(ball.pos.z*.32,-5.3,5.3)); if(ball.pos.x*attacking>38&&ball.vel.length()>3)target.x=p.team?47.7:-47.7; }
  else if(isOwner){
    const goal=v3(attacking*52,0,0); const dist=p.pos.distanceTo(goal); target.copy(goal);target.z=clamp(p.pos.z*.45+Math.sin(state.frame*.02+p.index)*3,-20,20);
    p.aiTimer-=dt;
    if(p.aiTimer<=0){p.aiTimer=.45+Math.random()*.7; const pressure=nearest&&nearest.pos.distanceTo(p.pos)<2.4; if(dist<18 && Math.abs(p.pos.z)<13 && Math.random()<.72){shoot(p, .55+Math.random()*.38); } else if(pressure||Math.random()<.22){const passTo=bestPassTarget(p, p.team); if(passTo)passBall(p,passTo,pressure?7.5:5.2,false);} }
  } else if(owner && owner.team===p.team){
    target.copy(p.home); target.x+=attacking*clamp(ball.pos.x*.19,-7,7); target.z+=clamp(ball.pos.z*.1,-4,4);
    if(p.role.includes('F'))target.x+=attacking*5;
  } else {
    const dist=p.pos.distanceTo(ball.pos);const chaser=nearestPlayer(null,ball.pos,ownTeam);if(chaser===p || dist<10) target.copy(ball.pos); else {target.copy(p.home);target.x+=attacking*clamp(ball.pos.x*.14,-8,8);} if(owner&&owner.team!==p.team&&dist<2.1&&Math.random()<.006*skill)tackle(p,false);
  }
  const d=target.sub(p.pos);d.y=0;const length=d.length();if(length>.1){d.normalize();const base=(p.goalKeeper?4.2:4.2+teamDefs[p.team].pace/45)*skill; p.vel.x=lerp(p.vel.x,d.x*base,.08);p.vel.z=lerp(p.vel.z,d.z*base,.08);p.facing=Math.atan2(-d.z,d.x);p.action='run';}else{p.vel.multiplyScalar(.82);p.action='idle';}
}
function bestPassTarget(from,team){
  const dir=team===0?1:-1;const candidates=players.filter(p=>p.team===team&&p!==from&&!p.goalKeeper);let best=null,score=-1e4; for(const p of candidates){const dx=(p.pos.x-from.pos.x)*dir;const d=p.pos.distanceTo(from.pos);if(d<3||d>36)continue;const threat=dx*1.7-d*.22-(Math.abs(p.pos.z)*.05);if(threat>score){score=threat;best=p;}}return best;
}
function nearestPlayer(from, position, list=players){let out=null,best=Infinity; for(const p of list){if(p===from||p.down>0)continue;const d=p.pos.distanceToSquared(position);if(d<best){best=d;out=p;}}return out;}
function updatePlayers(dt){
  for(const p of players){p.actionTimer=Math.max(0,p.actionTimer-dt);p.down=Math.max(0,p.down-dt); if(p.down>0){p.mesh.rotation.z=Math.sin(p.facing)*1.3;p.vel.multiplyScalar(.88);}else{p.mesh.rotation.z=0;if(p===controlled&&p.team===0)moveHuman(p,dt);else aiMove(p,dt);} p.pos.addScaledVector(p.vel,dt);p.pos.x=clamp(p.pos.x,-51,51);p.pos.z=clamp(p.pos.z,-33,33);p.mesh.position.copy(p.pos);p.mesh.rotation.y=p.facing;const bob=p.action==='run'?Math.sin(state.frame*.25+p.index)*.045:0;p.mesh.position.y=bob;p.ring.material.opacity=p===controlled?.95:0; }
}
function updateBall(dt){
  ball.protect=Math.max(0,ball.protect-dt);
  if(ball.owner){const o=ball.owner;if(o.down>0){ball.owner=null;ball.vel.copy(o.vel).multiplyScalar(.5);return;} const front=v3(Math.cos(o.facing),0,-Math.sin(o.facing));ball.pos.copy(o.pos).addScaledVector(front,.62);ball.pos.y=PITCH.ballR+.03+Math.abs(Math.sin(state.frame*.28))*0.025;ball.vel.copy(o.vel);o.hasBall=true;players.forEach(p=>{if(p!==o)p.hasBall=false;});}
  else {ball.pos.addScaledVector(ball.vel,dt);ball.vel.y-=14*dt;if(ball.pos.y<PITCH.ballR){ball.pos.y=PITCH.ballR;if(Math.abs(ball.vel.y)>1.2)ball.vel.y*=-.44;else ball.vel.y=0;ball.vel.x*=.985;ball.vel.z*=.985;}ball.vel.multiplyScalar(.999); if(ball.vel.length()<.08)ball.vel.set(0,0,0);takePossession();}
  ballMesh.position.copy(ball.pos);ballMesh.rotation.x+=ball.vel.z*dt*1.8;ballMesh.rotation.z-=ball.vel.x*dt*1.8;
}
function takePossession(){ if(ball.protect>0)return; const candidates=players.filter(p=>p.down<=0&&!p.goalKeeper&&p.pos.distanceTo(ball.pos)<.88);if(!candidates.length)return; candidates.sort((a,b)=>a.pos.distanceToSquared(ball.pos)-b.pos.distanceToSquared(ball.pos)); const p=candidates[0]; ball.owner=p;ball.lastPlayer=p;ball.vel.set(0,0,0);p.hasBall=true;if(p.team===0&&(!controlled||controlled.team!==0||controlled.pos.distanceTo(ball.pos)>9)){controlled=p;updateControlUI();} }
function passBall(from,to,power=6,long=false){ if(!from||ball.owner!==from||state.actionLock>0)return; const target=to.pos.clone().add(to.vel.clone().multiplyScalar(long?.95:.35));const dir=target.sub(from.pos);dir.y=0;const distance=dir.length();dir.normalize(); ball.owner=null;from.hasBall=false;ball.vel.copy(dir).multiplyScalar(power+distance*.12);ball.vel.y=long?2.6:Math.min(1.1,distance*.035);ball.protect=.13;ball.lastPlayer=from;state.lastTouch=from.team;state.actionLock=.18;from.action=long?'longpass':'pass';from.actionTimer=.28;
  if(offsideCheck(from,to)){setRestart('OFFSIDE',from.team===0?1:0,to.pos.clone());return;}
  if(from===controlled&&to.team===0){controlled=to;updateControlUI();} }
function offsideCheck(from,to){if(to.team!==from.team||to.goalKeeper)return false;const dir=from.team===0?1:-1;const defenders=players.filter(p=>p.team!==from.team).sort((a,b)=>(b.pos.x-a.pos.x)*dir);const line=defenders[1]?.pos.x??0;return (to.pos.x-line)*dir>1.2 && (to.pos.x-from.pos.x)*dir>1.5;}
function shoot(p,power=.65){if(!p||ball.owner!==p||state.actionLock>0)return;const goalX=p.team===0?52:-52;const aimZ=clamp(p.pos.z*.15+(Math.random()-.5)*4,-PITCH.goalW+.4,PITCH.goalW-.4);const target=v3(goalX,Math.random()<.25?3.4:1.1,aimZ);const dir=target.sub(p.pos);dir.normalize();const error=(1-power)*(state.difficulty==='hard'&&p.team?1.8:1.2);dir.z+=(Math.random()-.5)*error*.12;dir.y+=(Math.random()-.5)*error*.1;ball.owner=null;p.hasBall=false;ball.vel.copy(dir).multiplyScalar(14+power*12);ball.vel.y=Math.max(1.2,ball.vel.y*3.2+power*4);ball.protect=.16;ball.lastPlayer=p;state.lastTouch=p.team;state.stats.shots[p.team]++;state.actionLock=.25;p.action='shoot';p.actionTimer=.38; }
function tackle(p,slide=false){if(!p||p.down>0||state.actionLock>0)return;const enemy=nearestPlayer(p,p.pos,players.filter(q=>q.team!==p.team));const dist=enemy?p.pos.distanceTo(enemy.pos):99;p.action=slide?'slide':'tackle';p.actionTimer=slide?.55:.25;p.down=slide?.38:0;state.actionLock=.18; if(enemy&&dist<(slide?2.2:1.35)){const foulChance=slide?.36:.12;if(Math.random()<foulChance){state.stats.fouls[p.team]++;setRestart('FOUL',enemy.team,enemy.pos.clone());showBanner('FOUL!',1.2);whistle();}else if(ball.owner===enemy){ball.owner=null;ball.vel.copy(enemy.pos.clone().sub(p.pos).normalize()).multiplyScalar(3);ball.protect=.16;ball.lastPlayer=p;state.lastTouch=p.team;}}
}
function checkBounds(){
  if(state.phase!=='playing'||ball.owner)return; const x=ball.pos.x,z=ball.pos.z;
  if(Math.abs(x)>PITCH.x+.2 && Math.abs(z)<PITCH.goalW && ball.pos.y<PITCH.goalH){goal(x>0?0:1);return;}
  if(Math.abs(z)>PITCH.z+.25){const team=state.lastTouch===0?1:0;const spot=v3(clamp(x,-49,49),0,Math.sign(z)*32.8);setRestart('THROW-IN',team,spot);return;}
  if(Math.abs(x)>PITCH.x+.25){const scoringSide=x>0?0:1;const defendTeam=scoringSide===0?1:0; const last=state.lastTouch; if(last===defendTeam){const team=scoringSide;setRestart('CORNER',team,v3(Math.sign(x)*51,0,Math.sign(z||1)*32.4));}else{setRestart('GOAL KICK',defendTeam,v3(Math.sign(x)*47,0,0));} }
}
function goalieLogic(dt){ for(const g of players.filter(p=>p.goalKeeper)){ if(ball.owner&&ball.owner.team===g.team)continue;const inBox=(g.team===0?ball.pos.x<-34:ball.pos.x>34);if(inBox&&ball.pos.y<3&&Math.abs(ball.pos.z)<9&&ball.pos.distanceTo(g.pos)<6){g.pos.z=lerp(g.pos.z,clamp(ball.pos.z,-5.7,5.7),.09);if(ball.pos.distanceTo(g.pos)<1.25 && ball.vel.length()>3){ball.owner=g;ball.vel.set(0,0,0);ball.protect=.4;g.action='save';g.actionTimer=.45;}} } }
function goal(team){state.score[team]++;showBanner('GOAL!',2.2);whistle();state.phase='stoppage';state.resetTimer=2.6;state.restartText=`${teamDefs[team].short} SCORE!`;state.kickoffTeam=team===0?1:0;ball.owner=null;ball.vel.set(0,0,0);players.forEach(p=>{p.action=team===p.team?'celebrate':'idle';});}
function setRestart(label,team,spot){if(state.phase!=='playing')return;state.phase='stoppage';state.resetTimer=1.7;state.restartText=label;currentRestart={label,team,spot};ball.owner=null;ball.vel.set(0,0,0);ball.pos.copy(spot);showBanner(label,1.25);whistle();}
function resolveRestart(){ if(currentRestart){const r=currentRestart; const taker=nearestPlayer(null,r.spot,players.filter(p=>p.team===r.team&&!p.goalKeeper))||players.find(p=>p.team===r.team);taker.pos.copy(r.spot);taker.pos.x=clamp(taker.pos.x,-50,50);taker.pos.z=clamp(taker.pos.z,-32.5,32.5);ball.owner=taker;ball.lastPlayer=taker;ball.protect=.8;currentRestart=null;state.phase='playing';}else{resetFormation(state.kickoffTeam);state.phase='playing';} }
function updateCamera(dt){const focus=ball.owner?ball.owner.pos:ball.pos; const desired=v3(clamp(focus.x*.4,-15,15),42,clamp(focus.z*.32,-9,9)+48);camera.position.lerp(desired,1-Math.pow(.001,dt));camera.lookAt(focus.x*.22,0,focus.z*.18);}
function updateClock(dt){ if(state.phase==='playing'){state.elapsed+=dt; if(ball.owner)state.stats.possession[ball.owner.team]+=dt;const halfDuration=state.duration/2;if(state.half===1&&state.elapsed>=halfDuration){state.phase='halftime';state.resetTimer=3.5;showBanner('HALF TIME',2.8);whistle();}else if(state.elapsed>=state.duration){state.phase='fulltime';showResult();whistle();}}
  if(state.phase==='kickoff'||state.phase==='stoppage'||state.phase==='halftime'){state.resetTimer-=dt;if(state.resetTimer<=0){if(state.phase==='halftime'){state.half=2;state.phase='kickoff';state.resetTimer=1.6;state.kickoffTeam=1;showBanner('SECOND HALF',1.3);}else resolveRestart();}}
  const gameSeconds=clamp(state.elapsed,0,state.duration);const mins=Math.floor(gameSeconds/60).toString().padStart(2,'0'), secs=Math.floor(gameSeconds%60).toString().padStart(2,'0');$('#hud-clock').textContent=`${mins}:${secs}`;$('#hud-period').textContent=state.half===1?'1ST HALF':'2ND HALF';$('#hud-status').textContent=state.phase==='playing'?'LIVE':state.phase==='halftime'?'HALF TIME':state.restartText; }
function showResult(){ $('#hud').classList.add('hidden');$('#result-card').classList.remove('hidden');const [a,b]=state.score;$('#result-home').textContent=a;$('#result-away').textContent=b;$('#result-home-name').textContent=teamDefs[0].short;$('#result-away-name').textContent=teamDefs[1].short;$('#result-title').textContent=a===b?'Honours even':a>b?`${teamDefs[0].short} win!`:`${teamDefs[1].short} win!`;$('#stat-shots').textContent=`${state.stats.shots[0]} – ${state.stats.shots[1]}`;let pt=state.stats.possession[0]+state.stats.possession[1]||1;$('#stat-possession').textContent=`${Math.round(state.stats.possession[0]/pt*100)}% – ${Math.round(state.stats.possession[1]/pt*100)}%`;$('#stat-fouls').textContent=`${state.stats.fouls[0]} – ${state.stats.fouls[1]}`; }
function showBanner(text,seconds=1.4){const e=$('#event-banner');e.textContent=text;e.classList.add('show');state.bannerTimer=seconds;}
function updateHUD(dt){$('#hud-home-score').textContent=state.score[0];$('#hud-away-score').textContent=state.score[1];if(controlled){$('#stamina-bar').style.width=`${controlled.stamina}%`;$('#controlled-name').textContent=`${controlled.role} • #${controlled.index+1}`;} if(state.bannerTimer>0){state.bannerTimer-=dt;if(state.bannerTimer<=0)$('#event-banner').classList.remove('show');}const meter=$('#shot-meter');if(input.shotStart&&state.phase==='playing'){state.shotCharge=clamp((performance.now()-input.shotStart)/1300,.12,1);meter.classList.add('active');meter.querySelector('em').style.width=`${state.shotCharge*100}%`;}else meter.classList.remove('active');drawRadar();}
function updateControlUI(){if(controlled)$('#controlled-name').textContent=`${controlled.role} • #${controlled.index+1}`;}
function drawRadar(){const c=$('#radar'),ctx=c.getContext('2d'),w=c.width,h=c.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='rgba(43,115,63,.85)';ctx.fillRect(2,2,w-4,h-4);ctx.strokeStyle='rgba(244,255,242,.7)';ctx.lineWidth=1;ctx.strokeRect(3,3,w-6,h-6);ctx.beginPath();ctx.moveTo(w/2,3);ctx.lineTo(w/2,h-3);ctx.stroke();ctx.beginPath();ctx.arc(w/2,h/2,13,0,Math.PI*2);ctx.stroke();const map=(p)=>[(p.x/PITCH.x*.5+.5)*w,(p.z/PITCH.z*.5+.5)*h];for(const p of players){const [x,y]=map(p.pos);ctx.fillStyle=p.team===0?teamDefs[0].primary:teamDefs[1].primary;ctx.beginPath();ctx.arc(x,y,p===controlled?3.4:2.1,0,Math.PI*2);ctx.fill();if(p===controlled){ctx.strokeStyle='#ddff46';ctx.stroke();}}const [bx,by]=map(ball.pos);ctx.fillStyle='#fff';ctx.fillRect(bx-2,by-2,4,4);}
function whistle(){try{const ac=new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.type='square';o.frequency.value=1900;g.gain.setValueAtTime(.035,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.16);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+.17);}catch(e){/* browser may block audio before interaction */}}

function onKeyDown(e){const keys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'];if(keys.includes(e.code))e.preventDefault();if(e.code==='Escape'&&state.phase!=='menu'&&state.phase!=='fulltime'){togglePause();return;}if(e.repeat)return;input.down.add(e.code);if(state.phase!=='playing')return;if(e.code==='KeyJ'){const target=bestPassTarget(controlled,0);if(target)passBall(controlled,target,5.7,false);}if(e.code==='KeyL'){const target=bestPassTarget(controlled,0);if(target)passBall(controlled,target,7.8,true);}if(e.code==='KeyQ'){switchPlayer();}if(e.code==='Space'){tackle(controlled,false);}if(e.code==='KeyE'){tackle(controlled,true);}if(e.code==='KeyK'&&ball.owner===controlled)input.shotStart=performance.now();}
function onKeyUp(e){input.down.delete(e.code);if(e.code==='KeyK'&&input.shotStart){const power=clamp((performance.now()-input.shotStart)/1300,.15,1);shoot(controlled,power);input.shotStart=0;}}
function switchPlayer(){const pool=players.filter(p=>p.team===0&&!p.goalKeeper);pool.sort((a,b)=>a.pos.distanceToSquared(ball.pos)-b.pos.distanceToSquared(ball.pos));controlled=pool.find(p=>p!==controlled)||pool[0];updateControlUI();}
function togglePause(){state.paused=!state.paused;$('#pause-card').classList.toggle('hidden',!state.paused);}
function animate(now){animationId=requestAnimationFrame(animate);let dt=Math.min(clock.getDelta(),.045);state.frame++;if(state.phase!=='menu'&&!state.paused&&state.phase!=='fulltime'){state.actionLock=Math.max(0,state.actionLock-dt);updatePlayers(dt);goalieLogic(dt);updateBall(dt);checkBounds();updateClock(dt);updateHUD(dt);updateCamera(dt);}else if(state.phase!=='menu')updateHUD(dt);renderer.render(scene,camera);}

function init(){buildScene();configTeamCards();$('#kickoff').addEventListener('click',startMatch);$('#resume').addEventListener('click',togglePause);$('#restart').addEventListener('click',startMatch);$('#back-menu').addEventListener('click',backToMenu);$('#play-again').addEventListener('click',startMatch);$('#results-menu').addEventListener('click',backToMenu);window.addEventListener('keydown',onKeyDown);window.addEventListener('keyup',onKeyUp);$('#loading').remove();animate();}
init();
