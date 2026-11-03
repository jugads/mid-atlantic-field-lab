import {defenderInput} from './defender.js?v=driving3';
import {MultiplayerClient} from './multiplayer.js?v=fouls1';
import {FieldView} from './view3d.js?v=nonet1';
const {Simulation,ARCHETYPES,clamp,canUseTrench}=globalThis.FieldPhysics;
const {names,profiles,resolve:resolvePreset}=globalThis.TeamPresets;
const $=id=>document.getElementById(id),teams=Object.keys(profiles),sim=new Simulation(resolvePreset('341')),
  canvas=$('field'),view=new FieldView(canvas),controller=new globalThis.ControllerInput.ControllerInput(),countdown=new globalThis.MatchCountdown.Countdown(3);
let onlineMode=false;
const online=new MultiplayerClient(networkChanged);
let selectedTeam='341',keys=new Set(),last=0,accumulator=0,suppressGamepadShoot=false;

function selectRobot(team){
  if(sim.started||countdown.active||!profiles[team]||online.active&&online.room.status!=='lobby')return;
  selectedTeam=team;if(!online.active){sim.multiplayer=false;sim.activeIndex=0;sim.roster=[resolvePreset(team)];}sim.setConfig(resolvePreset(team));sim.reset();keys.clear();accumulator=0;
  const moveFocus=document.activeElement?.classList.contains('robot-choice');
  for(const button of $('robotChoices').children){const active=button.dataset.team===team;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));if(active&&moveFocus)button.focus();}
  $('netDetails').textContent=`${sim.config.capacity} capacity · Starts at ${canUseTrench(sim.config)?'trench':'bump'}`;
  if(online.active)online.send({type:'select',team});
  refreshIdentity();updateMatch();
}
function moveChoice(delta){const index=teams.indexOf(selectedTeam);selectRobot(teams[(index+delta+teams.length)%teams.length]);}
function createChoices(){
  for(const team of teams){
    const c=resolvePreset(team),button=document.createElement('button');button.type='button';button.className='robot-choice';button.dataset.team=team;
    button.setAttribute('aria-label',`Team ${team}, ${names[team]}, ${ARCHETYPES[c.archetype].label}, ${c.capacity} fuel capacity`);
    button.innerHTML=`<span class="choice-top"><span class="choice-number">${team}</span><span class="choice-check" aria-hidden="true">✓</span></span><strong>${names[team]}</strong><span class="choice-type">${ARCHETYPES[c.archetype].label}</span><span class="choice-stats"><span><b>${c.capacity}</b> CAPACITY</span><span><b>${c.feedRate}/s</b> SHOOT</span><span><b>${c.intakeRate}/s</b> INTAKE</span></span><span class="choice-details">${c.maxRange.toFixed(1)} m range · ${c.moving}% moving accuracy · ${c.shooterDirection==='back'?'Shoots rearward':'Shoots forward'}</span><span class="choice-start">Starts at ${canUseTrench(c)?'trench':'bump'}</span>`;
    button.onclick=()=>selectRobot(team);$('robotChoices').append(button);
  }
}
function refreshIdentity(){const c=sim.config;$('robotNumber').textContent=c.team;$('robotName').textContent=names[c.team];
 $('robotType').textContent=ARCHETYPES[c.archetype].label+' · '+(c.drive==='swerve'?'Swerve':'Tank')+' · '+(c.alliance==='blue'?'Blue':'Red')+' alliance';
 $('fuelSetup').textContent=`${sim.initialCenterCount} center · 48 depots · 48 outposts · ${Math.min(8,c.capacity)} preload`;}
