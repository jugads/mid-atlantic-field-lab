const {randomBytes,randomInt}=require('node:crypto');
const {Simulation}=require('../dist/physics.js');
const {profiles,resolve}=require('../dist/team-presets.js');
const cleanInput=value=>{
  const input={};if(!value||typeof value!=='object')return input;
  for(const k of ['moveX','moveY','forward','tankTurn','turnAxis'])input[k]=Number.isFinite(value[k])?Math.max(-1,Math.min(1,value[k])):0;
  for(const k of ['up','down','left','right','clockwise','counterclockwise','shoot','intake'])input[k]=value[k]===true;
  return input;
};
const round=n=>Math.round(n*1000)/1000;
class Rooms{
  constructor({now=()=>Date.now(),maxRooms=4}={}){this.rooms=new Map();this.now=now;this.maxRooms=maxRooms;this.nextBallId=1;this.ballIds=new WeakMap();}
  send(socket,data){if(socket?.readyState===1&&socket.bufferedAmount<512000)socket.send(JSON.stringify(data));}
  fail(socket,message){this.send(socket,{type:'error',message});}
  lobby(room){return {type:'room',code:room.code,mode:room.mode,status:room.status,countdown:room.countdown||0,
    players:room.players.map((p,index)=>({index,id:p.id,team:p.team,netEnabled:p.netEnabled,ready:p.ready,connected:!!p.socket,alliance:room.mode==='coop'||index===0?'blue':'red'}))};}
  broadcast(room,message=this.lobby(room)){for(const p of room.players)this.send(p.socket,message);}
  welcome(room,p){this.send(p.socket,{type:'welcome',id:p.id,token:p.token,code:room.code});this.broadcast(room);if(room.sim)this.send(p.socket,this.snapshot(room));}
  handle(socket,msg){
    if(!msg||typeof msg!=='object')return this.fail(socket,'Invalid message.');
    if(msg.type==='ping')return this.send(socket,{type:'pong',sent:msg.sent});
    if(msg.type==='resume'){
      if(socket.room)return this.fail(socket,'Already in a room.');
      const room=this.rooms.get(msg.code),p=room?.players.find(p=>p.token===msg.token);
      if(!p||p.socket||!p.disconnectedAt||this.now()-p.disconnectedAt>30000)return this.fail(socket,'This seat has expired. Join a room again.');
      p.socket=socket;p.disconnectedAt=0;socket.room=room;socket.player=p;p.input={};this.welcome(room,p);return;
    }
    if(msg.type==='create'||msg.type==='join'){
      if(socket.room)return this.fail(socket,'Leave your current room first.');
      let room;
      if(msg.type==='create'){
        if(!['1v1','coop'].includes(msg.mode))return this.fail(socket,'Choose 1v1 or co-op.');
        if(this.rooms.size>=this.maxRooms)return this.fail(socket,'Server is full. Try again after a match finishes.');
        const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;
        do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(this.rooms.has(code));
        room={code,mode:msg.mode,status:'lobby',players:[],sim:null,lastActivity:this.now()};this.rooms.set(code,room);
      }else{
        room=this.rooms.get(String(msg.code||'').trim().toUpperCase());
        if(!room)return this.fail(socket,'Room not found. Check the six-character code.');
        if(room.players.length>=2)return this.fail(socket,'This room already has two players.');
        if(room.status!=='lobby')return this.fail(socket,'This match has already started.');
      }
      const p={id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),team:typeof msg.team==='string'&&Object.hasOwn(profiles,msg.team)?msg.team:'341',netEnabled:true,ready:false,socket,input:{},inputAt:0};
      room.players.push(p);socket.room=room;socket.player=p;this.welcome(room,p);return;
    }
    const room=socket.room,p=socket.player;if(!room||!p)return this.fail(socket,'Join a room first.');
    room.lastActivity=this.now();
    if(msg.type==='leave'){this.remove(room,p);return;}
    if(msg.type==='input'){p.input=cleanInput(msg.input);p.inputAt=this.now();return;}
    if(msg.type==='select'){
      if(room.status!=='lobby')return this.fail(socket,'Robot selection is locked during a match.');
      if(!Object.hasOwn(profiles,msg.team))return this.fail(socket,'Unknown robot.');
      p.team=msg.team;p.netEnabled=true;for(const driver of room.players)driver.ready=false;this.broadcast(room);return;
    }
    if(msg.type==='ready'){
      if(room.status!=='lobby')return;
      p.ready=msg.ready===true;
      if(room.players.length===2&&room.players.every(p=>p.ready&&p.socket)){
        room.sim=new Simulation();room.sim.enableMultiplayer(room.players.map((p,i)=>resolve(p.team,room.mode==='coop'||i===0?'blue':'red')));
        room.status='countdown';room.countdown=3;room.countdownAt=this.now();this.broadcast(room,this.snapshot(room));
      }
      this.broadcast(room);return;
    }
    if(msg.type==='pause'){
      if(!room.sim||!['playing','paused'].includes(room.status))return;
      if(room.players.some(p=>!p.socket))return this.fail(socket,'Waiting for the other player to reconnect.');
      room.status=room.status==='playing'?'paused':'playing';room.sim.running=room.status==='playing';for(const driver of room.players)driver.input={};this.broadcast(room);return;
    }
    if(msg.type==='rematch'){
      if(room.status!=='finished')return this.fail(socket,'Finish the match before returning to the lobby.');
      room.status='lobby';room.sim=null;for(const driver of room.players){driver.ready=false;driver.input={};}this.broadcast(room);return;
    }
  }
  remove(room,p){
    const socket=p.socket;if(socket){socket.room=null;socket.player=null;this.send(socket,{type:'left'});}
    room.players=room.players.filter(other=>other!==p);room.sim=null;room.status='lobby';room.countdown=0;
    for(const driver of room.players){driver.ready=false;driver.input={};}
    if(!room.players.length)this.rooms.delete(room.code);else{this.broadcast(room,{type:'notice',message:'The other player left. Invite another player to start a new match.'});this.broadcast(room);}
  }
  disconnect(socket){
    const room=socket.room,p=socket.player;if(!room||!p||p.socket!==socket)return;
    p.socket=null;p.input={};p.ready=false;p.disconnectedAt=this.now();socket.room=null;socket.player=null;
    if(room.status==='playing'){room.status='paused';room.sim.running=false;}
    if(room.status==='countdown'){room.status='lobby';room.countdown=0;room.sim=null;for(const driver of room.players)driver.ready=false;}
    this.broadcast(room,{type:'notice',message:'Player disconnected. Their seat is reserved for 30 seconds.'});this.broadcast(room);
  }
  tick(dt){
    for(const room of this.rooms.values()){
      for(const p of [...room.players])if(!p.socket&&this.now()-p.disconnectedAt>30000)this.remove(room,p);
      if(!this.rooms.has(room.code))continue;
      if(room.status==='lobby'&&this.now()-room.lastActivity>15*60000){for(const p of [...room.players])this.remove(room,p);continue;}
      if(room.status==='countdown'){
        room.countdown=Math.max(0,3-(this.now()-room.countdownAt)/1000);
        if(room.countdown<=0){room.sim.start();room.status='playing';for(const p of room.players)p.input={};this.broadcast(room);}
      }
      if(room.status==='playing'){
        const inputs=room.players.map(p=>p.socket&&this.now()-p.inputAt<300?p.input:{});
        room.sim.step(dt,inputs);
        if(room.sim.phase.id==='finished'){room.status='finished';this.broadcast(room);}
      }
    }
  }
  snapshot(room){
    const s=room.sim;if(!s)return null;
    const balls=s.balls.map(b=>{if(!this.ballIds.has(b))this.ballIds.set(b,this.nextBallId++);return [this.ballIds.get(b),round(b.x),round(b.y),round(b.z)];});
    return {type:'snapshot',status:room.status,countdown:room.countdown||0,time:s.time,started:s.started,running:s.running,
      scores:s.scores,autoScores:s.autoScores,autoWinner:s.autoWinner,tieChoice:s.tieChoice,fired:s.fired,passed:s.passed,resolved:s.resolved,made:s.made,recycled:s.recycled,initialCenterCount:s.initialCenterCount,
      fleet:s.fleet.map(e=>({config:e.config,robot:e.robot,inventory:e.inventory,turretAngle:e.state.turretAngle,intake:e.state.intake})),balls};
  }
  snapshots(){for(const room of this.rooms.values())if(room.sim)this.broadcast(room,this.snapshot(room));}
}
module.exports={Rooms,cleanInput};
