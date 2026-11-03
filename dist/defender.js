// The opponent uses ordinary driver inputs, acceleration and bumper physics.
export function defenderInput(sim, difficulty='medium') {
  const defender=sim.fleet[1], player=sim.fleet[0].robot, r=defender.robot;
  const hard=difficulty==='hard', easy=difficulty==='easy';
  const speed=easy?.40:hard?1:.58;
  const driveTo=(x,y,intake=hard)=>{
    const dx=x-r.x,dy=y-r.y,distance=Math.hypot(dx,dy);
    if(distance<.12)return {};
    const angle=Math.atan2(dy,dx),error=Math.atan2(Math.sin(angle-r.a),Math.cos(angle-r.a));
    return {moveX:dx/distance*speed,moveY:dy/distance*speed,turnAxis:Math.max(-1,Math.min(1,error*1.5)),intake};
  };
  const red=defender.config.alliance==='red',home=red?r.x>=16.54-4.03:r.x<=4.03;
  // AUTO is driver-controlled for the player; the opponent never defends then.
  // While its hub is active it returns home and fires its available fuel.
  if(sim.phase.id==='auto'||sim.activeAt(defender.config.alliance)){
    if(defender.inventory>0){
      if(home)return {shoot:true};
      const x=red?16.54-4.03+.7:4.03-.7;
      return driveTo(x,r.y<8.07/2?1.0:8.07-1.0);
    }
    // Refuel only from nearby loose balls in our own alliance zone.
    const ball=sim.balls.filter(b=>!b.shot&&!b.hubInside&&b.z<.3&&(red?b.x>=16.54-4.03:b.x<=4.03))
      .reduce((best,b)=>!best||Math.hypot(b.x-r.x,b.y-r.y)<Math.hypot(best.x-r.x,best.y-r.y)?b:best,null);
    return ball?driveTo(ball.x,ball.y,true):{};
  }
  const distance=Math.hypot(player.x-r.x,player.y-r.y),lead=easy?0:Math.min(hard?.7:.16,distance/(hard?6:12));
  return driveTo(player.x+player.vx*lead,player.y+player.vy*lead);
}
