import * as T from './vendor/three.module.js';
const {W,H,hubs,bumps,trenches,FIELD,TOWER,BR,laneOffset}=globalThis.FieldPhysics;
export class FieldView {
  constructor(canvas){
    this.canvas=canvas;this.mode='follow';this.theta=0;this.phi=.89;this.distance=20;this.zoom=1;
    this.scene=new T.Scene();this.scene.background=new T.Color('#1b1424');
    this.camera=new T.PerspectiveCamera(46,1,.1,120);this.cameraTarget=new T.Vector3();
    try{this.renderer=new T.WebGLRenderer({canvas,antialias:true});}
    catch(error){document.getElementById('hint').textContent='3D needs WebGL. Enable hardware acceleration or try another browser.';throw error;}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.15;
    this.scene.add(new T.HemisphereLight(0xd8edff,0x46503b,2.2));
    const sun=new T.DirectionalLight(0xfff4dc,2.7);sun.position.set(-6,16,6);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-13,right:13,top:10,bottom:-10,near:.1,far:40});
    sun.shadow.bias=-.0005;this.scene.add(sun);this.hubVisuals={};this.buildField();
    this.robot=new T.Group();this.chassis=new T.Group();this.robot.add(this.chassis);this.scene.add(this.robot);this.parkedVisuals=new Map();
    this.fuel=new T.InstancedMesh(new T.SphereGeometry(BR,10,7),this.material('#f3cd38'),600);
    this.fuel.instanceMatrix.setUsage(T.DynamicDrawUsage);this.fuel.castShadow=true;this.fuel.frustumCulled=false;
    this.scene.add(this.fuel);this.fuelMatrix=new T.Matrix4();
    this.aimLine=new T.Line(new T.BufferGeometry(),new T.LineDashedMaterial({color:0xc8a5ff,dashSize:.12,gapSize:.08,transparent:true,opacity:.45}));this.scene.add(this.aimLine);
    this.passMarker=new T.Mesh(new T.RingGeometry(.45,.49,32),new T.MeshBasicMaterial({color:'#f2ce64',side:T.DoubleSide,transparent:true,opacity:.8}));
    this.passMarker.rotation.x=-Math.PI/2;this.scene.add(this.passMarker);
    this.pointer=null;
    canvas.addEventListener('pointerdown',e=>{if(this.mode!=='orbit')return;this.pointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!this.pointer)return;this.theta-=(e.clientX-this.pointer.x)*.006;
      this.phi=Math.max(.25,Math.min(1.45,this.phi+(e.clientY-this.pointer.y)*.005));this.pointer={x:e.clientX,y:e.clientY};});
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,()=>this.pointer=null);
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.6,Math.min(1.6,this.zoom+e.deltaY*.001));},{passive:false});
  }
  material(color,options={}){return new T.MeshStandardMaterial({color,roughness:.8,metalness:.08,...options});}
  box(w,h,d,x,y,z,color,parent=this.scene){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),this.material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  cylinder(rt,rb,h,x,y,z,color,parent=this.scene){const mesh=new T.Mesh(new T.CylinderGeometry(rt,rb,h,24),this.material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  label(value,x,z,color,size=1){const c=document.createElement('canvas');c.width=768;c.height=96;const ctx=c.getContext('2d');ctx.font='600 42px sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(value,384,62);const tex=new T.CanvasTexture(c),mesh=new T.Mesh(new T.PlaneGeometry(size*4,size*.5),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.022,z);this.scene.add(mesh);return mesh;}
  ramp(b){
    const half=b.width/2,depth=b.depth/2,peak=FIELD.bumpHeight,x=b.x-W/2,z=b.y-H/2;
    const shape=new T.Shape();shape.moveTo(-half,0);shape.lineTo(half,0);shape.lineTo(half,0);shape.lineTo(0,peak);shape.lineTo(-half,0);shape.closePath();
    const geometry=new T.ExtrudeGeometry(shape,{depth:b.depth,bevelEnabled:false,steps:1});
    const mesh=new T.Mesh(geometry,this.material(b.alliance==='blue'?'#3d67a9':'#b54843'));
    mesh.position.set(x,0,z-depth);mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);
    // Narrow seams follow the two 15-degree HDPE faces rather than a flat slab.
    for(const side of [-1,1])for(const offset of [-depth+.06,0,depth-.06]){
      const seam=this.box(half,.006,.012,x+side*half/2,peak/2+.012,z+offset,'#aebbb7');seam.rotation.z=-side*Math.atan2(peak-.014,half);
    }
  }
  buildField(){
    this.box(W+.25,.16,H+.25,0,-.13,0,'#201929');this.box(W,.04,H,0,-.03,0,'#48414f');
    this.gridGroup=new T.Group();this.scene.add(this.gridGroup);
    for(let x=-W/2;x<=W/2;x+=.5)this.box(.006,.002,H,x,.001,0,'#514958',this.gridGroup);
    for(let z=-H/2;z<=H/2;z+=.5)this.box(W,.002,.006,0,.001,z,'#514958',this.gridGroup);
    this.box(.05,.008,H,0,.008,0,'#c7cdc5');
    for(const z of [-H/2,H/2]){
      this.box(W+.1,.035,.035,0,.508,z,'#8f9897');const glass=this.box(W,.48,.015,0,.25,z,'#a8bdc6');glass.material.transparent=true;glass.material.opacity=.08;glass.castShadow=false;
      for(let x=-W/2;x<=W/2;x+=1.4)this.box(.025,.5,.025,x,.25,z,'#7b8582');
    }
    for(const x of [-W/2,W/2]){
      this.box(.05,.22,H,x,.11,0,x<0?'#385c90':'#93443f');
      for(const z of [-2.7,0,2.7]){const glass=this.box(.035,1.2,2.3,x,.82,z,'#adb8bd');glass.material.transparent=true;glass.material.opacity=.06;glass.castShadow=false;}
    }
    for(const b of bumps)this.ramp(b);
    for(const tr of trenches){
      const x=tr.x-W/2,z=tr.y-H/2,color=tr.alliance==='blue'?'#4b7ccd':'#ce6157';
      const postZ=(tr.sign<0?FIELD.trenchWidth+.16:H-FIELD.trenchWidth-.16)-H/2;
      this.box(FIELD.hubSize,1.022,.32,x,.511,postZ,color);
      // Open underpass, not a roofed box. Lowest beam surface is exactly 22.25 inches high.
      this.box(.16,.12,FIELD.trenchWidth,x,FIELD.trenchClearance+.06,z,color);
      this.box(.16,FIELD.trenchClearance,.065,x,FIELD.trenchClearance/2,tr.sign*(H/2-.0325),'#b4beb9');
      this.box(FIELD.hubSize,.008,.035,x,.012,z-FIELD.trenchWidth/2+.06,'#c8d4c0');
      this.box(FIELD.hubSize,.008,.035,x,.012,z+FIELD.trenchWidth/2-.06,'#c8d4c0');
      for(const dx of [-.9,.9])this.label('UNDERPASS',x+dx,z,'#d4ddc9',.23);
    }
    for(const h of hubs){
      const x=h.x-W/2,color=h.alliance==='blue'?'#4f81d0':'#d05b52',direction=h.alliance==='blue'?1:-1;
      this.box(.05,.009,H,(h.alliance==='blue'?FIELD.startLine:W-FIELD.startLine)-W/2,.01,0,color);
      this.box(FIELD.hubSize,1.48,FIELD.hubSize,x,.74,0,color);
      // Hexagonal opening, visible funnel, and alliance light strips.
      const funnel=new T.Mesh(new T.CylinderGeometry(FIELD.openingRadius,.28,.35,6,1,true),this.material('#6c7675',{side:T.DoubleSide}));
      funnel.position.set(x,FIELD.hubHeight-.175,0);funnel.rotation.y=Math.PI/6;funnel.castShadow=true;this.scene.add(funnel);
      const ring=new T.Mesh(new T.TorusGeometry(FIELD.openingRadius,.025,6,6),this.material(color,{emissive:color,emissiveIntensity:.1}));
      ring.rotation.x=Math.PI/2;ring.rotation.z=Math.PI/6;ring.position.set(x,FIELD.hubHeight,0);this.scene.add(ring);
      const lights=[];for(const dz of [-.6,.6])lights.push(this.box(1.15,.065,.035,x,1.5,dz,color));
      for(const dx of [-.6,.6])lights.push(this.box(.035,.065,1.15,x+dx,1.5,0,color));
      for(let i=0;i<4;i++){
        const z=[-.42,-.14,.14,.42][i];this.box(.035,.23,.21,x+direction*.606,.2,z,'#121c18');
        const chute=this.box(.25,.025,.21,x+direction*.68,.08,z,'#a7b3a6');chute.rotation.z=-direction*.15;
      }
      this.label('FUEL RETURN →',x+direction*1.1,.2,'#afbaa9',.3);
      // Back net faces the neutral zone and stops the visual hub looking like a low bucket.
      const netX=x+direction*.63;
      for(const dz of [-.65,.65])this.box(.025,1.35,.025,netX,2.15,dz,'#929d96');
      this.box(.025,.025,1.3,netX,2.825,0,'#929d96');
      for(let z=-.6;z<=.6;z+=.12){const wire=this.box(.006,1.15,.006,netX,2.2,z,'#829087');wire.castShadow=false;}
      for(let y=1.65;y<2.85;y+=.16){const wire=this.box(.006,.006,1.3,netX,y,0,'#829087');wire.castShadow=false;}
      this.hubVisuals[h.alliance]={ring,lights,color:new T.Color(color)};
      const tx=h.alliance==='blue'?-W/2+TOWER.postX:W/2-TOWER.postX;
      this.box(TOWER.depth,.008,TOWER.width,h.alliance==='blue'?-W/2+TOWER.depth/2:W/2-TOWER.depth/2,.004,0,'#202722');
      const poleSpacing=(TOWER.postGap+TOWER.postWidth)/2;
      for(const dz of [-poleSpacing,poleSpacing])this.box(TOWER.postDepth,TOWER.postHeight,TOWER.postWidth,tx,TOWER.postHeight/2,dz,color);
      for(const y of TOWER.rungs){const rung=this.cylinder(TOWER.rungDiameter/2,TOWER.rungDiameter/2,TOWER.postGap+2*TOWER.postWidth,tx,y,0,color);rung.rotation.x=Math.PI/2;}
      const wallDirection=h.alliance==='blue'?-1:1;
      for(const side of [-1,1]){
        const from=new T.Vector3(tx,.72,side*poleSpacing),to=new T.Vector3(tx+wallDirection*.85,1.1,side*poleSpacing);
        const delta=to.clone().sub(from),brace=new T.Mesh(new T.BoxGeometry(.045,delta.length(),.045),this.material(color));
        brace.position.copy(from.clone().add(to).multiplyScalar(.5));brace.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());brace.castShadow=true;this.scene.add(brace);
      }
      // Depot holds 24 floor fuel. Outpost stores another 24 before human-player feeding.
      const depotZ=h.alliance==='blue'?H/2-.95:-H/2+.95,dx=h.alliance==='blue'?-W/2+.63:W/2-.63;
      this.box(.69,.015,1.07,dx,.012,depotZ,'#5d6152');
      for(const dz of [-.535,.535])this.box(.69,.029,.025,dx,.026,depotZ+dz,color);
      this.label('DEPOT · 24',dx+direction*.9,depotZ,'#aebca6',.3);
      // Outpost fuel stays in reserve off-field; do not draw a placeholder block on the carpet.
      const outZ=-depotZ;this.label('OUTPOST · 24',tx+direction*.9,outZ,'#aebca6',.28);
    }
    // Thin staging footprint makes the compact two-sided center pile easy to read before AUTO.
    const sd=FIELD.centerDepth,sw=FIELD.centerWidth;
    for(const x of [-sd/2,sd/2])this.box(.012,.004,sw,x,.007,0,'#7b816c');
    for(const z of [-sw/2,sw/2])this.box(sd,.004,.012,0,.007,z,'#7b816c');
  }
  disposeGroup(group){
    group.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});
    while(group.children.length)group.remove(group.children[0]);
  }
  genericRobot(group,c){
    const l=c.length,w=c.width,h=c.height,color=c.alliance==='blue'?'#386dca':'#c6443f';
    this.box(l,.16,w,0,.15,0,color,group);
    const body=this.box(l*.88,h-.23,w*.88,0,.23+(h-.23)/2,0,'#303631',group);
    body.material.transparent=true;body.material.opacity=.48;
    const outline=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(l*.89,h-.22,w*.89)),new T.LineBasicMaterial({color:'#c4cbb4',transparent:true,opacity:.45}));
    outline.position.y=.23+(h-.22)/2;group.add(outline);
    const fill=this.box(l*.83,1,w*.83,0,.23,0,'#e4c646',group);fill.castShadow=false;
    // A modest roller and two short side rails identify the intake end.
    const intakeBar=this.box(.14,.07,w*.7,l/2+.07,.14,0,'#c8a5ff',group);
    for(const side of [-1,1])this.box(.14,.08,.025,l/2+.07,.16,side*w*.35,'#a59bb0',group);
    const roller=this.cylinder(.035,.035,w*.66,l/2+.13,.18,0,'#e6dcef',group);roller.rotation.x=Math.PI/2;
    const cv=document.createElement('canvas');cv.width=512;cv.height=160;const ct=cv.getContext('2d');
    ct.fillStyle=color;ct.fillRect(0,0,512,160);ct.fillStyle='#fff';ct.strokeStyle='#111';ct.lineWidth=8;
    ct.textAlign='center';ct.font='bold 124px sans-serif';ct.strokeText(c.team,256,125);ct.fillText(c.team,256,125);
    const tex=new T.CanvasTexture(cv);tex.colorSpace=T.SRGBColorSpace;
    // A single small bumper number and a simple shooter block keep the robot readable.
    const tag=new T.Mesh(new T.PlaneGeometry(l*.48,.10),new T.MeshBasicMaterial({map:tex}));
    tag.position.set(0,.16,w/2+.003);group.add(tag);
    const shooter=new T.Group();group.add(shooter);
    const back=c.shooterDirection==='back',direction=back?-1:1;
    shooter.position.set(c.archetype==='dumper'?direction*l*.30:0,h+.025,0);
    this.box(.18,.09,w*.32,0,.045,0,'#a99bb8',shooter);
    if(c.archetype==='dumper')for(let lane=0;lane<(c.lanes||1);lane++){
      this.box(.12,.055,.055,direction*.12,.055,laneOffset(lane,c.lanes,w),'#eee7f5',shooter);
    }else this.box(.18,.06,.09,.15,.06,0,'#eee7f5',shooter);
    return {body,fill,intakeBar,shooter};
  }
  updateFill(visual,config,inventory){
    const fraction=Math.max(0,Math.min(1,inventory/config.capacity));
    const height=Math.max(.005,(config.height-.24)*fraction);
    visual.fill.visible=inventory>0;visual.fill.scale.y=height;visual.fill.position.y=.23+height/2;
    visual.body.material.color.lerpColors(new T.Color('#303631'),new T.Color('#f1d455'),fraction);
  }
  rebuildRobot(c){
    this.disposeGroup(this.chassis);this.activeVisual=this.genericRobot(this.chassis,c);this.intakeBar=this.activeVisual.intakeBar;
    this.robotKey=[c.width,c.length,c.height,c.alliance,c.team,c.archetype,c.lanes,c.shooterDirection].join('|');
  }
  setCamera(mode){this.mode=mode;this.pointer=null;this.zoom=1;}
  resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  movement(x,y){
    const forward=new T.Vector3();this.camera.getWorldDirection(forward);forward.y=0;forward.normalize();
    const right=new T.Vector3().crossVectors(forward,new T.Vector3(0,1,0)).normalize();
    if(this.mode==='top')return {moveX:x,moveY:y};
    return {moveX:right.x*x-forward.x*y,moveY:right.z*x-forward.z*y};
  }
  draw(sim,grid){
    const c=sim.config,r=sim.robot,key=[c.width,c.length,c.height,c.alliance,c.team,c.archetype,c.lanes,c.shooterDirection].join('|');
    if(this.robotKey!==key)this.rebuildRobot(c);this.gridGroup.visible=grid;
    const x=r.x-W/2,z=r.y-H/2;this.robot.position.set(x,r.z,z);this.robot.rotation.y=-r.a;
    this.chassis.rotation.set(r.roll,0,r.pitch,'XYZ');this.intakeBar.material.color.set(sim.intake?'#c8a5ff':'#665b70');
    const solution=sim.shotSolution,target=solution.target,aim=c.autoAim&&c.archetype==='turret'?sim.aimAngle:sim.shooterAngle;this.updateFill(this.activeVisual,c,sim.inventory);
    if(c.archetype==='turret')this.activeVisual.shooter.rotation.y=-(aim-r.a);
    const parkedKeys=new Set();
    sim.fleet.forEach((entry,index)=>{
      if(index===sim.activeIndex)return;parkedKeys.add(index);
      const pc=entry.config,pr=entry.robot,key=[pc.width,pc.length,pc.height,pc.alliance,pc.team,pc.archetype,pc.lanes,pc.shooterDirection].join('|');
      let visual=this.parkedVisuals.get(index);
      if(!visual||visual.key!==key){if(visual){this.disposeGroup(visual.group);this.scene.remove(visual.group);}const group=new T.Group();this.scene.add(group);visual={group,key,...this.genericRobot(group,pc)};this.parkedVisuals.set(index,visual);}
      visual.group.position.set(pr.x-W/2,pr.z,pr.y-H/2);visual.group.rotation.set(pr.roll,-pr.a,pr.pitch,'YXZ');this.updateFill(visual,pc,entry.inventory);
    });
    for(const [index,visual] of this.parkedVisuals)if(!parkedKeys.has(index)){this.disposeGroup(visual.group);this.scene.remove(visual.group);this.parkedVisuals.delete(index);}
    this.fuel.count=sim.balls.length;
    for(let i=0;i<sim.balls.length;i++){const b=sim.balls[i];this.fuelMatrix.makeTranslation(b.x-W/2,b.z,b.y-H/2);this.fuel.setMatrixAt(i,this.fuelMatrix);}this.fuel.instanceMatrix.needsUpdate=true;
    for(const alliance of ['blue','red']){
      const v=this.hubVisuals[alliance],status=sim.hubStatus(alliance),pulse=status.warning?(.25+.75*(.5+.5*Math.sin(sim.time*12))):1;
      const settling=sim.phase.id==='final-settle',lit=status.active?pulse:.025;
      for(const mesh of [v.ring,...v.lights]){mesh.material.color.copy(v.color).multiplyScalar(status.active?1:.25);
        mesh.material.emissive.copy(settling?new T.Color('#ffffff'):v.color);mesh.material.emissiveIntensity=lit*(status.transition?1.2+.5*Math.sin(sim.time*10):1.1);}
    }
    const passing=solution.passing,points=[],d=solution.reach,flight=solution.flight,launch=r.z+c.height-.05;
    const vz=(target.z-launch+.5*9.81*flight*flight)/flight;
    const manual=!c.autoAim||c.archetype==='dumper';
    const origin=sim.shooterOrigin,power=Math.hypot(target.x-origin.x-r.vx*flight,target.y-origin.y-r.vy*flight)/flight;
    const vx=manual?Math.cos(aim)*power+r.vx:(target.x-r.x)/flight,vy=manual?Math.sin(aim)*power+r.vy:(target.y-r.y)/flight;
    const muzzle=c.archetype==='dumper'?(c.shooterDirection==='back'?-1:1)*c.length*.30:0;
    for(let i=0;i<=24;i++){const t=i/24*flight;points.push(new T.Vector3(x+Math.cos(r.a)*muzzle+vx*t,launch+vz*t-4.905*t*t,z+Math.sin(r.a)*muzzle+vy*t));}
    this.aimLine.geometry.dispose();this.aimLine.geometry=new T.BufferGeometry().setFromPoints(points);this.aimLine.computeLineDistances();this.aimLine.visible=sim.inventory>0;this.aimLine.material.color.set(passing||solution.outOfRange?'#f2ce64':'#c8a5ff');
    this.passMarker.visible=passing;this.passMarker.position.set(target.x-W/2,.025,target.y-H/2);
    const side=c.alliance==='blue'?-1:1,fit=this.camera.aspect<1.25?1.2:1;
    if(this.mode==='driver'){
      this.camera.position.set(side*14*this.zoom*fit,14*this.zoom*fit,-side*5.5*this.zoom*fit);this.cameraTarget.set(side*1.2,.1,0);
    }else if(this.mode==='follow'){
      this.camera.position.lerp(new T.Vector3(x+side*6*this.zoom,7.5*this.zoom,z-side*2.3*this.zoom),.1);this.cameraTarget.set(x-side*1.3,.2,z);
    }else if(this.mode==='top'){
      this.camera.position.set(0,24*this.zoom,.001);this.cameraTarget.set(0,0,0);
    }else{
      const dist=this.distance*this.zoom*fit;this.camera.position.set(Math.sin(this.theta)*Math.cos(this.phi)*dist,Math.sin(this.phi)*dist,Math.cos(this.theta)*Math.cos(this.phi)*dist);this.cameraTarget.set(0,0,0);
    }
    this.camera.lookAt(this.cameraTarget);this.renderer.render(this.scene,this.camera);
  }
}
