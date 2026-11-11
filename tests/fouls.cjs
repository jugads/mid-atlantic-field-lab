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
{
 const s=match(),[blue,red]=s.fleet;move(blue,8.2,2);move(red,8.9,2);s.assessFouls();
 move(blue,8.9,2);move(red,9.6,2);s.assessFouls();assert.equal(s.scores.red,30,'crossing during existing contact counts crossing and contact');
}
{
 const s=match(),[a,b]=s.fleet;s.time=40;s.autoWinner='blue';move(a,7,.425);move(b,7,1.3);
 // Red pushes blue into the wall; brief ordinary contact is not a foul.
 for(let i=0;i<299;i++){s.time+=.01;s.assessPins(.01,[{},{moveY:-1}]);}
 assert.equal(s.fouls.red.major,0);assert(s.pinCounts[0].elapsed>2.9);
 s.time+=.01;s.assessPins(.01,[{},{moveY:-1}]);assert.equal(s.fouls.red.major,1);assert.equal(s.foulPoints.blue,15);
 for(let i=0;i<300;i++){s.time+=.01;s.assessPins(.01,[{},{moveY:-1}]);}assert.equal(s.fouls.red.major,2,'continued pin gets another major');
 move(b,7,3);for(let i=0;i<30;i++){s.time+=.01;s.assessPins(.01,[{},{}]);}assert.equal(s.pinCounts.length,0,'backing away clears the count');
}
{
 const s=match(),[a,b]=s.fleet;s.time=40;move(a,7,4);move(b,7,4.9);
 for(let i=0;i<500;i++){s.time+=.01;s.assessPins(.01,[{},{moveY:-1}]);}
 assert.equal(s.pinCounts.length,0,'unconstrained bumper contact is not a pin');assert.equal(s.fouls.red.major,0);
}
console.log('PASS pin counts, major fouls, separation and legal defense');
{
 const s=match(),[a,b]=s.fleet;s.time=40;s.autoWinner='blue';s.balls=[];move(a,7,.425);move(b,7,1.4);
 for(let i=0;i<4*120;i++)s.step(1/120,[{},{moveY:-1}]);
 assert.equal(s.fouls.red.major,1,'sustained wall pin produces a major foul through physics');
}
