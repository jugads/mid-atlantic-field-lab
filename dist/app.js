import {FieldView} from './view3d.js?v=picker1';
const {Simulation,ARCHETYPES,clamp}=globalThis.FieldPhysics;
const {names,profiles,resolve:resolvePreset}=globalThis.TeamPresets;
const $=id=>document.getElementById(id),teams=Object.keys(profiles),sim=new Simulation(resolvePreset('341')),
  canvas=$('field'),view=new FieldView(canvas),controller=new globalThis.ControllerInput.ControllerInput();
let selectedTeam='341',keys=new Set(),last=0,accumulator=0,suppressGamepadShoot=false;

function selectRobot(team){
  if(sim.started||!profiles[team])return;
  selectedTeam=team;sim.setConfig(resolvePreset(team));sim.reset();keys.clear();accumulator=0;
  const moveFocus=document.activeElement?.classList.contains('robot-choice');
  for(const button of $('robotChoices').children){const active=button.dataset.team===team;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));if(active&&moveFocus)button.focus();}
  refreshIdentity();updateMatch();
}
function moveChoice(delta){const index=teams.indexOf(selectedTeam);selectRobot(teams[(index+delta+teams.length)%teams.length]);}
function createChoices(){
  for(const team of teams){
    const c=resolvePreset(team),button=document.createElement('button');button.type='button';button.className='robot-choice';button.dataset.team=team;
    button.setAttribute('aria-label',`Team ${team}, ${names[team]}, ${ARCHETYPES[c.archetype].label}, ${c.capacity} fuel capacity`);
    button.innerHTML=`<span class="choice-top"><span class="choice-number">${team}</span><span class="choice-check" aria-hidden="true">✓</span></span><strong>${names[team]}</strong><span class="choice-type">${ARCHETYPES[c.archetype].label}</span><span class="choice-stats"><span><b>${c.capacity}</b> CAPACITY</span><span><b>${c.feedRate}/s</b> SHOOT</span><span><b>${c.intakeRate}/s</b> INTAKE</span></span><span class="choice-details">${c.maxRange.toFixed(1)} m range · ${c.moving}% moving accuracy</span>`;
    button.onclick=()=>selectRobot(team);$('robotChoices').append(button);
  }
}
function refreshIdentity(){const c=sim.config;$('robotNumber').textContent=c.team;$('robotName').textContent=names[c.team];
 $('robotType').textContent=ARCHETYPES[c.archetype].label+' · '+(c.drive==='swerve'?'Swerve':'Tank')+' · Blue alliance';
 $('fuelSetup').textContent=`${sim.initialCenterCount} center · 48 depots · 48 outposts · ${Math.min(8,c.capacity)} preload`;}
