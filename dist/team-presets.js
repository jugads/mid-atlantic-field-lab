/* Built-in profiles supplied by the user. Unspecified values are archetype defaults. */
(function(root){
  const names={
    '193':'MORT Beta','316':'LUNATECS','341':'Miss Daisy','365':'Miracle Workerz','1218':'SCH Robotics',
    '1391':'The Metal Moose','1403':'Cougar Robotics','1640':'Sab-BOT-age',
    '1676':'The Pascack PI-oneers','1923':'The MidKnight Inventors',
    '5895':'Peddie Robotics','2539':'Krypton Cougars','2590':'Nemesis','2607':'The Fighting RoboVikings','8513':'Sisters 1st','9094':'Team 9094'
  };
  const profiles={
    // Very short and high SOTM are approximated as 0.40 m and 90%.
    '341':{archetype:'turret',height:.4,capacity:8,feedRate:10,intakeRate:15,moving:90},
    // 0.55 m clears the 0.5652 m trench. Unspecified dimensions use dumper defaults.
    '316':{disableIntakeWhileMovingShot:true,aimLockWhileShooting:true,shooterDirection:'back',archetype:'dumper',height:.55,capacity:50,feedRate:25,lanes:3,intakeRate:32,moving:75},
    '1391':{intakeDirection:'front',shooterMount:'back',archetype:'dumper',height:.55,capacity:45,feedRate:15,lanes:4,intakeRate:20,moving:0,maxRange:3.6},
    // The 2026 robot height limit is 30 inches (0.762 m). Lane count defaults to three.
    '8513':{shooterDirection:'back',archetype:'dumper',height:.762,capacity:80,feedRate:20,intakeRate:25,moving:0},
    '193':{intakeDirection:'front',shooterMount:'back',shooterDirection:'front',archetype:'dumper',height:.762,capacity:80,feedRate:20,intakeRate:35,moving:0,maxRange:2},
    '5895':{archetype:'double_turret',height:.50,width:.8262,length:.8762,capacity:40,feedRate:14,intakeRate:32,moving:80,intakeDirection:'front'},
    '2539':{archetype:'dumper',height:.50,width:.8262,length:.8762,capacity:40,feedRate:20,intakeRate:30},
    '9094':{archetype:'turret',capacity:35,feedRate:7,intakeRate:20,moving:75}
  };
  function resolve(team,alliance='blue'){
    const p=profiles[team];if(!p)return null;
    const {base,ARCHETYPES}=root.FieldPhysics;
    return {...base,...ARCHETYPES[p.archetype].settings,...p,team,alliance};
  }
  root.TeamPresets={names,profiles,resolve};
  if(typeof module!=='undefined')module.exports=root.TeamPresets;
})(globalThis);
