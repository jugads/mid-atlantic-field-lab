import {defenderInput} from './defender.js?v=tandem36';

export const startFields=pose=>pose&&Number.isFinite(pose.y)?{startX:pose.x,startY:pose.y,startA:pose.a}:{};

export function createHostSimulation(room){
  const {Simulation}=globalThis.FieldPhysics,{resolve}=globalThis.TeamPresets;
  const roster=room.players.map(p=>({...resolve(p.team,p.alliance),...startFields(p.startPositions?.[p.team])}));
  const size=room.mode==='3v3'||room.mode==='3v3solo'||room.mode==='3v3coop'||room.mode==='3v0'?3:room.mode==='2v2'?2:0;
  const used=new Set(roster.map(c=>c.team)),pool=Object.keys(globalThis.TeamPresets.profiles);
  if(size)for(const alliance of ['blue','red']){
    if(room.mode==='3v0'&&!roster.some(r=>r.alliance===alliance))continue;
    const count=roster.filter(r=>r.alliance===alliance).length;
    for(let i=count;i<size;i++){
      const owner=room.players.find(p=>p.alliance===alliance),slot=i-count;
      const proposed=room.aiTeams?.[alliance]?.[slot]??owner?.aiTeams?.[slot];
      const candidate=proposed||'2539',chosen=!used.has(candidate)?candidate:pool.find(id=>!used.has(id));used.add(chosen);
      const role=room.aiRoles?.[alliance]?.[slot]??owner?.aiRoles?.[slot]??'auto';
      roster.push({...resolve(chosen,alliance),aiRole:role,...startFields(owner?.startPositions?.[chosen])});
    }
  }
  const sim=new Simulation();sim.enableMultiplayer(roster);return sim;
}


// Human entries come first; assign each AI to an opposing human where possible,
// then spread remaining bots across opposing robots.
export function matchInputs(sim,humanInputs,difficulty='medium'){
  const count=humanInputs.length,inputs=humanInputs.slice();
  for(let i=count;i<sim.fleet.length;i++){
    const enemies=sim.fleet.map((e,j)=>({e,j})).filter(({e})=>e.config.alliance!==sim.fleet[i].config.alliance);
    const human=enemies.find(({j})=>j<count),ordinal=sim.fleet.slice(count,i).filter(e=>e.config.alliance===sim.fleet[i].config.alliance).length;
    const target=(ordinal===0&&human?human:enemies[ordinal%enemies.length]);
    inputs.push(defenderInput(sim,difficulty,i,target?.j ?? -1));
  }
  return inputs;
}

