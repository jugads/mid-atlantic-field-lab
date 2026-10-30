const assert=require('node:assert/strict');
const {Simulation,ARCHETYPES,FIELD,TOWER,W,H,BR,hubs,bumps,trenches,solids,ball,phaseAt,terrainHeight,canUseTrench,intakeSign}=require('../dist/physics.js');
const {profiles,resolve:resolvePreset}=require('../dist/team-presets.js');
const {ControllerInput,axis}=require('../dist/controller.js');
const {Countdown}=require('../dist/countdown.js');
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function advance(s,seconds,input={}){for(let i=0;i<Math.round(seconds*120);i++)s.step(1/120,input);}
function empty(config={}){const s=new Simulation({stationary:100,...config},()=>.5);s.balls=[];return s;}
function total(s){return s.balls.length+s.inventory+s.parked.reduce((n,r)=>n+r.inventory,0)+s.pending.length+s.outpostReserve.blue+s.outpostReserve.red;}
function enterHub(s,alliance){const h=hubs.find(h=>h.alliance===alliance);s.balls.push({...ball(h.x,h.y,FIELD.hubHeight+.001),vz:-1,shot:true,eligible:true,shooter:alliance});advance(s,.35);}
test('504 fuel with centered pile, depot fuel and outpost reserves',()=>{
 const s=new Simulation();assert.equal(total(s),504);assert.equal(s.initialCenterCount,400);
 assert(s.balls.slice(0,400).every(b=>Math.abs(b.x-W/2)<FIELD.centerDepth/2&&Math.abs(b.y-H/2)<FIELD.centerWidth/2));
 assert(s.balls.slice(0,400).every(b=>Math.abs(b.x-W/2)>BR+.025));assert.equal(s.balls.length-400,48);
 const low=new Simulation({capacity:1});assert.equal(low.initialCenterCount,407);assert.equal(total(low),504);
});
test('three-second countdown pauses, resumes, completes once, and can reset',()=>{
 const c=new Countdown(3);assert(!c.active);assert(c.start());assert(!c.start());
 assert.equal(c.remaining,3);assert(!c.advance(1));assert.equal(c.remaining,2);
 assert(c.togglePause());assert(!c.advance(50));assert.equal(c.remaining,2);
 assert(c.togglePause());assert(!c.advance(1.9));assert(c.advance(.1));assert(!c.active);assert(!c.advance(1));
 assert(c.start());c.advance(.5);c.cancel();assert(!c.active);assert.equal(c.remaining,0);
});
test('ready state freezes physics; AUTO remains driver-controlled',()=>{
 const s=empty(),x=s.robot.x,a=s.robot.a;s.step(1,{right:true});assert.equal(s.time,0);
 s.start();advance(s,.1,{left:true,clockwise:true});assert(s.robot.x<x);assert(s.robot.a>a);assert.equal(s.fired,0);
});
test('driver-triggered AUTO shooting scores and recycles without fuel loss',()=>{
 const s=empty(),count=total(s);s.start();advance(s,5,{shoot:true});assert.equal(s.fired,8);assert.equal(s.autoScores.blue,8);
 assert.equal(s.score,8);assert.equal(s.resolved,8);assert.equal(s.recycled,8);assert.equal(total(s),count);
});
test('official phase boundaries include both three-second scoring delays',()=>{
 for(const [t,id]of [[0,'auto'],[19.99,'auto'],[20,'auto-settle'],[23,'transition'],[33,'shift1'],[58,'shift2'],[83,'shift3'],[108,'shift4'],[133,'endgame'],[163,'final-settle'],[166,'finished']])assert.equal(phaseAt(t).id,id);
});
test('AUTO winner inactive first; hubs alternate then both activate for endgame',()=>{
 const s=empty();s.start();s.autoWinner='blue';
 for(const [time,blue,red]of [[0,true,true],[23,true,true],[33,false,true],[58,true,false],[83,false,true],[108,true,false],[133,true,true]]){s.time=time;assert.equal(s.activeAt('blue'),blue);assert.equal(s.activeAt('red'),red);}
 s.autoWinner='red';s.time=33;assert(s.activeAt('blue'));assert(!s.activeAt('red'));
});
test('AUTO result locks after delay; tied result uses random selection',()=>{
 const s=empty();s.start();s.time=22.99;s.autoScores.red=3;s.step(.02);assert.equal(s.autoWinner,'red');
 const t=empty();t.start();t.time=22.99;t.step(.02);assert.equal(t.autoWinner,t.tieChoice);
});
test('inactive hub recycles without points after deactivation grace',()=>{
 const s=empty();s.start();s.autoWinner='blue';s.time=34;enterHub(s,'blue');assert.equal(s.score,1);
 s.time=36.1;enterHub(s,'blue');assert.equal(s.score,1);assert.equal(s.inactiveMade,1);assert.equal(s.pending.length+s.recycled,2);
 s.time=37.2;s.step(1/120);assert.equal(s.recycled,2);
});
test('four exits return fuel toward center',()=>{
 const s=empty();s.start();s.time=40;for(let exit=0;exit<4;exit++)s.pending.push({alliance:'blue',release:40,exit});s.step(1/120);
 assert.equal(s.balls.length,4);assert(s.balls.every(b=>b.vx>0&&b.x>hubs[0].x));assert.equal(new Set(s.balls.map(b=>b.y.toFixed(2))).size,4);
});
test('pause and final match state freeze controls and time',()=>{
 const s=empty();s.start();s.time=30;s.pause();const x=s.robot.x;advance(s,1,{right:true});assert.equal(s.time,30);assert.equal(s.robot.x,x);
 s.pause();s.time=165.99;s.step(.02,{shoot:true});assert.equal(s.phase.id,'finished');assert.equal(s.running,false);
});
test('front intake respects capacity; lowering capacity conserves fuel',()=>{
 const s=empty({capacity:1});s.start();s.time=25;s.inventory=0;s.balls=[ball(s.robot.x+.6,s.robot.y)];s.step(1/120);assert.equal(s.inventory,1);assert.equal(s.balls.length,0);
 const t=empty(),count=total(t);t.setConfig({capacity:2});assert.equal(t.inventory,2);assert.equal(total(t),count);
});
test('bump slope lifts and pitches chassis; trench rejects tall robots',()=>{
 const b=bumps[0];assert(Math.abs(terrainHeight(b.x,b.y)-.1654)<1e-8);assert(terrainHeight(b.x-.4,b.y)<terrainHeight(b.x,b.y));
 const s=empty();s.robot.x=b.x-.3;s.robot.y=b.y;s.updatePose();assert(s.robot.z>0);assert(s.robot.pitch>0);
 const tr=trenches[0],low=empty({height:.52});low.start();low.time=25;low.robot.x=tr.x-1;low.robot.y=tr.y;advance(low,1,{right:true});assert(low.robot.x>tr.x+.6);
 const tall=empty({height:.8});tall.start();tall.time=25;tall.robot.x=tr.x-1;tall.robot.y=tr.y;advance(tall,1,{right:true});assert(tall.robot.x<tr.x-FIELD.hubSize/2);
});
test('turning alone does not translate swerve',()=>{
 const s=empty();s.start();s.time=25;const x=s.robot.x,y=s.robot.y;advance(s,.15,{clockwise:true});assert(s.robot.a>0);assert(Math.hypot(s.robot.x-x,s.robot.y-y)<.001);
});
test('releasing drive controls applies strong braking without changing acceleration',()=>{
 const s=empty();s.start();s.time=25;s.robot.x=7;s.robot.y=1;advance(s,.75,{right:true});
 assert(Math.abs(s.robot.vx-s.config.maxSpeed)<.02,`top speed ${s.robot.vx}`);
 const x=s.robot.x;advance(s,.25);assert(Math.hypot(s.robot.vx,s.robot.vy)<.02,'should stop within 0.25 seconds');
 assert(s.robot.x-x<.6,'neutral stopping distance should stay under 0.6 m');
});
test('user-supplied team builds resolve with the requested specifications',()=>{
 const p341=resolvePreset('341'),p316=resolvePreset('316'),p1391=resolvePreset('1391'),p8513=resolvePreset('8513');
 assert.equal(Object.keys(profiles).length,5);
 assert.equal(p341.capacity,8);assert.equal(p341.archetype,'turret');assert.equal(p341.height,.4);
 assert.equal(p341.feedRate,10);assert.equal(p341.intakeRate,15);assert(p341.moving>=85);
 assert.equal(p316.capacity,50);assert(p316.height<FIELD.trenchClearance);assert.equal(p316.archetype,'dumper');assert.equal(p316.feedRate,20);assert.equal(p316.lanes,3);assert.equal(p316.intakeRate,32);assert.equal(p316.moving,75);
 assert.equal(p1391.capacity,45);assert.equal(p1391.maxRange,3.7);assert(p1391.height<FIELD.trenchClearance);assert.equal(p1391.feedRate,15);assert.equal(p1391.lanes,4);assert.equal(p1391.intakeRate,20);assert.equal(p1391.moving,0);
 assert.equal(p8513.capacity,80);assert.equal(p8513.height,.762);assert.equal(p8513.feedRate,20);assert.equal(p8513.intakeRate,30);assert.equal(p8513.moving,0);
 const p9094=resolvePreset('9094');assert.equal(p9094.archetype,'turret');assert.equal(p9094.capacity,35);assert.equal(p9094.feedRate,10);assert.equal(p9094.intakeRate,20);assert.equal(p9094.moving,75);
 assert.equal(resolvePreset('316','red').alliance,'red');assert.equal(resolvePreset('unknown'),null);
});
test('0% SOTM profiles miss while moving but still shoot normally when stationary',()=>{
 for(const team of ['1391','8513']){
  const c={...resolvePreset(team),autoAim:false,stationary:100},s=empty(c);s.robot.vx=2;s.robot.a=0;s.inventory=8;
  s.fire();const target=s.target, b=s.balls[0],d=Math.hypot(target.x-s.robot.x,target.y-s.robot.y),t=s.shotSolution.flight;
  assert(Math.hypot(b.x+b.vx*t-target.x,b.y+b.vy*t-target.y)>FIELD.openingRadius+BR,team+' should miss when moving');
  const stopped=empty(c);stopped.robot.a=Math.atan2(stopped.target.y-stopped.robot.y,stopped.target.x-stopped.robot.x)-(c.shooterDirection==='back'?Math.PI:0);stopped.inventory=8;stopped.fire();
  const q=stopped.balls[0],distance=Math.hypot(stopped.target.x-stopped.robot.x,stopped.target.y-stopped.robot.y),tf=stopped.shotSolution.flight;
  assert(Math.hypot(q.x+q.vx*tf-stopped.target.x,q.y+q.vy*tf-stopped.target.y)<FIELD.openingRadius,team+' should retain stationary shooting');
 }
});
test('all built-in profiles and generic archetypes default to the same drive limits',()=>{
 for(const team of Object.keys(profiles)){const p=resolvePreset(team);assert.equal(p.maxSpeed,5,team);assert.equal(p.acceleration,10,team);}
 for(const spec of Object.values(ARCHETYPES)){assert.equal(spec.settings.maxSpeed,5);assert.equal(spec.settings.acceleration,10);}
});
test('dumper channels are centered and their launch points match the configured offsets',()=>{
 const s=empty({...ARCHETYPES.dumper.settings,lanes:4,autoAim:false});s.robot.a=0;s.inventory=8;s.fire();
 const offsets=s.balls.map(b=>b.y-s.robot.y);assert.equal(offsets.length,4);
 assert(offsets.every(offset=>Math.abs(offset)<=s.config.width*.15+1e-9));
 assert(Math.abs(offsets.reduce((a,b)=>a+b,0))<1e-8);
});
test('standard controller deadzones, holds, edge buttons and disconnects',()=>{
 const input=new ControllerInput();assert.equal(axis(.1),0);assert.equal(axis(-1),-1);
 const pad={index:0,connected:true,mapping:'standard',axes:[.15,-1,.575],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
 pad.buttons[0].pressed=true;pad.buttons[2].pressed=true;pad.buttons[5].pressed=true;pad.buttons[9].pressed=true;
 let a=input.poll([pad]);assert(a.connected&&a.supported&&a.shoot&&a.confirm&&a.toggleIntake&&a.switchRobot&&a.startPause);
 assert.equal(a.x,0);assert.equal(a.y,-1);assert(Math.abs(a.turn-.5)<.001);
 a=input.poll([pad]);assert(a.shoot);assert(!a.confirm&&!a.toggleIntake&&!a.switchRobot&&!a.startPause);
 pad.buttons[14].pressed=true;assert(input.poll([pad]).previousChoice);assert(!input.poll([pad]).previousChoice);
 pad.buttons[14].pressed=false;pad.buttons[15].pressed=true;assert(input.poll([pad]).nextChoice);
 a=input.poll([pad],true);assert(!a.shoot&&a.turn===0);a=input.poll([pad]);assert(!a.startPause);
 pad.buttons[9].pressed=false;input.poll([pad]);pad.buttons[9].pressed=true;assert(input.poll([pad]).startPause);
 assert(!input.poll([]).connected);const unknown=input.poll([{...pad,mapping:''}]);assert(unknown.connected&&!unknown.supported&&!unknown.shoot);
});
test('analog controller input provides proportional swerve and tank motion',()=>{
 const s=empty();s.start();s.time=25;s.robot.x=7;s.robot.y=1;advance(s,1,{moveX:.5,moveY:0,turnAxis:.5});
 assert(Math.abs(s.robot.vx-2.5)<.05);assert(s.robot.a>1.7&&s.robot.a<1.9);
 const t=empty({drive:'tank'});t.start();t.time=25;t.robot.x=7;t.robot.y=1;advance(t,.2,{forward:.5,tankTurn:.5});
 assert(t.robot.a>.3&&t.robot.a<.4);assert(Math.hypot(t.robot.vx,t.robot.vy)>0);
});
test('hub retains fuel visibly until it reaches the sensor',()=>{
 const s=empty();s.start();s.time=25;const h=hubs[0];
 s.balls=[{...ball(h.x,h.y,FIELD.hubHeight+.08),vz:-4,shot:true,eligible:true,shooter:'blue'}];
 advance(s,.035);assert.equal(s.score,0);assert.equal(s.balls.length,1);assert.equal(s.balls[0].hubInside,'blue');
 advance(s,.3);assert.equal(s.score,1);assert.equal(s.resolved,1);
});
test('fuel can bounce off the hub rim and either fall in or out',()=>{
 function throwAt(offset){const s=empty();s.start();s.time=25;const h=hubs[0];
   s.balls=[{...ball(h.x+offset,h.y,FIELD.hubHeight+.08),vz:-4,shot:true,eligible:true,shooter:'blue'}];
   let bounced=false;for(let i=0;i<240;i++){s.step(1/120);if(s.balls[0]?.vz>0&&s.time<25.2)bounced=true;}
   return {s,bounced};}
 const inside=throwAt(.5),outside=throwAt(.53);
 assert(inside.bounced&&outside.bounced,'both shots should rebound from the lip');
 assert.equal(inside.s.score,1);assert.equal(outside.s.score,0);
});
test('1391 scoring range reaches the tower but distant shots fall short',()=>{
 const s=empty(resolvePreset('1391'));s.robot.x=TOWER.postX;s.robot.y=H/2;
 assert(!s.shotSolution.outOfRange);assert(s.shotSolution.distance<=3.7);
 s.robot.x=.45;const target=s.target;assert(s.shotSolution.outOfRange);assert.equal(s.fireStatus,'OUT OF RANGE');
 const solution=s.shotSolution;assert(Math.abs(solution.reach-3.7)<1e-8);assert(solution.target.x<target.x);
 s.config.autoAim=true;s.robot.a=s.aimAngle;s.inventory=1;assert.equal(s.fire(1),1);const b=s.balls[0];
 assert(b.x+b.vx*solution.flight<target.x-FIELD.openingRadius,'ball should fall short of the hub');
 s.robot.x=W/2;assert.equal(s.shotMode,'pass');assert(!s.shotSolution.outOfRange,'passing has separate range');
});
test('longer hub shots have a higher ballistic apex',()=>{
 const s=empty();s.robot.y=H/2;const h=s.target,launch=s.robot.z+s.config.height-.05;
 function apex(distance){s.robot.x=h.x-distance;const t=s.shotSolution.flight,vz=(FIELD.hubHeight-launch+.5*9.81*t*t)/t;return launch+vz*vz/(2*9.81);}
 assert(apex(4)>apex(2)+.3);
});
test('wider trench lets a standard 1 m chassis use the extra margin',()=>{
 const s=empty({width:1,length:1.05,height:.55});s.start();s.time=25;const tr=trenches[0];
 s.robot.x=tr.x-1;s.robot.y=.83;advance(s,1.5,{right:true});
 assert(s.robot.x>tr.x+.6,`robot stopped at ${s.robot.x}`);
});
test('bump height and pitch transition smoothly without snapping',()=>{
 const s=empty(),b=bumps[0];s.robot.x=b.x-.25;s.robot.y=b.y;s.robot.z=0;s.robot.pitch=0;
 s.updatePose(1/120);const first=s.robot.z;assert(first>0&&first<=FIELD.bumpHeight);
 for(let i=0;i<120;i++)s.updatePose(1/120);assert(s.robot.z>0);assert(s.robot.pitch>0);
 assert.equal(terrainHeight(b.x-b.width/2,b.y),0);
});
test('bump crest supports the chassis and the intake opposes dumper shooters',()=>{
 const b=bumps[0],s=empty();Object.assign(s.robot,{x:b.x,y:b.y,z:0,a:0,pitch:0,roll:0});s.updatePose(1/120);
 assert(s.robot.z>=terrainHeight(b.x,b.y));
 for(const team of ['316','1391','8513']){const c=resolvePreset(team);assert.equal(intakeSign(c),c.shooterDirection==='back'?1:-1);}
 assert.equal(intakeSign(resolvePreset('341')),1);
});
test('front and rear dumper intakes collect on the side opposite the shooter',()=>{
 for(const team of ['316','1391']){
  const c=resolvePreset(team),s=empty(c);s.start();s.time=25;Object.assign(s.robot,{x:7,y:1,a:0,vx:0,vy:0});s.inventory=0;
  const side=intakeSign(c);s.balls=[ball(s.robot.x+side*(c.length/2+.12),s.robot.y)];advance(s,.05);
  assert.equal(s.inventory,1,team+' should collect at intake side');
 }
});
test('bump traversal maintains drive speed and settles quickly afterward',()=>{
 const s=empty(),b=bumps[0];s.start();Object.assign(s.robot,{x:b.x-1.3,y:b.y,z:0,a:0,vx:5,vy:0});
 let minSpeed=5;for(let i=0;i<64;i++){s.step(1/120,{right:true});minSpeed=Math.min(minSpeed,s.robot.vx);}
 assert(minSpeed>4.99);assert(s.robot.x>b.x+1.2);assert(s.robot.z<.01);assert(Math.abs(s.robot.pitch)<.03);
});
test('built-in robots start at a matching trench or bump',()=>{
 for(const team of ['341','316','1391','8513']){
   const c=resolvePreset(team),s=new Simulation(c,()=>.5),r=s.robot;
   assert.equal(r.startArea,team==='8513'?'bump':'trench',team);
   assert(r.x+c.length/2<=FIELD.startLine+1e-5,team+' starts on the alliance side');
   if(r.startArea==='trench')assert(Math.abs(r.y-FIELD.trenchWidth/2)<1e-6,team+' should align to the opening');
   else assert(Math.abs(r.y-(H/2-FIELD.hubSize/2-FIELD.bumpWidth/2))<1e-6,team+' should align to the bump');
   s.balls=[];s.start();advance(s,1,{right:true});assert(s.robot.x>FIELD.startLine+.5,team+' should be able to leave its start lane');
 }
 assert(!canUseTrench({height:FIELD.trenchClearance+.01,width:.8}));
 assert(!canUseTrench({height:.5,width:FIELD.trenchWidth}));
});
test('multiple robot starts use distinct lanes on either alliance',()=>{
 const s=new Simulation(resolvePreset('341'));assert(s.addRobot(resolvePreset('316')));assert(s.addRobot(resolvePreset('8513')));
 const blue=s.fleet.map(e=>e.robot.y);assert.equal(new Set(blue).size,3);
 assert(s.addRobot(resolvePreset('1391','red')));const r=s.robot;
 assert.equal(r.startArea,'trench');assert(r.x-s.config.length/2>=W-FIELD.startLine-1e-5);assert(Math.abs(r.a-Math.PI)<1e-8);
});
test('shooting or passing limits swerve and tank robots to 30% drive speed',()=>{
 for(const drive of ['swerve','tank']){
  const s=empty({drive,feedRate:1,capacity:80,autoAim:false});s.start();s.time=25;s.robot.x=6.5;s.robot.y=1;s.inventory=80;
  const input=drive==='tank'?{forward:1,shoot:true}:{moveX:1,moveY:0,shoot:true};
  advance(s,1,input);assert(Math.abs(Math.hypot(s.robot.vx,s.robot.vy)-s.config.maxSpeed*.3)<.02,drive+' should be limited to 30%');
  assert(s.robot.shootingSpeedLimited);assert(s.passed>0,'outside the alliance zone, firing is passing');
  advance(s,.4,{...input,shoot:false});assert(Math.hypot(s.robot.vx,s.robot.vy)>s.config.maxSpeed*.8,drive+' should regain speed after release');
 }
});
test('pressing shoot while moving brakes into the lower limit; empty robots are unrestricted',()=>{
 const s=empty({feedRate:1,capacity:80,autoAim:false});s.start();s.time=25;s.robot.x=6.5;s.robot.y=1;s.inventory=80;
 advance(s,.55,{moveX:1,moveY:0});assert(Math.abs(s.robot.vx-5)<.02);
 advance(s,.15,{moveX:1,moveY:0,shoot:true});assert(Math.abs(s.robot.vx-1.5)<.02);
 s.inventory=0;advance(s,.4,{moveX:1,moveY:0,shoot:true});assert(!s.robot.shootingSpeedLimited);assert(s.robot.vx>4);
});
test('outside alliance zone, Space ferries fuel to home carpet',()=>{
 const s=empty();s.start();s.time=25;s.inventory=1;s.robot.x=W/2;s.robot.y=H/2-1.65;
 assert.equal(s.shotMode,'pass');advance(s,2,{shoot:true});assert.equal(s.passed,1);assert.equal(s.fired,0);assert.equal(s.score,0);
 assert(s.balls.some(b=>b.x<FIELD.startLine));
});
test('turret fires while moving without changing chassis heading',()=>{
 const s=empty();s.robot.vx=2;s.robot.a=Math.PI;const angle=s.robot.a;assert.equal(s.fire(),1);assert.equal(s.robot.a,angle);assert.equal(s.fired,1);
});
test('dumper rapidly aligns chassis and fires while moving',()=>{
 const s=empty({...ARCHETYPES.dumper.settings,stationary:100,moving:100});s.start();s.time=25;
 const initial=s.robot.a;advance(s,.35,{moveY:.25,shoot:true});assert(s.robot.a!==initial);assert(s.fired>0);assert(Math.hypot(s.robot.vx,s.robot.vy)>.15);
});
test('rear shooters aim and launch from the back when scoring and passing',()=>{
 for(const team of ['316','8513'])for(const x of [2.5,W/2]){
  const s=empty({...resolvePreset(team),stationary:100,moving:100});s.start();s.time=25;
  Object.assign(s.robot,{x,y:2,a:0,vx:0,vy:0});s.inventory=8;advance(s,.5,{shoot:true});
  assert(s.fired+s.passed>0,team+' should fire');
  const b=s.balls.find(b=>b.shot||b.pass);assert(b,team+' should launch fuel');
  const target=s.shotSolution.target;assert((b.vx*(target.x-b.x)+b.vy*(target.y-b.y))>0,team+' should shoot toward target');
  assert.equal(s.config.shooterDirection,'back');
 }
 const s=empty({...resolvePreset('316'),autoAim:false,stationary:100});s.robot.a=0;s.inventory=1;s.fire();
 assert(s.balls[0].x<s.robot.x);assert(s.balls[0].vx<0);
});
test('dumper lanes produce distinct parallel launch origins',()=>{
 const s=empty({...ARCHETYPES.dumper.settings,lanes:4,autoAim:false});s.inventory=8;
 assert.equal(s.fire(),4);assert.equal(s.balls.length,4);assert.equal(new Set(s.balls.map(b=>b.y.toFixed(3))).size,4);assert.equal(s.inventory,4);
});
test('25 BPS is shared across lanes, not multiplied by their number',()=>{
 const s=empty({...ARCHETYPES.dumper.settings,lanes:5,feedRate:25,capacity:80,autoAim:false});s.start();s.time=25;s.inventory=80;
 advance(s,1,{shoot:true});assert(s.fired>=24&&s.fired<=25,`fired ${s.fired}`);
});
test('dumper feed intervals vary while preserving the configured average across lanes',()=>{
 let seed=913;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const s=new Simulation({...ARCHETYPES.dumper.settings,feedRate:25,lanes:5,capacity:1000,autoAim:false},random);
 s.balls=[];s.inventory=1000;s.start();s.time=25;const times=[],lanes=[];
 for(let i=0;i<1200;i++){
   const before=s.fired;s.step(1/120,{shoot:true});
   if(s.fired>before){times.push(s.time);lanes.push(s.balls[s.balls.length-1].lane);}
   s.balls=[];
 }
 const intervals=times.slice(1).map((time,i)=>Math.round((time-times[i])*1000));
 assert(times.length>=245&&times.length<=255,`10 seconds produced ${times.length} balls`);
 assert(new Set(intervals).size>=2,'expected varied shot timing');
 assert(new Set(lanes).size===5,'expected all lanes to fire');
});
test('a 100 fuel/s intake can collect well above the old 25 fuel/s limit',()=>{
 const s=empty({intakeRate:100,capacity:80});s.start();s.robot.x=2;s.robot.y=2;s.inventory=0;
 // Isolate intake cadence from ball-to-ball scattering: fuel is continuously available at the mouth.
 s.balls=Array.from({length:50},()=>ball(2+s.config.length/2+.15,2));s.collideFuel=()=>{};
 advance(s,.2);assert(s.inventory>=18,`collected ${s.inventory} in 0.2 seconds`);
});
test('high-speed fuel contacts do not tunnel through each other',()=>{
 const s=empty();s.start();s.time=25;s.balls=[{...ball(7.8,1,.3),vx:80},{...ball(8.2,1,.3),vx:-80}];
 const energy=80*80*2;s.step(1/120);assert(s.balls[0].vx<0);assert(s.balls[1].vx>0);
 assert(s.balls.reduce((n,b)=>n+b.vx*b.vx+b.vy*b.vy,0)<=energy+1e-6);
});
test('fast fuel cannot tunnel through a tower upright',()=>{
 const s=empty();s.start();s.time=25;const y=H/2+(TOWER.postGap+TOWER.postWidth)/2;
 s.balls=[{...ball(TOWER.postX+.45,y,.3),vx:-120}];s.step(1/120);assert(s.balls[0].vx>0);assert(s.balls[0].x>TOWER.postX);
});
test('robot contact uses relative velocity without repeated energy injection',()=>{
 const s=empty({maxSpeed:4});s.start();s.time=25;s.intake=false;s.robot.x=7;s.robot.y=1;s.robot.vx=4;
 s.balls=[{...ball(s.robot.x+s.config.length/2+BR-.005,1),vx:4}];advance(s,.3,{right:true});assert(Math.hypot(s.balls[0].vx,s.balls[0].vy)<6);
});
test('tower rungs have vertical clearance and block at their actual height',()=>{
 const s=empty(),rung=solids.find(b=>b.tower&&Math.abs(b.bottom-(TOWER.rungs[0]-TOWER.rungDiameter/2))<1e-8);
 const low=ball(rung.x,rung.y,.2);s.collideBallBox(low,rung);assert.equal(low.x,rung.x);assert.equal(low.z,.2);
 const hit={...ball(rung.x+.03,rung.y,TOWER.rungs[0]),vx:-3};s.collideBallBox(hit,rung);assert(hit.x>rung.x+.03);assert(hit.vx>0);
 assert.equal(terrainHeight(.5,H/2),.008);
});
test('built-in robots fit beneath both towers and still collide with uprights',()=>{
 for(const team of Object.keys(profiles))for(const alliance of ['blue','red']){
  const s=empty(resolvePreset(team,alliance)), x=alliance==='blue'?TOWER.postX:W-TOWER.postX;
  Object.assign(s.robot,{x,y:H/2,z:0,a:0,vx:0,vy:0});s.resolveRobot();
  assert(Math.abs(s.robot.x-x)<1e-6,team+' should fit under '+alliance+' tower');
  assert(Math.abs(s.robot.y-H/2)<1e-6,team+' should fit between uprights');
 }
 const s=empty(resolvePreset('341'));Object.assign(s.robot,{x:TOWER.postX,y:H/2+(TOWER.postGap+TOWER.postWidth)/2,z:0,a:0,vx:0,vy:0});
 s.resolveRobot();assert.notEqual(s.robot.y,H/2+(TOWER.postGap+TOWER.postWidth)/2);
});
test('fleet preserves inventories and setup fuel count when adding/switching',()=>{
 const s=new Simulation();assert(s.addRobot({...ARCHETYPES.dumper.settings,team:'1640',alliance:'blue'}));assert.equal(s.initialCenterCount,392);assert.equal(total(s),504);
 s.inventory=3;s.switchRobot(0);assert.equal(s.inventory,8);s.switchRobot(1);assert.equal(s.inventory,3);
 assert(s.addRobot({team:'2590',alliance:'blue'}));assert(!s.addRobot({team:'341',alliance:'blue'}));
 assert(s.addRobot({team:'2539',alliance:'red'}));assert.equal(total(s),504);
});
if(!process.argv.includes('--quick'))test('full 166-second match keeps fuel conserved and positions finite',()=>{
 let seed=42;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 const s=new Simulation({},random);s.start();advance(s,166,{shoot:true});assert.equal(s.phase.id,'finished');assert.equal(total(s),504);assert(s.score>0);assert(s.recycled>0);
 assert(s.balls.every(b=>[b.x,b.y,b.z,b.vx,b.vy,b.vz].every(Number.isFinite)));
});
console.log(`${passed} physics and match tests passed.`);
