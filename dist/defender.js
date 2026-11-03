// Scoring uses full drive speed; defense keeps its established difficulty tuning.
export const defenderTeam=difficulty=>difficulty==='hard'?'316':'2539';
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
    // Hard mode batches sizable loads for faster cycles and leaves time to return
    // before its five-second early switch to defense; other levels fill fully.
    if(state.collecting&&(defender.inventory>=(hard?Math.min(defender.config.capacity,30):defender.config.capacity)||(defender.inventory>0&&Number.isFinite(sim.phaseRemaining)&&sim.phaseRemaining<=(hard&&sim.phase.shift?9:4)))){state.collecting=false;state.target=null;state.lane=null;}
    // Cross the entire structure before re-planning. Crossing the alliance-line
    // alone does not mean the back of the chassis has cleared the divider.
    const crossTrench=(towardHome)=>{
      if(!state.route||state.route.towardHome!==towardHome){
        // Select an open crossing. A defending robot in the trench should
        // send us over the adjacent bump rather than into an endless push.
        const lanes=[.69,2.51,8.07-2.51,8.07-.69];
        const hubX=red?16.54-4.03-1.194/2:4.03+1.194/2;
        const lane=lanes.reduce((best,y)=>{
          const cost=v=>Math.abs(r.y-v)+(Math.abs(player.x-hubX)<2&&Math.abs(player.y-v)<1.25?5:0)+(state.avoidLane&&sim.time<state.avoidLane.until&&Math.abs(v-state.avoidLane.y)<.2?8:0)+(v===.69||v===8.07-.69?0:.35);
          return cost(y)<cost(best)?y:best;
        });
        const half=defender.config.length/2+.18;
        const homeEdge=red?16.54-4.03+half:4.03-half;
        const neutralEdge=red?16.54-4.03-1.194-half:4.03+1.194+half;
        state.route={towardHome,lane,entry:towardHome?neutralEdge:homeEdge,exit:towardHome?homeEdge:neutralEdge,lastX:r.x,lastY:r.y,progressAt:sim.time,chosenAt:sim.time};
      }
      const route=state.route,dir=Math.sign(route.exit-route.entry);
      // If contact or a hub corner prevents progress, retreat from the
      // structure before picking another lane. Do not spin inside a trench.
      if(Math.hypot(r.x-route.lastX,r.y-route.lastY)>.28){route.lastX=r.x;route.lastY=r.y;route.progressAt=sim.time;}
      if(sim.time-route.progressAt>1.4){
        const side=r.x<(red?16.54-4.03-1.194/2:4.03+1.194/2)?-1:1;
        state.escape={x:(red?16.54-4.03-1.194/2:4.03+1.194/2)+side*1.65,y:r.y,until:sim.time+2};
        state.avoidLane={y:route.lane,until:sim.time+6};state.route=null;
        return driveTo(state.escape.x,state.escape.y,true,1);
      }
      // A moving defender can cut off a lane after it was selected. Replan
      // while still on the approach side, before entering the narrow crossing.
      const ahead=dir>0?r.x<route.entry+.2:r.x>route.entry-.2;
      if(hard&&ahead&&sim.time-route.chosenAt>.5&&Math.abs(player.x-(route.entry+route.exit)/2)<1.45&&Math.abs(player.y-route.lane)<1.1){
        state.avoidLane={y:route.lane,until:sim.time+3};state.route=null;
        return crossTrench(towardHome);
      }
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
    if(state.escape){
      if(sim.time<state.escape.until&&Math.abs(r.x-state.escape.x)>.2)return driveTo(state.escape.x,state.escape.y,true,1);
      state.escape=null;
    }
    if(state.route){const crossing=crossTrench(state.route.towardHome);if(crossing)return crossing;}
    if(!state.collecting&&defender.inventory>0){
      if(!home){const crossing=crossTrench(true);if(crossing)return crossing;}
      if(hard){
        // If the defender is about to make contact, reposition inside the
        // alliance zone before shooting instead of sitting and being pinned.
        if(state.evade&&(sim.time>state.evade.until||Math.hypot(r.x-state.evade.x,r.y-state.evade.y)<.45))state.evade=null;
        if(!state.evade&&sim.time>(state.evadeCooldown||0)&&Math.hypot(player.x-r.x,player.y-r.y)<1.55){
          const candidates=[2.15,3,5.07,5.92].map(y=>({x:red?14.05:16.54-14.05,y}));
          candidates.sort((a,b)=>(Math.hypot(b.x-player.x,b.y-player.y)-.55*Math.hypot(b.x-r.x,b.y-r.y))-(Math.hypot(a.x-player.x,a.y-player.y)-.55*Math.hypot(a.x-r.x,a.y-r.y)));
          state.evade={...candidates[0],until:sim.time+1.8};state.evadeCooldown=sim.time+3;
        }
        if(state.evade)return driveTo(state.evade.x,state.evade.y,false,1);
      }
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
      // In open carpet, steer around an opponent directly between us and the
      // fuel. Keep the chosen side briefly so the robot does not oscillate.
      if(hard){
        if(state.detour&&(sim.time>state.detour.until||Math.hypot(r.x-state.detour.x,r.y-state.detour.y)<.4))state.detour=null;
        const dx=ball.x-r.x,dy=ball.y-r.y,len=Math.hypot(dx,dy);
        if(!state.detour&&len>.5){
          const px=player.x-r.x,py=player.y-r.y,along=(px*dx+py*dy)/len,cross=(px*dy-py*dx)/len;
          const hubX=red?16.54-4.03-1.194/2:4.03+1.194/2;
          if(along>.1&&along<Math.min(len,2.5)&&Math.abs(cross)<1.15&&Math.abs(r.x-hubX)>1.6&&Math.abs(player.x-hubX)>1.6){
            const nx=-dy/len,ny=dx/len,side=cross>=0?1:-1;
            let x=player.x+nx*side*1.35,y=player.y+ny*side*1.35;
            if(y<.65||y>7.42){x=player.x-nx*side*1.35;y=player.y-ny*side*1.35;}
            state.detour={x:Math.max(.65,Math.min(15.89,x)),y:Math.max(.65,Math.min(7.42,y)),until:sim.time+2};
          }
        }
        if(state.detour)return driveTo(state.detour.x,state.detour.y,true,1);
      }
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
  if(hard&&enemy){
    // Aim at an offset on the near face rather than the center. Bumper contact
    // then applies a realistic turning impulse through the collision model.
    const c=Math.cos(player.a),s=Math.sin(player.a),localX=dx*c+dy*s,localY=-dx*s+dy*c;
    const xFace=Math.abs(localX)/(enemy.length||1)>=Math.abs(localY)/(enemy.width||1);
    const tangent=xFace?{x:-s,y:c}:{x:c,y:s};
    const lateral=xFace?localY:localX;
    let side=Math.abs(lateral)>.08?Math.sign(lateral):(player.y<4.035?1:-1);
    const offset=(xFace?(enemy.width||1):(enemy.length||1))*.38;
    let tx=player.x+player.vx*lead+tangent.x*side*offset,ty=player.y+player.vy*lead+tangent.y*side*offset;
    if(ty<.5||ty>7.57){side=-side;tx=player.x+player.vx*lead+tangent.x*side*offset;ty=player.y+player.vy*lead+tangent.y*side*offset;}
    return driveTo(tx,ty,true,1);
  }
  return driveTo(player.x+player.vx*lead,player.y+player.vy*lead);
}
