const assert=require('node:assert/strict');
const {Simulation,ball,BR,FIELD,rectangleContact}=require('../dist/physics.js');
const {resolve}=require('../dist/team-presets.js');
const {Rooms,cleanInput}=require('../server/rooms.cjs');
let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++;}
const advance=(s,seconds,input)=>{for(let i=0;i<Math.round(seconds*120);i++)s.step(1/120,input);};
const total=s=>s.balls.length+s.fleet.reduce((n,e)=>n+e.inventory,0)+s.pending.length+s.outpostReserve.blue+s.outpostReserve.red;
function fleet(mode='1v1'){const s=new Simulation({},()=>.5);s.enableMultiplayer([resolve('341'),resolve('316',mode==='coop'?'blue':'red')]);return s;}
function socket(){return {readyState:1,bufferedAmount:0,messages:[],send(data){this.messages.push(JSON.parse(data));}};}
function lobby(mode='1v1'){
 let now=1000;const rooms=new Rooms({now:()=>now}),a=socket(),b=socket();rooms.handle(a,{type:'create',protocol:2,mode,team:'341'});const room=a.room;
 rooms.handle(b,{type:'join',protocol:2,code:room.code,team:'316'});return {rooms,a,b,room,setNow:n=>now=n};
}
test('two drivers share one 504-fuel world and one clock',()=>{
 const s=fleet(),[a,b]=s.fleet.map(e=>e.robot),ax=a.x,bx=b.x;s.start();advance(s,.5,[{moveX:-1},{moveX:1}]);
 assert(a.x<ax);assert(b.x>bx);assert(Math.abs(s.time-.5)<1e-8);assert.equal(total(s),504);assert.equal(s.initialCenterCount,392);
});
test('co-op spawns separately on blue; 1v1 spawns opposite',()=>{
 const s=fleet('coop');assert(s.fleet.every(e=>e.config.alliance==='blue'));assert.notEqual(s.fleet[0].robot.y,s.fleet[1].robot.y);
 assert.equal(fleet().fleet[1].config.alliance,'red');
});
test('both intakes collect independently and a fuel can only be collected once',()=>{
 const s=fleet('coop');s.balls=[];
 for(const [i,e] of s.fleet.entries()){Object.assign(e.robot,{x:7,y:2+i*3,a:0,z:0});e.inventory=e.state.inventory=0;s.balls.push({...ball(7+e.config.length/2+.1,2+i*3),sleeping:true});}
 s.loadDriver(0);s.start();advance(s,.05,[{intake:true},{intake:true}]);assert.deepEqual(s.fleet.map(e=>e.inventory),[1,1]);assert.equal(s.balls.length,0);
});
test('overlapping intake openings cannot duplicate the same fuel',()=>{
 const s=new Simulation();s.enableMultiplayer([resolve('341'),resolve('341')]);s.balls=[];
 for(const [i,e] of s.fleet.entries()){Object.assign(e.robot,{x:7,y:3+i*.9,a:0,z:0});e.inventory=e.state.inventory=0;}
 s.loadDriver(0);s.balls.push({...ball(7.55,3.45),sleeping:true});s.start();advance(s,.05,[{intake:true},{intake:true}]);
 assert.equal(s.fleet.reduce((n,e)=>n+e.inventory,0),1);assert.equal(s.balls.length,0);
});
test('the second robot wakes sleeping fuel without the first touching it',()=>{
 const s=fleet();s.balls=[];const e=s.fleet[1];Object.assign(e.robot,{x:7,y:5,a:0,z:0});s.balls.push({...ball(7+e.config.length/2+.1,5),sleeping:true});s.start();advance(s,.1,[{},{moveX:.1,intake:true}]);assert.equal(e.inventory,9);
});
test('resting fuel sleeps, but moving fuel wakes and displaces it',()=>{
 const s=fleet();s.balls=[ball(7,4),{...ball(7.149,4),sleeping:true}];s.start();
 advance(s,1,[{},{}]);assert(s.balls.every(b=>b.sleeping));
 Object.assign(s.balls[0],{sleeping:false,vx:1});advance(s,.1,[{},{}]);
 assert(!s.balls[1].sleeping);assert(s.balls[1].x>7.149);
});
test('robot contacts prevent passing through one another',()=>{
 const s=fleet('coop');s.balls=[];Object.assign(s.fleet[0].robot,{x:7,y:4,a:0});Object.assign(s.fleet[1].robot,{x:9,y:4,a:0});s.start();advance(s,1,[{moveX:1},{moveX:-1}]);
 const [a,b]=s.fleet;assert(a.robot.x<b.robot.x);const hit=rectangleContact(a.robot,a.config.length,a.config.width,{x:b.robot.x,y:b.robot.y,width:b.config.length,depth:b.config.width,a:b.robot.a});assert(!hit||hit.depth<.001);
});
test('both shooters maintain separate feed and PID state; fuel remains conserved',()=>{
 const s=fleet();s.start();advance(s,3,[{shoot:true},{shoot:true}]);assert(s.fleet.every(e=>e.inventory<8));assert.notEqual(s.fleet[0].state.aimController,s.fleet[1].state.aimController);assert.equal(total(s),504);assert(s.fired>8);
});
test('server relays guest input and host snapshots without running physics',()=>{
 const {rooms,a,b,room,setNow}=lobby();rooms.handle(a,{type:'ready',ready:true});rooms.handle(b,{type:'ready',ready:true});
 assert.equal(room.status,'countdown');assert.equal(room.hostId,a.player.id);assert.equal(room.sim,undefined);
 setNow(4001);rooms.tick();assert.equal(room.status,'playing');
 rooms.handle(b,{type:'input',input:{moveX:1,intake:true}});assert.equal(a.messages.at(-1).type,'guest_input');
 const snap={type:'snapshot',time:1,fleet:[{},{}],balls:[[1,1,1,1]],scores:{blue:0,red:0}};
 rooms.handle(b,snap);assert.equal(room.snapshot,null);rooms.handle(a,snap);assert.equal(b.messages.at(-1).type,'snapshot');
 rooms.handle(a,{...snap,time:.5});assert.equal(room.snapshot.time,1);
});
test('disconnect pauses the match and reserved seats resume',()=>{
 const {rooms,a,b,room,setNow}=lobby();rooms.handle(a,{type:'ready',ready:true});rooms.handle(b,{type:'ready',ready:true});setNow(4001);rooms.tick();
 const token=b.player.token;rooms.disconnect(b);assert.equal(room.status,'paused');
 const restored=socket();rooms.handle(restored,{type:'resume',code:room.code,token});assert.equal(restored.player,room.players[1]);
 rooms.handle(restored,{type:'pause'});assert.equal(room.status,'playing');
});
test('room requires the current protocol and rejects additional players',()=>{
 const {rooms,room}=lobby();const c=socket();rooms.handle(c,{type:'join',code:room.code});assert.equal(c.messages.at(-1).type,'error');
 rooms.handle(c,{type:'join',protocol:2,code:room.code});assert.equal(c.messages.at(-1).type,'error');assert.equal(room.players.length,2);
});
test('stale seat expires and the remaining guest becomes lobby host',()=>{
 const {rooms,a,b,room,setNow}=lobby();rooms.disconnect(a);setNow(32001);rooms.tick();assert.equal(room.hostId,b.player.id);assert.equal(room.status,'lobby');
});
test('complete two-player match conserves fuel and ends for both drivers',()=>{
 const s=fleet('coop');s.start();advance(s,166,[{shoot:true},{shoot:true}]);assert.equal(s.phase.id,'finished');assert(!s.running);assert.equal(total(s),504);assert(s.fleet.every(e=>e.robot.vx===0&&e.robot.vy===0));
});
console.log(`${passed} multiplayer tests passed.`);
