import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Load the browser module without imposing ESM on the CommonJS server.
const code=await readFile(new URL('../dist/defender.js',import.meta.url),'utf8');
const {defenderInput}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
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
const botDefense=defenderInput(dual,'medium',2,3);assert(botDefense.moveX>0,'blue bot defends against red bot, not the red human');
const sameSim=makeSim();sameSim.enableMultiplayer([resolve('341'),resolve('316','red'),{...resolve('2539','blue'),intakeDirection:'front'},{...resolve('2539','red'),intakeDirection:'front'}]);sameSim.start();sameSim.balls=[];sameSim.fleet[2].inventory=sameSim.fleet[2].state.inventory=0;
defenderInput(sameSim,'medium',2,3);assert(defenderInput(sameSim,'medium',3,2).shoot,'each bot has independent scoring state');
console.log('Both bots target each other and use separate strategy state');
const fill=makeSim();fill.time=40;fill.autoWinner='blue';const fillBot=fill.fleet[1];Object.assign(fillBot.robot,{x:13,y:3,a:0});fillBot.inventory=fillBot.state.inventory=0;fill.balls=[{x:14,y:3,z:.075}];
defenderInput(fill,'medium');fill.time=47;fillBot.robot.x=13.4;fillBot.inventory=fillBot.state.inventory=11;
assert(!defenderInput(fill,'medium').shoot,'AI keeps collecting past the old 10-ball cutoff');
fillBot.inventory=fillBot.state.inventory=fillBot.config.capacity;assert.equal(defenderInput(fill,'medium').shoot,true,'full AI hopper is shot');
const late=makeSim();late.time=55;late.autoWinner='blue';const lateBot=late.fleet[1];lateBot.inventory=lateBot.state.inventory=0;late.balls=[{x:14,y:3,z:.075}];defenderInput(late,'medium');lateBot.inventory=lateBot.state.inventory=4;assert.equal(defenderInput(late,'medium').shoot,true,'AI shoots a partial hopper when its shift is nearly over');
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
const cutoff=makeSim();cutoff.time=54;cutoff.autoWinner='blue';cutoff.balls=[{x:9,y:.69,z:.075}];const cutoffBot=cutoff.fleet[1];Object.assign(cutoffBot.robot,{x:13.6,y:.69,a:Math.PI});cutoffBot.inventory=cutoffBot.state.inventory=3;
assert(defenderInput(cutoff,'medium').shoot,'bot shoots its partial load with four seconds remaining');
console.log('Neutral collection respects the four-second cutoff');