function togglePause(){if(online.active){online.send({type:'pause'});keys.clear();return;}if(countdown.active)countdown.togglePause();else sim.pause();keys.clear();updateMatch();}
function reset(){if(online.active){online.send({type:'rematch'});return;}countdown.cancel();sim.reset();keys.clear();accumulator=0;selectRobot(selectedTeam);}
$('start').onclick=()=>{if(onlineMode){if(online.active)online.send({type:'ready',ready:!online.self?.ready});keys.clear();canvas.focus();return;}if(sim.started||countdown.active)return;if($('aiDefender').checked)sim.enableMultiplayer([resolvePreset(selectedTeam),{...resolvePreset('2539','red'),intakeDirection:'front'}]);countdown.start();keys.clear();accumulator=0;updateMatch();canvas.focus();};
$('pause').onclick=togglePause;$('reset').onclick=reset;
$('help').onclick=()=>{if(!online.active&&(sim.running||countdown.running))togglePause();$('helpDialog').showModal();};$('closeHelp').onclick=()=>$('helpDialog').close();
const used=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowLeft','ArrowRight','Space','ShiftLeft','KeyP','KeyR'];
window.addEventListener('keydown',e=>{
 if($('helpDialog').open||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
 if(!sim.started&&!countdown.active&&['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();if(!e.repeat)moveChoice(e.code==='ArrowRight'?1:-1);return;}
 if(!sim.started&&!countdown.active&&e.code==='Enter'&&!/BUTTON/.test(e.target.tagName)){e.preventDefault();$('start').click();return;}
 if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)||!used.includes(e.code))return;
 e.preventDefault();if(!e.repeat&&e.code==='KeyP')togglePause();else if(!e.repeat&&e.code==='KeyR'&&(sim.started||countdown.active))reset();else keys.add(e.code);
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{keys.clear();last=0;if(document.hidden&&online.active&&online.room.hostId===online.id&&online.room.status==='playing')online.send({type:'pause'});else if(!online.active&&document.hidden&&(sim.running||countdown.running))togglePause();});
canvas.addEventListener('pointerdown',()=>canvas.focus());
for(const button of document.querySelectorAll('[data-hold]')){
 button.onpointerdown=e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(button.dataset.hold);};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>keys.delete(button.dataset.hold));
}
new ResizeObserver(()=>view.resize()).observe(canvas);$('camera').onchange=()=>view.setCamera($('camera').value);
const formatTime=seconds=>{const t=Math.max(0,Math.ceil(seconds-1e-7));return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};
function updateMatch(){
 const p=sim.phase,preparing=online.active?online.room.status==='countdown':countdown.active,ready=online.active?online.room.status==='lobby':p.id==='ready'&&!preparing,finished=p.id==='finished',paused=online.active?online.room.status==='paused'||online.state==='reconnecting':preparing?!countdown.running:sim.started&&!sim.running&&!finished;
 $('picker').hidden=!ready;
 $('start').disabled=onlineMode&&!online.active;
 $('start').textContent=onlineMode?(online.self?.ready?'Cancel ready':'Ready up'):'Start match ↗';$('reset').hidden=ready;$('pause').hidden=ready||finished||(online.active&&preparing);if(online.active)$('reset').hidden=!finished;
 $('pause').textContent=paused?'▶ Resume':'Ⅱ Pause';$('reset').textContent=finished?'↺ Choose robot':'↺ Reset match';
 $('stateLabel').textContent=ready?'MATCH READY':paused?'MATCH PAUSED':preparing?'COUNTDOWN':p.label;
 $('phaseLabel').textContent=ready?'READY FOR AUTO':paused?'PAUSED':preparing?'MATCH STARTING':p.label;
 $('matchClock').textContent=formatTime(sim.matchRemaining);
 const event=sim.foulEvents?.at(-1);$('foulNotice').textContent=event&&sim.time-event.time<5?`${event.alliance.toUpperCase()} · ${event.rule} · ${event.detail} · +${event.points} to opponent`:'';
 $('foulTotals').textContent=`FOUL POINTS · BLUE +${sim.foulPoints?.blue||0} · RED +${sim.foulPoints?.red||0}`;
 $('shiftClock').textContent=ready?'20s AUTO · 140s TELEOP':preparing?'AUTO begins after countdown':finished?'Final fuel score':`${formatTime(sim.phaseRemaining)} in ${p.label.toLowerCase()}`;
 for(const alliance of ['blue','red']){
   const status=sim.hubStatus(alliance);$(alliance+'Score').textContent=sim.scores[alliance];
   const label=(ready||preparing)?'STANDBY':finished?'FINAL':status.warning?'DEACTIVATING':status.grace?'INACTIVE · 3s GRACE':status.active?'HUB ACTIVE':'HUB INACTIVE';
   const element=$(alliance+'Status');element.textContent=label;element.className=status.active?'active':'inactive';
 }
 for(const segment of document.querySelectorAll('[data-phase]'))segment.classList.toggle('current',segment.dataset.phase===p.id||(p.id==='auto-settle'&&segment.dataset.phase==='auto')||(p.id==='final-settle'&&segment.dataset.phase==='endgame'));
 const overlay=$('matchOverlay');overlay.hidden=!(preparing||finished||paused);
 overlay.classList.toggle('countdown',preparing&&!paused);
 let overlayContent='';
 if(paused)overlayContent=online.active?'<strong>MATCH PAUSED</strong><span>'+((online.state==='reconnecting'||online.room.players.some(p=>!p.connected))?'Waiting for both players to reconnect.':online.room.stalled?'Waiting for the host to return. Then press P or Resume.':'Press P or Resume to continue for both players.')+'</span>':'<strong>MATCH PAUSED</strong><span>Press P or Resume to continue.</span>';
 else if(preparing)overlayContent=`<strong class="countdown-number">${Math.ceil(online.active?(online.frames.at(-1)?.data.countdown??online.room.countdown):countdown.remaining)}</strong><span>GET READY</span>`;
 else if(finished&&online.active)overlayContent=`<strong>${online.room.mode==='coop'?'CO-OP COMPLETE':'MATCH COMPLETE'}</strong><span>${online.room.mode==='coop'?`Shared blue score: ${sim.scores.blue}`:`Blue ${sim.scores.blue} — ${sim.scores.red} Red`} · Press R to return to the room lobby</span>`;
 else if(finished)overlayContent=`<strong>MATCH COMPLETE</strong><span>Blue ${sim.scores.blue} — ${sim.scores.red} Red · ${sim.recycled} fuel returned · Press R or A to choose again</span>`;
 if(overlay.innerHTML!==overlayContent)overlay.innerHTML=overlayContent;
 $('hint').textContent=ready?'Select a team to begin':paused?'Clock and physics paused':preparing?'GET READY · Controls start with AUTO':p.id==='auto'?'AUTO · Driver-controlled · Both hubs active':p.id==='auto-settle'||p.id==='final-settle'?'Driver input disabled · Waiting for airborne fuel to settle':finished?'Choose a robot to play again':
   (!sim.inAllianceZone?'PASS MODE · Hold Space to ferry fuel into your alliance zone':sim.shotSolution.outOfRange?'OUT OF RANGE · Shots will fall short':sim.config.archetype==='dumper'?'BIG DUMPER · Hold Space to aim and shoot':sim.activeAt(sim.config.alliance)?'YOUR HUB IS ACTIVE · Turret can shoot while moving':'YOUR HUB IS INACTIVE · Collect fuel for your next shift');
 $('shotMode').textContent=(sim.shotMode==='pass'?'↶ PASS TO HOME':'◎ SHOOT HUB')+' · '+(sim.shotSolution.outOfRange?'OUT OF RANGE':sim.fireStatus.startsWith('ALIGNING')?sim.fireStatus:sim.config.archetype==='dumper'?sim.fireStatus:'SWIVEL TURRET')+(sim.robot.shootingSpeedLimited?' · 30% DRIVE':'');
 $('shotMode').classList.toggle('passing',sim.shotMode==='pass'||sim.shotSolution.outOfRange);
}
function draw(){
 view.draw(sim,false);const r=sim.robot,c=sim.config;
 $('score').textContent=sim.score;$('inventory').textContent=sim.inventory;$('capacityDisplay').textContent='/ '+c.capacity;
 $('shots').textContent=`${online.active?'Room: ':''}${sim.fired} shots · ${sim.passed} passes`;
 $('accuracy').textContent=sim.resolved?Math.round(sim.made/sim.resolved*100)+'%':'—';
 $('speed').textContent=Math.hypot(r.vx,r.vy).toFixed(1);$('fill').style.width=sim.inventory/c.capacity*100+'%';
 $('elapsed').textContent=sim.recycled+' fuel returned';updateMatch();
}
function frame(now){
 const elapsed=last?Math.max(0,(now-last)/1000):0,dt=Math.min(elapsed,.1);last=now;
 const blocked=document.hidden||$('helpDialog').open||!document.hasFocus();
 let pads=[],gamepadError=false;try{pads=navigator.getGamepads?.()||[];}catch{gamepadError=true;}
 const gamepad=controller.poll(pads,blocked);
 const controllerLabel=!navigator.getGamepads||gamepadError?'CONTROLLER UNAVAILABLE IN THIS BROWSER':gamepad.supported?(blocked?'CONTROLLER CONNECTED · CLICK GAME TO ENABLE':gamepad.generic?'CONTROLLER CONNECTED · GENERIC MAPPING':'CONTROLLER CONNECTED'):gamepad.connected?'CONTROLLER DETECTED · UNSUPPORTED MAPPING':'CONTROLLER · CONNECT & PRESS A BUTTON';
 if($('controllerStatus').textContent!==controllerLabel)$('controllerStatus').textContent=controllerLabel;
 $('controllerStatus').classList.toggle('connected',gamepad.supported);
 if(online.active&&online.room.status==='countdown'){}else if(countdown.active){
   if(gamepad.startPause)togglePause();
 }else if(!sim.started){
   if(gamepad.previousChoice)moveChoice(-1);if(gamepad.nextChoice)moveChoice(1);
   if(gamepad.startPause||gamepad.confirm){suppressGamepadShoot=true;$('start').click();}
 }else if(sim.phase.id==='finished'&&(gamepad.startPause||gamepad.confirm)){suppressGamepadShoot=true;reset();}
 else if(gamepad.startPause)togglePause();
 if(!gamepad.shoot)suppressGamepadShoot=false;
 const up=!blocked&&keys.has('KeyW'),down=!blocked&&keys.has('KeyS'),left=!blocked&&keys.has('KeyA'),right=!blocked&&keys.has('KeyD');
 const x=clamp(Number(right)-Number(left)+gamepad.x,-1,1),y=clamp(Number(down)-Number(up)+gamepad.y,-1,1);
 const input=blocked?{}:{up,down,left,right,...view.movement(x,y),forward:clamp(Number(up)-Number(down)-gamepad.y,-1,1),tankTurn:gamepad.x,
   turnAxis:gamepad.turn,clockwise:keys.has('KeyE')||keys.has('ArrowRight'),counterclockwise:keys.has('KeyQ')||keys.has('ArrowLeft'),shoot:keys.has('Space')||(gamepad.shoot&&!suppressGamepadShoot),intake:keys.has('ShiftLeft')||gamepad.intake};
 if(online.active){
   online.input(input,now);online.advanceHost(now,input);online.apply(sim,now,input);refreshIdentity();
   $('connectionBadge').textContent=online.state==='connected'?`${online.room.mode==='coop'?'CO-OP':'1v1'} · ${online.rtt} ms`: 'RECONNECTING';
 }else{
   sim.intake=sim.controlsEnabled&&!!input.intake;
   let matchDt=dt;
   if(countdown.active){matchDt=0;if(!document.hidden&&countdown.advance(elapsed)){sim.start();keys.clear();accumulator=0;updateMatch();}}
   if(sim.running&&!document.hidden){accumulator+=matchDt;while(accumulator>=1/120){sim.step(1/120,sim.multiplayer?[input,defenderInput(sim,$('defenderDifficulty').value)]:input);accumulator-=1/120;}}else accumulator=0;
 }
 draw();requestAnimationFrame(frame);
}
function previewLobby(){
 const room=online.room;if(!room||room.status!=='lobby')return;
 sim.multiplayer=false;sim.activeIndex=Math.max(0,room.players.findIndex(p=>p.id===online.id));
 sim.roster=room.players.map(p=>resolvePreset(p.team,p.alliance));sim.reset();
 const me=online.self;if(me)selectedTeam=me.team;
 for(const button of $('robotChoices').children){const active=button.dataset.team===selectedTeam;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));}
 $('netDetails').textContent=`${sim.config.capacity} capacity · Starts at ${canUseTrench(sim.config)?'trench':'bump'}`;
 refreshIdentity();
}
function networkChanged(msg){
 if(!$('onlinePanel'))return;
 $('networkMessage').textContent=online.message;
 $('roomConnect').hidden=online.active;$('serverSettings').hidden=online.active;$('roomLobby').hidden=!online.active;
 $('leaveRoom').hidden=!online.active;$('soloTab').disabled=online.active;$('connectionBadge').hidden=!online.active;
 const busy=['connecting','reconnecting'].includes(online.state);
 $('createRoom').disabled=busy;$('joinRoom').disabled=busy;
 if(online.room){
  $('roomCode').textContent=online.room.code;$('roomDescription').textContent=online.room.mode==='coop'?'CO-OP · SHARED BLUE SCORE':'1v1 · BLUE vs RED';
  $('roomPlayers').replaceChildren(...online.room.players.map(p=>{const row=document.createElement('span');row.textContent=`${p.id===online.id?'You':'Player '+(p.index+1)} · ${p.team} · ${p.alliance.toUpperCase()} — ${!p.connected?'Reconnecting':p.ready?'Ready':'Choosing robot'}`;return row;}));
  if(online.room.players.length<2){const row=document.createElement('span');row.textContent='Waiting for player 2… Share the room code.';$('roomPlayers').append(row);}
  if(msg?.type==='room'&&online.room.status==='lobby')previewLobby();
 }else if(sim.started||sim.roster.length>1){
  sim.multiplayer=false;sim.activeIndex=0;sim.roster=[resolvePreset(selectedTeam)];sim.reset();refreshIdentity();
 }
 updateMatch();
}
function setOnlineMode(value){
 if(online.active)return;
 if(!value&&online.state==='connecting')online.leave(false);
 onlineMode=value;$('defenderOption').hidden=value;$('defenderDifficultyOption').hidden=value||!$('aiDefender').checked;$('picker').classList.toggle('room-mode',value);$('onlinePanel').hidden=!value;$('soloTab').setAttribute('aria-pressed',String(!value));$('onlineTab').setAttribute('aria-pressed',String(value));
 updateMatch();
}
function connectRoom(type){
 const endpoint=$('serverUrl').value.trim();
 if(!endpoint){online.message='The match server still needs to be deployed to Render. Enter its URL under Server connection.';$('serverSettings').open=true;networkChanged();return;}
 if(type==='join'&&!/^[A-Z2-9]{6}$/i.test($('roomCodeInput').value.trim())){online.message='Enter a six-character room code.';networkChanged();return;}
 try{localStorage.setItem('fieldLabServer',endpoint);}catch{}
 online.connect(endpoint,{type,mode:$('roomMode').value,code:$('roomCodeInput').value.trim().toUpperCase(),team:selectedTeam});
}
$('aiDefender').onchange=()=>$('defenderDifficultyOption').hidden=onlineMode||!$('aiDefender').checked;
$('soloTab').onclick=()=>setOnlineMode(false);$('onlineTab').onclick=()=>setOnlineMode(true);
$('createRoom').onclick=()=>connectRoom('create');$('joinRoom').onclick=()=>connectRoom('join');
$('leaveRoom').onclick=()=>{online.leave();keys.clear();networkChanged();};
$('copyRoom').onclick=async()=>{try{await navigator.clipboard.writeText(online.room.code);online.message='Room code copied.';}catch{online.message='Room code: '+online.room.code;}networkChanged();};
let savedEndpoint='';try{savedEndpoint=localStorage.getItem('fieldLabServer')||'';}catch{}
$('serverUrl').value=globalThis.FIELD_LAB_SERVER_URL||savedEndpoint||(['localhost','127.0.0.1'].includes(location.hostname)||location.hostname.endsWith('.onrender.com')?location.origin:'');
$('serverSetupNote').hidden=!!$('serverUrl').value;
window.addEventListener('pagehide',()=>online.send({type:'input',input:{}}));
createChoices();selectRobot(selectedTeam);view.resize();requestAnimationFrame(frame);
