const assert=require('node:assert/strict');
const {Simulation,ARCHETYPES,FIELD,TOWER,W,H,BR,hubs,bumps,trenches,solids,ball,phaseAt,terrainHeight}=require('../dist/physics.js');
const {profiles,resolve:resolvePreset}=require('../dist/team-presets.js');
const {ControllerInput,axis}=require('../dist/controller.js');
let passed=0;
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function advance(s,seconds,input={}){for(let i=0;i<Math.round(seconds*120);i++)s.step(1/120,input);}
function empty(config={}){const s=new Simulation({stationary:100,...config},()=>.5);s.balls=[];return s;}
function total(s){return s.balls.length+s.inventory+s.parked.reduce((n,r)=>n+r.inventory,0)+s.pending.length+s.outpostReserve.blue+s.outpostReserve.red;}
function enterHub(s,alliance){const h=hubs.find(h=>h.alliance===alliance);s.balls.push({...ball(h.x,h.y,FIELD.hubHeight+.001),vz:-1,shot:true,eligible:true,shooter:alliance});s.step(1/120);}
test('504 fuel with centered pile, depot fuel and outpost reserves',()=>{
 const s=new Simulation();assert.equal(total(s),504);assert.equal(s.initialCenterCount,400);
 assert(s.balls.slice(0,400).every(b=>Math.abs(b.x-W/2)<FIELD.centerDepth/2&&Math.abs(b.y-H/2)<FIELD.centerWidth/2));
 assert(s.balls.slice(0,400).every(b=>Math.abs(b.x-W/2)>BR+.025));assert.equal(s.balls.length-400,48);
 const low=new Simulation({capacity:1});assert.equal(low.initialCenterCount,407);assert.equal(total(low),504);
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
 assert.equal(Object.keys(profiles).length,4);
 assert.equal(p341.capacity,8);assert.equal(p341.archetype,'turret');assert.equal(p341.height,.4);
 assert.equal(p341.feedRate,10);assert.equal(p341.intakeRate,15);assert(p341.moving>=85);
 assert.equal(p316.capacity,50);assert(p316.height<FIELD.trenchClearance);assert.equal(p316.archetype,'dumper');assert.equal(p316.feedRate,20);assert.equal(p316.lanes,3);assert.equal(p316.intakeRate,32);assert.equal(p316.moving,75);
 assert.equal(p1391.capacity,45);assert(p1391.height<FIELD.trenchClearance);assert.equal(p1391.feedRate,15);assert.equal(p1391.lanes,4);assert.equal(p1391.intakeRate,20);assert.equal(p1391.moving,0);
 assert.equal(p8513.capacity,80);assert.equal(p8513.height,.762);assert.equal(p8513.feedRate,20);assert.equal(p8513.intakeRate,30);assert.equal(p8513.moving,0);
 assert.equal(resolvePreset('316','red').alliance,'red');assert.equal(resolvePreset('unknown'),null);
});
test('0% SOTM profiles miss while moving but still shoot normally when stationary',()=>{
 for(const team of ['1391','8513']){
  const c={...resolvePreset(team),autoAim:false,stationary:100},s=empty(c);s.robot.vx=2;s.robot.a=0;s.inventory=8;
  s.fire();const target=s.target, b=s.balls[0],d=Math.hypot(target.x-s.robot.x,target.y-s.robot.y),t=Math.max(.8,Math.min(1.8,d/5));
  assert(Math.hypot(b.x+b.vx*t-target.x,b.y+b.vy*t-target.y)>FIELD.openingRadius+BR,team+' should miss when moving');
  const stopped=empty(c);stopped.robot.a=Math.atan2(stopped.target.y-stopped.robot.y,stopped.target.x-stopped.robot.x);stopped.inventory=8;stopped.fire();
  const q=stopped.balls[0],distance=Math.hypot(stopped.target.x-stopped.robot.x,stopped.target.y-stopped.robot.y),tf=Math.max(.8,Math.min(1.8,distance/5));
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
 let a=input.poll([pad]);assert(a.connected&&a.supported&&a.shoot&&a.toggleIntake&&a.switchRobot&&a.startPause);
 assert.equal(a.x,0);assert.equal(a.y,-1);assert(Math.abs(a.turn-.5)<.001);
 a=input.poll([pad]);assert(a.shoot);assert(!a.toggleIntake&&!a.switchRobot&&!a.startPause);
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
