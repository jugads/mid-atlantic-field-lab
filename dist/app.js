import {FieldView} from './view3d.js';
const {Simulation,base,ARCHETYPES,clamp,FIELD}=globalThis.FieldPhysics;
const {names,profiles,resolve:resolvePreset}=globalThis.TeamPresets;
const $=id=>document.getElementById(id),sim=new Simulation(resolvePreset('341')),canvas=$('field'),view=new FieldView(canvas);
let grid=false,keys=new Set(),last=0,accumulator=0,lastLocked=null;
const schema=[['maxSpeed','Top speed',1,6,.1,'m/s','driveSettings'],['acceleration','Acceleration',1,12,.5,'m/s²','driveSettings'],
 ['width','Width',.55,1.2,.05,'m','driveSettings'],['length','Length',.55,1.2,.05,'m','driveSettings'],['height','Height',.4,.9,.001,'m','driveSettings'],
 ['intakeRate','Intake rate',1,100,1,'fuel/s','fuelSettings'],['feedRate','Feed rate',1,25,1,'fuel/s','fuelSettings'],['capacity','Capacity',1,80,1,'fuel','fuelSettings'],
 ['lanes','Shooter lanes',1,6,1,'lanes','shootSettings'],['stationary','Stationary accuracy',10,100,1,'%','shootSettings'],['moving','Moving accuracy',0,100,1,'%','shootSettings']];
for(const id of ['team','addTeam'])for(const [number,name]of Object.entries(names)){$(id).add(new Option(number+' · '+name,number));}
$('addTeam').value='1640';
let builds={};
function normalize(p){const valid={...base};for(const [id,,min,max]of schema)if(Number.isFinite(p[id]))valid[id]=clamp(p[id],min,max);
 valid.archetype=p.archetype==='dumper'?'dumper':'turret';valid.lanes=Math.round(valid.lanes);
 valid.capacity=Math.round(valid.capacity);valid.drive=p.drive==='tank'?'tank':'swerve';valid.alliance=p.alliance==='red'?'red':'blue';valid.autoAim=p.autoAim!==false;
 valid.team=Object.hasOwn(names,p.team)?p.team:'341';return valid;}
try{const data=JSON.parse(localStorage.getItem('fma-team-builds-v1')||'{}');for(const team of Object.keys(names))if(data[team])builds[team]=normalize({...data[team],team});}catch{}

for(const [id,label,min,max,step,unit,group] of schema){
 const row=document.createElement('div');row.className='slider-row';
 row.innerHTML=`<label for="${id}">${label}<output id="${id}Value"></output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${base[id]}">`;
 $(group).append(row);$(id).addEventListener('input',()=>{sim.setConfig({[id]:Number($(id).value)});sim.reset();refreshConfig();});
}
function refreshConfig(){
 for(const [id,,, ,step,unit] of schema){$(id).value=sim.config[id];$(id+'Value').textContent=(step<1?Number(sim.config[id]).toFixed(step<.01?3:step<.1?2:1):sim.config[id])+' '+unit;}
 for(const id of ['drive','alliance','team','archetype'])$(id).value=sim.config[id];$('autoAim').checked=sim.config.autoAim;
 $('robotNumber').textContent=sim.config.team==='custom'?'FMA':sim.config.team;$('robotName').textContent=names[sim.config.team];
 $('robotType').textContent=ARCHETYPES[sim.config.archetype].label+' · '+(sim.config.drive==='swerve'?'Swerve':'Tank')+' · '+(sim.config.alliance==='blue'?'Blue':'Red')+' alliance';
 $('robotNumber').style.borderColor=sim.config.alliance==='blue'?'#568eed':'#e16d65';
 $('clearanceNote').textContent=`${sim.config.height.toFixed(2)} m robot · ${sim.config.height<=FIELD.trenchClearance?'fits under':'too tall for'} 0.565 m trench`;
 $('clearanceNote').classList.toggle('warning',sim.config.height>FIELD.trenchClearance);
 $('fuelSetup').textContent=`${sim.initialCenterCount} center · 48 depots · 48 outposts · ${sim.fleet.reduce((n,r,i)=>n+Math.min(8,r.config.capacity),0)} preload`;
 $('archetypeNote').textContent=ARCHETYPES[sim.config.archetype].description;
 $('restorePreset').disabled=sim.started||!profiles[sim.config.team];
 $('aimLabel').textContent=sim.config.archetype==='dumper'?'Fast chassis aim assist':'Auto-aim turret';
 lastLocked=null;updateIntake();updateMatch();renderGarage();
}
function updateIntake(){
 $('intake').innerHTML=`<span>◉ Intake ${sim.intake?'enabled':'disabled'}</span><kbd>I</kbd>`;$('intake').setAttribute('aria-pressed',sim.intake);
}
function togglePause(){sim.pause();keys.clear();updateMatch();}
function reset(){sim.reset();keys.clear();accumulator=0;refreshConfig();}
$('start').onclick=()=>{sim.start();keys.clear();$('settingsPanel').hidden=true;$('garagePanel').hidden=true;updateMatch();renderGarage();canvas.focus();};$('pause').onclick=togglePause;$('reset').onclick=reset;
$('intake').onclick=()=>{if(sim.started&&!sim.controlsEnabled)return;sim.intake=!sim.intake;updateIntake();};
$('viewGrid').onclick=()=>{grid=!grid;$('viewGrid').textContent=grid?'▦ Grid on':'▦ Grid off';$('viewGrid').setAttribute('aria-pressed',grid);};
$('team').onchange=()=>{const team=$('team').value,alliance=sim.config.alliance;
 sim.setConfig({...base,...(builds[team]||resolvePreset(team,alliance)||ARCHETYPES[sim.config.archetype].settings),team,alliance});reset();};
