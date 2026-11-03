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
bot.inventory=8;robot.x=10;assert(defenderInput(sim,'medium').moveX>0,'active robot returns to its zone');
sim.activeAt=()=>false;const easy=defenderInput(sim,'easy'),medium=defenderInput(sim,'medium'),hard=defenderInput(sim,'hard');
assert(Math.hypot(easy.moveX,easy.moveY)<Math.hypot(medium.moveX,medium.moveY));
assert(Math.hypot(medium.moveX,medium.moveY)<Math.hypot(hard.moveX,hard.moveY));assert.equal(hard.intake,true);
console.log('Defender phase and difficulty checks passed');
