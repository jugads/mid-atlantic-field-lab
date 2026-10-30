/* Built-in profiles supplied by the user. Unspecified values are archetype defaults. */
(function(root){
  const names={
    '316':'LUNATECS','341':'Miss Daisy','365':'Miracle Workerz','1218':'SCH Robotics',
    '1391':'The Metal Moose','1403':'Cougar Robotics','1640':'Sab-BOT-age',
    '1676':'The Pascack PI-oneers','1923':'The MidKnight Inventors',
    '2539':'Krypton Cougars','2590':'Nemesis','2607':'The Fighting RoboVikings','8513':'Sisters 1st'
  };
  const profiles={
    // Very short and high SOTM are approximated as 0.40 m and 90%.
    '341':{archetype:'turret',height:.4,capacity:8,feedRate:10,intakeRate:15,moving:90},
    // 0.55 m clears the 0.5652 m trench. Unspecified dimensions use dumper defaults.
    '316':{archetype:'dumper',height:.55,capacity:50,feedRate:20,lanes:3,intakeRate:32,moving:75},
    '1391':{archetype:'dumper',height:.55,capacity:45,feedRate:15,lanes:4,intakeRate:20,moving:0,maxRange:3.7},
    // The 2026 robot height limit is 30 inches (0.762 m). Lane count defaults to three.
    '8513':{archetype:'dumper',height:.762,capacity:80,feedRate:20,intakeRate:30,moving:0}
  };
  function resolve(team,alliance='blue'){
    const p=profiles[team];if(!p)return null;
    const {base,ARCHETYPES}=root.FieldPhysics;
    return {...base,...ARCHETYPES[p.archetype].settings,...p,team,alliance};
  }
  root.TeamPresets={names,profiles,resolve};
  if(typeof module!=='undefined')module.exports=root.TeamPresets;
})(globalThis);
