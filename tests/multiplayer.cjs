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
test('robot impacts transfer momentum to a stationary defender',()=>{
 const s=fleet('coop');s.balls=[];const [a,b]=s.fleet;Object.assign(a.robot,{x:7,y:4,a:0,vx:4,vy:0});Object.assign(b.robot,{x:7.8,y:4,a:0,vx:0,vy:0});
 s.loadDriver(0);const ma=54+a.inventory*.2268,mb=54+b.inventory*.2268,before=ma*a.robot.vx+mb*b.robot.vx;s.resolveRobot();
 assert(b.robot.vx>1,'defender receives forward momentum');assert(a.robot.vx<4,'attacker loses momentum');
 assert(Math.abs(ma*a.robot.vx+mb*b.robot.vx-before)<1e-8,'contact conserves linear momentum');
});
test('bumper friction resists sliding along a defender',()=>{
 const s=fleet('coop');s.balls=[];const [a,b]=s.fleet;Object.assign(a.robot,{x:7,y:4,a:0,vx:3,vy:2});Object.assign(b.robot,{x:7.8,y:4,a:0,vx:0,vy:0});
 s.loadDriver(0);s.resolveRobot();assert(a.robot.vy<2,'attacker loses sideways speed');assert(b.robot.vy>0,'defender receives sideways momentum');
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
test('a stalled host pauses the room until fresh snapshots arrive',()=>{
 const {rooms,a,b,room,setNow}=lobby();rooms.handle(a,{type:'ready',ready:true});rooms.handle(b,{type:'ready',ready:true});setNow(4001);rooms.tick();
 setNow(6600);rooms.tick();assert.equal(room.status,'paused');assert.equal(room.stalled,true);
 rooms.handle(b,{type:'pause'});assert.equal(room.status,'paused');
 rooms.handle(a,{type:'snapshot',time:0,fleet:[{},{}],balls:[],scores:{blue:0,red:0}});
 rooms.handle(b,{type:'pause'});assert.equal(room.status,'playing');assert.equal(room.stalled,false);
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
test('off-center bumper impact spins a shooting robot and the chassis continues turning',()=>{
 const s=fleet('coop');s.balls=[];const [a,b]=s.fleet;
 Object.assign(a.robot,{x:7,y:4.35,a:0,vx:4,vy:0,omega:0,impactOmega:0});
 Object.assign(b.robot,{x:7.8,y:4,a:0,vx:0,vy:0,omega:0,impactOmega:0});
 s.loadDriver(0);s.resolveRobot();assert(Math.abs(b.robot.impactOmega)>.1,'off-center hit transfers angular momentum');
 const before=b.robot.a;s.start();advance(s,.1,[{},{shoot:true}]);assert(Math.abs(b.robot.a-before)>.01,'impact rotates robot even under aim control');
});
test('centered bumper impact produces no significant spin',()=>{
 const s=fleet('coop');s.balls=[];const [a,b]=s.fleet;
 Object.assign(a.robot,{x:7,y:4,a:0,vx:4,vy:0,omega:0,impactOmega:0});
 Object.assign(b.robot,{x:7.8,y:4,a:0,vx:0,vy:0,omega:0,impactOmega:0});
 s.loadDriver(0);s.resolveRobot();assert(Math.abs(b.robot.impactOmega)<1e-8);
});
test('2v2 rooms accept four-robot snapshots and preserve human alliances',()=>{
 let now=1000;const rooms=new Rooms({now:()=>now}),a=socket(),b=socket();
 rooms.handle(a,{type:'create',protocol:2,mode:'2v2',team:'341'});const room=a.room;
 rooms.handle(b,{type:'join',protocol:2,code:room.code,team:'316'});
 assert.deepEqual(rooms.lobby(room).players.map(p=>p.alliance),['blue','red']);
 rooms.handle(a,{type:'ready',ready:true});rooms.handle(b,{type:'ready',ready:true});now=4001;rooms.tick();
 const snapshot={type:'snapshot',time:1,fleet:[{},{},{},{}],balls:[],scores:{blue:0,red:0}};
 rooms.handle(a,snapshot);assert.equal(room.snapshot.fleet.length,4);assert.equal(b.messages.at(-1).fleet.length,4);
 rooms.handle(a,{...snapshot,time:2,fleet:[{},{}]});assert.equal(room.snapshot.time,1,'wrong fleet size rejected');
});
test('1v1 rooms reject four-robot snapshots',()=>{
 const {rooms,a,b,room,setNow}=lobby();rooms.handle(a,{type:'ready',ready:true});rooms.handle(b,{type:'ready',ready:true});setNow(4001);rooms.tick();
 rooms.handle(a,{type:'snapshot',time:1,fleet:[{},{},{},{}],balls:[],scores:{blue:0,red:0}});assert.equal(room.snapshot,null);
});
test('3v3 room accepts exactly six robot snapshots',()=>{
 let now=1000;const rooms=new Rooms({now:()=>now}),a=socket(),b=socket();rooms.handle(a,{type:'create',protocol:2,mode:'3v3',team:'341'});const room=a.room;
 rooms.handle(b,{type:'join',protocol:2,code:room.code,team:'708'});rooms.handle(a,{type:'ready',ready:true});rooms.handle(b,{type:'ready',ready:true});now=4001;rooms.tick();
 rooms.handle(a,{type:'snapshot',time:1,fleet:Array.from({length:6},()=>({})),balls:[],scores:{blue:0,red:0}});assert.equal(room.snapshot.fleet.length,6);assert.equal(b.messages.at(-1).fleet.length,6);
 rooms.handle(a,{type:'snapshot',time:2,fleet:[{},{}],balls:[],scores:{blue:0,red:0}});assert.equal(room.snapshot.time,1);
});
test('3v3 enforces unique teams and preserves independent AI roles',()=>{
 const rooms=new Rooms({now:()=>1000}),a=socket(),b=socket();rooms.handle(a,{type:'create',protocol:2,mode:'3v3',team:'341'});rooms.handle(b,{type:'join',protocol:2,code:a.room.code,team:'341'});
 const players=a.room.players;assert.equal(new Set(players.flatMap(p=>[p.team,...p.aiTeams])).size,6);
 const before=b.player.aiTeams[0];rooms.handle(b,{type:'select_ai',slot:0,team:a.player.team});assert.equal(b.player.aiTeams[0],before);
 rooms.handle(a,{type:'ready',ready:true});rooms.handle(b,{type:'select_ai_role',slot:0,role:'defend'});assert.equal(b.player.aiRoles[0],'defend');assert.equal(a.player.ready,false);
});
test('3v3 co-op assigns both players blue and accepts six robots',()=>{
 let now=1000;const rooms=new Rooms({now:()=>now}),a=socket(),b=socket();rooms.handle(a,{type:'create',protocol:2,mode:'3v3coop',team:'341'});rooms.handle(b,{type:'join',protocol:2,code:a.room.code,team:'316'});const room=a.room;
 assert.deepEqual(rooms.lobby(room).players.map(p=>p.alliance),['blue','blue']);rooms.handle(a,{type:'ready',ready:true});rooms.handle(b,{type:'ready',ready:true});now=4001;rooms.tick();
 rooms.handle(a,{type:'snapshot',time:1,fleet:Array.from({length:6},()=>({})),balls:[],scores:{blue:0,red:0}});assert.equal(room.snapshot.fleet.length,6);
});
