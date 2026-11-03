const assert=require('node:assert/strict');
const {Simulation,W,TOWER}=require('../dist/physics.js');
const {resolve}=require('../dist/team-presets.js');
function match(){const s=new Simulation({},()=>.5);s.enableMultiplayer([resolve('341'),resolve('2539','red')]);s.start();return s;}
function move(e,x,y){Object.assign(e.robot,{x,y,a:0,vx:0,vy:0,z:0});}
{
 const s=match(),[blue,red]=s.fleet;move(blue,W/2+1,2);move(red,14,6);s.assessFouls();
 assert.equal(s.scores.red,15);assert.equal(s.autoScores.red,0);s.assessFouls();assert.equal(s.scores.red,15,'continuous crossing penalized once');
 move(blue,W/2-1,2);s.assessFouls();move(blue,W/2+1,2);s.assessFouls();assert.equal(s.scores.red,30,'new crossing penalized');
 move(red,blue.robot.x+.7,2);s.assessFouls();assert.equal(s.scores.red,45,'contact after crossing');s.assessFouls();assert.equal(s.scores.red,45,'ongoing contact does not repeat');
}
{
 const s=match(),[blue,red]=s.fleet;s.time=132;move(blue,1,4);move(red,1.8,4);s.assessFouls();assert.equal(s.scores.blue,0,'no tower foul before endgame');
 s.time=133;s.assessFouls();assert.equal(s.scores.blue,15,'opponent contacting robot on its tower');s.assessFouls();assert.equal(s.scores.blue,15,'no duplicate for same contact');
 move(red,5,4);s.assessFouls();move(red,1.8,4);s.assessFouls();assert.equal(s.scores.blue,30,'a new contact is penalized');
}
{
 const s=match(),[blue,red]=s.fleet;s.time=133;move(blue,3,2);move(red,3.8,2);s.assessFouls();assert.equal(s.scores.blue+s.scores.red,0,'ordinary defense is legal');
}
console.log('PASS AUTO and tower foul scoring');