$('archetype').onchange=()=>{sim.setConfig(ARCHETYPES[$('archetype').value].settings);reset();};
for(const id of ['drive','alliance'])$(id).onchange=()=>{
 const value=$(id).value;
 if(id==='alliance'&&sim.roster.filter((r,i)=>i!==sim.activeIndex&&r.alliance===value).length>=3){$(id).value=sim.config.alliance;$('saveStatus').textContent='That alliance already has three robots.';return;}
 sim.setConfig({[id]:value});reset();};
$('autoAim').onchange=()=>sim.setConfig({autoAim:$('autoAim').checked});
$('save').onclick=()=>{try{builds[sim.config.team]=normalize(sim.config);localStorage.setItem('fma-team-builds-v1',JSON.stringify(builds));$('saveStatus').textContent='Saved build to team '+sim.config.team+'.';renderGarage();}catch{$('saveStatus').textContent='Storage unavailable in this browser.';}};
$('load').onclick=()=>{const saved=builds[sim.config.team];if(!saved){$('saveStatus').textContent='No saved build for this team yet.';return;}sim.setConfig({...saved,alliance:sim.config.alliance});reset();$('saveStatus').textContent='Loaded saved team '+sim.config.team+' build.';};
$('restorePreset').onclick=()=>{const preset=resolvePreset(sim.config.team,sim.config.alliance);if(!preset)return;sim.setConfig(preset);reset();$('saveStatus').textContent='Loaded built-in team '+sim.config.team+' build.';};
function openPanel(id){const wasOpen=!$(id).hidden;for(const panel of ['settingsPanel','garagePanel'])$(panel).hidden=true;
 if(!wasOpen){if(sim.running)togglePause();$(id).hidden=false;renderGarage();}}
