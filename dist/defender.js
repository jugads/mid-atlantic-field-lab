// Scoring uses full drive speed; defense keeps its established difficulty tuning.
const scoringState=new WeakMap();
const defenseState=new WeakMap();
export function defenderInput(sim, difficulty='medium', botIndex=1, opponentIndex=0) {
  const defender=sim.fleet[botIndex], player=sim.fleet[opponentIndex].robot, r=defender.robot;
  const hard=difficulty==='hard', easy=difficulty==='easy';
  const defenseSpeed=easy?.40:hard?1:.58;
  const driveTo=(x,y,intake=hard,speed=defenseSpeed,alignIntake=false)=>{
    const dx=x-r.x,dy=y-r.y,distance=Math.hypot(dx,dy);
    if(distance<.08)return {intake};
    const angle=Math.atan2(dy,dx),error=Math.atan2(Math.sin(angle-r.a),Math.cos(angle-r.a));
    // Align the intake before driving into fuel, otherwise swerve motion pushes it away.
    const approach=speed===1?Math.min(1,Math.max(.2,distance*.9)):1;
    const throttle=alignIntake&&Math.abs(error)>.4?0:speed*approach;
    return {moveX:dx/distance*throttle,moveY:dy/distance*throttle,turnAxis:Math.max(-1,Math.min(1,error*1.5)),intake};
  };
  const red=defender.config.alliance==='red',home=red?r.x>=16.54-4.03:r.x<=4.03;
  const leavingEarly=!!sim.phase.shift&&sim.activeAt(defender.config.alliance)&&sim.phaseRemaining<=5;
  const scoring=sim.phase.id==='auto'||(sim.activeAt(defender.config.alliance)&&!leavingEarly);
  if(scoring){
    let states=scoringState.get(sim);if(!states){states=new Map();scoringState.set(sim,states);}
    let state=states.get(botIndex);
    if(!state||sim.time<state.lastTime){state={collecting:false,since:sim.time,target:null,blocked:new WeakMap(),lane:null,routeHome:null,route:null};states.set(botIndex,state);}
    state.lastTime=sim.time;
    if(state.phase!==sim.phase.id){
      state.phase=sim.phase.id;
      state.collecting=defender.inventory<defender.config.capacity&&(!Number.isFinite(sim.phaseRemaining)||sim.phaseRemaining>4);
      state.since=sim.time;state.target=null;state.route=null;state.lane=null;
    }
    if(defender.inventory===0&&!state.collecting){state.collecting=true;state.since=sim.time;state.target=null;}
    // Fill the hopper before shooting; leave time to score before the shift ends.
    if(state.collecting&&(defender.inventory>=defender.config.capacity||(defender.inventory>0&&Number.isFinite(sim.phaseRemaining)&&sim.phaseRemaining<=4))){state.collecting=false;state.target=null;state.lane=null;}
    // Cross the entire structure before re-planning. Crossing the alliance-line
    // alone does not mean the back of the chassis has cleared the divider.
    const crossTrench=(towardHome)=>{
      if(!state.route||state.route.towardHome!==towardHome){
        const lane=r.y<8.07/2?.69:8.07-.69;
        const half=defender.config.length/2+.18;
        const homeEdge=red?16.54-4.03+half:4.03-half;
        const neutralEdge=red?16.54-4.03-1.194-half:4.03+1.194+half;
        state.route={towardHome,lane,entry:towardHome?neutralEdge:homeEdge,exit:towardHome?homeEdge:neutralEdge};
      }
      const route=state.route,dir=Math.sign(route.exit-route.entry);
      const passed=dir>0?r.x>=route.exit-.10:r.x<=route.exit+.10;
      if(passed){state.route=null;return null;}
      // First get fully clear of the hub before strafing into the lane.
      const entryClear=dir>0?r.x<=route.entry+.12:r.x>=route.entry-.12;
      if(!entryClear&&Math.abs(r.y-route.lane)>.13)return driveTo(route.entry,r.y,true,1);
      if(Math.abs(r.y-route.lane)>.13)return driveTo(route.entry,route.lane,true,1);
      // Face straight down the trench before moving, so the corners clear it.
      const angle=dir>0?0:Math.PI,error=Math.atan2(Math.sin(angle-r.a),Math.cos(angle-r.a));
      if(Math.abs(error)>.14)return {turnAxis:Math.max(-1,Math.min(1,error*1.5)),intake:true};
      return {moveX:dir,moveY:Math.max(-.25,Math.min(.25,(route.lane-r.y)*2)),turnAxis:Math.max(-1,Math.min(1,error*1.5)),intake:true};
    };
    if(state.route){const crossing=crossTrench(state.route.towardHome);if(crossing)return crossing;}
    if(!state.collecting&&defender.inventory>0){
      if(!home){const crossing=crossTrench(true);if(crossing)return crossing;}
      return {shoot:true};
    }
    // Seek loose fuel in home or the neutral zone, staying on our side of
    // the center line during AUTO to avoid G403.
    const centerSafe=defender.config.length/2+.1;
    const eligible=b=>!b.shot&&!b.hubInside&&b.z<.3&&
      (red?b.x>=4.03:b.x<=16.54-4.03)&&
      (!Number.isFinite(sim.phaseRemaining)||sim.phaseRemaining>4||(red?b.x>=16.54-4.03:b.x<=4.03))&&
      (sim.phase.id!=='auto'||(red?b.x>=16.54/2+centerSafe:b.x<=16.54/2-centerSafe));
    // Keep pursuing a chosen ball instead of oscillating between nearby targets.
    if(state.target&&(!sim.balls.includes(state.target)||!eligible(state.target)))state.target=null;
    if(state.target&&sim.time-state.targetSince>2.5){
      const distance=Math.hypot(state.target.x-r.x,state.target.y-r.y);
      if(distance>state.targetDistance-.35){state.blocked.set(state.target,sim.time+8);state.target=null;state.lane=null;}
      else{state.targetDistance=distance;state.targetSince=sim.time;}
    }
    if(!state.target){
      // Score nearby clusters by available fuel and travel distance. Spatial
      // buckets make this linear in the number of balls rather than quadratic.
      const cell=1,available=sim.balls.filter(b=>eligible(b)&&(state.blocked.get(b)||0)<=sim.time),buckets=new Map();
      const key=(x,y)=>`${x},${y}`;
      for(const b of available){const x=Math.floor(b.x/cell),y=Math.floor(b.y/cell),k=key(x,y);buckets.set(k,(buckets.get(k)||0)+1);}
      let best=-Infinity,closest=Infinity;
      for(const b of available){const x=Math.floor(b.x/cell),y=Math.floor(b.y/cell);let count=0;
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)count+=buckets.get(key(x+dx,y+dy))||0;
        const distance=Math.hypot(b.x-r.x,b.y-r.y),score=Math.min(defender.config.capacity-defender.inventory,count)/(1+.6*distance);
        if(score>best||(score===best&&distance<closest)){best=score;closest=distance;state.target=b;}}
      state.targetSince=sim.time;state.targetDistance=closest;
    }
    const ball=state.target;
    if(ball){
      const ballHome=red?ball.x>=16.54-4.03:ball.x<=4.03;
      if(home!==ballHome){const crossing=crossTrench(ballHome);if(crossing)return crossing;}
      state.lane=null;
      return driveTo(ball.x,ball.y,true,1,true);
    }
    if(defender.inventory){state.collecting=false;return home?{shoot:true}:(crossTrench(true)||{shoot:true});}
    return {};
  }
  let states=defenseState.get(sim);if(!states){states=new Map();defenseState.set(sim,states);}
  let ds=states.get(botIndex);if(!ds||sim.time<ds.lastTime){ds={lastTime:sim.time,stuckSince:null,backoffUntil:0,bypass:null};states.set(botIndex,ds);}ds.lastTime=sim.time;
  const dx=r.x-player.x,dy=r.y-player.y,distance=Math.hypot(dx,dy)||1;
  const pin=sim.pinCounts?.find(p=>p.attacker===botIndex&&p.victim===opponentIndex);
  if(pin&&pin.elapsed>=2.1)ds.backoffUntil=Math.max(ds.backoffUntil,sim.time+1);
  if(sim.time<ds.backoffUntil)return {moveX:dx/distance,moveY:dy/distance};
  const hubX=player.x<8.27?4.03+1.194/2:16.54-4.03-1.194/2;
  const inTrench=Math.abs(r.x-hubX)<1.3&&(r.y<1.4||r.y>8.07-1.4);
  if(inTrench&&distance<2&&Math.hypot(r.vx,r.vy)<.35){if(ds.stuckSince===null)ds.stuckSince=sim.time;}
  else ds.stuckSince=null;
  if(!ds.bypass&&ds.stuckSince!==null&&sim.time-ds.stuckSince>1.2){
    const side=r.x<hubX?-1:1;ds.bypass={stage:0,entry:hubX+side*1.55,exit:hubX-side*1.55,lane:r.y<8.07/2?2.51:8.07-2.51};ds.stuckSince=null;
  }
  if(ds.bypass){
    const path=ds.bypass;
    if(path.stage===0){if(Math.abs(r.x-path.entry)>.25)return driveTo(path.entry,r.y,false,1);path.stage=1;}
    if(path.stage===1){if(Math.abs(r.y-path.lane)>.25)return driveTo(path.entry,path.lane,false,1);path.stage=2;}
    if(path.stage===2){if(Math.abs(r.x-path.exit)>.3)return driveTo(path.exit,path.lane,false,1);ds.bypass=null;}
  }
  const enemy=sim.fleet[opponentIndex].config;
  const bumpOnly=enemy&&(enemy.height>.5652||enemy.width>1.30);
  if(bumpOnly&&Math.abs(player.x-hubX)<2.7){
    const side=player.y<8.07/2?2.51:8.07-2.51;
    const blockX=hubX+(player.x<8.27?1:-1)*1.1;
    return driveTo(blockX,side,false,.95);
  }
  const lead=easy?0:Math.min(hard?.7:.16,distance/(hard?6:12));
  return driveTo(player.x+player.vx*lead,player.y+player.vy*lead);
}