function togglePause(){sim.pause();keys.clear();updateMatch();}
function reset(){sim.reset();keys.clear();accumulator=0;selectRobot(selectedTeam);}
$('start').onclick=()=>{if(sim.started)return;sim.start();keys.clear();updateMatch();canvas.focus();};
$('pause').onclick=togglePause;$('reset').onclick=reset;
$('help').onclick=()=>{if(sim.running)togglePause();$('helpDialog').showModal();};$('closeHelp').onclick=()=>$('helpDialog').close();
const used=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowLeft','ArrowRight','Space','KeyI','KeyP','KeyR'];
window.addEventListener('keydown',e=>{
 if($('helpDialog').open||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
 if(!sim.started&&['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();if(!e.repeat)moveChoice(e.code==='ArrowRight'?1:-1);return;}
 if(!sim.started&&e.code==='Enter'&&!/BUTTON/.test(e.target.tagName)){e.preventDefault();$('start').click();return;}
 if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)||!used.includes(e.code))return;
 e.preventDefault();if(!e.repeat&&e.code==='KeyP')togglePause();else if(!e.repeat&&e.code==='KeyR'&&sim.started)reset();else if(!e.repeat&&e.code==='KeyI'&&sim.controlsEnabled)sim.intake=!sim.intake;else keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{keys.clear();last=0;if(document.hidden&&sim.running)togglePause();});
canvas.addEventListener('pointerdown',()=>canvas.focus());
for(const button of document.querySelectorAll('[data-hold]')){
 button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(button.dataset.hold);};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>keys.delete(button.dataset.hold));
}
new ResizeObserver(()=>view.resize()).observe(canvas);$('camera').onchange=()=>view.setCamera($('camera').value);
const formatTime=seconds=>{const t=Math.max(0,Math.ceil(seconds-1e-7));return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};
function updateMatch(){
 const p=sim.phase,ready=p.id==='ready',finished=p.id==='finished',paused=sim.started&&!sim.running&&!finished;
 $('picker').hidden=!ready;$('reset').hidden=ready;$('pause').hidden=ready||finished;
 $('pause').textContent=paused?'▶ Resume':'Ⅱ Pause';$('reset').textContent=finished?'↺ Choose robot':'↺ Reset match';
 $('stateLabel').textContent=ready?'MATCH READY':paused?'MATCH PAUSED':p.label;
 $('phaseLabel').textContent=ready?'READY FOR AUTO':paused?'PAUSED · '+p.label:p.label;
 $('matchClock').textContent=formatTime(sim.matchRemaining);
 $('shiftClock').textContent=ready?'20s AUTO · 140s TELEOP':finished?'Final fuel score':`${formatTime(sim.phaseRemaining)} in ${p.label.toLowerCase()}`;
 for(const alliance of ['blue','red']){
   const status=sim.hubStatus(alliance);$(alliance+'Score').textContent=sim.scores[alliance];
   const label=ready?'STANDBY':finished?'FINAL':status.warning?'DEACTIVATING':status.grace?'INACTIVE · 3s GRACE':status.active?'HUB ACTIVE':'HUB INACTIVE';
   const element=$(alliance+'Status');element.textContent=label;element.className=status.active?'active':'inactive';
 }
 for(const segment of document.querySelectorAll('[data-phase]'))segment.classList.toggle('current',segment.dataset.phase===p.id||(p.id==='auto-settle'&&segment.dataset.phase==='auto')||(p.id==='final-settle'&&segment.dataset.phase==='endgame'));
 const overlay=$('matchOverlay');overlay.hidden=!(finished||paused);
 if(finished)overlay.innerHTML=`<strong>MATCH COMPLETE</strong><span>Blue ${sim.scores.blue} — ${sim.scores.red} Red · ${sim.recycled} fuel returned · Press R or A to choose again</span>`;
 else if(paused)overlay.innerHTML='<strong>MATCH PAUSED</strong><span>Press P or Resume to continue.</span>';
 $('hint').textContent=ready?'Select a team to begin':paused?'Clock and physics paused':p.id==='auto'?'AUTO · Driver-controlled · Both hubs active':p.id==='auto-settle'||p.id==='final-settle'?'Driver input disabled · Waiting for airborne fuel to settle':finished?'Choose a robot to play again':
   (!sim.inAllianceZone?'PASS MODE · Hold Space to ferry fuel into your alliance zone':sim.shotSolution.outOfRange?'OUT OF RANGE · Shots will fall short':sim.config.archetype==='dumper'?'BIG DUMPER · Hold Space to aim and shoot':sim.activeAt(sim.config.alliance)?'YOUR HUB IS ACTIVE · Turret can shoot while moving':'YOUR HUB IS INACTIVE · Collect fuel for your next shift');
 $('shotMode').textContent=(sim.shotMode==='pass'?'↶ PASS TO HOME':'◎ SHOOT HUB')+' · '+(sim.shotSolution.outOfRange?'OUT OF RANGE':sim.config.archetype==='dumper'?sim.fireStatus:'SWIVEL TURRET');
 $('shotMode').classList.toggle('passing',sim.shotMode==='pass'||sim.shotSolution.outOfRange);
}
function draw(){
 view.draw(sim,false);const r=sim.robot,c=sim.config;
 $('score').textContent=sim.score;$('inventory').textContent=sim.inventory;$('capacityDisplay').textContent='/ '+c.capacity;
 $('shots').textContent=`${sim.fired} shots · ${sim.passed} passes`;
 $('accuracy').textContent=sim.resolved?Math.round(sim.made/sim.resolved*100)+'%':'—';
 $('speed').textContent=Math.hypot(r.vx,r.vy).toFixed(1);$('fill').style.width=sim.inventory/c.capacity*100+'%';
 $('elapsed').textContent=sim.recycled+' fuel returned';updateMatch();
}
function frame(now){
 const dt=last?Math.min((now-last)/1000,.1):0;last=now;
 const blocked=document.hidden||$('helpDialog').open||!document.hasFocus();
 let pads=[];try{pads=navigator.getGamepads?.()||[];}catch{}
 const gamepad=controller.poll(pads,blocked);
 const controllerLabel=gamepad.supported?'CONTROLLER CONNECTED':gamepad.connected?'CONTROLLER NOT STANDARD':'CONTROLLER · CONNECT & PRESS A BUTTON';
 if($('controllerStatus').textContent!==controllerLabel)$('controllerStatus').textContent=controllerLabel;
 $('controllerStatus').classList.toggle('connected',gamepad.supported);
 if(!sim.started){
   if(gamepad.previousChoice)moveChoice(-1);if(gamepad.nextChoice)moveChoice(1);
   if(gamepad.startPause||gamepad.confirm){suppressGamepadShoot=true;$('start').click();}
 }else if(sim.phase.id==='finished'&&(gamepad.startPause||gamepad.confirm)){suppressGamepadShoot=true;reset();}
 else if(gamepad.startPause)togglePause();
 if(!gamepad.shoot)suppressGamepadShoot=false;
 if(gamepad.toggleIntake&&sim.controlsEnabled)sim.intake=!sim.intake;
 if(sim.running&&!document.hidden){accumulator+=dt;while(accumulator>=1/120){
   const up=keys.has('KeyW'),down=keys.has('KeyS'),left=keys.has('KeyA'),right=keys.has('KeyD');
   const x=clamp(Number(right)-Number(left)+gamepad.x,-1,1),y=clamp(Number(down)-Number(up)+gamepad.y,-1,1);
   sim.step(1/120,{up,down,left,right,...view.movement(x,y),forward:clamp(Number(up)-Number(down)-gamepad.y,-1,1),tankTurn:gamepad.x,
     turnAxis:gamepad.turn,clockwise:keys.has('KeyE')||keys.has('ArrowRight'),counterclockwise:keys.has('KeyQ')||keys.has('ArrowLeft'),shoot:keys.has('Space')||(gamepad.shoot&&!suppressGamepadShoot)});
   accumulator-=1/120;
 }}else accumulator=0;
 draw();requestAnimationFrame(frame);
}
createChoices();selectRobot(selectedTeam);view.resize();requestAnimationFrame(frame);