$('settingsToggle').onclick=()=>openPanel('settingsPanel');$('garageToggle').onclick=()=>openPanel('garagePanel');
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>{$(button.dataset.close).hidden=true;canvas.focus();};
function switchRobot(index){keys.clear();sim.switchRobot(index);refreshConfig();canvas.focus();}
function renderGarage(){
 $('robotCount').textContent=sim.fleet.length;const list=$('fleetList');list.replaceChildren();
 sim.fleet.forEach((entry,index)=>{const cfg=index===sim.activeIndex?sim.config:entry.config,inventory=index===sim.activeIndex?sim.inventory:entry.inventory;
   const card=document.createElement('div');card.className='fleet-card'+(index===sim.activeIndex?' selected':'');
   const title=document.createElement('strong');title.textContent=cfg.team+' · '+names[cfg.team];card.append(title);
   const detail=document.createElement('small');detail.textContent=ARCHETYPES[cfg.archetype].label+' · '+cfg.alliance+' · '+inventory+'/'+cfg.capacity+' fuel'+(index===sim.activeIndex?' · YOU':' · parked');card.append(detail);
   const actions=document.createElement('div');actions.className='fleet-actions';
   const drive=document.createElement('button');drive.textContent=index===sim.activeIndex?'Driving':'Drive this robot';drive.disabled=index===sim.activeIndex;drive.onclick=()=>switchRobot(index);actions.append(drive);
   const remove=document.createElement('button');remove.textContent='Remove';remove.disabled=sim.started||sim.fleet.length<=1;remove.onclick=()=>{sim.removeRobot(index);refreshConfig();};actions.append(remove);card.append(actions);list.append(card);
 });
 $('addRobot').disabled=sim.started||sim.fleet.length>=6;
 const library=$('buildList');library.replaceChildren();
 for(const [team] of Object.entries(profiles)){const config=resolvePreset(team);const card=document.createElement('div');card.className='saved-card';card.textContent=team+' · '+names[team];
  const detail=document.createElement('small');detail.textContent='BUILT-IN · '+ARCHETYPES[config.archetype].label+' · '+config.capacity+' fuel · '+config.feedRate+' fuel/s';card.append(detail);library.append(card);}
 for(const [team,config] of Object.entries(builds)){const card=document.createElement('div');card.className='saved-card';card.textContent=team+' · '+names[team];
  const detail=document.createElement('small');detail.textContent='SAVED IN BROWSER · '+ARCHETYPES[config.archetype].label+' · '+config.capacity+' fuel · '+config.feedRate+' fuel/s';card.append(detail);library.append(card);}
}
$('addTeam').onchange=()=>{const team=$('addTeam').value;$('addArchetype').value=profiles[team]?'builtin':builds[team]?'saved':'turret';};
$('addArchetype').value='turret';
$('addRobot').onclick=()=>{const team=$('addTeam').value,selection=$('addArchetype').value,alliance=$('addAlliance').value;
 let config;
 if(selection==='builtin'){config=resolvePreset(team,alliance);if(!config){$('garageStatus').textContent='No built-in build for this team; choose a generic build.';return;}}
 else if(selection==='saved'){if(!builds[team]){$('garageStatus').textContent='No saved build for this team yet.';return;}config={...builds[team],team,alliance};}
 else config={...base,...ARCHETYPES[selection].settings,team,alliance};
 if(!sim.addRobot(config)){$('garageStatus').textContent='Reset first; maximum 6 robots and 3 per alliance.';return;}
 keys.clear();refreshConfig();$('garageStatus').textContent='Added '+team+' to '+alliance+'. Close this menu to drive.';
};
$('help').onclick=()=>{if(sim.running)togglePause();$('helpDialog').showModal();};$('closeHelp').onclick=()=>$('helpDialog').close();
const used=['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ArrowLeft','ArrowRight','Space','KeyI','KeyP','Tab'];
window.addEventListener('keydown',e=>{
 if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)||$('helpDialog').open||!used.includes(e.code))return;
 e.preventDefault();if(!e.repeat&&e.code==='Tab')switchRobot((sim.activeIndex+1)%sim.fleet.length);else if(!e.repeat&&e.code==='KeyP')togglePause();else if(!e.repeat&&e.code==='KeyI')$('intake').click();else keys.add(e.code);
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
 $('stateLabel').textContent=ready?'MATCH READY':paused?'MATCH PAUSED':p.label;
 $('phaseLabel').textContent=ready?'READY FOR AUTO':paused?'PAUSED · '+p.label:p.label;
 $('matchClock').textContent=formatTime(sim.matchRemaining);
 $('shiftClock').textContent=ready?'20s AUTO · 140s TELEOP':finished?'Final fuel score':`${formatTime(sim.phaseRemaining)} in ${p.label.toLowerCase()}`;
 $('start').hidden=sim.started&&!finished;$('start').textContent=finished?'▶ New match':'▶ Start match';
 $('pause').disabled=ready||finished;$('pause').textContent=paused?'▶ Resume':'Ⅱ Pause';
 for(const alliance of ['blue','red']){
   const status=sim.hubStatus(alliance);$(alliance+'Score').textContent=sim.scores[alliance];
   const label=ready?'STANDBY':finished?'FINAL':status.warning?'DEACTIVATING':status.grace?'INACTIVE · 3s GRACE':status.active?'HUB ACTIVE':'HUB INACTIVE';
   const element=$(alliance+'Status');element.textContent=label;element.className=status.active?'active':'inactive';
 }
 for(const segment of document.querySelectorAll('[data-phase]'))segment.classList.toggle('current',segment.dataset.phase===p.id||(p.id==='auto-settle'&&segment.dataset.phase==='auto')||(p.id==='final-settle'&&segment.dataset.phase==='endgame'));
 const overlay=$('matchOverlay');overlay.hidden=!(ready||finished||paused);
 if(ready)overlay.innerHTML='<strong>YOUR FIELD. YOUR BUILD.</strong><span>Add robots or tune a team build, then start the match.</span>';
 else if(finished)overlay.innerHTML=`<strong>MATCH COMPLETE</strong><span>Blue ${sim.scores.blue} — ${sim.scores.red} Red · ${sim.recycled} fuel returned to center</span>`;
 else if(paused)overlay.innerHTML='<strong>MATCH PAUSED</strong><span>Press P or Resume to continue.</span>';
 $('hint').textContent=ready?'WASD drive · ← → turn · Space shoot · Scroll to zoom':paused?'Clock and physics paused':p.id==='auto'?'AUTO · Driver-controlled · Both hubs active':p.id==='auto-settle'||p.id==='final-settle'?'Driver input disabled · Waiting for airborne fuel to settle':finished?'Reset or start a new match':
   (!sim.inAllianceZone?'PASS MODE · Hold Space to ferry fuel into your alliance zone':sim.config.archetype==='dumper'?'BIG DUMPER · Hold Space for fast aim and multi-lane fire':sim.activeAt(sim.config.alliance)?'YOUR HUB IS ACTIVE · Turret can shoot while moving':'YOUR HUB IS INACTIVE · Collect fuel for your next shift');
 $('shotMode').textContent=(sim.shotMode==='pass'?'↶ PASS TO HOME':'◎ SHOOT HUB')+' · '+(sim.config.archetype==='dumper'?sim.fireStatus:'SWIVEL TURRET');
 $('shotMode').classList.toggle('passing',sim.shotMode==='pass');
 const locked=sim.started;
 if(locked!==lastLocked){for(const [id]of schema)$(id).disabled=locked||(id==='lanes'&&sim.config.archetype!=='dumper');for(const id of ['team','drive','alliance','archetype','load'])$(id).disabled=locked;$('configStatus').textContent=locked?'RESET MATCH TO EDIT BUILDS':'PRE-MATCH · changes apply immediately';renderGarage();lastLocked=locked;}
 $('intake').disabled=sim.started&&!sim.controlsEnabled; $('restorePreset').disabled=sim.started||!profiles[sim.config.team];
}
function draw(){
 view.draw(sim,grid);const r=sim.robot,c=sim.config;
 $('score').textContent=sim.score;$('inventory').textContent=sim.inventory;$('capacityDisplay').textContent='/ '+c.capacity;
 $('shots').textContent=`${sim.fired} shots · ${sim.passed} passes`;
 $('accuracy').textContent=sim.resolved?Math.round(sim.made/sim.resolved*100)+'%':'—';
 $('speed').textContent=Math.hypot(r.vx,r.vy).toFixed(1);$('fill').style.width=sim.inventory/c.capacity*100+'%';
 $('elapsed').textContent=sim.recycled+' fuel returned';updateMatch();
}
function frame(now){
 const dt=last?Math.min((now-last)/1000,.1):0;last=now;
 if(sim.running&&!document.hidden){accumulator+=dt;while(accumulator>=1/120){
   const up=keys.has('KeyW'),down=keys.has('KeyS'),left=keys.has('KeyA'),right=keys.has('KeyD');
   sim.step(1/120,{up,down,left,right,...view.movement(Number(right)-Number(left),Number(down)-Number(up)),
     clockwise:keys.has('KeyE')||keys.has('ArrowRight'),counterclockwise:keys.has('KeyQ')||keys.has('ArrowLeft'),shoot:keys.has('Space')});
   accumulator-=1/120;
 }}else accumulator=0;
 draw();requestAnimationFrame(frame);
}
refreshConfig();view.resize();requestAnimationFrame(frame);
