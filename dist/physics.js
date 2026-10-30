/* Meter/second units, fixed 120 Hz integration. Intentionally simplified practice physics. */
(function(root){
const W=16.54,H=8.07,G=9.81,BR=.075;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const base={maxSpeed:4.5,acceleration:6,width:.85,length:.9,intakeRate:5,feedRate:6,capacity:30,stationary:92,moving:65,drive:'swerve',alliance:'blue',autoAim:true,team:'341'};
const hubs=[{x:4.5,y:H/2,r:.67,alliance:'blue'},{x:W-4.5,y:H/2,r:.67,alliance:'red'}];
function ball(x,y){return {x,y,z:BR,vx:0,vy:0,vz:0,shot:false,checked:false,trail:[]};}
class Simulation{
 constructor(config={}){this.config={...base,...config};this.reset();}
 reset(){this.robot={x:this.config.alliance==='blue'?2.1:W-2.1,y:H/2,a:this.config.alliance==='blue'?0:Math.PI,vx:0,vy:0};this.inventory=Math.min(8,this.config.capacity);this.score=0;this.fired=0;this.resolved=0;this.time=0;this.intake=true;this.intakeClock=0;this.fireClock=0;this.balls=[];this.flashes=[];for(let i=0;i<100;i++)this.balls.push(ball(6.3+Math.random()*3.9,.45+Math.random()*(H-.9)));for(let side of [1,-1])for(let i=0;i<20;i++)this.balls.push(ball(side===1?1.1+Math.random()*1.8:W-2.9+Math.random()*1.8,.7+Math.random()*1.25));}
 get target(){return hubs.find(h=>h.alliance===this.config.alliance);}
 get radius(){return Math.hypot(this.config.width,this.config.length)/2;}
 setConfig(c){this.config={...this.config,...c};while(this.inventory>this.config.capacity){this.inventory--;this.balls.push(ball(this.robot.x,this.robot.y));}this.resolveRobot();}
 resolveRobot(){let r=this.robot,rad=this.radius;r.x=clamp(r.x,rad,W-rad);r.y=clamp(r.y,rad,H-rad);for(let h of hubs){let dx=r.x-h.x,dy=r.y-h.y,d=Math.hypot(dx,dy),limit=h.r+rad;if(d<limit){let nx=d?dx/d:1,ny=d?dy/d:0;r.x=h.x+nx*limit;r.y=h.y+ny*limit;let dot=r.vx*nx+r.vy*ny;if(dot<0){r.vx-=dot*nx;r.vy-=dot*ny;}}}}
 fire(){if(!this.inventory)return;const r=this.robot,c=this.config,h=this.target;let d=Math.hypot(h.x-r.x,h.y-r.y),t=clamp(d/5,.75,1.7),speed=Math.hypot(r.vx,r.vy);let accuracy=(c.stationary+(c.moving-c.stationary)*clamp(speed/c.maxSpeed,0,1))/100;let sigma=.025+(1-accuracy)*1.1;let gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-8,Math.random())))*Math.cos(2*Math.PI*Math.random());let ex=gaussian()*sigma*(.7+d/5),ey=gaussian()*sigma*(.7+d/5);let vx=(h.x-r.x+ex)/t,vy=(h.y-r.y+ey)/t;if(!c.autoAim){const magnitude=d/t;vx=Math.cos(r.a)*magnitude+r.vx;vy=Math.sin(r.a)*magnitude+r.vy;}const b=ball(r.x,r.y);Object.assign(b,{z:.65,vx,vy,vz:(1.8-.65+.5*G*t*t)/t,shot:true,checked:false});this.balls.push(b);this.inventory--;this.fired++;}
 step(dt,input={}){this.time+=dt;const c=this.config,r=this.robot;let x=(input.right?1:0)-(input.left?1:0),y=(input.down?1:0)-(input.up?1:0);let turn=(input.clockwise?1:0)-(input.counterclockwise?1:0);if(c.drive==='tank'){turn+=x;let forward=-y;x=Math.cos(r.a)*forward;y=Math.sin(r.a)*forward;}r.a+=turn*3.6*dt;let len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}let bump=hubs.some(h=>Math.abs(r.x-h.x)<.55&&Math.abs(r.y-h.y)>.9&&Math.abs(r.y-h.y)<2.65);let max=c.maxSpeed*(bump?.5:1);let dx=x*max-r.vx,dy=y*max-r.vy,delta=Math.hypot(dx,dy),step=c.acceleration*dt;if(delta>step){dx*=step/delta;dy*=step/delta;}r.vx+=dx;r.vy+=dy;r.x+=r.vx*dt;r.y+=r.vy*dt;this.resolveRobot();this.fireClock=Math.max(0,this.fireClock-dt);this.intakeClock=Math.max(0,this.intakeClock-dt);if(input.shoot&&this.fireClock===0&&this.inventory){this.fire();this.fireClock=1/c.feedRate;}
 let kept=[];for(let b of this.balls){const oldZ=b.z;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.vz-=G*dt;
 if(b.shot&&!b.checked&&b.vz<0&&oldZ>=1.8&&b.z<1.8){b.checked=true;this.resolved++;let h=this.target;if(Math.hypot(b.x-h.x,b.y-h.y)<.48){this.score++;this.flashes.push({x:h.x,y:h.y,life:.7});continue;}}
 if(b.z<=BR){b.z=BR;b.vz=Math.abs(b.vz)>.8?-b.vz*.38:0;b.vx*=Math.exp(-2.2*dt);b.vy*=Math.exp(-2.2*dt);if(b.shot){if(!b.checked)this.resolved++;b.shot=false;b.checked=true;}}
 if(b.x<BR||b.x>W-BR){b.x=clamp(b.x,BR,W-BR);b.vx*=-.6;}if(b.y<BR||b.y>H-BR){b.y=clamp(b.y,BR,H-BR);b.vy*=-.6;}
 if(b.z<.65){for(let h of hubs){let dx=b.x-h.x,dy=b.y-h.y,d=Math.hypot(dx,dy),limit=h.r+BR;if(d<limit){let nx=d?dx/d:1,ny=d?dy/d:0;b.x=h.x+nx*limit;b.y=h.y+ny*limit;let dot=b.vx*nx+b.vy*ny;if(dot<0){b.vx-=1.6*dot*nx;b.vy-=1.6*dot*ny;}}}
 let dx=b.x-r.x,dy=b.y-r.y,d=Math.hypot(dx,dy),forward=dx*Math.cos(r.a)+dy*Math.sin(r.a),side=-dx*Math.sin(r.a)+dy*Math.cos(r.a);if(this.intake&&this.inventory<c.capacity&&this.intakeClock===0&&forward>0&&forward<c.length/2+.42&&Math.abs(side)<c.width/2+.12){this.inventory++;this.intakeClock=1/c.intakeRate;continue;}if(d<this.radius+BR){let nx=d?dx/d:1,ny=d?dy/d:0;b.x=r.x+nx*(this.radius+BR);b.y=r.y+ny*(this.radius+BR);let closing=(r.vx-b.vx)*nx+(r.vy-b.vy)*ny;if(closing>0){b.vx+=closing*1.4*nx;b.vy+=closing*1.4*ny;}}}
 kept.push(b);}this.balls=kept;for(let f of this.flashes)f.life-=dt;this.flashes=this.flashes.filter(f=>f.life>0);
 }
}
root.FieldPhysics={Simulation,base,W,H,hubs,BR,clamp};if(typeof module!=='undefined')module.exports=root.FieldPhysics;
})(globalThis);