/* The room host simulates; the server relays guest controls and host snapshots. */
export class MultiplayerClient{
  constructor(onChange){this.onChange=onChange;this.room=null;this.id=null;this.token=null;this.socket=null;this.frames=[];this.message='';this.state='offline';this.rtt=0;this.lastInput=0;this.lastMessage=0;this.lastPing=0;this.retry=0;this.timer=null;this.epoch=0;this.hostSim=null;this.guestInput={};this.guestInputAt=0;this.ballIds=new WeakMap();this.nextBallId=1;this.hostAccumulator=0;this.hostLast=0;this.lastSnapshot=0;this.visualRobot=null;this.visualAt=0;}
  get active(){return !!this.room;}
  get self(){return this.room?.players.find(p=>p.id===this.id);}
  normalizeEndpoint(value){
    const url=new URL(value);if(url.username||url.password)throw Error('Use a server URL without a username or password.');
    if(!['https:','wss:'].includes(url.protocol)&&!(['http:','ws:'].includes(url.protocol)&&['localhost','127.0.0.1'].includes(url.hostname)))throw Error('Use an HTTPS Render server URL.');
    url.protocol=['https:','wss:'].includes(url.protocol)?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';return url.href;
  }
  connect(endpoint,request){
    try{this.endpoint=this.normalizeEndpoint(endpoint);}catch(e){this.message=e.message;this.onChange();return;}
    this.leave(false);this.intent={...request,protocol:2};this.state='connecting';this.message='Connecting… A sleeping Render server may take a minute to wake.';this.connectAt=performance.now();this.open(false);this.onChange();
  }
  open(resume){
    const generation=++this.epoch;this.socket=new WebSocket(this.endpoint);const socket=this.socket;
    this.lastMessage=performance.now();
    const timeout=setTimeout(()=>{if(socket.readyState!==WebSocket.OPEN)socket.close();},60000);
    socket.onopen=()=>{if(generation!==this.epoch)return;clearTimeout(timeout);this.lastMessage=performance.now();this.send(resume?{type:'resume',code:this.room.code,token:this.token}:this.intent);};
    socket.onmessage=e=>{
      if(generation!==this.epoch)return;this.lastMessage=performance.now();let msg;try{msg=JSON.parse(e.data);}catch{return;}
      if(msg.type==='welcome'){this.id=msg.id;this.token=msg.token;this.state='connected';this.message='';this.retry=0;}
      if(msg.type==='room'){
        const prior=this.room;this.room=msg;
        if(msg.status==='lobby'&&prior?.status!=='lobby'){this.frames=[];this.hostSim=null;this.hostLast=0;}
        if(msg.status==='countdown'&&msg.hostId===this.id&&!this.hostSim){
          this.hostSim=createHostSimulation(msg);
          this.ballIds=new WeakMap();this.nextBallId=1;this.hostAccumulator=0;this.hostLast=0;
        }
        if(prior?.status!==msg.status){this.hostLast=0;this.hostAccumulator=0;this.guestInput={};this.visualRobot=null;}
      }
      if(msg.type==='guest_input'){this.guestInput=msg.input;this.guestInputAt=performance.now();return;}
      if(msg.type==='snapshot'){if(this.frames.length&&msg.time<this.frames.at(-1).data.time)this.frames=[];this.frames.push({at:performance.now(),data:msg});if(this.frames.length>8)this.frames.shift();return;}
      if(msg.type==='notice')this.message=msg.message;
      if(msg.type==='pong'){this.rtt=Math.round(performance.now()-msg.sent);return;}
      if(msg.type==='error'){
        this.message=msg.message;
        if(this.state==='reconnecting'||!this.room){const message=this.message;this.leave(false);this.message=message;}
      }
      if(msg.type==='left'){this.leave(false);this.message='You left the room.';}
      this.onChange(msg);
    };
    socket.onerror=()=>{};
    socket.onclose=()=>{
      clearTimeout(timeout);if(generation!==this.epoch)return;
      if(this.room){
        if(this.state!=='reconnecting'){this.reconnectAt=performance.now();this.frames=[];}
        this.state='reconnecting';this.message='Connection lost. Reconnecting to your reserved seat…';
        if(performance.now()-this.reconnectAt<28000)this.timer=setTimeout(()=>this.open(true),Math.min(4000,500*2**this.retry++));
        else {this.leave(false);this.message='Connection could not be restored. Rejoin with the room code.';}
      }else{this.state='offline';this.message='Could not connect. Check the server URL or retry once Render is awake.';}
      this.onChange();
    };
  }
  send(msg){if(this.socket?.readyState===WebSocket.OPEN&&(msg.type!=='snapshot'||this.socket.bufferedAmount<131072))this.socket.send(JSON.stringify(msg));}
  leave(notify=true){
    if(notify){this.send({type:'leave'});this.message='You left the room.';}++this.epoch;clearTimeout(this.timer);this.socket?.close();this.socket=null;this.room=null;this.id=null;this.token=null;this.frames=[];this.hostSim=null;this.hostLast=0;this.guestInput={};this.visualRobot=null;this.state='offline';this.onChange();
  }
  input(input,now){
    if(this.state!=='connected')return;
    if(this.room?.hostId!==this.id&&now-this.lastInput>=1000/30){this.send({type:'input',input});this.lastInput=now;}
    if(now-this.lastPing>2000){this.send({type:'ping',sent:now});this.lastPing=now;}
    if(now-this.lastMessage>10000)this.socket?.close();
  }
  advanceHost(now,input){
    const s=this.hostSim;if(!s||this.room?.hostId!==this.id||this.state!=='connected')return;
    const playing=this.room.status==='playing';
    if(playing&&!s.started)s.start();
    s.running=playing&&s.phase.id!=='finished';
    if(playing&&this.hostLast){
      this.hostAccumulator+=Math.min(.1,Math.max(0,(now-this.hostLast)/1000));
      const guest=now-this.guestInputAt<300?this.guestInput:{};
      while(this.hostAccumulator>=1/120){const humans=[input,guest];s.step(1/120,s.fleet.length>humans.length?matchInputs(s,humans):humans);this.hostAccumulator-=1/120;}
    }
    this.hostLast=playing?now:0;
    if(now-this.lastSnapshot<50)return;
    this.lastSnapshot=now;
    const round=n=>Math.round(n*1000)/1000;
    const balls=s.balls.map(b=>{if(!this.ballIds.has(b))this.ballIds.set(b,this.nextBallId++);return [this.ballIds.get(b),round(b.x),round(b.y),round(b.z)];});
    const snapshot={type:'snapshot',status:this.room.status,countdown:this.room.countdown||0,time:s.time,started:s.started,running:s.running,
      scores:{...s.scores},matchStats:s.matchStats,fouls:s.fouls,foulPoints:s.foulPoints,foulEvents:s.foulEvents,pinCounts:s.pinCounts,autoScores:{...s.autoScores},autoWinner:s.autoWinner,tieChoice:s.tieChoice,fired:s.fired,passed:s.passed,resolved:s.resolved,made:s.made,recycled:s.recycled,initialCenterCount:s.initialCenterCount,
      fleet:s.fleet.map(e=>({config:e.config,robot:{...e.robot},inventory:e.inventory,turretAngle:e.state.turretAngle,intake:e.state.intake})),balls};
    this.send(snapshot);this.frames.push({at:now,data:snapshot});if(this.frames.length>6)this.frames.shift();
  }
  apply(sim,now,input={}){
    if(!this.frames.length)return;
    const isHost=this.room?.hostId===this.id;
    const renderAt=now-100;
    let a=this.frames[0],b=this.frames.at(-1);
    if(isHost)a=b;
    else for(let i=1;i<this.frames.length;i++)if(this.frames[i].at>=renderAt){a=this.frames[i-1];b=this.frames[i];break;}
    const f=a===b?1:Math.max(0,Math.min(1,(renderAt-a.at)/(b.at-a.at))),data=b.data;
    const lerp=(x,y)=>x+(y-x)*f;
    const angle=(x,y)=>x+Math.atan2(Math.sin(y-x),Math.cos(y-x))*f;
    for(const k of ['started','running','scores','matchStats','fouls','foulPoints','foulEvents','pinCounts','autoScores','autoWinner','tieChoice','fired','passed','resolved','made','recycled','initialCenterCount'])sim[k]=data[k];
    sim.time=lerp(a.data.time,data.time);
    sim.fleet=data.fleet.map((e,i)=>{
      const old=a.data.fleet[i]||e,robot={...e.robot};
      for(const k of ['x','y','z','vx','vy','pitch','roll'])robot[k]=lerp(old.robot[k],e.robot[k]);robot.a=angle(old.robot.a,e.robot.a);
      return {...e,robot,turretAngle:angle(old.turretAngle,e.turretAngle)};
    });
    sim.activeIndex=Math.max(0,this.room?.players.findIndex(p=>p.id===this.id)??0);
    const me=sim.fleet[sim.activeIndex];if(!me)return;
    sim.config=me.config;sim.robot=me.robot;sim.inventory=me.inventory;sim.turretAngle=me.turretAngle;sim.intake=me.intake;sim.score=data.scores[me.config.alliance];
    // Predict only our chassis using the same drive and field-collision model as
    // the server. Scoring, fuel, and all authoritative state still come from snapshots.
    // Bound prediction to keep a delayed connection from driving through obstacles.
    const latest=this.frames.at(-1),latestMe=latest.data.fleet[sim.activeIndex];
    if(!isHost&&latestMe&&now-latest.at<250&&this.state==='connected'&&this.room?.status==='playing'&&latest.data.running&&sim.controlsEnabled){
      Object.assign(me.robot,latestMe.robot);
      let lead=Math.min(.15,Math.max(0,(now-latest.at+this.rtt/2)/1000));
      const lock=input.shoot&&me.inventory>0&&me.config.autoAim&&me.config.archetype==='dumper'&&me.config.aimLockWhileShooting;
      const controls=lock?{...input,clockwise:false,counterclockwise:false,turnAxis:0,tankTurn:0}:input;
      while(lead>1e-6){const dt=Math.min(lead,1/120);sim.drive(dt,controls);lead-=dt;}
      const target={...me.robot},dt=Math.max(0,Math.min(.05,(now-this.visualAt)/1000));
      if(this.visualRobot&&now-this.visualAt<150&&Math.hypot(target.x-this.visualRobot.x,target.y-this.visualRobot.y)<1.2){
        Object.assign(me.robot,this.visualRobot);
        let remaining=dt;while(remaining>1e-6){const step=Math.min(remaining,1/120);sim.drive(step,controls);remaining-=step;}
        const correction=1-Math.exp(-8*dt);
        for(const key of ['x','y','z','vx','vy','pitch','roll'])me.robot[key]+=(target[key]-me.robot[key])*correction;
        me.robot.a+=Math.atan2(Math.sin(target.a-me.robot.a),Math.cos(target.a-me.robot.a))*correction;
      }
      this.visualRobot={...me.robot};this.visualAt=now;
    }else{
      this.visualRobot=null;
    }
    const previous=new Map(a.data.balls.map(ball=>[ball[0],ball]));
    sim.balls=data.balls.map(ball=>{const old=previous.get(ball[0])||ball;return {x:lerp(old[1],ball[1]),y:lerp(old[2],ball[2]),z:lerp(old[3],ball[3])};});
    sim.flashes=[];
  }
}
