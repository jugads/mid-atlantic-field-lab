// Scoring uses full drive speed; defense keeps its established difficulty tuning.
const scoringState=new WeakMap();
export function defenderInput(sim, difficulty='medium') {
  const defender=sim.fleet[1], player=sim.fleet[0].robot, r=defender.robot;
  const hard=difficulty==='hard', easy=difficulty==='easy';
  const defenseSpeed=easy?.40:hard?1:.58;
  const driveTo=(x,y,intake=hard,speed=defenseSpeed,alignIntake=false)=>{
    const dx=x-r.x,dy=y-r.y,distance=Math.hypot(dx,dy);
    if(distance<.08)return {intake};
    const angle=Math.atan2(dy,dx),error=Math.atan2(Math.sin(angle-r.a),Math.cos(angle-r.a));
    // Align the intake before driving into fuel, otherwise swerve motion pushes it away.
    const throttle=alignIntake&&Math.abs(error)>.4?0:speed;
    return {moveX:dx/distance*throttle,moveY:dy/distance*throttle,turnAxis:Math.max(-1,Math.min(1,error*1.5)),intake};
  };
  const red=defender.config.alliance==='red',home=red?r.x>=16.54-4.03:r.x<=4.03;
  const scoring=sim.phase.id==='auto'||sim.activeAt(defender.config.alliance);
  if(scoring){
    let state=scoringState.get(sim);
    if(!state||sim.time<state.lastTime){state={collecting:false,since:sim.time};scoringState.set(sim,state);}
    state.lastTime=sim.time;
    // Returning through an open trench avoids driving directly into the hub.
    if(!home){
      const lane=r.y<8.07/2?.69:8.07-.69;
      const entry=red?16.54-4.03-1.8:4.03+1.8;
      const exit=red?16.54-4.03+.9:4.03-.9;
      if((red?r.x<entry:r.x>entry)&&Math.abs(r.y-lane)>.3)return driveTo(r.x,lane,true,1);
      if(Math.abs(r.y-lane)>.3)return driveTo(entry,lane,true,1);
      return driveTo(exit,lane,true,1);
    }
    if(defender.inventory===0&&!state.collecting){state.collecting=true;state.since=sim.time;}
    if(state.collecting&&(defender.inventory>=Math.min(10,defender.config.capacity)||sim.time-state.since>5&&defender.inventory>0))state.collecting=false;
    if(!state.collecting&&defender.inventory>0)return {shoot:true};
    const ball=sim.balls.filter(b=>!b.shot&&!b.hubInside&&b.z<.3&&(red?b.x>=16.54-4.03:b.x<=4.03))
      .reduce((best,b)=>!best||Math.hypot(b.x-r.x,b.y-r.y)<Math.hypot(best.x-r.x,best.y-r.y)?b:best,null);
    if(ball)return driveTo(ball.x,ball.y,true,1,true);
    return defender.inventory?{shoot:true}:{};
  }
  const distance=Math.hypot(player.x-r.x,player.y-r.y),lead=easy?0:Math.min(hard?.7:.16,distance/(hard?6:12));
  return driveTo(player.x+player.vx*lead,player.y+player.vy*lead);
}
