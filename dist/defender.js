// Scoring uses full drive speed; defense keeps its established difficulty tuning.
const scoringState=new WeakMap();
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
  const scoring=sim.phase.id==='auto'||sim.activeAt(defender.config.alliance);
  if(scoring){
    let states=scoringState.get(sim);if(!states){states=new Map();scoringState.set(sim,states);}
    let state=states.get(botIndex);
    if(!state||sim.time<state.lastTime){state={collecting:false,since:sim.time,target:null,blocked:new WeakMap(),lane:null,routeHome:null};states.set(botIndex,state);}
    state.lastTime=sim.time;
    if(defender.inventory===0&&!state.collecting){state.collecting=true;state.since=sim.time;state.target=null;}
    // Fill the hopper before shooting; leave time to score before the shift ends.
    if(state.collecting&&(defender.inventory>=defender.config.capacity||(defender.inventory>0&&Number.isFinite(sim.phaseRemaining)&&sim.phaseRemaining<=5))){state.collecting=false;state.target=null;state.lane=null;}
    const crossTrench=(towardHome)=>{
      if(state.lane===null||state.routeHome!==towardHome){state.lane=r.y<8.07/2?.69:8.07-.69;state.routeHome=towardHome;}
      const lane=state.lane;
      const neutral=red?16.54-4.03-1.8:4.03+1.8;
      const inside=red?16.54-4.03+.9:4.03-.9;
      const before=towardHome?neutral:inside,after=towardHome?inside:neutral;
      if(Math.abs(r.y-lane)>.12)return driveTo(before,lane,true,1);
      return driveTo(after,lane,true,1);
    };
    if(!state.collecting&&defender.inventory>0){
      if(!home)return crossTrench(true);
      return {shoot:true};
    }
    // Seek loose fuel in home or the neutral zone, staying on our side of
    // the center line during AUTO to avoid G403.
    const centerSafe=defender.config.length/2+.1;
    const eligible=b=>!b.shot&&!b.hubInside&&b.z<.3&&
      (red?b.x>=4.03:b.x<=16.54-4.03)&&
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
      if(home!==ballHome)return crossTrench(ballHome);
      state.lane=null;
      return driveTo(ball.x,ball.y,true,1,true);
    }
    if(defender.inventory){state.collecting=false;return home?{shoot:true}:crossTrench(true);}
    return {};
  }
  const distance=Math.hypot(player.x-r.x,player.y-r.y),lead=easy?0:Math.min(hard?.7:.16,distance/(hard?6:12));
  return driveTo(player.x+player.vx*lead,player.y+player.vy*lead);
}
