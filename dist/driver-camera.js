// Eye position stays at the driver station; only the neck's yaw/pitch follow.
export function driverStationPose(previous, robot, config, width, dt) {
  const side = config.alliance === 'red' ? 1 : -1;
  const eye = {x: side * (width / 2 + .85), y: 1.75, z: Number.isFinite(config.stationY) ? config.stationY : -side * 2.2};
  const dx = robot.x - eye.x, dz = robot.z - eye.z;
  const yaw = Math.atan2(dz, dx);
  const pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 6,
    Math.atan2(robot.y - eye.y, Math.hypot(dx, dz))));
  const step = (from, to, speed) => {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    const seconds = Math.max(0, Math.min(.1, dt));
    return from + Math.max(-speed * seconds, Math.min(speed * seconds, delta * (1 - Math.exp(-seconds / .18))));
  };
  const reset = !previous || previous.side !== side;
  const headYaw = reset ? yaw : step(previous.yaw, yaw, 2.6);
  const headPitch = reset ? pitch : step(previous.pitch, pitch, 1.8);
  return {side, eye, yaw: headYaw, pitch: headPitch,
    target: {x: eye.x + Math.cos(headYaw) * Math.cos(headPitch),
      y: eye.y + Math.sin(headPitch), z: eye.z + Math.sin(headYaw) * Math.cos(headPitch)}};
}
