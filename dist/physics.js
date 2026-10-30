/* REBUILT single-robot match model. SI units; integrate at a fixed 120 Hz. */
(function (root) {
  const W = 16.54, H = 8.07, G = 9.81, BR = .075;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const base = {maxSpeed:5, acceleration:10, width:.85, length:.9, height:.52,
    intakeRate:5, feedRate:6, capacity:30, stationary:92, moving:65, maxRange:6,
    drive:'swerve', alliance:'blue', autoAim:true, team:'341', autoRoutine:'preload', archetype:'turret',lanes:1};
  const ARCHETYPES = {
    turret: {label:'Turret',description:'Swiveling shooter · fire while moving',settings:{archetype:'turret',width:.85,length:.9,height:.52,capacity:30,feedRate:6,intakeRate:5,maxSpeed:5,acceleration:10,stationary:92,moving:65,lanes:1}},
    dumper: {label:'Big dumper',description:'Fixed multi-lane shooter · chassis aim · moving accuracy',settings:{archetype:'dumper',width:1,length:1.05,height:.72,capacity:60,feedRate:12,intakeRate:9,maxSpeed:5,acceleration:10,stationary:95,moving:40,lanes:3}}
  };
  const FIELD = {hubSize:1.194, hubHeight:1.83, openingRadius:.53,
    bumpDepth:1.128, bumpWidth:1.854, bumpHeight:.1654, trenchClearance:.5652,
    trenchWidth:1.38, startLine:4.03, centerDepth:1.83, centerWidth:5.23};
  const hubs = [{x:4.03 + FIELD.hubSize/2,y:H/2,alliance:'blue'},
    {x:W-4.03-FIELD.hubSize/2,y:H/2,alliance:'red'}];
  const bumps = hubs.flatMap(h=>[-1,1].map(sign=>({x:h.x,
    y:H/2+sign*(FIELD.hubSize/2+FIELD.bumpWidth/2),width:FIELD.bumpDepth,
    depth:FIELD.bumpWidth,alliance:h.alliance})));
  const trenches = hubs.flatMap(h=>[-1,1].map(sign=>({x:h.x,
    y:sign<0?FIELD.trenchWidth/2:H-FIELD.trenchWidth/2,
    width:FIELD.hubSize,depth:FIELD.trenchWidth,alliance:h.alliance,sign})));
  const solids = hubs.map(h=>({x:h.x,y:h.y,width:FIELD.hubSize,depth:FIELD.hubSize,height:1.65,hub:true,alliance:h.alliance}));
  for (const t of trenches) solids.push({x:t.x,y:t.sign<0?FIELD.trenchWidth+.16:H-FIELD.trenchWidth-.16,width:FIELD.hubSize,depth:.32,height:1.022});
  const TOWER={depth:1.148,width:1.45,postX:.95,postGap:1.35,postDepth:.0889,postWidth:.0381,postHeight:1.831,rungDiameter:.04216,rungs:[.90,1.143,1.6002]};
  const towers=['blue','red'].map(alliance=>({alliance,x:alliance==='blue'?TOWER.postX:W-TOWER.postX,y:H/2}));
  for(const t of towers){
    for(const side of [-1,1])solids.push({x:t.x,y:t.y+side*(TOWER.postGap+TOWER.postWidth)/2,width:TOWER.postDepth,depth:TOWER.postWidth,height:TOWER.postHeight,bottom:0,tower:true});
    for(const z of TOWER.rungs)solids.push({x:t.x,y:t.y,width:TOWER.rungDiameter,depth:TOWER.postGap+2*TOWER.postWidth,height:z+TOWER.rungDiameter/2,bottom:z-TOWER.rungDiameter/2,tower:true});
    const towardWall=t.alliance==='blue'?-1:1;
    for(const side of [-1,1])for(let i=0;i<8;i++){const f=i/7;solids.push({x:t.x+towardWall*f*.85,y:t.y+side*(TOWER.postGap+TOWER.postWidth)/2,width:.13,depth:.045,bottom:.72+f*.38-.025,height:.72+f*.38+.025,tower:true});}
  }
  // Prefer the trench only when the chassis fits the opening, leaving a little steering room.
  const canUseTrench=c=>c.height<=FIELD.trenchClearance&&c.width<=FIELD.trenchWidth-.08;
  function startingLocations(c){
    const trench=[FIELD.trenchWidth/2,H-FIELD.trenchWidth/2];
    const bumpOffset=FIELD.hubSize/2+FIELD.bumpWidth/2;
    const bump=[H/2-bumpOffset,H/2+bumpOffset];
    return canUseTrench(c)
      ? [...trench.map(y=>({y,area:'trench'})),...bump.map(y=>({y,area:'bump'})),{y:H/2,area:'center'}]
      : [...bump.map(y=>({y,area:'bump'})),{y:H/2,area:'center'},...trench.map(y=>({y,area:'trench approach'}))];
  }
  // The dumper channels are grouped around the center of the chassis.
  const laneOffset=(lane,lanes,width)=>lanes===1?0:(lane/(lanes-1)-.5)*width*.30;
  const ball = (x,y,z=BR) => ({x,y,z,vx:0,vy:0,vz:0,shot:false,checked:false});
  const PHASES = [
    {id:'auto',label:'AUTO',start:0,end:20,active:'both'},
    {id:'auto-settle',label:'AUTO SCORING',start:20,end:23,active:'both'},
    {id:'transition',label:'TRANSITION',start:23,end:33,active:'both'},
    {id:'shift1',label:'SHIFT 1',start:33,end:58,shift:1},
    {id:'shift2',label:'SHIFT 2',start:58,end:83,shift:2},
    {id:'shift3',label:'SHIFT 3',start:83,end:108,shift:3},
    {id:'shift4',label:'SHIFT 4',start:108,end:133,shift:4},
    {id:'endgame',label:'END GAME',start:133,end:163,active:'both'},
    {id:'final-settle',label:'FINAL SCORING',start:163,end:166,active:'both'}
  ];
  function phaseAt(time) { return PHASES.find(p=>time<p.end-1e-8)||{id:'finished',label:'MATCH COMPLETE',start:166,end:166}; }
  function terrainHeight(x,y) {
    for(const b of bumps) if(Math.abs(y-b.y)<=b.depth/2 && Math.abs(x-b.x)<=b.width/2)
      return FIELD.bumpHeight*(1-Math.abs(x-b.x)/(b.width/2));
    if((x<TOWER.depth||x>W-TOWER.depth)&&Math.abs(y-H/2)<TOWER.width/2)return .008;
    return 0;
  }
  // Separating-axis contact for oriented robot chassis against an axis-aligned structure.
  function rectangleContact(r,length,width,box) {
    const ca=Math.cos(r.a),sa=Math.sin(r.a),bc=Math.cos(box.a||0),bs=Math.sin(box.a||0),axes=[[ca,sa],[-sa,ca],[bc,bs],[-bs,bc]];
    let best=null;
    for(const [nx,ny] of axes){
      const extent=Math.abs(nx*ca+ny*sa)*length/2+Math.abs(-nx*sa+ny*ca)*width/2+
        Math.abs(nx*bc+ny*bs)*box.width/2+Math.abs(-nx*bs+ny*bc)*box.depth/2;
      const offset=(r.x-box.x)*nx+(r.y-box.y)*ny,depth=extent-Math.abs(offset);
      if(depth<=0)return null;
      if(!best||depth<best.depth)best={nx:nx*(offset<0?-1:1),ny:ny*(offset<0?-1:1),depth};
    }
    return best;
  }
  class Simulation {
    constructor(config={},random=Math.random){this.config={...base,...config};this.random=random;this.roster=[{...this.config}];this.activeIndex=0;this.reset();}
    reset(){
      this.config={...this.roster[this.activeIndex]};
      const occupied={blue:[],red:[]};this.fleet=this.roster.map(config=>{
        const c={...config},blue=c.alliance==='blue',candidates=startingLocations(c),used=occupied[c.alliance];
        // Reserve separate lanes for each parked robot in a multi-robot simulation.
        const position=candidates.find(p=>used.every(o=>Math.abs(p.y-o.y)>=(c.width+o.width)/2+.05))||candidates[0];
        used.push({y:position.y,width:c.width});
        const robot={x:blue?FIELD.startLine-c.length/2:W-FIELD.startLine+c.length/2,
          y:position.y,startArea:position.area,a:blue?0:Math.PI,vx:0,vy:0,omega:0,z:0,pitch:0,roll:0};
        return {config:c,robot,inventory:Math.min(8,c.capacity)};
      });
      this.robot=this.fleet[this.activeIndex].robot;this.inventory=this.fleet[this.activeIndex].inventory;
      const c=this.config;
      this.score=0;this.scores={blue:0,red:0};this.autoScores={blue:0,red:0};
      this.fired=0;this.passed=0;this.resolved=0;this.made=0;this.inactiveMade=0;this.recycled=0;this.time=0;
      this.running=false;this.started=false;this.intake=true;this.intakeClock=0;this.fireClock=0;this.feedBudget=0;this.feedThreshold=1;
      this.autoWinner=null;this.tieChoice=this.random()<.5?'blue':'red';this.balls=[];this.pending=[];this.flashes=[];
      this.outpostReserve={blue:24,red:24};
      // Six-robot preloads not used by this single-robot session return to the neutral pile.
      const centerCount=408-this.fleet.reduce((sum,r)=>sum+r.inventory,0);
      const slots=[];
      // Five clear columns on each side of the divider, 34 rows; remaining fuel sits above gaps.
      for(let side of [-1,1])for(let col=0;col<5;col++)for(let row=0;row<34;row++)
        slots.push({x:W/2+side*(.115+col*.17),y:H/2-2.5+row*.1515,z:BR});
      for(let side of [-1,1])for(let col=0;col<4;col++)for(let row=0;row<33;row++)
        slots.push({x:W/2+side*(.2+col*.17),y:H/2-2.424+row*.1515,z:.198});
      const upper=slots.splice(340);for(let i=upper.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[upper[i],upper[j]]=[upper[j],upper[i]];}
      slots.push(...upper);
      for(let i=0;i<centerCount;i++){const p=slots[i];this.balls.push(ball(p.x+(this.random()-.5)*.008,p.y+(this.random()-.5)*.008,p.z));}
      for(const alliance of ['blue','red'])for(let i=0;i<24;i++){
        const blueDepot=alliance==='blue';this.balls.push(ball(blueDepot?.4+(i%4)*.151:W-.4-(i%4)*.151,
          blueDepot?H-1.45+Math.floor(i/4)*.151:1.45-Math.floor(i/4)*.151));
      }
      this.initialCenterCount=centerCount;this.resolveRobot();this.updatePose();
    }
    get target(){return hubs.find(h=>h.alliance===this.config.alliance);}
    get inAllianceZone(){return this.config.alliance==='blue'?this.robot.x<=FIELD.startLine:this.robot.x>=W-FIELD.startLine;}
    get shotMode(){return this.inAllianceZone?'score':'pass';}
    get shotTarget(){
      if(this.inAllianceZone)return {...this.target,z:FIELD.hubHeight};
      // Ferry to an open lane, away from the hub and tower. Passes are recovered from the carpet.
      const lane=this.robot.y<H/2?H/2-1.65:H/2+1.65;
      return {x:this.config.alliance==='blue'?2.2:W-2.2,y:lane,z:BR};
    }
    get shotSolution(){
      const h=this.shotTarget,r=this.robot,passing=!this.inAllianceZone;
      const dx=h.x-r.x,dy=h.y-r.y,d=Math.hypot(dx,dy),reach=passing?d:Math.min(d,this.config.maxRange);
      const factor=d>1e-8?reach/d:0,target={x:r.x+dx*factor,y:r.y+dy*factor,z:h.z};
      // Longer scoring shots stay aloft longer and therefore follow a higher arc.
      const flight=passing?clamp(d/5.2,1.05,2.25):clamp(.75+reach*.15,.9,2.25);
      return {target,actualTarget:h,distance:d,reach,flight,passing,outOfRange:!passing&&d>this.config.maxRange+.001};
    }
    get aimAngle(){const {target,flight}=this.shotSolution,r=this.robot;
      return Math.atan2(target.y-r.y-r.vy*flight,target.x-r.x-r.vx*flight);}
    get fireStatus(){
      if(!this.inventory)return 'EMPTY';
      if(this.config.archetype==='dumper'){
        const error=Math.atan2(Math.sin(this.aimAngle-this.robot.a),Math.cos(this.aimAngle-this.robot.a));
        if(this.config.autoAim&&Math.abs(error)>.07)return 'ALIGNING CHASSIS';
      }
      if(this.shotSolution.outOfRange)return 'OUT OF RANGE';
      return this.inAllianceZone?'SHOOT HUB':'PASS TO HOME';
    }
    get radius(){return Math.hypot(this.config.width,this.config.length)/2;}
    get phase(){return !this.started?{id:'ready',label:'READY',start:0,end:20}:phaseAt(this.time);}
    get matchRemaining(){if(!this.started||this.time<20)return Math.max(0,20-this.time);if(this.time<23)return 0;return Math.max(0,163-this.time);}
    get phaseRemaining(){return Math.max(0,this.phase.end-this.time);}
    get controlsEnabled(){return this.running&&(this.time<20||(this.time>=23&&this.time<163));}
    start(){if(this.phase.id==='finished')this.reset();this.started=true;this.running=true;}
    pause(){if(this.started&&this.phase.id!=='finished')this.running=!this.running;}
    activeAt(alliance,time=this.time){
      if(!this.started||time<0)return false;const p=phaseAt(time);
      if(p.active==='both')return true;if(!p.shift)return false;
      const winner=this.autoWinner||this.tieChoice;
      return p.shift%2===1?alliance!==winner:alliance===winner;
    }
    canScore(alliance){return this.started&&this.time<166&&(this.activeAt(alliance)||
      [33,58,83,108,133].some(t=>this.time>=t&&this.time<t+3&&this.activeAt(alliance,t-.001)));}
    hubStatus(alliance){
      const active=this.activeAt(alliance),p=this.phase;
      const warning=active&&p.end-this.time<=3&&p.end>this.time&&!this.activeAt(alliance,p.end+.001);
      return {active,warning,grace:!active&&this.canScore(alliance),transition:this.phase.id==='transition'&&alliance===this.autoWinner};
    }
    setConfig(c){this.config={...this.config,...c};this.roster[this.activeIndex]={...this.config};while(this.inventory>this.config.capacity){this.inventory--;this.balls.push(ball(this.robot.x,this.robot.y));}this.resolveRobot();this.updatePose();}
    saveActive(){const entry=this.fleet[this.activeIndex];entry.config={...this.config};entry.inventory=this.inventory;entry.robot=this.robot;}
    switchRobot(index){
      if(index<0||index>=this.fleet.length||index===this.activeIndex)return;
      this.saveActive();this.activeIndex=index;const entry=this.fleet[index];this.config={...entry.config};this.robot=entry.robot;
      this.inventory=entry.inventory;this.robot.vx=0;this.robot.vy=0;this.robot.omega=0;this.fireClock=0;this.feedBudget=0;this.feedThreshold=1;this.intakeClock=0;this.score=this.scores[this.config.alliance];
    }
    addRobot(config){
      if(this.started||this.roster.length>=6)return false;
      const alliance=config.alliance||'blue';if(this.roster.filter(r=>r.alliance===alliance).length>=3)return false;
      this.saveActive();this.roster.push({...base,...config});this.activeIndex=this.roster.length-1;this.reset();return true;
    }
    removeRobot(index){
      if(this.started||this.roster.length<=1||index<0||index>=this.roster.length)return false;
      this.roster.splice(index,1);this.activeIndex=Math.min(this.activeIndex,this.roster.length-1);this.reset();return true;
    }
    get parked(){return this.fleet.filter((r,i)=>i!==this.activeIndex);}
    resolveRobot(){
      const r=this.robot,c=this.config,ex=Math.abs(Math.cos(r.a))*c.length/2+Math.abs(Math.sin(r.a))*c.width/2,
        ey=Math.abs(Math.sin(r.a))*c.length/2+Math.abs(Math.cos(r.a))*c.width/2;
      r.x=clamp(r.x,ex,W-ex);r.y=clamp(r.y,ey,H-ey);
      const obstacles=[...solids,...this.parked.map(p=>({x:p.robot.x,y:p.robot.y,width:p.config.length,depth:p.config.width,a:p.robot.a}))];
      if(c.height+r.z>FIELD.trenchClearance)for(const t of trenches)obstacles.push({...t,height:1.022});
      for(let i=0;i<3;i++)for(const b of obstacles){if(b.height!==undefined&&(r.z>=b.height||r.z+c.height<=(b.bottom||0)))continue;const hit=rectangleContact(r,c.length,c.width,b);if(!hit)continue;
        r.x+=hit.nx*(hit.depth+.00001);r.y+=hit.ny*(hit.depth+.00001);const v=r.vx*hit.nx+r.vy*hit.ny;
        if(v<0){r.vx-=v*hit.nx;r.vy-=v*hit.ny;}}
    }
    updatePose(dt=0){const r=this.robot,c=this.config,ca=Math.cos(r.a),sa=Math.sin(r.a),l=c.length*.34,w=c.width*.34;
      const fl=terrainHeight(r.x+ca*l-sa*w,r.y+sa*l+ca*w),fr=terrainHeight(r.x+ca*l+sa*w,r.y+sa*l-ca*w),
        bl=terrainHeight(r.x-ca*l-sa*w,r.y-sa*l+ca*w),br=terrainHeight(r.x-ca*l+sa*w,r.y-sa*l-ca*w);
      const height=(fl+fr+bl+br)/4,pitch=Math.atan2((fl+fr-bl-br)/2,2*l),roll=Math.atan2((fl+bl-fr-br)/2,2*w);
      // Follow the wheel heights quickly enough to stay grounded at full driving speed.
      const alpha=dt>0?1-Math.exp(-32*dt):1;
      r.z+=(height-r.z)*alpha;r.pitch+=(pitch-r.pitch)*alpha;r.roll+=(roll-r.roll)*alpha;
    }
    fire(limit=Infinity){
      if(!this.inventory||this.fireStatus==='ALIGNING CHASSIS')return 0;
      const r=this.robot,c=this.config,{target:h,passing,flight:t,reach:d}=this.shotSolution;
      const launch=r.z+c.height-.05,speed=Math.hypot(r.vx,r.vy);
      const accuracy=(c.stationary+(c.moving-c.stationary)*clamp(speed/c.maxSpeed,0,1))/100;
      const sigma=(passing?.06:.025)+(1-accuracy)*(passing?.45:1.1)+Math.abs(r.pitch)*.3;
      const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-8,this.random())))*Math.cos(2*Math.PI*this.random());
      const lanes=c.archetype==='dumper'?Math.max(1,Math.round(c.lanes||1)):1,count=Math.min(lanes,this.inventory,limit);
      const startLane=limit===1&&lanes>1?Math.floor(this.random()*lanes):0;
      for(let i=0;i<count;i++){
        const lane=(startLane+i)%lanes;
        const offset=laneOffset(lane,lanes,c.width);
        const ox=r.x-Math.sin(r.a)*offset,oy=r.y+Math.cos(r.a)*offset;
        const ex=gaussian()*sigma*(.7+d/5),ey=gaussian()*sigma*(.7+d/5);
        let vx=(h.x-ox+ex)/t,vy=(h.y-oy+ey)/t;
        if(!c.autoAim||c.archetype==='dumper'){
          const magnitude=Math.hypot(h.x-r.x-r.vx*t,h.y-r.y-r.vy*t)/t;
          vx=Math.cos(r.a)*magnitude+r.vx+ex/t;vy=Math.sin(r.a)*magnitude+r.vy+ey/t;
        }
        // 0% SOTM means a moving scoring shot cannot land in the hub opening.
        // Passing still works; once stopped, the normal stationary spread applies.
        if(!passing&&c.moving===0&&speed>.15){
          const dx=ox+vx*t-h.x,dy=oy+vy*t-h.y,miss=Math.hypot(dx,dy),margin=FIELD.openingRadius+BR+.25;
          if(miss<margin){const nx=miss>1e-6?dx/miss:1,ny=miss>1e-6?dy/miss:0;
            vx+=(margin-miss)*nx/t;vy+=(margin-miss)*ny/t;}
        }
        this.balls.push({...ball(ox,oy,launch),vx,vy,vz:(h.z-launch+.5*G*t*t)/t,
          shot:!passing,pass:passing,shooter:c.alliance,eligible:!passing,launchTime:this.time,lane});
        this.inventory--;if(passing)this.passed++;else this.fired++;
      }
      return count;
    }
    processHub(b,h){
      if(b.shot&&!b.checked)this.resolved++;
      this.made+=b.shot?1:0;
      const credit=b.shot&&b.eligible&&b.shooter===h.alliance&&this.canScore(h.alliance);
      if(credit){this.scores[h.alliance]++;if(this.time<23)this.autoScores[h.alliance]++;this.score=this.scores[this.config.alliance];}
      else if(b.shot)this.inactiveMade++;
      this.pending.push({alliance:h.alliance,release:this.time+.6+this.random()*.4,exit:Math.floor(this.random()*4)});
      this.flashes.push({x:h.x,y:h.y,life:.7,scored:credit});
    }
    releaseFuel(){
      const remain=[];
      for(const p of this.pending){if(p.release>this.time){remain.push(p);continue;}
        const h=hubs.find(h=>h.alliance===p.alliance),direction=h.alliance==='blue'?1:-1;
        const sideOffsets=[-.42,-.14,.14,.42],angle=[-.42,-.15,.15,.42][p.exit]+(this.random()-.5)*.18;
        const speed=2.5+this.random()*1.25;
        this.balls.push({...ball(h.x+direction*(FIELD.hubSize/2+.09),h.y+sideOffsets[p.exit],.23),
          vx:direction*Math.cos(angle)*speed,vy:Math.sin(angle)*speed,vz:.5+this.random()*.5});this.recycled++;
      }
      this.pending=remain;
    }
    drive(dt,input){
      const c=this.config,r=this.robot;let x=input.moveX??((input.right?1:0)-(input.left?1:0)),
        y=input.moveY??((input.down?1:0)-(input.up?1:0));
      let turn=clamp(((input.clockwise?1:0)-(input.counterclockwise?1:0))+(input.turnAxis||0),-1,1);
      if(c.drive==='tank'){turn=clamp(turn+(input.right?1:0)-(input.left?1:0)+(input.tankTurn||0),-1,1);const f=clamp(input.forward??((input.up?1:0)-(input.down?1:0)),-1,1);x=Math.cos(r.a)*f;y=Math.sin(r.a)*f;}
      r.omega=turn*3.6;r.a+=r.omega*dt;const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}
      // Shooting and passing limit drive speed to 30% while fuel is available.
      r.shootingSpeedLimited=!!input.shoot&&this.inventory>0;
      const max=c.maxSpeed*(r.shootingSpeedLimited?.3:1);
      // Brake into the lower shooting limit, and when the stick is neutral.
      const braking=Math.max(12,c.acceleration*3);
      const slowingForShot=r.shootingSpeedLimited&&Math.hypot(r.vx,r.vy)>max;
      let dx=x*max-r.vx,dy=y*max-r.vy,delta=Math.hypot(dx,dy),step=(len>0&&!slowingForShot?c.acceleration:braking)*dt;
      if(delta>step){dx*=step/delta;dy*=step/delta;}r.vx+=dx;r.vy+=dy;r.x+=r.vx*dt;r.y+=r.vy*dt;
      this.resolveRobot();this.updatePose(dt);
    }
    collideBallBox(b,box){
      const bottom=box.bottom||0;if(b.z-BR>box.height||b.z+BR<bottom)return;
      const closestX=clamp(b.x,box.x-box.width/2,box.x+box.width/2),closestY=clamp(b.y,box.y-box.depth/2,box.y+box.depth/2),closestZ=clamp(b.z,bottom,box.height);
      let dx=b.x-closestX,dy=b.y-closestY,dz=b.z-closestZ,d=Math.hypot(dx,dy,dz);if(d>=BR)return;
      if(d<1e-7){
        const faces=[{d:b.x-box.x+box.width/2,nx:-1,ny:0,nz:0},{d:box.x+box.width/2-b.x,nx:1,ny:0,nz:0},
          {d:b.y-box.y+box.depth/2,nx:0,ny:-1,nz:0},{d:box.y+box.depth/2-b.y,nx:0,ny:1,nz:0},{d:box.height-b.z,nx:0,ny:0,nz:1}];
        if(bottom>BR)faces.push({d:b.z-bottom,nx:0,ny:0,nz:-1});
        faces.sort((a,b)=>a.d-b.d);const n=faces[0];b.x+=n.nx*(BR+n.d);b.y+=n.ny*(BR+n.d);b.z+=n.nz*(BR+n.d);dx=n.nx;dy=n.ny;dz=n.nz;d=1;
      }else{b.x+=dx/d*(BR-d);b.y+=dy/d*(BR-d);b.z+=dz/d*(BR-d);}
      const nx=dx/d,ny=dy/d,nz=dz/d,v=b.vx*nx+b.vy*ny+b.vz*nz;
      if(v<0){b.vx-=1.4*v*nx;b.vy-=1.4*v*ny;b.vz-=1.4*v*nz;}
    }
    collideHubRim(b,h){
      // A tube around the opening lets glancing shots visibly rebound instead of vanishing.
      const dz=b.z-FIELD.hubHeight,contact=BR+.025;
      if(Math.abs(dz)>contact)return;
      const dx=b.x-h.x,dy=b.y-h.y,r=Math.hypot(dx,dy);if(r<1e-8)return;
      const radial=r-FIELD.openingRadius,dist=Math.hypot(radial,dz);if(dist>=contact)return;
      const nr=dist>1e-8?radial/dist:0,nz=dist>1e-8?dz/dist:1,nx=dx/r*nr,ny=dy/r*nr;
      const penetration=contact-dist;b.x+=nx*penetration;b.y+=ny*penetration;b.z+=nz*penetration;
      const vn=b.vx*nx+b.vy*ny+b.vz*nz;if(vn<0){b.vx-=1.55*vn*nx;b.vy-=1.55*vn*ny;b.vz-=1.55*vn*nz;}
    }
    collideHubFunnel(b,h){
      // Cone wall directs balls inward but can bounce them back over the lip.
      const bottom=FIELD.hubHeight-.35,slope=(FIELD.openingRadius-.30)/.35;
      if(b.z>FIELD.hubHeight+BR){b.hubInside=null;return;}
      if(b.z<bottom-.08)return;
      const dx=b.x-h.x,dy=b.y-h.y,r=Math.hypot(dx,dy);if(r<1e-8)return;
      const radius=.30+slope*clamp(b.z-bottom,0,.35),allowed=radius-BR*Math.sqrt(1+slope*slope);
      if(r<=allowed)return;
      const push=(r-allowed)/(1+slope*slope),nx=dx/r,ny=dy/r;
      b.x-=nx*push;b.y-=ny*push;b.z+=slope*push;
      const norm=Math.sqrt(1+slope*slope),vx=-nx/norm,vy=-ny/norm,vz=slope/norm;
      const vn=b.vx*vx+b.vy*vy+b.vz*vz;if(vn<0){b.vx-=1.45*vn*vx;b.vy-=1.45*vn*vy;b.vz-=1.45*vn*vz;}
    }
    collideFuel(){
      // Spatial hash keeps dense starting piles and recycled fuel from passing through one another.
      const cell=BR*2,buckets=new Map(),hash=(ix,iy,iz)=>((ix+512)*1024+iy+512)*1024+iz+512;
      for(let i=0;i<this.balls.length;i++){const b=this.balls[i],ix=Math.floor(b.x/cell),iy=Math.floor(b.y/cell),iz=Math.floor(b.z/cell);
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
          const bucket=buckets.get(hash(ix+dx,iy+dy,iz+dz));if(!bucket)continue;
          for(const j of bucket){const o=this.balls[j],xx=b.x-o.x,yy=b.y-o.y,zz=b.z-o.z,d=Math.hypot(xx,yy,zz);
            if(d>=cell)continue;const nx=d?xx/d:1,ny=d?yy/d:0,nz=d?zz/d:0,overlap=(cell-d)*.5;
            b.x+=nx*overlap;b.y+=ny*overlap;b.z+=nz*overlap;o.x-=nx*overlap;o.y-=ny*overlap;o.z-=nz*overlap;
            const relative=(b.vx-o.vx)*nx+(b.vy-o.vy)*ny+(b.vz-o.vz)*nz;
            if(relative<0){const impulse=-relative*.65;b.vx+=nx*impulse;b.vy+=ny*impulse;b.vz+=nz*impulse;o.vx-=nx*impulse;o.vy-=ny*impulse;o.vz-=nz*impulse;}
          }
        }
        const key=hash(ix,iy,iz);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);
      }
    }
    step(dt,input={}){
      if(!this.running||this.phase.id==='finished')return;
      // Limit relative travel per contact step to well below one fuel diameter.
      // At fast launch/feed rates this prevents fuel skipping through balls, walls or intakes.
      let fastest=Math.hypot(this.robot.vx,this.robot.vy)+this.config.maxSpeed;
      for(const b of this.balls)fastest=Math.max(fastest,Math.hypot(b.vx,b.vy,b.vz));
      const count=Math.max(1,Math.ceil(dt/(1/120)),Math.ceil(fastest*dt/(BR*.55)));
      for(let i=0;i<count;i++)this.substep(dt/count,input);
    }
    substep(dt,input={}){
      if(!this.running||this.phase.id==='finished')return;
      const oldTime=this.time;this.time=Math.min(166,this.time+dt);
      if(oldTime<23&&this.time>=23-1e-8)this.autoWinner=this.autoScores.blue===this.autoScores.red?this.tieChoice:
        this.autoScores.blue>this.autoScores.red?'blue':'red';
      const c=this.config,r=this.robot,auto=this.time<20;
      const control=this.controlsEnabled?input:{};
      if(this.controlsEnabled)this.drive(dt,control);else{r.vx=0;r.vy=0;r.omega=0;r.shootingSpeedLimited=false;}
      this.fireClock=Math.max(0,this.fireClock-dt);this.intakeClock=Math.max(-dt,this.intakeClock-dt);
      const wantsFire=control.shoot;
      if(wantsFire&&c.archetype==='dumper'&&c.autoAim&&!control.clockwise&&!control.counterclockwise&&Math.abs(control.turnAxis||0)<.01&&Math.abs(control.tankTurn||0)<.01){
        const error=Math.atan2(Math.sin(this.aimAngle-r.a),Math.cos(this.aimAngle-r.a));
        const rotation=clamp(error,-12*dt,12*dt);r.a+=rotation;r.omega=rotation/dt;this.resolveRobot();this.updatePose(dt);
      }
      // The configured rate is the average total output across all lanes. Dumpers
      // emit individual balls with ±15% interval variation instead of synchronized volleys.
      this.feedBudget=wantsFire?Math.min(1.5,this.feedBudget+dt*c.feedRate):0;
      if(wantsFire&&this.inventory&&this.feedBudget+1e-8>=this.feedThreshold){
        const released=this.fire(1);
        if(released){this.feedBudget=Math.max(0,this.feedBudget-this.feedThreshold);
          this.feedThreshold=c.archetype==='dumper'?.85+this.random()*.3:1;}
      }
      this.releaseFuel();const kept=[];
      for(const b of this.balls){
        const old={x:b.x,y:b.y,z:b.z};b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.vz-=G*dt;
        for(const hub of hubs)this.collideHubRim(b,hub);
        if(!b.hubInside&&b.vz<0&&old.z>=FIELD.hubHeight&&b.z<FIELD.hubHeight){
          const f=(old.z-FIELD.hubHeight)/(old.z-b.z),px=old.x+(b.x-old.x)*f,py=old.y+(b.y-old.y)*f;
          const hub=hubs.find(h=>Math.hypot(px-h.x,py-h.y)<FIELD.openingRadius-BR);
          if(hub)b.hubInside=hub.alliance;
        }
        if(b.hubInside){
          const hub=hubs.find(h=>h.alliance===b.hubInside);
          this.collideHubFunnel(b,hub);
          // Count only once the ball reaches the sensor, not when it touches the rim.
          if(b.hubInside&&b.z<=FIELD.hubHeight-.32&&b.vz<0){this.processHub(b,hub);continue;}
        }
        const floor=terrainHeight(b.x,b.y)+BR;
        if(b.z<=floor){const impact=Math.max(0,-b.vz);if(impact>1){const grip=Math.max(.25,1-impact*.065);b.vx*=grip;b.vy*=grip;}b.z=floor;b.vz=Math.abs(b.vz)>.8?-b.vz*.35:0;b.vx*=Math.exp(-1.15*dt);b.vy*=Math.exp(-1.15*dt);
          if(floor>BR+.001){const eps=.005;b.vx-=G*(terrainHeight(b.x+eps,b.y)-terrainHeight(b.x-eps,b.y))/(2*eps)*dt;}
          if(b.shot){if(!b.checked)this.resolved++;b.shot=false;b.checked=true;}}
        if(b.x<BR||b.x>W-BR){b.x=clamp(b.x,BR,W-BR);b.vx*=-.55;}
        if(b.y<BR||b.y>H-BR){b.y=clamp(b.y,BR,H-BR);b.vy*=-.55;}
        for(const box of solids)if(!(box.hub&&box.alliance===b.hubInside))this.collideBallBox(b,box);
        // Trench overhangs block airborne fuel and tall chassis; the low lane stays open.
        for(const tr of trenches)if(b.z>FIELD.trenchClearance&&b.z<.69&&Math.abs(b.x-tr.x)<tr.width/2&&Math.abs(b.y-tr.y)<tr.depth/2){
          b.z=b.vz>0?FIELD.trenchClearance-BR:.69+BR;b.vz*=-.35;}
        if(b.z<r.z+c.height&&(b.launchTime===undefined||this.time-b.launchTime>.15)){const ca=Math.cos(r.a),sa=Math.sin(r.a),dx=b.x-r.x,dy=b.y-r.y,
          forward=dx*ca+dy*sa,side=-dx*sa+dy*ca;
          if(this.controlsEnabled&&this.intake&&this.inventory<c.capacity&&this.intakeClock<=1e-8&&
            b.z<r.z+.3&&forward>c.length/2-.1&&forward<c.length/2+.3&&Math.abs(side)<c.width/2+.04){
            this.inventory++;this.intakeClock+=1/c.intakeRate;continue;}
          // Resolve in the moving contact frame; add its velocity back exactly once.
          const pointVx=r.vx-r.omega*dy,pointVy=r.vy+r.omega*dx;
          const rvx=b.vx-pointVx,rvy=b.vy-pointVy;
          const local={...b,x:forward,y:side,vx:rvx*ca+rvy*sa,vy:-rvx*sa+rvy*ca};
          const beforeX=local.x,beforeY=local.y,beforeZ=local.z;this.collideBallBox(local,{x:0,y:0,width:c.length,depth:c.width,height:r.z+c.height});
          if(local.x!==beforeX||local.y!==beforeY||local.z!==beforeZ){b.z=local.z;b.vz=local.vz;b.x=r.x+local.x*ca-local.y*sa;b.y=r.y+local.x*sa+local.y*ca;
            b.vx=local.vx*ca-local.vy*sa+pointVx;b.vy=local.vx*sa+local.vy*ca+pointVy;}
        }
        for(const parked of this.parked){
          const pr=parked.robot,pc=parked.config;if(b.z>=pr.z+pc.height)continue;
          const co=Math.cos(pr.a),si=Math.sin(pr.a),dx=b.x-pr.x,dy=b.y-pr.y;
          const local={...b,x:dx*co+dy*si,y:-dx*si+dy*co,vx:b.vx*co+b.vy*si,vy:-b.vx*si+b.vy*co};
          this.collideBallBox(local,{x:0,y:0,width:pc.length,depth:pc.width,height:pr.z+pc.height});
          b.z=local.z;b.vz=local.vz;b.x=pr.x+local.x*co-local.y*si;b.y=pr.y+local.x*si+local.y*co;b.vx=local.vx*co-local.vy*si;b.vy=local.vx*si+local.vy*co;
        }
        kept.push(b);
      }
      this.balls=kept;this.collideFuel();
      // Contact correction may move a resting ball slightly below carpet or outside a wall.
      for(const b of this.balls){b.x=clamp(b.x,BR,W-BR);b.y=clamp(b.y,BR,H-BR);b.z=Math.max(BR+terrainHeight(b.x,b.y),b.z);}
      for(const f of this.flashes)f.life-=dt;this.flashes=this.flashes.filter(f=>f.life>0);
      if(this.time>=166){this.running=false;r.vx=0;r.vy=0;}
    }
  }
  root.FieldPhysics={Simulation,base,ARCHETYPES,W,H,hubs,bumps,trenches,solids,towers,TOWER,FIELD,PHASES,BR,clamp,canUseTrench,startingLocations,laneOffset,ball,phaseAt,terrainHeight,rectangleContact};
  if(typeof module!=='undefined')module.exports=root.FieldPhysics;
})(globalThis);
