// Use the same acceleration, obstacle and bumper physics as a human driver.
export function defenderInput(defender, player, difficulty='medium') {
  const dx=player.x-defender.x, dy=player.y-defender.y;
  const distance=Math.hypot(dx,dy);
  const hard=difficulty==='hard', easy=difficulty==='easy';
  const lead=easy?0:Math.min(hard?.7:.35,distance/(hard?6:10));
  const tx=dx+player.vx*lead, ty=dy+player.vy*lead;
  const length=Math.hypot(tx,ty);
  if(length<.01)return {intake:hard};
  const angle=Math.atan2(ty,tx);
  const error=Math.atan2(Math.sin(angle-defender.a),Math.cos(angle-defender.a));
  const speed=easy?.62:hard?1:.83;
  return {moveX:tx/length*speed,moveY:ty/length*speed,turnAxis:Math.max(-1,Math.min(1,error*1.5)),intake:hard};
}
