import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Load the browser module without imposing ESM on the CommonJS server.
const code=await readFile(new URL('../dist/defender.js',import.meta.url),'utf8');
const {defenderInput,defenderTeam}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const player={x:6,y:4,vx:1,vy:0},robot={x:13,y:4,a:Math.PI};
const bot={robot,config:{alliance:'red',length:.8762,width:.8262,capacity:40},inventory:8};
const sim={fleet:[{robot:player},bot],phase:{id:'auto'},activeAt:()=>true,balls:[]};
assert.equal(defenderInput(sim,'medium').shoot,true,'AUTO scores rather than chasing');
bot.inventory=0;assert.deepEqual(defenderInput(sim,'medium'),{},'AUTO never pursues');
sim.phase.id='shift1';assert.deepEqual(defenderInput(sim,'medium'),{},'empty robot does not defend during its active shift');
bot.inventory=8;robot.x=10;assert(!defenderInput(sim,'medium').shoot&&Math.hypot(defenderInput(sim,'medium').moveX,defenderInput(sim,'medium').moveY)>0,'active robot returns to its zone');
sim.activeAt=()=>false;const easy=defenderInput(sim,'easy'),medium=defenderInput(sim,'medium'),hard=defenderInput(sim,'hard');
assert(Math.hypot(easy.moveX,easy.moveY)<Math.hypot(medium.moveX,medium.moveY));
assert(Math.hypot(medium.moveX,medium.moveY)<Math.hypot(hard.moveX,hard.moveY));assert.equal(hard.intake,true);
console.log('Defender phase and difficulty checks passed');
// Exercise a full scoring cycle and a return from the far side using real physics.
const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
const {Simulation}=require('../dist/physics.js');const {resolve}=require('../dist/team-presets.js');
const makeSim=()=>{const s=new Simulation({},()=>.5);s.enableMultiplayer([resolve('341'),{...resolve('2539','red'),intakeDirection:'front'}]);s.start();return s;};
const advance=(s,seconds)=>{for(let i=0;i<seconds*120;i++)s.step(1/120,[{},defenderInput(s,'medium')]);};
const auto=makeSim();advance(auto,20);assert(auto.scores.red>=20,'AI collects and scores during AUTO');
const returning=makeSim();returning.time=34;returning.autoWinner='blue';const entry=returning.fleet[1];
Object.assign(entry.robot,{x:7,y:4,a:0});entry.inventory=entry.state.inventory=20;advance(returning,15);
assert(returning.scores.red>0,'AI crosses the field and scores on its active shift');
console.log('Defender scoring cycle and return checks passed');
const endgame=makeSim();endgame.time=140;const endgameInput=defenderInput(endgame,'medium');assert(endgameInput.shoot||endgameInput.intake,'AI collects or scores during endgame');
const neutral=makeSim();neutral.time=40;neutral.autoWinner='blue';neutral.balls=[{x:10,y:.69,z:.075}];const enemy=neutral.fleet[1];enemy.inventory=enemy.state.inventory=0;Object.assign(enemy.robot,{x:13.6,y:.69,a:Math.PI});
const seek=defenderInput(neutral,'medium');assert(seek.moveX<0&&seek.intake,'AI heads through the trench for neutral-zone fuel');
console.log('Defender endgame and neutral fuel checks passed');
// Nearby balls changing order must not make the robot reverse its steering target.
const targetSim=makeSim();targetSim.time=40;targetSim.autoWinner='blue';const targetBot=targetSim.fleet[1];
Object.assign(targetBot.robot,{x:14,y:4,a:0});targetBot.inventory=targetBot.state.inventory=0;
const first={x:15,y:4.4,z:.075},second={x:15,y:3.5,z:.075};targetSim.balls=[first,second];
const initial=defenderInput(targetSim,'medium');first.y=4.55;second.y=3.6;targetSim.time+=.1;
const next=defenderInput(targetSim,'medium');assert(initial.turnAxis>0&&next.turnAxis>0,'stick with a target instead of reversing when another ball becomes closer');
// If a ball cannot be reached, eventually choose a different one.
targetSim.time+=2.6;const retry=defenderInput(targetSim,'medium');assert(retry.turnAxis<0,'abandon a target when no progress is made');
console.log('Defender target stability and recovery checks passed');
const dual=makeSim();dual.enableMultiplayer([resolve('341'),resolve('316','red'),{...resolve('2539','blue'),intakeDirection:'front'},{...resolve('2539','red'),intakeDirection:'front'}]);dual.start();dual.time=34;dual.autoWinner='blue';
const blueBot=dual.fleet[2],redBot=dual.fleet[3];Object.assign(blueBot.robot,{x:7,y:3,a:0});Object.assign(redBot.robot,{x:9,y:3,a:Math.PI});Object.assign(dual.fleet[1].robot,{x:4,y:3});
const botDefense=defenderInput(dual,'medium',2,1);assert(botDefense.moveX<0,'blue bot defends against the red human');
const sameSim=makeSim();sameSim.enableMultiplayer([resolve('341'),resolve('316','red'),{...resolve('2539','blue'),intakeDirection:'front'},{...resolve('2539','red'),intakeDirection:'front'}]);sameSim.start();sameSim.balls=[];sameSim.fleet[2].inventory=sameSim.fleet[2].state.inventory=0;
defenderInput(sameSim,'medium',2,3);assert(defenderInput(sameSim,'medium',3,2).shoot,'each bot has independent scoring state');
console.log('Bots target opposing humans and use separate strategy state');
const fill=makeSim();fill.time=40;fill.autoWinner='blue';const fillBot=fill.fleet[1];Object.assign(fillBot.robot,{x:13,y:3,a:0});fillBot.inventory=fillBot.state.inventory=0;fill.balls=[{x:14,y:3,z:.075}];
defenderInput(fill,'medium');fill.time=47;fillBot.robot.x=13.4;fillBot.inventory=fillBot.state.inventory=11;
assert(!defenderInput(fill,'medium').shoot,'AI keeps collecting past the old 10-ball cutoff');
fillBot.inventory=fillBot.state.inventory=fillBot.config.capacity;assert.equal(defenderInput(fill,'medium').shoot,true,'full AI hopper is shot');
const late=makeSim();late.time=17;late.autoWinner='blue';const lateBot=late.fleet[1];lateBot.inventory=lateBot.state.inventory=0;late.balls=[{x:14,y:3,z:.075}];defenderInput(late,'medium');lateBot.inventory=lateBot.state.inventory=4;assert.equal(defenderInput(late,'medium').shoot,true,'AI shoots a partial hopper when its shift is nearly over');
const clusters=makeSim();clusters.time=40;clusters.autoWinner='blue';const cb=clusters.fleet[1];Object.assign(cb.robot,{x:13,y:3,a:0});cb.inventory=cb.state.inventory=0;
clusters.balls=[{x:13.6,y:2.5,z:.075},...Array.from({length:12},(_,i)=>({x:14.7+(i%4)*.15,y:4.5+Math.floor(i/4)*.15,z:.075}))];
assert(defenderInput(clusters,'medium').turnAxis>0,'AI favors a larger fuel cluster over a nearby single ball');
console.log('AI fills capacity and prioritizes fuel clusters');
// Use real field collisions: cross either trench, fill from the neutral pile,
// return home, and shoot. Both alliances and partial hoppers must work.
for(const alliance of ['blue','red'])for(const y of [.69,4.035,7.38]){
 const other=alliance==='red'?'blue':'red';const s=new Simulation({},()=>.5);
 s.enableMultiplayer([resolve('341',other),{...resolve('2539',alliance),intakeDirection:'front'}]);s.start();s.time=34;s.autoWinner=other;
 const e=s.fleet[1];Object.assign(e.robot,{x:alliance==='red'?13.6:2.94,y,a:0,vx:0,vy:0});e.inventory=e.state.inventory=1;
 s.balls=Array.from({length:100},(_,i)=>({...require('../dist/physics.js').ball(7.7+(i%10)*.155,2.6+Math.floor(i/10)*.155),sleeping:true}));
 let maxInventory=0;for(let i=0;i<20*120;i++){s.step(1/120,[{},defenderInput(s,'medium')]);maxInventory=Math.max(maxInventory,e.inventory);}
 assert(maxInventory>=30,`${alliance} bot starting at y=${y} should fill from neutral; got ${maxInventory}`);
 assert(s.scores[alliance]>0,`${alliance} bot starting at y=${y} must return through trench and score`);
}
console.log('Bots cross both trench lanes, fill, and score for both alliances');
const partial=makeSim();partial.time=40;partial.autoWinner='blue';partial.balls=[{x:9,y:.69,z:.075}];const partialBot=partial.fleet[1];Object.assign(partialBot.robot,{x:13.6,y:.69,a:Math.PI});partialBot.inventory=partialBot.state.inventory=3;
const neutralTrip=defenderInput(partial,'medium');assert(!neutralTrip.shoot&&neutralTrip.intake,'partially filled bot seeks neutral fuel when more than four seconds remain');
const cutoff=makeSim();cutoff.time=16;cutoff.autoWinner='blue';cutoff.balls=[{x:9,y:.69,z:.075}];const cutoffBot=cutoff.fleet[1];Object.assign(cutoffBot.robot,{x:13.6,y:.69,a:Math.PI});cutoffBot.inventory=cutoffBot.state.inventory=3;
assert(defenderInput(cutoff,'medium').shoot,'bot shoots its partial load with four seconds remaining');
console.log('Neutral collection respects the four-second cutoff');
const early=makeSim();early.time=54;early.autoWinner='blue';const earlyBot=early.fleet[1];earlyBot.inventory=earlyBot.state.inventory=20;
Object.assign(earlyBot.robot,{x:13,y:3,a:0});Object.assign(early.fleet[0].robot,{x:7,y:3,vx:0,vy:0});
const earlyInput=defenderInput(early,'medium');assert(!earlyInput.shoot&&earlyInput.moveX<0,'bot leaves scoring shift with 5 seconds left');
early.time=50;const scoreInput=defenderInput(early,'medium');assert(scoreInput.shoot||scoreInput.intake,'bot still scores with more than 5 seconds left');
const escaping=makeSim();escaping.time=40;escaping.autoWinner='red';Object.assign(escaping.fleet[1].robot,{x:8,y:4,vx:0,vy:0});Object.assign(escaping.fleet[0].robot,{x:7,y:4,vx:0,vy:0});escaping.pinCounts=[{attacker:1,victim:0,alliance:'red',elapsed:2.2}];
assert(defenderInput(escaping,'medium').moveX>0,'bot backs away before a pin foul');
const bump=makeSim();bump.balls=[];bump.time=40;bump.autoWinner='red';bump.fleet[0].config=resolve('8513');Object.assign(bump.fleet[0].robot,{x:5,y:2.51,vx:0,vy:0});Object.assign(bump.fleet[1].robot,{x:8,y:2.51,vx:0,vy:0});
const bumpInput=defenderInput(bump,'medium');assert(bumpInput.moveX<0&&Math.abs(bumpInput.moveY)<.05,'bot blocks the opponent bump lane');
console.log('AI handles early defense, pin release and bump-only opponents');
const jam=makeSim();jam.time=40;jam.autoWinner='red';jam.balls=[];
Object.assign(jam.fleet[0].robot,{x:4.7,y:.69,a:0,vx:0,vy:0});Object.assign(jam.fleet[1].robot,{x:5.6,y:.69,a:Math.PI,vx:0,vy:0});
let reachedBump=false;for(let i=0;i<4*120;i++){jam.step(1/120,[{},defenderInput(jam,'medium')]);if(jam.fleet[1].robot.y>2.1)reachedBump=true;}
assert(reachedBump,'AI escapes a blocked trench and routes through the bump lane');
console.log('AI escapes a blocked trench via the bump');
// A full hard-mode shift should complete three collection/shooting cycles
// while still leaving the last five seconds for defense.
assert.equal(defenderTeam('hard'),'316');
assert.equal(defenderTeam('medium'),'2539');
const hardShift=new Simulation({},()=>.5);hardShift.enableMultiplayer([resolve('341'),resolve('316','red')]);hardShift.start();hardShift.time=33;hardShift.autoWinner='blue';
let bursts=0,shooting=false;
for(let i=0;i<20*120;i++){
 const input=defenderInput(hardShift,'hard');
 if(input.shoot&&!shooting)bursts++;
 shooting=!!input.shoot;
 hardShift.step(1/120,[{},input]);
}
assert(bursts>=3,`hard 316 should shoot three loads in its shift, got ${bursts}`);
assert(hardShift.scores.red>=75,`hard 316 should score substantially during its shift, got ${hardShift.scores.red}`);
console.log('Hard team 316 completes three scoring cycles before defense');
// A stationary defender blocking either trench must not trap the scoring bot.
for(const y of [.69,7.38]){
 const blocked=new Simulation({},()=>.5);blocked.enableMultiplayer([resolve('341'),resolve('316','red')]);blocked.start();blocked.time=33;blocked.autoWinner='blue';
 Object.assign(blocked.fleet[0].robot,{x:11.9,y,a:0});
 for(let i=0;i<20*120;i++)blocked.step(1/120,[{},defenderInput(blocked,'hard')]);
 assert(blocked.scores.red>=30,`hard AI should score around a robot blocking trench y=${y}; got ${blocked.scores.red}`);
}
console.log('Hard scoring AI navigates around blocked trenches');
// Hard defense should hit off center and turn the opponent through actual
// robot collision physics, while still respecting the pin-release rule.
const cornerDefense=new Simulation({},()=>.5);cornerDefense.enableMultiplayer([resolve('316','blue'),resolve('316','red')]);cornerDefense.start();cornerDefense.time=40;cornerDefense.autoWinner='red';cornerDefense.balls=[];
Object.assign(cornerDefense.fleet[0].robot,{x:7,y:4,a:0,vx:0,vy:0});Object.assign(cornerDefense.fleet[1].robot,{x:9,y:4,a:Math.PI,vx:0,vy:0});
let rotation=0;for(let i=0;i<180;i++){cornerDefense.step(1/120,[{},defenderInput(cornerDefense,'hard')]);rotation=Math.max(rotation,Math.abs(cornerDefense.fleet[0].robot.impactOmega||0));}
assert(rotation>.3,`hard defender should rotate opponent on contact; got ${rotation}`);
const pressured=makeSim();pressured.time=40;pressured.autoWinner='blue';pressured.fleet[1].config=resolve('316','red');pressured.fleet[1].inventory=pressured.fleet[1].state.inventory=50;
Object.assign(pressured.fleet[1].robot,{x:13.8,y:3,a:0});Object.assign(pressured.fleet[0].robot,{x:14.5,y:3,a:0});
const evadeInput=defenderInput(pressured,'hard');assert(!evadeInput.shoot&&Math.hypot(evadeInput.moveX,evadeInput.moveY)>.1,'hard scorer moves away from nearby defender before shooting');
console.log('Hard AI disrupts shots with corner contact and evades pressure');
// A swerve robot should start crossing while turning, choosing the nearest
// of the two valid trench headings rather than stopping for a 180-degree turn.
const quickCross=new Simulation({},()=>.5);quickCross.enableMultiplayer([resolve('341'),resolve('316','red')]);quickCross.start();quickCross.time=34;quickCross.autoWinner='blue';
Object.assign(quickCross.fleet[1].robot,{x:13.6,y:.69,a:1.2,vx:0,vy:0});quickCross.fleet[1].inventory=quickCross.fleet[1].state.inventory=0;
const crossingInput=defenderInput(quickCross,'hard');assert(crossingInput.moveX<-.5&&crossingInput.turnAxis<0,'hard robot drives and takes the shorter turn through trench');
// Starting across the opposing hub, hard defense must reach and pressure a
// shooting opponent instead of driving into the hub and remaining stuck.
const pursuit=new Simulation({},()=>.5);pursuit.enableMultiplayer([resolve('316','blue'),resolve('316','red')]);pursuit.start();pursuit.time=40;pursuit.autoWinner='red';pursuit.balls=[];
Object.assign(pursuit.fleet[0].robot,{x:3,y:2.51,a:0,vx:0,vy:0});Object.assign(pursuit.fleet[1].robot,{x:8,y:4,a:Math.PI,vx:0,vy:0});
let pressure=0;for(let i=0;i<8*120;i++){pursuit.fleet[0].inventory=pursuit.fleet[0].state.inventory=50;pursuit.step(1/120,[{shoot:true},defenderInput(pursuit,'hard')]);if(Math.hypot(pursuit.fleet[0].robot.x-pursuit.fleet[1].robot.x,pursuit.fleet[0].robot.y-pursuit.fleet[1].robot.y)<1.4)pressure++;}
assert(pressure>4*120,`hard defense should reach and pressure the shooter, got ${pressure/120}s`);
console.log('Hard AI crosses while turning and pursues through the hub');
// Hard bump defense tracks lateral motion and stops guarding the bump after
// the attacker crosses; medium retains its fixed-lane behavior.
const agile=new Simulation({},()=>.5);agile.enableMultiplayer([resolve('8513','blue'),resolve('316','red')]);agile.start();agile.time=40;agile.autoWinner='red';agile.balls=[];
Object.assign(agile.fleet[0].robot,{x:3.5,y:2.1,a:0,vx:0,vy:1});Object.assign(agile.fleet[1].robot,{x:5.58,y:2.3,a:Math.PI,vx:0,vy:0});
const tracking=defenderInput(agile,'hard');assert(tracking.moveY>.7,'hard bump defense predicts and rapidly tracks lateral movement');
Object.assign(agile.fleet[0].robot,{x:5.4,y:2.51,vx:1,vy:0});Object.assign(agile.fleet[1].robot,{x:7,y:2.51});
const afterCross=defenderInput(agile,'hard');assert(afterCross.moveX<-.8,'hard defense chases once attacker has crossed the bump');
console.log('Hard bump defense tracks and responds after a crossing');
// Sustained defense should disrupt aim without towing a stationary opponent.
const controlledContact=new Simulation({},()=>.5);controlledContact.enableMultiplayer([resolve('316','blue'),resolve('316','red')]);controlledContact.start();controlledContact.time=40;controlledContact.autoWinner='red';controlledContact.balls=[];
Object.assign(controlledContact.fleet[0].robot,{x:7,y:4,a:0,vx:0,vy:0});Object.assign(controlledContact.fleet[1].robot,{x:9,y:4,a:Math.PI,vx:0,vy:0});
let contactSpin=0;for(let i=0;i<8*120;i++){controlledContact.step(1/120,[{},defenderInput(controlledContact,'hard')]);contactSpin=Math.max(contactSpin,Math.abs(controlledContact.fleet[0].robot.impactOmega||0));}
const moved=Math.hypot(controlledContact.fleet[0].robot.x-7,controlledContact.fleet[0].robot.y-4);
assert(moved<2,`stationary player should not be pushed across the field: ${moved}m`);
assert(contactSpin>.3,'controlled defense still creates an off-center turning impact');
console.log('Hard defense controls sustained pushing while disrupting aim');
// On the approach, hard mode should move and turn together rather than
// waiting for the intake or crossing heading before driving.
const movingApproach=new Simulation({},()=>.5);movingApproach.enableMultiplayer([resolve('341'),resolve('316','red')]);movingApproach.start();movingApproach.time=33;movingApproach.autoWinner='blue';
Object.assign(movingApproach.fleet[1].robot,{x:13.8,y:1.4,a:1.3,vx:0,vy:0});movingApproach.fleet[1].inventory=movingApproach.fleet[1].state.inventory=0;
movingApproach.balls=[{...require('../dist/physics.js').ball(9,2.5),sleeping:true}];
const movingInput=defenderInput(movingApproach,'hard');assert(Math.hypot(movingInput.moveX||0,movingInput.moveY||0)>.8,'hard AI keeps moving while approaching crossing');
console.log('Hard scoring AI maintains speed while approaching crossings');
// The same bump-only opponent is guarded at the bump with scarce fuel, but
// pressured in its alliance zone when there is enough nearby fuel to score.
for(const alliance of ['blue','red']){
 const other=alliance==='blue'?'red':'blue',s=new Simulation({},()=>.5);s.enableMultiplayer([resolve('8513',alliance),resolve('316',other)]);s.start();s.time=40;s.autoWinner=other;
 const px=alliance==='blue'?3:16.54-3,bx=alliance==='blue'?5.577:16.54-5.577;
 Object.assign(s.fleet[0].robot,{x:px,y:2.51,a:0,vx:0,vy:0});Object.assign(s.fleet[1].robot,{x:bx,y:2.51,a:0,vx:0,vy:0});s.balls=[];
 const guard=defenderInput(s,'hard');
 s.balls=Array.from({length:24},(_,i)=>({x:px,y:1+i*.06,z:.075}));s.time+=.6;
 const zone=defenderInput(s,'hard');
 assert(Math.abs(zone.moveX||0)>.5&&Math.abs(guard.moveX||0)<.1,`${alliance} AI should cross toward player in fuel-rich zone`);
 s.balls=[];s.time+=.6;const guardAgain=defenderInput(s,'hard');assert(Math.abs(guardAgain.moveX||0)<.1,`${alliance} AI should return to bump when fuel runs low`);
}
console.log('AI switches between bump and zonal defense based on opponent-zone fuel');
// A bump-only attacker outside its zone during its active shift must find the
// defender on the alliance side of its chosen bump when it returns.
for(const alliance of ['blue','red'])for(const y of [2.51,5.56]){
 const other=alliance==='blue'?'red':'blue',s=new Simulation({},()=>.5);s.enableMultiplayer([resolve('8513',alliance),resolve('316',other)]);s.start();s.time=40;s.autoWinner=other;s.balls=[];
 Object.assign(s.fleet[0].robot,{x:alliance==='blue'?8:8.54,y,a:0,vx:0,vy:0});Object.assign(s.fleet[1].robot,{x:alliance==='blue'?6.3:10.24,y,a:0,vx:0,vy:0});
 for(let i=0;i<3*120;i++)s.step(1/120,[{},defenderInput(s,'hard')]);
 const x=s.fleet[1].robot.x;
 assert(alliance==='blue'?x<4.03:x>16.54-4.03,`${alliance} defender should reach inside of bump y=${y}, x=${x}`);
 assert(Math.abs(s.fleet[1].robot.y-y)<.8,`${alliance} defender should block chosen bump lane`);
}
console.log('Defense moves inside to block bump-only attackers returning from neutral');
