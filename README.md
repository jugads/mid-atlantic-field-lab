# Mid-Atlantic Field Lab

Full-screen, single-player 3D REBUILT field simulator. Three.js is bundled locally under its MIT license; there is no build step.

```sh
python3 -m http.server 8080 --directory dist
# Open http://localhost:8080
node tests/physics.cjs
```

## Controls

- WASD: camera-relative swerve movement; W/S forward/back and A/D turn for tank.
- Left/Right arrows or Q/E: turn the chassis.
- Space: shoot at your hub from your alliance zone; otherwise pass to the marked home-zone landing area.
- I: toggle intake. Tab: select the next robot. P: pause.
- Scroll: zoom. Free orbit camera allows dragging.
- Standard gamepad: left stick drives, right stick turns; A / Cross or right trigger shoots, X / Square toggles intake, right bumper switches robots, and Start / Options starts or pauses. The page must be focused; press a controller button after connecting. The standard browser gamepad mapping is required.
- Menus: Robots adds/selects/removes robots; Settings edits and saves a team build.

AUTO is deliberately driver-controlled, per the user's request. No autonomous routine runs automatically. Up to six robots, at most three per alliance, can be placed before a match. Only the selected robot is driven; the others remain parked physical obstacles. Builds save per team in browser localStorage under `fma-team-builds-v1`. Reset to edit or add/remove robots.

## Robot archetypes

Turret: independent swivel aim and motion compensation.

Big dumper: fixed, fast chassis-aim shooter with 1–6 parallel lanes. It can shoot while moving; the moving-accuracy slider controls dispersion. Dumper lanes emit fuel individually, with slightly irregular intervals averaging the configured total feed rate. Five lanes at 25 fuel/s share an average total of 25 fuel/s, not 125 fuel/s. Feed rate is adjustable up to 25 fuel/s and intake rate up to 100 fuel/s. Both chassis styles use generic boxes with yellow fill increasing in height and intensity with inventory.

## Match behavior

- 20-second AUTO, followed by a 3-second scoring delay.
- 140-second TELEOP: 10-second transition, four 25-second alternating hub shifts, 30-second end game.
- AUTO fuel winner is inactive in shift 1. Ties use a random order. Both hubs are active in AUTO, transition and end game.
- Three seconds of scoring grace after hub deactivation and at the match end.
- Active, eligible fuel earns one point. Hub entries recycle from four neutral-facing exits even when inactive.
- Standard 504-fuel setup: 48 in depots, 48 stored in outposts, up to eight preloads per robot; unused robot preloads join the compact neutral-zone pile. One eight-fuel robot gives 400 center fuel; six give 360.

## Physics and geometry

All robot presets default to 5 m/s top speed and 10 m/s² acceleration. Legacy saved builds are migrated to those values in memory; subsequent explicitly saved adjustments are preserved. Neutral drive input brakes at three times configured acceleration (minimum 12 m/s²). SI units, 120 Hz base stepping with adaptive contact substeps so high-speed fuel moves less than 0.55 ball radii per substep. Spatially hashed sphere contacts, restitution, gravity, impact/rolling losses, and relative-velocity moving-chassis contacts. Robot footprints use oriented-box contacts. Shot spread depends on range, chassis pitch, and speed. Passing uses ballistic trajectories to an alliance-zone landing target. Fuel and inventory are conserved through capture, capacity changes, scoring and recycling.

Bumps have sloping faces, approximately 15 degrees, 1.128 m travel depth, 1.854 m width and 0.1654 m crest height. Wheel contact samples raise/pitch/roll the chassis. Trenches have 0.5652 m clearance and 1.279 m usable lane width; tall robots cannot pass. Towers have a traversable base, separate upright, brace and rung collision volumes; rung heights are 0.6858, 1.143 and 1.6002 m. Robots and fuel collide with these structures at their actual modeled heights.

This is a practice simulator, not a full rigid-body FRC digital twin. Tower depth placement and brace contact volumes are approximations; suspension, hub netting, ball deformation, and distribution are simplified. Climbing and climb scoring, fouls, ranking points, AI robots and human-player feeding are not implemented. Outpost reserves remain stored. Teams 341, 316, 1391 and 8513 have built-in presets based on the supplied specifications. Unspecified width, length, speed, acceleration and stationary accuracy use archetype defaults. Team 341 height (0.400 m) and moving accuracy (90%) interpret “very short” and “high”; team 8513 height is the 2026 legal maximum of 0.762 m, and its unspecified lane count defaults to three. Zero moving accuracy makes moving shots miss while allowing stationary shots. Accuracy settings tune spread rather than guarantee a score percentage.

## Source

- `dist/physics.js`: match state, fleet, braking, geometry constants and simulation.
- `dist/team-presets.js`: permanent, version-controlled user-specified team builds.
- `dist/controller.js`: standard gamepad mapping, deadzones and edge-triggered actions.
- `dist/view3d.js`: Three.js models, instanced fuel and camera views.
- `dist/app.js`: input, menus, team build persistence and HUD.
- `tests/physics.cjs`: timing, setup, recycling, passing, high-speed contacts, lane rate, tower clearance, fleet and full-match conservation checks.

References:
- https://firstfrc.blob.core.windows.net/frc2026/Manual/HTML/2026GameManual.htm (§5.4–5.8, §6.3–6.5)
- https://frc-events.firstinspires.org/2026/district/FMA
