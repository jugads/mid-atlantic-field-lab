import {defenderInput,defenderTeam} from './defender.js?v=tandem35';
import {MultiplayerClient,createHostSimulation,matchInputs,startFields} from './multiplayer.js?v=tandem35';
import {FieldView} from './view3d.js?v=camera25';
const {Simulation,ARCHETYPES,clamp,canUseTrench}=globalThis.FieldPhysics;
const {names,profiles,resolve:resolvePreset}=globalThis.TeamPresets;
const $=id=>document.getElementById(id),teams=Object.keys(profiles),sim=new Simulation(resolvePreset('341')),
  canvas=$('field'),view=new FieldView(canvas),controller=new globalThis.ControllerInput.ControllerInput(),countdown=new globalThis.MatchCountdown.Countdown(3);
let onlineMode=false;
const soloStartPositions={};
const soloAi={blue:['316','708'],red:['1391','1640','2539']},soloRoles={blue:['auto','auto'],red:['auto','auto','auto']};
const online=new MultiplayerClient(networkChanged);
let selectedTeam='341',keys=new Set(),last=0,accumulator=0,suppressGamepadShoot=false;

function selectRobot(team){
  if(sim.started||countdown.active||!profiles[team]||online.active&&online.room.status!=='lobby')return;
  if(!online.active&&['3v3solo','3v0'].includes($('soloMatch').value)&&($('soloMatch').value==='3v0'?soloAi.blue:Object.values(soloAi).flat()).includes(team))return;
  if(online.active&&['3v3','3v3coop'].includes(online.room.mode)&&online.room.players.some(p=>p.id!==online.id&&p.team===team||p.aiTeams.includes(team)))return;
  selectedTeam=team;if(!online.active){sim.multiplayer=false;sim.activeIndex=0;sim.roster=[resolvePreset(team)];}sim.setConfig(resolvePreset(team));sim.reset();keys.clear();accumulator=0;
  const moveFocus=document.activeElement?.classList.contains('robot-choice');
  for(const button of $('robotChoices').children){const active=button.dataset.team===team;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));if(active&&moveFocus)button.focus();}
  $('netDetails').textContent=`${sim.config.capacity} capacity · Starts at ${canUseTrench(sim.config)?'trench':'bump'}`;
  if(online.active)online.send({type:'select',team});
  refreshIdentity();renderAiSelections();updateMatch();
}
function moveChoice(delta){let index=teams.indexOf(selectedTeam);for(let i=0;i<teams.length;i++){index=(index+delta+teams.length)%teams.length;const button=$('robotChoices').children[index];if(!button.disabled){selectRobot(teams[index]);break;}}}
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
$('start').onclick=()=>{if(onlineMode){if(online.active)online.send({type:'ready',ready:!online.self?.ready});keys.clear();canvas.focus();return;}if(sim.started||countdown.active)return;if(['3v3solo','3v0'].includes($('soloMatch').value)){const match=createHostSimulation({mode:$('soloMatch').value,players:[{team:selectedTeam,alliance:'blue'}],aiTeams:soloAi,aiRoles:soloRoles});sim.enableMultiplayer(match.roster.map(c=>({...c,...startFields(soloStartPositions[c.team])})));}else if($('aiDefender').checked)sim.enableMultiplayer([resolvePreset(selectedTeam),{...resolvePreset(defenderTeam($('defenderDifficulty').value)===selectedTeam?'2539':defenderTeam($('defenderDifficulty').value),'red'),intakeDirection:'front'}]);if(!sim.multiplayer){Object.assign(sim.roster[0],startFields(soloStartPositions[selectedTeam]));sim.reset();}else if($('soloMatch').value==='1v1'&&sim.fleet.length===2){Object.assign(sim.roster[0],startFields(soloStartPositions[selectedTeam]));sim.enableMultiplayer(sim.roster);}countdown.start();keys.clear();accumulator=0;updateMatch();canvas.focus();};
$('pause').onclick=togglePause;$('reset').onclick=reset;
$('resultsButton').onclick=()=>{renderResults();$('resultsDialog').showModal();};$('closeResults').onclick=()=>$('resultsDialog').close();
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
function renderResults(){
 const box=$('resultsContent');box.replaceChildren();
 const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
 const score=el('div','results-score');
 for(const [alliance,label] of [['blue','BLUE'],['red','RED']]){const item=el('div',`results-score-team ${alliance}`);item.append(el('span','',label),el('strong','',sim.scores[alliance]));score.append(item);}
 box.append(score);const outcome=sim.scores.blue===sim.scores.red?'Tie match':`${sim.scores.blue>sim.scores.red?'Blue':'Red'} wins`;box.append(el('p','results-outcome',`${outcome} · AUTO ${sim.autoScores.blue} – ${sim.autoScores.red}`));
 const data=sim.matchStats;if(!data){box.append(el('p','results-empty','Detailed statistics are unavailable for this match.'));return;}
 const section=(title,subtitle)=>{const group=el('section','results-section');group.append(el('h3','',title));if(subtitle)group.append(el('p','results-note',subtitle));box.append(group);return group;};
 const table=(parent,labels,rows)=>{const wrap=el('div','results-table-wrap'),table=el('table','results-table'),thead=el('thead'),header=el('tr'),body=el('tbody');
  for(const label of labels)header.append(el('th','',label));thead.append(header);table.append(thead);
  for(const row of rows){const tr=el('tr');for(let i=0;i<row.length;i++){const cell=el(i?'td':'th','',row[i]);if(!i)cell.scope='row';tr.append(cell);}body.append(tr);}table.append(body);wrap.append(table);parent.append(wrap);};
 const periods=section('Fuel points by period','Points from fuel only; foul points are shown separately.');
 table(periods,['Period','Blue','Red'],[['auto','AUTO'],['transition','Transition'],['shift1','Shift 1'],['shift2','Shift 2'],['shift3','Shift 3'],['shift4','Shift 4'],['endgame','Endgame']].map(([id,label])=>{const v=data.periods[id]||{blue:0,red:0};return [label,v.blue,v.red];}));
 const robots=section('Robot contributions','Accuracy is fuel entering a hub ÷ resolved scoring shots.');
 table(robots,['Robot','Points','In / shots','Accuracy','Passes','Collected','Cycles'],data.robots.map(r=>[`${r.alliance.toUpperCase()} ${r.team}`,r.points,`${r.made} / ${r.resolved}`,r.resolved?Math.round(100*r.made/r.resolved)+'%':'—',r.passes,r.collected,r.cycles]));
 const fouls=section('Fouls','Foul points are awarded to the opposing alliance.');
 table(fouls,['Alliance','Minor','Major','Points awarded'],['blue','red'].map(a=>[a.toUpperCase(),sim.fouls[a].minor,sim.fouls[a].major,sim.foulPoints[a]]));
 box.append(el('p','results-note','A cycle is a collection period followed by a shot or pass. Scroll sideways to see all robot statistics on a small screen.'));
}
function updateMatch(){
 const p=sim.phase,preparing=online.active?online.room.status==='countdown':countdown.active,ready=online.active?online.room.status==='lobby':p.id==='ready'&&!preparing,finished=p.id==='finished',paused=online.active?online.room.status==='paused'||online.state==='reconnecting':preparing?!countdown.running:sim.started&&!sim.running&&!finished;
 $('picker').hidden=!ready;
 const cameraParent=ready?$('startControls'):$('matchCamera');
 if($('cameraControl').parentElement!==cameraParent)cameraParent.prepend($('cameraControl'));
 $('matchCamera').hidden=ready;
 $('start').disabled=onlineMode&&!online.active; $('resultsButton').hidden=!finished;
 $('start').textContent=onlineMode?(online.self?.ready?'Cancel ready':'Ready up'):'Start match ↗';$('reset').hidden=ready;$('pause').hidden=ready||finished||(online.active&&preparing);if(online.active)$('reset').hidden=!finished;
 $('pause').textContent=paused?'▶ Resume':'Ⅱ Pause';$('reset').textContent=finished?'↺ Choose robot':'↺ Reset match';
 $('stateLabel').textContent=ready?'MATCH READY':paused?'MATCH PAUSED':preparing?'COUNTDOWN':p.label;
 $('phaseLabel').textContent=ready?'READY FOR AUTO':paused?'PAUSED':preparing?'MATCH STARTING':p.label;
 $('matchClock').textContent=formatTime(sim.matchRemaining);
 const auto=$('autoResult');auto.hidden=!sim.started||sim.time<23||sim.time>=33;
 if(!auto.hidden){const b=sim.autoScores.blue,r=sim.autoScores.red,winner=b===r?'AUTO TIED':`${sim.autoWinner.toUpperCase()} WON AUTO`;auto.firstElementChild.textContent=`${winner}  ·  ${b}–${r}`;auto.lastElementChild.textContent=`${sim.autoWinner.toUpperCase()} INACTIVE FIRST`;}

 const pin=sim.pinCounts?.find(p=>p.elapsed>0);$('pinNotice').textContent=pin?`${pin.alliance.toUpperCase()} PIN · ${Math.min(3,pin.elapsed).toFixed(1)} / 3s`:'';
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
 $('shotMode').textContent=(sim.shotMode==='pass'?'↶ PASS TO HOME':'◎ SHOOT HUB')+' · '+(sim.shotSolution.outOfRange?'OUT OF RANGE':sim.shotSolution.passLimited?'MAX PASS RANGE':sim.fireStatus.startsWith('ALIGNING')?sim.fireStatus:sim.config.archetype==='dumper'?sim.fireStatus:'SWIVEL TURRET')+(sim.robot.shootingSpeedLimited?' · 30% DRIVE':'');
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
   $('connectionBadge').textContent=online.state==='connected'?`${['coop','3v3coop'].includes(online.room.mode)?'CO-OP':online.room.mode==='2v2'?'2v2':online.room.mode==='3v3'?'3v3':'1v1'} · ${online.rtt} ms`: 'RECONNECTING';
 }else{
   sim.intake=sim.controlsEnabled&&!!input.intake;
   let matchDt=dt;
   if(countdown.active){matchDt=0;if(!document.hidden&&countdown.advance(elapsed)){sim.start();keys.clear();accumulator=0;updateMatch();}}
   if(sim.running&&!document.hidden){accumulator+=matchDt;while(accumulator>=1/120){sim.step(1/120,sim.multiplayer?(sim.fleet.length>2?matchInputs(sim,[input],$('defenderDifficulty').value):[input,defenderInput(sim,$('defenderDifficulty').value)]):input);accumulator-=1/120;}}else accumulator=0;
 }
 draw();requestAnimationFrame(frame);
}
const SVGNS='http://www.w3.org/2000/svg';
let startSelected=null,startActions=null;
function fieldBackdrop(){
 const {FIELD,W,H,hubs,bumps,trenches,TOWER}=globalThis.FieldPhysics,f=n=>+n.toFixed(3),sl=FIELD.startLine;
 const label=(x,y,t,size=.26,rot=0,fill='#ffffff70')=>`<text x="${f(x)}" y="${f(y)}" font-size="${size}" fill="${fill}" text-anchor="middle" dominant-baseline="middle" letter-spacing=".04" transform="rotate(${rot} ${f(x)} ${f(y)})">${t}</text>`;
 let g=`<defs><pattern id="bumpHatch" width=".28" height=".28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width=".28" height=".28" fill="#6d5a3a"/><rect width=".12" height=".28" fill="#a88b54"/></pattern><pattern id="trenchHatch" width=".3" height=".3" patternUnits="userSpaceOnUse"><rect width=".3" height=".3" fill="#171220"/><path d="M0 .3L.3 0" stroke="#3a2f4d" stroke-width=".05"/></pattern></defs>`;
 g+=`<rect width="${W}" height="${H}" fill="#2f2840"/><rect width="${sl}" height="${H}" fill="#223763"/><rect x="${f(W-sl)}" width="${sl}" height="${H}" fill="#66303d"/>`;
 g+=`<g stroke="#ffffff12" stroke-width=".02">${Array.from({length:16},(_,i)=>`<path d="M${i+1} 0V${H}"/>`).join('')}${Array.from({length:7},(_,i)=>`<path d="M0 ${i+1}H${W}"/>`).join('')}</g>`;
 g+=`<rect width=".14" height="${H}" fill="#4a7bd0"/><rect x="${f(W-.14)}" width=".14" height="${H}" fill="#d0566a"/>`;
 // Neutral-zone fuel pile
 const dots=[];for(let i=0;i<9;i++)for(let j=0;j<22;j++)dots.push(`<circle cx="${f(W/2-FIELD.centerDepth/2+.1+i*(FIELD.centerDepth-.2)/8)}" cy="${f(H/2-FIELD.centerWidth/2+.1+j*(FIELD.centerWidth-.2)/21)}" r=".06"/>`);
 g+=`<rect x="${f(W/2-FIELD.centerDepth/2)}" y="${f(H/2-FIELD.centerWidth/2)}" width="${FIELD.centerDepth}" height="${FIELD.centerWidth}" fill="#f4df8714" stroke="#f4df8760" stroke-width=".04" stroke-dasharray=".16 .1"/><g fill="#f4df8780">${dots.join('')}</g>${label(W/2,H/2,'FUEL',.3,-90,'#f4df87aa')}`;
 g+=`<path d="M${W/2} 0V${H}" stroke="#ffffff55" stroke-width=".04"/>`;
 for(const t of trenches){const x=t.x-t.width/2,y=t.y-t.depth/2;g+=`<rect x="${f(x)}" y="${f(y)}" width="${t.width}" height="${t.depth}" fill="url(#trenchHatch)" stroke="#a48fc4" stroke-width=".04"/>${label(t.x,t.y,'TRENCH',.22,0,'#d9c8f2')}`;}
 for(const b of bumps)g+=`<rect x="${f(b.x-b.width/2)}" y="${f(b.y-b.depth/2)}" width="${b.width}" height="${b.depth}" rx=".08" fill="url(#bumpHatch)" stroke="#e0bf7a" stroke-width=".04"/>${label(b.x,b.y,'BUMP',.24,-90,'#fff3d0')}`;
 for(const h of hubs){const s=FIELD.hubSize;g+=`<rect x="${f(h.x-s/2)}" y="${f(h.y-s/2)}" width="${s}" height="${s}" rx=".06" fill="#4f3f6b" stroke="#c9b6ee" stroke-width=".05"/><circle cx="${h.x}" cy="${h.y}" r="${FIELD.openingRadius}" fill="#1d1629" stroke="#f4df87" stroke-width=".05"/>${label(h.x,h.y,'HUB',.24,0,'#f4df87')}`;}
 for(const [side,x0] of [['blue',0],['red',W-TOWER.depth]])g+=`<rect x="${f(x0)}" y="${f(H/2-TOWER.width/2)}" width="${TOWER.depth}" height="${TOWER.width}" fill="#ffffff10" stroke="#ffffff55" stroke-width=".03"/><path d="M${f(x0)} ${f(H/2-TOWER.postGap/2)}H${f(x0+TOWER.depth)}M${f(x0)} ${f(H/2+TOWER.postGap/2)}H${f(x0+TOWER.depth)}" stroke="#ffffff90" stroke-width=".05"/>${label(x0+TOWER.depth/2,H/2,'TOWER',.2,0,'#ffffffa0')}`;
 for(const x of [sl,W-sl])g+=`<path d="M${f(x)} 0V${H}" stroke="#f4df87" stroke-width=".07"/>`;
 g+=label(sl/2+.2,.4,'BLUE ZONE',.26,0,'#9fc0f5')+label(W-sl/2-.2,.4,'RED ZONE',.26,0,'#f0a5b1')+label(sl-.25,H-.55,'START LINE',.22,-90,'#f4df87')+label(W-sl+.25,H-.55,'START LINE',.22,-90,'#f4df87');
 return g;
}
function renderStartLayout(){
 const section=$('startLayoutSection'),field=$('startLayout');
 const room=online.active&&online.room?.status==='lobby'?online.room:null;
 section.hidden=onlineMode&&!room;if(section.hidden)return;
 let preview,editable,alliance,ownTeam;
 if(room){preview=createHostSimulation(room);const me=online.self;alliance=me?.alliance||'blue';ownTeam=me?.team;editable=new Set([me?.team,...(me?.aiTeams||[])]);}
 else {
  alliance='blue';ownTeam=selectedTeam;const mode=$('soloMatch').value;
  if(['3v3solo','3v0'].includes(mode))preview=createHostSimulation({mode,players:[{team:selectedTeam,alliance:'blue'}],aiTeams:soloAi,aiRoles:soloRoles});
  else {preview=new Simulation(resolvePreset(selectedTeam));if($('aiDefender').checked)preview.enableMultiplayer([resolvePreset(selectedTeam),resolvePreset(defenderTeam($('defenderDifficulty').value)===selectedTeam?'2539':defenderTeam($('defenderDifficulty').value),'red')]);}
  preview.roster=preview.roster.map(c=>({...c,...startFields(soloStartPositions[c.team])}));preview.reset();editable=new Set(preview.fleet.filter(e=>e.config.alliance==='blue').map(e=>e.config.team));
 }
 const {W,H,startPlacement,obbOverlap}=globalThis.FieldPhysics;
 field.replaceChildren();
 const svg=document.createElementNS(SVGNS,'svg');svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.innerHTML=fieldBackdrop();field.append(svg);
 const node=(tag,attrs,parent)=>{const n=document.createElementNS(SVGNS,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);if(parent)parent.append(n);return n;};
 const station=node('g',{'pointer-events':'none'},svg);
 const ownEntry=preview.fleet.find(e=>e.config.team===ownTeam&&e.config.alliance===alliance);
 const ownBlue=alliance==='blue';
 node('rect',{x:ownBlue?0:W-.3,y:-.4,width:.3,height:.8,fill:'#f4df87',rx:.04},station);
 const stationLabel=node('text',{'font-size':.18,fill:'#2a2236','text-anchor':'middle','font-weight':'bold',transform:`translate(${ownBlue?.17:W-.13} 0) rotate(-90)`},station);stationLabel.textContent='DRIVER';
 const placeStation=y=>station.setAttribute('transform',`translate(0 ${y})`);
 if(ownEntry)placeStation(ownEntry.robot.y);else station.setAttribute('visibility','hidden');
 const headingName=(c,a)=>{const toward=c.alliance==='blue'?0:Math.PI,d=Math.atan2(Math.sin(a-toward),Math.cos(a-toward));return Math.abs(d)<.1?'facing the field':Math.abs(Math.abs(d)-Math.PI)<.1?'facing its wall':d>0?'facing down the line':'facing up the line';};
 const tandemNote=()=>{const mine=preview.fleet.filter(e=>e.config.alliance===alliance&&editable.has(e.config.team));
  for(const a of mine)for(const b of mine){if(a===b||a.config.team>b.config.team)continue;const lead=globalThis.FieldPhysics.tandemLead(a,b);if(!lead)continue;const follow=lead===a?b:a;
   const lt=canUseTrench(lead.config),ft=canUseTrench(follow.config),second=lt&&!ft?`${lead.config.team} takes the trench and ${follow.config.team} the bump`:ft?`${lead.config.team} takes the bump and ${follow.config.team} the trench`:`both take bumps (neither fits the trench)`;
   return ` Tandem: ${lead.config.team} leads and ${follow.config.team} follows through one lane on pass 1, then on pass 2 ${second}.`;}
  return '';};
 const entries=[];
 for(const entry of preview.fleet){
  const c=entry.config,r=entry.robot,blue=c.alliance==='blue',canEdit=c.alliance===alliance&&editable.has(c.team);
  const g=node('g',{class:'start-robot '+(canEdit?'':'locked'),tabindex:canEdit?0:-1,role:'button','aria-label':`Team ${c.team} starting position; drag, or use up and down arrows. R rotates.`},svg);
  const tint=blue?['#3c6ca4','#8db5ec']:['#a24755','#f0919f'];
  node('rect',{class:'chassis',x:-c.length/2,y:-c.width/2,width:c.length,height:c.width,rx:.06,fill:tint[0],stroke:tint[1]},g);
  node('rect',{x:-c.length/2+.1,y:-c.width/2+.1,width:c.length-.2,height:c.width-.2,rx:.03,fill:'#0000002e','pointer-events':'none'},g);
  node('rect',{x:c.length/2-.07,y:-c.width/2+.04,width:.1,height:c.width-.08,rx:.04,fill:'#fff','pointer-events':'none'},g);
  node('path',{d:`M${c.length/2-.3} ${-c.width*.22}L${c.length/2-.12} 0L${c.length/2-.3} ${c.width*.22}Z`,fill:'#ffffffd0','pointer-events':'none'},g);
  const text=node('text',{'font-size':Math.min(.3,c.width*.36,c.length*.3),fill:'#fff','font-weight':'bold','text-anchor':'middle','dominant-baseline':'middle','pointer-events':'none'},g);text.textContent=c.team;
  const title=node('title',{},g);title.textContent=`${c.team}${canEdit?'':' (locked)'}`;
  const paint=()=>{const deg=r.a*180/Math.PI;g.setAttribute('transform',`translate(${r.x} ${r.y}) rotate(${deg})`);text.setAttribute('transform',`rotate(${-deg})`);if(entry===ownEntry)placeStation(r.y);};
  const peers=preview.fleet.filter(o=>o!==entry&&o.config.alliance===c.alliance),E=1e-3,SL=globalThis.FieldPhysics.FIELD.startLine;
  const peerBox=o=>{const e=startPlacement(o.config,o.robot.a,blue);return {x:o.robot.x,y:o.robot.y,ex:e.ex,ey:e.ey,a:o.robot.a,length:o.config.length,width:o.config.width};};
  const bounds=a=>{const e=startPlacement(c,a,blue);return {e,lo:blue?e.ex:W-SL+e.ex,hi:blue?SL-e.ex:W-e.ex};};
  const touchesLine=(x,a)=>{const {lo,hi}=bounds(a);return Math.abs(x-(blue?hi:lo))<E;};
  const touchesPeer=(x,y,a)=>{const {e}=bounds(a);return peers.some(o=>{const q=peerBox(o),dx=Math.abs(x-q.x)-(e.ex+q.ex),dy=Math.abs(y-q.y)-(e.ey+q.ey);return (Math.abs(dx)<E&&dy<-E)||(Math.abs(dy)<E&&dx<-E);});};
  // Legal: inside the zone, no overlap, and touching the start line or flush against a teammate.
  const legal=(x,y,a)=>{const {e,lo,hi}=bounds(a);if(x<lo-E||x>hi+E||y<e.ey-E||y>H-e.ey+E)return false;
   const p={x,y,a,length:c.length,width:c.width};if(peers.some(o=>obbOverlap(p,peerBox(o))))return false;return touchesLine(x,a)||touchesPeer(x,y,a);};
  // Snap to the line, teammates' bumpers, walls and teammates' centerlines, then take the nearest legal pose.
  const settle=(wantX,wantY,a,snap=true)=>{const {e,lo,hi}=bounds(a),ylo=e.ey,yhi=H-e.ey,line=blue?hi:lo;
   const xs=[line],ys=[ylo,yhi];for(const o of peers){const q=peerBox(o);xs.push(q.x-q.ex-e.ex,q.x+q.ex+e.ex);ys.push(q.y-q.ey-e.ey,q.y+q.ey+e.ey);}
   const centers=peers.map(o=>[o.robot.x,o.robot.y]);
   let x=Math.max(lo,Math.min(hi,wantX)),y=Math.max(ylo,Math.min(yhi,wantY));
   if(snap){for(const t of ys)if(Math.abs(t-y)<.15)y=t;for(const [,cy] of centers)if(Math.abs(cy-y)<.1)y=cy;}
   const xc=[x,...xs.filter(t=>t>=lo-E&&t<=hi+E)],yc=[y,...ys.filter(t=>t>=ylo-E&&t<=yhi+E)];
   let best=null,bd=Infinity;for(const cx of xc)for(const cy of yc){if(!legal(cx,cy,a))continue;const d=Math.hypot(cx-x,cy-y);if(d<bd){bd=d;best={x:cx,y:cy};}}
   return best;};
  const apply=(x,y,a)=>{r.x=x;r.y=y;r.a=a;r.startX=x;r.startY=y;r.startA=a;paint();};
  const where=()=>touchesLine(r.x,r.a)?'touching the start line':'bumper to bumper with a teammate';
  const commit=()=>{$('startSelected').textContent=`Team ${c.team} · ${headingName(c,r.a)}`;$('startLayoutMessage').textContent=`Team ${c.team} starts ${headingName(c,r.a)}, ${where()}. The driver station view lines up with it.${tandemNote()}`;
   if(room)online.send({type:'start_position',team:c.team,x:r.x,y:r.y,a:r.a});else{soloStartPositions[c.team]={x:r.x,y:r.y,a:r.a};if(c.team===selectedTeam&&!sim.multiplayer&&!sim.started&&!countdown.active){Object.assign(sim.roster[0],startFields(soloStartPositions[c.team]));sim.reset();}}};
  paint();entries.push({g,entry});
  if(!canEdit)continue;
  const norm=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const select=()=>{startSelected=c.team;for(const o of entries)o.g.classList.toggle('selected',o.entry===entry);$('startSelected').textContent=`Team ${c.team} · ${headingName(c,r.a)}`;
   const turn=a=>{const next=settle(r.x,r.y,a,false);if(!next){$('startLayoutMessage').textContent='No room to rotate there. Move a teammate first.';return;}apply(next.x,next.y,a);commit();};
   startActions={rotate:dir=>turn(norm(r.a+dir*Math.PI/2)),flip:()=>turn(norm(r.a+Math.PI))};};
  if(startSelected===c.team)select();
  let dragging=false;const pointer=e=>{const rect=svg.getBoundingClientRect();return [(e.clientX-rect.left)/rect.width*W,(e.clientY-rect.top)/rect.height*H];};
  const move=(x,y,snap=true)=>{const next=settle(x,y,r.a,snap);if(!next){$('startLayoutMessage').textContent='Robots cannot overlap. Choose another position.';return false;}apply(next.x,next.y,r.a);return true;};
  g.addEventListener('pointerdown',e=>{e.preventDefault();select();dragging=true;g.setPointerCapture(e.pointerId);g.classList.add('dragging');g.focus();});
  g.addEventListener('pointermove',e=>{if(dragging)move(...pointer(e));});
  const finish=e=>{if(!dragging)return;dragging=false;g.classList.remove('dragging');if(e.type==='pointerup')move(...pointer(e));commit();};
  g.addEventListener('pointerup',finish);g.addEventListener('pointercancel',finish);
  g.addEventListener('focus',select);
  g.addEventListener('keydown',e=>{
   const step=e.shiftKey?.02:.1,d={ArrowUp:[0,-step],ArrowDown:[0,step],ArrowLeft:[-step,0],ArrowRight:[step,0]}[e.key];
   if(d){e.preventDefault();e.stopPropagation();if(move(r.x+d[0],r.y+d[1],false))commit();}
   else if(e.code==='KeyR'){e.preventDefault();e.stopPropagation();startActions?.rotate(e.shiftKey?-1:1);}
  });
 }
 if(!entries.some(o=>o.entry.config.team===startSelected&&editable.has(o.entry.config.team))){startSelected=null;startActions=null;$('startSelected').textContent='Select a robot';}
}
$('startRotL').onclick=()=>startActions?.rotate(-1);$('startRotR').onclick=()=>startActions?.rotate(1);$('startFlip').onclick=()=>startActions?.flip();
function renderAiSelections(){
 const box=$('aiSelections'),inRoom=onlineMode&&['3v3','3v3coop'].includes(online.room?.mode)&&online.room.status==='lobby',solo=!onlineMode&&['3v3solo','3v0'].includes($('soloMatch').value);
 box.hidden=!(inRoom||solo);if(box.hidden){box.replaceChildren();for(const button of $('robotChoices').children)button.disabled=false;renderStartLayout();return;}
 const heading=document.createElement('strong');heading.textContent=inRoom?'Your AI teammates':'Choose AI robots';box.replaceChildren(heading);
 const groups=solo?($('soloMatch').value==='3v0'?['blue']:['blue','red']):(online.self?.aiTeams?.length?[online.self.alliance]:[]);
 const occupied=solo?[selectedTeam,...groups.flatMap(a=>soloAi[a])]:(online.room?.players.flatMap(p=>[p.team,...p.aiTeams])||[]);
 for(const button of $('robotChoices').children)button.disabled=button.dataset.team!==selectedTeam&&occupied.includes(button.dataset.team);
 for(const alliance of groups){const selections=solo?soloAi[alliance]:(online.self?.aiTeams||['2539','2539']);selections.forEach((team,slot)=>{
  const label=document.createElement('label');label.textContent=`${alliance.toUpperCase()} AI ${slot+1} `;const select=document.createElement('select');select.setAttribute('aria-label',`${alliance} AI ${slot+1}`);
  for(const id of teams){const option=document.createElement('option');option.value=id;option.textContent=`${id} · ${names[id]}`;option.disabled=id!==team&&occupied.includes(id);select.append(option);}select.value=team;
  select.onchange=()=>{if(solo){soloAi[alliance][slot]=select.value;renderAiSelections();}else online.send({type:'select_ai',slot,team:select.value});};label.append(select);const role=document.createElement('select');role.setAttribute('aria-label',`${alliance} AI ${slot+1} role`);for(const [id,title] of [['auto','Automatic shifts'],['score','Prioritize scoring'],['defend','Prioritize defense'],['collect','Collect full loads'],['pass','Pass fuel home']]){const o=document.createElement('option');o.value=id;o.textContent=title;role.append(o);}role.value=solo?soloRoles[alliance][slot]:(online.self.aiRoles?.[slot]||'auto');role.onchange=()=>{if(solo)soloRoles[alliance][slot]=role.value;else online.send({type:'select_ai_role',slot,role:role.value});};label.append(role);box.append(label);
 });}
 renderStartLayout();
}
function previewLobby(){
 const room=online.room;if(!room||room.status!=='lobby')return;
 sim.multiplayer=false;sim.activeIndex=Math.max(0,room.players.findIndex(p=>p.id===online.id));
 sim.roster=room.players.map(p=>({...resolvePreset(p.team,p.alliance),...startFields(p.startPositions?.[p.team])}));sim.reset();
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
  $('roomCode').textContent=online.room.code;$('roomDescription').textContent=online.room.mode==='3v3coop'?'3v3 CO-OP · BOTH PLAYERS BLUE':online.room.mode==='coop'?'CO-OP · SHARED BLUE SCORE':online.room.mode==='2v2'?'2v2 · ONE BOT PER ALLIANCE':online.room.mode==='3v3'?'3v3 · TWO BOTS PER ALLIANCE':'1v1 · BLUE vs RED';
  $('roomPlayers').replaceChildren(...online.room.players.map(p=>{const row=document.createElement('span');row.textContent=`${p.id===online.id?'You':'Player '+(p.index+1)} · ${p.team} · ${p.alliance.toUpperCase()} — ${!p.connected?'Reconnecting':p.ready?'Ready':'Choosing robot'}`;return row;}));
  if(['3v3','3v3coop'].includes(online.room.mode))for(const player of online.room.players)if(player.aiTeams.length){const row=document.createElement('span');row.textContent=`AI · ${player.aiTeams.join(', ')} · ${player.alliance.toUpperCase()}`;$('roomPlayers').append(row);}
  if(online.room.mode==='2v2'&&online.room.players.length===2){const used=new Set(online.room.players.map(p=>p.team));for(const alliance of ['blue','red']){const choice=!used.has('2539')?'2539':teams.find(t=>!used.has(t));used.add(choice);const row=document.createElement('span');row.textContent=`AI · ${choice} · ${alliance.toUpperCase()}`;$('roomPlayers').append(row);}}
  if(online.room.mode==='3v3coop'&&online.room.players.length===2){const used=new Set(online.room.players.flatMap(p=>[p.team,...p.aiTeams]));const bots=[];for(let i=0;i<3;i++){const choice=!used.has('2539')?'2539':teams.find(t=>!used.has(t));used.add(choice);bots.push(choice);}const row=document.createElement('span');row.textContent=`AI · ${bots.join(', ')} · RED`;$('roomPlayers').append(row);}
  if(online.room.players.length<2){const row=document.createElement('span');row.textContent='Waiting for player 2… Share the room code.';$('roomPlayers').append(row);}
  if(msg?.type==='room'&&online.room.status==='lobby')previewLobby();
 }else if(sim.started||sim.roster.length>1){
  sim.multiplayer=false;sim.activeIndex=0;sim.roster=[resolvePreset(selectedTeam)];sim.reset();refreshIdentity();
 }
 renderAiSelections();updateMatch();
}
function setOnlineMode(value){
 if(online.active)return;
 if(!value&&online.state==='connecting')online.leave(false);
 onlineMode=value;$('soloMatchOption').hidden=value;$('defenderOption').hidden=value||['3v3solo','3v0'].includes($('soloMatch').value);$('defenderDifficultyOption').hidden=value||(!$('aiDefender').checked&&!['3v3solo','3v0'].includes($('soloMatch').value));$('picker').classList.toggle('room-mode',value);$('onlinePanel').hidden=!value;$('soloTab').setAttribute('aria-pressed',String(!value));$('onlineTab').setAttribute('aria-pressed',String(value));
 renderAiSelections();updateMatch();
}
function connectRoom(type){
 const endpoint=$('serverUrl').value.trim();
 if(!endpoint){online.message='The match server still needs to be deployed to Render. Enter its URL under Server connection.';$('serverSettings').open=true;networkChanged();return;}
 if(type==='join'&&!/^[A-Z2-9]{6}$/i.test($('roomCodeInput').value.trim())){online.message='Enter a six-character room code.';networkChanged();return;}
 try{localStorage.setItem('fieldLabServer',endpoint);}catch{}
 online.connect(endpoint,{type,mode:$('roomMode').value,code:$('roomCodeInput').value.trim().toUpperCase(),team:selectedTeam});
}
$('aiDefender').onchange=()=>{ $('defenderDifficultyOption').hidden=onlineMode||(!$('aiDefender').checked&&!['3v3solo','3v0'].includes($('soloMatch').value));renderStartLayout();};
$('soloMatch').onchange=()=>{const full=['3v3solo','3v0'].includes($('soloMatch').value);if(full){const used=new Set([selectedTeam]);for(const alliance of ($('soloMatch').value==='3v0'?['blue']:['blue','red']))soloAi[alliance]=soloAi[alliance].map(id=>{const chosen=used.has(id)?teams.find(t=>!used.has(t)):id;used.add(chosen);return chosen;});}$('defenderOption').hidden=full;$('defenderDifficultyOption').hidden=!full&&!$('aiDefender').checked;renderAiSelections();};
$('soloTab').onclick=()=>setOnlineMode(false);$('onlineTab').onclick=()=>setOnlineMode(true);
$('createRoom').onclick=()=>connectRoom('create');$('joinRoom').onclick=()=>connectRoom('join');
$('leaveRoom').onclick=()=>{online.leave();keys.clear();networkChanged();};
$('copyRoom').onclick=async()=>{try{await navigator.clipboard.writeText(online.room.code);online.message='Room code copied.';}catch{online.message='Room code: '+online.room.code;}networkChanged();};
let savedEndpoint='';try{savedEndpoint=localStorage.getItem('fieldLabServer')||'';}catch{}
$('serverUrl').value=globalThis.FIELD_LAB_SERVER_URL||savedEndpoint||(['localhost','127.0.0.1'].includes(location.hostname)||location.hostname.endsWith('.onrender.com')?location.origin:'');
$('serverSetupNote').hidden=!!$('serverUrl').value;
window.addEventListener('pagehide',()=>online.send({type:'input',input:{}}));
createChoices();selectRobot(selectedTeam);view.resize();requestAnimationFrame(frame);
