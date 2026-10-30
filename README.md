# Mid-Atlantic Field Lab

A single-player 3D browser simulator with locally bundled Three.js (MIT licensed). No build step or package installation needed. Serve `dist` with any static server:

```sh
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. WASD/arrows drive, Q/E rotate, I toggles intake, Space shoots, P pauses. Click the field after editing a control to return keyboard focus. Touch controls are available on small screens.

The workshop changes drive speed, acceleration, chassis dimensions, intake/feed rate, capacity and stationary/moving shot spread. Profiles can be saved locally. Blue/red alliance selection resets the practice session. Both hubs are always active.

## Implementation

- `dist/physics.js`: fixed-step simulation in meters and seconds, acceleration-limited drive, circular collision envelope around rectangular chassis, walls/hubs, ramp speed reduction, directional intake and cooldowns, discrete inventory, gravity and bounced fuel, aim compensation and speed/distance-dependent shot spread.
- `dist/app.js`: keyboard/touch input, workshop and local profile persistence.
- `dist/view3d.js`: Three.js field, robot and fuel rendering; overview, follow and top-down cameras. Drag to orbit and scroll to zoom in overview mode.
- `dist/style.css`: responsive driver station UI.

This is a REBUILT-inspired practice prototype, not an official game implementation. Field obstacle geometry is approximate; no climbing, hub phase rules, robot-to-robot collisions, ball-to-ball contacts, or detailed roller dynamics. Accuracy sliders control dispersion, not a guaranteed success percentage. Team names come from the FIRST Mid-Atlantic directory; all preset capabilities and robot shapes are fictional examples, not measurements or rankings.

References: https://frc-events.firstinspires.org/2026/district/FMA and https://firstfrc.blob.core.windows.net/frc2026/Manual/HTML/2026GameManual.htm

Run physics checks with `node tests/physics.cjs`.
