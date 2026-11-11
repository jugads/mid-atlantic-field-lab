const {randomBytes,randomInt}=require('node:crypto');
const {profiles}=require('../dist/team-presets.js');
const isFullMatch=mode=>mode==='3v3'||mode==='3v3coop';
const aiSlots=(mode,index)=>mode==='3v3'?2:mode==='3v3coop'&&index===0?1:0;
const teamPool=Object.keys(profiles);
const cleanInput=value=>{
  const input={};if(!value||typeof value!=='object')return input;
  for(const k of ['moveX','moveY','forward','tankTurn','turnAxis'])input[k]=Number.isFinite(value[k])?Math.max(-1,Math.min(1,value[k])):0;
  for(const k of ['up','down','left','right','clockwise','counterclockwise','shoot','intake'])input[k]=value[k]===true;
  return input;
};
class Rooms{
  constructor({now=()=>Date.now(),maxRooms=4}={}){this.rooms=new Map();this.now=now;this.maxRooms=maxRooms;}
  send(socket,data){if(socket?.readyState===1&&socket.bufferedAmount<512000)socket.send(JSON.stringify(data));}
  fail(socket,message){this.send(socket,{type:'error',message});}
  lobby(room){return {type:'room',protocol:2,code:room.code,mode:room.mode,status:room.status,countdown:room.countdown||0,hostId:room.hostId,stalled:!!room.stalled,
    players:room.players.map((p,index)=>({index,id:p.id,team:p.team,aiTeams:p.aiTeams,aiRoles:p.aiRoles,startPositions:p.startPositions||{},ready:p.ready,connected:!!p.socket,alliance:['coop','3v3coop'].includes(room.mode)||index===0?'blue':'red'}))};}
  broadcast(room,message=this.lobby(room)){for(const p of room.players)this.send(p.socket,message);}
  welcome(room,p){this.send(p.socket,{type:'welcome',protocol:2,id:p.id,token:p.token,code:room.code});this.broadcast(room);if(room.snapshot&&p.id!==room.hostId)this.send(p.socket,room.snapshot);}
  handle(socket,msg){
    if(!msg||typeof msg!=='object')return this.fail(socket,'Invalid message.');
    if(msg.type==='ping')return this.send(socket,{type:'pong',sent:msg.sent});
    if(msg.type==='resume'){
      if(socket.room)return this.fail(socket,'Already in a room.');
      const room=this.rooms.get(msg.code),p=room?.players.find(p=>p.token===msg.token);
      if(!p||p.socket||!p.disconnectedAt||this.now()-p.disconnectedAt>30000)return this.fail(socket,'This seat has expired. Join a room again.');
      p.socket=socket;p.disconnectedAt=0;socket.room=room;socket.player=p;this.welcome(room,p);return;
    }
    if(msg.type==='create'||msg.type==='join'){
      if(msg.protocol!==2)return this.fail(socket,'This game version is out of date. Both players must refresh the Render site.');
      if(socket.room)return this.fail(socket,'Leave your current room first.');
      let room;
      if(msg.type==='create'){
        if(!['1v1','2v2','3v3','3v3coop','coop'].includes(msg.mode))return this.fail(socket,'Choose 1v1, 2v2, 3v3, or co-op.');
        if(this.rooms.size>=this.maxRooms)return this.fail(socket,'Server is full. Try again after a match finishes.');
        const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;
        do{code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}while(this.rooms.has(code));
        room={code,mode:msg.mode,status:'lobby',players:[],snapshot:null,lastActivity:this.now()};this.rooms.set(code,room);
      }else{
        room=this.rooms.get(String(msg.code||'').trim().toUpperCase());
        if(!room)return this.fail(socket,'Room not found. Check the six-character code.');
        if(room.players.length>=2)return this.fail(socket,'This room already has two players.');
        if(room.status!=='lobby')return this.fail(socket,'This match has already started.');
      }
      const used=new Set(room.players.flatMap(driver=>[driver.team,...driver.aiTeams.slice(0,aiSlots(room.mode,room.players.indexOf(driver)))]));
      let team=typeof msg.team==='string'&&Object.hasOwn(profiles,msg.team)?msg.team:'341';if(used.has(team)&&room.mode!=='1v1')team=teamPool.find(id=>!used.has(id));used.add(team);
      const picks=[];for(let i=0;i<aiSlots(room.mode,room.players.length);i++){const choice=teamPool.find(id=>!used.has(id));picks.push(choice);used.add(choice);}
      const p={id:randomBytes(8).toString('hex'),token:randomBytes(24).toString('hex'),team,aiTeams:picks,aiRoles:picks.map(()=>'auto'),ready:false,socket};
      room.players.push(p);if(!room.hostId)room.hostId=p.id;socket.room=room;socket.player=p;this.welcome(room,p);return;
    }
    const room=socket.room,p=socket.player;if(!room||!p)return this.fail(socket,'Join a room first.');
    room.lastActivity=this.now();
    if(msg.type==='leave'){this.remove(room,p);return;}
    if(msg.type==='input'){
      if(p.id!==room.hostId&&room.status==='playing')this.send(room.players.find(x=>x.id===room.hostId)?.socket,{type:'guest_input',input:cleanInput(msg.input)});
      return;
    }
    if(msg.type==='snapshot'){
      if(p.id!==room.hostId||!['playing','paused','countdown'].includes(room.status))return;
      if(!Number.isFinite(msg.time)||msg.time<0||msg.time>166||!Array.isArray(msg.balls)||msg.balls.length>504||!Array.isArray(msg.fleet)||msg.fleet.length!==(isFullMatch(room.mode)?6:room.mode==='2v2'?4:2)||!msg.scores)return;
      if(room.snapshot&&msg.time+0.001<room.snapshot.time)return;
      msg.status=room.status;room.snapshot=msg;room.snapshotAt=this.now();
      for(const other of room.players)if(other.id!==room.hostId)this.send(other.socket,msg);
      if(msg.time>=166&&room.status==='playing'){room.status='finished';this.broadcast(room);}
      return;
    }
    if(msg.type==='select'){
      if(room.status!=='lobby')return this.fail(socket,'Robot selection is locked during a match.');
      if(!Object.hasOwn(profiles,msg.team))return this.fail(socket,'Unknown robot.');
      if(room.mode!=='1v1'&&room.players.some(other=>(other!==p&&other.team===msg.team)||other.aiTeams.includes(msg.team)))return this.fail(socket,'That team is already in this match.');
      p.team=msg.team;for(const driver of room.players)driver.ready=false;this.broadcast(room);return;
    }
    if(msg.type==='select_ai'){
      if(room.status!=='lobby'||!isFullMatch(room.mode))return this.fail(socket,'AI selection is available in a 3v3 lobby.');
      if(!Number.isInteger(msg.slot)||msg.slot<0||msg.slot>=aiSlots(room.mode,room.players.indexOf(p))||typeof msg.team!=='string'||!Object.hasOwn(profiles,msg.team))return this.fail(socket,'Invalid AI selection.');
      if(room.players.some(other=>other.team===msg.team||other.aiTeams.some((id,i)=>id===msg.team&&(other!==p||i!==msg.slot))))return this.fail(socket,'That team is already in this match.');
      p.aiTeams[msg.slot]=msg.team;for(const driver of room.players)driver.ready=false;this.broadcast(room);return;
    }
    if(msg.type==='select_ai_role'){
      if(room.status!=='lobby'||!isFullMatch(room.mode)||!Number.isInteger(msg.slot)||msg.slot<0||msg.slot>=aiSlots(room.mode,room.players.indexOf(p))||!['auto','score','defend','collect','pass'].includes(msg.role))return this.fail(socket,'Invalid AI role.');
      p.aiRoles[msg.slot]=msg.role;for(const driver of room.players)driver.ready=false;this.broadcast(room);return;
    }
    if(msg.type==='start_position'){
      if(room.status!=='lobby'||typeof msg.team!=='string'||![p.team,...p.aiTeams.slice(0,aiSlots(room.mode,room.players.indexOf(p)))].includes(msg.team)||!Number.isFinite(msg.y)||msg.y<.3||msg.y>7.77||(msg.a!==undefined&&!Number.isFinite(msg.a))||(msg.x!==undefined&&(!Number.isFinite(msg.x)||msg.x<0||msg.x>16.54)))return this.fail(socket,'Invalid starting position.');
      p.startPositions=p.startPositions||{};p.startPositions[msg.team]={x:Number.isFinite(msg.x)?msg.x:undefined,y:msg.y,a:Number.isFinite(msg.a)?Math.atan2(Math.sin(msg.a),Math.cos(msg.a)):undefined};for(const driver of room.players)driver.ready=false;this.broadcast(room);return;
    }
    if(msg.type==='ready'){
      if(room.status!=='lobby')return;
      p.ready=msg.ready===true;
      if(room.players.length===2&&room.players.every(p=>p.ready&&p.socket)){
        room.snapshot=null;room.snapshotAt=0;room.stalled=false;room.status='countdown';room.countdown=3;room.countdownAt=this.now();
      }
      this.broadcast(room);return;
    }
    if(msg.type==='pause'){
      if(!['playing','paused'].includes(room.status))return;
      if(room.players.some(p=>!p.socket))return this.fail(socket,'Waiting for the other player to reconnect.');
      if(room.status==='paused'&&room.stalled&&(!room.snapshotAt||this.now()-room.snapshotAt>2500))return this.fail(socket,'Waiting for the host to resume sending match updates.');
      room.status=room.status==='playing'?'paused':'playing';room.stalled=false;room.playingAt=this.now();this.broadcast(room);return;
    }
    if(msg.type==='rematch'){
      if(room.status!=='finished')return this.fail(socket,'Finish the match before returning to the lobby.');
      room.status='lobby';room.snapshot=null;for(const driver of room.players)driver.ready=false;this.broadcast(room);return;
    }
  }
  remove(room,p){
    const socket=p.socket;if(socket){socket.room=null;socket.player=null;this.send(socket,{type:'left'});}
    room.players=room.players.filter(other=>other!==p);room.snapshot=null;room.status='lobby';room.countdown=0;
    if(p.id===room.hostId)room.hostId=room.players[0]?.id;
    for(const driver of room.players)driver.ready=false;
    if(!room.players.length)this.rooms.delete(room.code);else{this.broadcast(room,{type:'notice',message:'The other player left. Invite another player to start a new match.'});this.broadcast(room);}
  }
  disconnect(socket){
    const room=socket.room,p=socket.player;if(!room||!p||p.socket!==socket)return;
    p.socket=null;p.ready=false;p.disconnectedAt=this.now();socket.room=null;socket.player=null;
    if(room.status==='playing')room.status='paused';
    if(room.status==='countdown'){room.status='lobby';room.countdown=0;room.snapshot=null;for(const driver of room.players)driver.ready=false;}
    this.broadcast(room,{type:'notice',message:'Player disconnected. Their seat is reserved for 30 seconds.'});this.broadcast(room);
  }
  tick(){
    for(const room of this.rooms.values()){
      for(const p of [...room.players])if(!p.socket&&this.now()-p.disconnectedAt>30000)this.remove(room,p);
      if(!this.rooms.has(room.code))continue;
      if(room.status==='lobby'&&this.now()-room.lastActivity>15*60000){for(const p of [...room.players])this.remove(room,p);continue;}
      if(room.status==='countdown'){
        const before=Math.ceil(room.countdown);
        room.countdown=Math.max(0,3-(this.now()-room.countdownAt)/1000);
        if(room.countdown<=0){room.status='playing';room.playingAt=this.now();room.stalled=false;this.broadcast(room);}
        else if(Math.ceil(room.countdown)!==before)this.broadcast(room);
      }
      if(room.status==='playing'&&this.now()-Math.max(room.playingAt||0,room.snapshotAt||0)>2500){
        room.status='paused';room.stalled=true;
        this.broadcast(room,{type:'notice',message:'Host updates stopped. Match paused until the host reconnects or returns to the game.'});this.broadcast(room);
      }
    }
  }
}
module.exports={Rooms,cleanInput};
