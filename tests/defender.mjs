import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Load the browser module without imposing ESM on the CommonJS server.
const code=await readFile(new URL('../dist/defender.js',import.meta.url),'utf8');
const {defenderInput}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const player={x:6,y:4,vx:1,vy:0},robot={x:13,y:4,a:Math.PI};
const bot={robot,config:{alliance:'red'},inventory:8};
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
const endgame=makeSim();endgame.time=140;const endgameInput=defenderInput(endgame,'medium');assert(endgameInput.shoot,'AI scores its preload during endgame');
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
