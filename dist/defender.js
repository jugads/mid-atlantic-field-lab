// Scoring uses full drive speed; defense keeps its established difficulty tuning.
export const defenderTeam = () => '316';
const scoringState = new WeakMap();
const defenseState = new WeakMap();
function planDefenderInput(sim, difficulty = 'medium', botIndex = 1, opponentIndex = 0, role = 'auto') {
  const defender = sim.fleet[botIndex], player = sim.fleet[opponentIndex].robot, r = defender.robot;
  const hard = difficulty === 'hard', easy = difficulty === 'easy';
  // Route according to this robot's clearance, not the robot it is defending.
  const canCrossTrench = globalThis.FieldPhysics?.canUseTrench?.(defender.config) ?? ((defender.config.height ?? 0) <= .5652 && (defender.config.width ?? 0) <= 1.30);
  const crossingLanes = canCrossTrench ? [.69, 2.51, 8.07 - 2.51, 8.07 - .69] : [2.51, 8.07 - 2.51];
  const defenseSpeed = 1;
  const driveTo = (x, y, intake = hard, speed = defenseSpeed, alignIntake = false) => {
    const dx = x - r.x, dy = y - r.y, distance = Math.hypot(dx, dy);
    if (distance < .08) return { intake };
    const angle = Math.atan2(dy, dx), error = Math.atan2(Math.sin(angle - r.a), Math.cos(angle - r.a));
    // Align the intake before driving into fuel, otherwise swerve motion pushes it away.
    const approach = speed === 1 ? Math.min(1, Math.max(.2, distance * .9)) : 1;
    const throttle = alignIntake && Math.abs(error) > .4 ? ((scoring || hard) ? speed * .75 : 0) : speed * approach;
    return { moveX: dx / distance * throttle, moveY: dy / distance * throttle, turnAxis: Math.max(-1, Math.min(1, error * 1.5)), intake };
  };
  const red = defender.config.alliance === 'red', home = red ? r.x >= 16.54 - 4.03 : r.x <= 4.03;
  const waitingToScore = role === 'score' && !canCrossTrench && sim.phase.id !== 'auto' && !sim.activeAt(defender.config.alliance);
  const passing = role === 'pass' && sim.phase.id !== 'auto' && !sim.activeAt(defender.config.alliance);
  const leavingEarly = !!sim.phase.shift && sim.activeAt(defender.config.alliance) && sim.phaseRemaining <= 5;
  const scoring = waitingToScore || sim.phase.id === 'auto' || role === 'collect' || role === 'pass' || (role !== 'defend' && sim.activeAt(defender.config.alliance) && (!leavingEarly || role === 'score'));
  // A small defensive traction advantage affects contact, not top speed.
  r.defensePush = !scoring && hard ? 1.06 : 1;
  if (scoring) {
    // All difficulty levels use the same scoring strategy and driving skill.
    const hard = true;
    let states = scoringState.get(sim); if (!states) { states = new Map(); scoringState.set(sim, states); }
    let state = states.get(botIndex);
    if (!state || sim.time < state.lastTime) { state = { collecting: false, since: sim.time, target: null, blocked: new WeakMap(), lane: null, routeHome: null, route: null }; states.set(botIndex, state); }
    state.lastTime = sim.time;
    if (state.phase !== sim.phase.id) {
      state.phase = sim.phase.id;
      state.collecting = defender.inventory < defender.config.capacity && (waitingToScore || !Number.isFinite(sim.phaseRemaining) || sim.phaseRemaining > 4);
      state.since = sim.time; state.target = null; state.route = null; state.lane = null;
    }
    if (defender.inventory === 0 && !state.collecting) { state.collecting = true; state.since = sim.time; state.target = null; }
    // Batch sizable loads and leave time to return before switching to defense.
    if (state.collecting && (defender.inventory >= (waitingToScore || role === 'collect' ? defender.config.capacity : Math.min(defender.config.capacity, 30)) || (!waitingToScore && defender.inventory > 0 && Number.isFinite(sim.phaseRemaining) && sim.phaseRemaining <= (hard && sim.phase.shift ? 9 : 4)))) { state.collecting = false; state.target = null; state.lane = null; }
    // Cross the entire structure before re-planning. Crossing the alliance-line
    // alone does not mean the back of the chassis has cleared the divider.
    const crossTrench = (towardHome) => {
      if (!state.route || state.route.towardHome !== towardHome) {
        // Select an open crossing. A defending robot in the trench should
        // send us over the adjacent bump rather than into an endless push.
        const lanes = crossingLanes;
        const hubX = red ? 16.54 - 4.03 - 1.194 / 2 : 4.03 + 1.194 / 2;
        const lane = lanes.reduce((best, y) => {
          const cost = v => Math.abs(r.y - v) + (Math.abs(player.x - hubX) < 2 && Math.abs(player.y - v) < 1.25 ? 5 : 0) + (state.avoidLane && sim.time < state.avoidLane.until && Math.abs(v - state.avoidLane.y) < .2 ? 8 : 0) + (v === .69 || v === 8.07 - .69 ? 0 : .35);
          return cost(y) < cost(best) ? y : best;
        });
        const half = defender.config.length / 2 + .18;
        const homeEdge = red ? 16.54 - 4.03 + half : 4.03 - half;
        const neutralEdge = red ? 16.54 - 4.03 - 1.194 - half : 4.03 + 1.194 + half;
        state.route = { towardHome, lane, entry: towardHome ? neutralEdge : homeEdge, exit: towardHome ? homeEdge : neutralEdge, lastX: r.x, lastY: r.y, progressAt: sim.time, chosenAt: sim.time };
      }
      const route = state.route, dir = Math.sign(route.exit - route.entry);
      // If contact or a hub corner prevents progress, retreat from the
      // structure before picking another lane. Do not spin inside a trench.
      if (Math.hypot(r.x - route.lastX, r.y - route.lastY) > .28) { route.lastX = r.x; route.lastY = r.y; route.progressAt = sim.time; }
      if (sim.time - route.progressAt > 1.4) {
        const side = r.x < (red ? 16.54 - 4.03 - 1.194 / 2 : 4.03 + 1.194 / 2) ? -1 : 1;
        state.escape = { x: (red ? 16.54 - 4.03 - 1.194 / 2 : 4.03 + 1.194 / 2) + side * 1.65, y: r.y, until: sim.time + 2 };
        state.avoidLane = { y: route.lane, until: sim.time + 6 }; state.route = null;
        return driveTo(state.escape.x, state.escape.y, true, 1);
      }
      // A moving defender can cut off a lane after it was selected. Replan
      // while still on the approach side, before entering the narrow crossing.
      const ahead = dir > 0 ? r.x < route.entry + .2 : r.x > route.entry - .2;
      if (hard && ahead && sim.time - route.chosenAt > .5 && Math.abs(player.x - (route.entry + route.exit) / 2) < 1.45 && Math.abs(player.y - route.lane) < 1.1) {
        state.avoidLane = { y: route.lane, until: sim.time + 3 }; state.route = null;
        return crossTrench(towardHome);
      }
      const passed = dir > 0 ? r.x >= route.exit - .10 : r.x <= route.exit + .10;
      if (passed) { state.route = null; return null; }
      // Approach diagonally at full speed and start the short trench turn
      // during the approach, rather than braking at an intermediate waypoint.
      const entryClear = dir > 0 ? r.x <= route.entry + .12 : r.x >= route.entry - .12;
      if (hard) {
        const dy = route.lane - r.y, laneError = Math.abs(dy), trench = route.lane < 1 || route.lane > 7;
        const e0 = Math.atan2(Math.sin(-r.a), Math.cos(-r.a)), e1 = Math.atan2(Math.sin(Math.PI - r.a), Math.cos(Math.PI - r.a));
        const error = Math.abs(e0) < Math.abs(e1) ? e0 : e1;
        if (!entryClear && laneError > (trench ? .23 : .4)) return { moveX: -dir, moveY: 0, turnAxis: trench ? Math.max(-1, Math.min(1, error * 2)) : 0, intake: true };
        if (laneError > (trench ? .16 : .3)) {
          // Advance only as far as the safe entrance until the lane is clear.
          const advance = Math.max(0, Math.min(1, (dir * (route.entry - r.x) + .20) * 2));
          const vx = dir * advance, vy = Math.max(-1, Math.min(1, dy * 2.5)), len = Math.hypot(vx, vy) || 1;
          return { moveX: vx / len, moveY: vy / len, turnAxis: trench ? Math.max(-1, Math.min(1, error * 2)) : 0, intake: true };
        }
      } else {
        if (!entryClear && Math.abs(r.y - route.lane) > .13) return driveTo(route.entry, r.y, true, 1);
        if (Math.abs(r.y - route.lane) > .13) return driveTo(route.entry, route.lane, true, 1);
      }
      // Swerve can cross in either orientation. Turn toward whichever is
      // closer while moving; bump lanes have enough width to keep heading.
      const isTrench = route.lane < 1 || route.lane > 7;
      const e0 = Math.atan2(Math.sin(-r.a), Math.cos(-r.a)), e1 = Math.atan2(Math.sin(Math.PI - r.a), Math.cos(Math.PI - r.a));
      const error = Math.abs(e0) < Math.abs(e1) ? e0 : e1;
      if (!hard && isTrench && Math.abs(error) > .14) return { turnAxis: Math.max(-1, Math.min(1, error * 1.5)), intake: true };
      return { moveX: dir, moveY: Math.max(-.35, Math.min(.35, (route.lane - r.y) * 3)), turnAxis: isTrench ? Math.max(-1, Math.min(1, error * 2)) : 0, intake: true };
    };
    if (state.escape) {
      if (sim.time < state.escape.until && Math.abs(r.x - state.escape.x) > .2) return driveTo(state.escape.x, state.escape.y, true, 1);
      state.escape = null;
    }
    // Passing requires shooting from outside our alliance zone. Leave home
    // with any fuel instead of parking there with the trigger suppressed.
    if (passing && home && defender.inventory > 0) {
      state.collecting = false;
      return crossTrench(false) || driveTo(red ? 10.8 : 5.74, r.y < 4.035 ? 2.51 : 5.56, true, 1);
    }
    if (state.route) { const crossing = crossTrench(state.route.towardHome); if (crossing) return crossing; }
    if (!state.collecting && defender.inventory > 0) {
      if (passing && !home) return { shoot: true, intake: true };
      if (!home) { const crossing = crossTrench(true); if (crossing) return crossing; }
      if (waitingToScore) return {};
      if (hard) {
        // If the defender is about to make contact, reposition inside the
        // alliance zone before shooting instead of sitting and being pinned.
        if (state.evade && (sim.time > state.evade.until || Math.hypot(r.x - state.evade.x, r.y - state.evade.y) < .45)) state.evade = null;
        if (!state.evade && sim.time > (state.evadeCooldown || 0) && Math.hypot(player.x - r.x, player.y - r.y) < 1.55) {
          const candidates = [2.15, 3, 5.07, 5.92].map(y => ({ x: red ? 14.05 : 16.54 - 14.05, y }));
          candidates.sort((a, b) => (Math.hypot(b.x - player.x, b.y - player.y) - .55 * Math.hypot(b.x - r.x, b.y - r.y)) - (Math.hypot(a.x - player.x, a.y - player.y) - .55 * Math.hypot(a.x - r.x, a.y - r.y)));
          state.evade = { ...candidates[0], until: sim.time + 1.8 }; state.evadeCooldown = sim.time + 3;
        }
        if (state.evade) return driveTo(state.evade.x, state.evade.y, false, 1);
      }
      return { shoot: true };
    }
    // Seek loose fuel in home or the neutral zone, staying on our side of
    // the center line during AUTO to avoid G403.
    const centerSafe = defender.config.length / 2 + .1;
    const eligible = b => !b.shot && !b.hubInside && b.z < .3 &&
      (!passing || (red ? b.x < 16.54 - 4.03 : b.x > 4.03)) &&
      (red ? b.x >= 4.03 : b.x <= 16.54 - 4.03) &&
      (waitingToScore || !Number.isFinite(sim.phaseRemaining) || sim.phaseRemaining > 4 || (red ? b.x >= 16.54 - 4.03 : b.x <= 4.03)) &&
      (sim.phase.id !== 'auto' || (red ? b.x >= 16.54 / 2 + centerSafe : b.x <= 16.54 / 2 - centerSafe));
    // Keep pursuing a chosen ball instead of oscillating between nearby targets.
    if (state.target && (!sim.balls.includes(state.target) || !eligible(state.target))) state.target = null;
    if (state.target && sim.time - state.targetSince > 2.5) {
      const distance = Math.hypot(state.target.x - r.x, state.target.y - r.y);
      if (distance > state.targetDistance - .35) { state.blocked.set(state.target, sim.time + 8); state.target = null; state.lane = null; }
      else { state.targetDistance = distance; state.targetSince = sim.time; }
    }
    if (!state.target) {
      // Score nearby clusters by available fuel and travel distance. Spatial
      // buckets make this linear in the number of balls rather than quadratic.
      const cell = 1, available = sim.balls.filter(b => eligible(b) && (state.blocked.get(b) || 0) <= sim.time), buckets = new Map();
      const key = (x, y) => `${x},${y}`;
      for (const b of available) { const x = Math.floor(b.x / cell), y = Math.floor(b.y / cell), k = key(x, y); buckets.set(k, (buckets.get(k) || 0) + 1); }
      let best = -Infinity, closest = Infinity;
      for (const b of available) {
        const x = Math.floor(b.x / cell), y = Math.floor(b.y / cell); let count = 0;
        for (let dx = -1; dx <= 1; dx++)for (let dy = -1; dy <= 1; dy++)count += buckets.get(key(x + dx, y + dy)) || 0;
        const distance = Math.hypot(b.x - r.x, b.y - r.y), score = Math.min(defender.config.capacity - defender.inventory, count) / (1 + .6 * distance);
        if (score > best || (score === best && distance < closest)) { best = score; closest = distance; state.target = b; }
      }
      state.targetSince = sim.time; state.targetDistance = closest;
    }
    const ball = state.target;
    if (ball) {
      const ballHome = red ? ball.x >= 16.54 - 4.03 : ball.x <= 4.03;
      if (home !== ballHome) { const crossing = crossTrench(ballHome); if (crossing) return crossing; }
      state.lane = null;
      // In open carpet, steer around an opponent directly between us and the
      // fuel. Keep the chosen side briefly so the robot does not oscillate.
      if (hard) {
        if (state.detour && (sim.time > state.detour.until || Math.hypot(r.x - state.detour.x, r.y - state.detour.y) < .4)) state.detour = null;
        const dx = ball.x - r.x, dy = ball.y - r.y, len = Math.hypot(dx, dy);
        if (!state.detour && len > .5) {
          const px = player.x - r.x, py = player.y - r.y, along = (px * dx + py * dy) / len, cross = (px * dy - py * dx) / len;
          const hubX = red ? 16.54 - 4.03 - 1.194 / 2 : 4.03 + 1.194 / 2;
          if (along > .1 && along < Math.min(len, 2.5) && Math.abs(cross) < 1.15 && Math.abs(r.x - hubX) > 1.6 && Math.abs(player.x - hubX) > 1.6) {
            const nx = -dy / len, ny = dx / len, side = cross >= 0 ? 1 : -1;
            let x = player.x + nx * side * 1.35, y = player.y + ny * side * 1.35;
            if (y < .65 || y > 7.42) { x = player.x - nx * side * 1.35; y = player.y - ny * side * 1.35; }
            state.detour = { x: Math.max(.65, Math.min(15.89, x)), y: Math.max(.65, Math.min(7.42, y)), until: sim.time + 2 };
          }
        }
        if (state.detour) return driveTo(state.detour.x, state.detour.y, true, 1);
      }
      return driveTo(ball.x, ball.y, true, 1, true);
    }
    if (passing && home) return crossTrench(false) || {};
    if (waitingToScore) { state.collecting = false; return home ? {} : (crossTrench(true) || {}); }
    if (defender.inventory) { state.collecting = false; return home ? { shoot: true } : (crossTrench(true) || { shoot: true }); }
    return {};
  }
  let states = defenseState.get(sim); if (!states) { states = new Map(); defenseState.set(sim, states); }
  let ds = states.get(botIndex); if (!ds || sim.time < ds.lastTime) { ds = { lastTime: sim.time, stuckSince: null, backoffUntil: 0, bypass: null }; states.set(botIndex, ds); } ds.lastTime = sim.time;
  // Easier defense makes decisions from less frequent observations, while
  // every level retains the same maximum drive speed and acceleration.
  const reaction = easy ? .65 : hard ? 0 : .25;
  if (!ds.observed || sim.time < ds.observedAt || sim.time - ds.observedAt >= reaction) {
    ds.observed = {x: player.x, y: player.y, vx: player.vx, vy: player.vy}; ds.observedAt = sim.time;
  }
  const dx = r.x - player.x, dy = r.y - player.y, distance = Math.hypot(dx, dy) || 1;
  const pin = sim.pinCounts?.find(p => p.attacker === botIndex && p.victim === opponentIndex);
  if (pin && pin.elapsed >= 2.1) ds.backoffUntil = Math.max(ds.backoffUntil, sim.time + 1);
  if (sim.time < ds.backoffUntil) return { moveX: dx / distance, moveY: dy / distance };
  const enemy = sim.fleet[opponentIndex].config;
  const enemyBlue = enemy?.alliance ? enemy.alliance === 'blue' : player.x < 8.27;
  const hubX = enemyBlue ? 4.03 + 1.194 / 2 : 16.54 - 4.03 - 1.194 / 2;
  const inTrench = Math.abs(r.x - hubX) < 1.3 && (r.y < 1.4 || r.y > 8.07 - 1.4);
  if (inTrench && distance < 2 && Math.hypot(r.vx, r.vy) < .35) { if (ds.stuckSince === null) ds.stuckSince = sim.time; }
  else ds.stuckSince = null;
  if (!ds.bypass && ds.stuckSince !== null && sim.time - ds.stuckSince > 1.2) {
    const side = r.x < hubX ? -1 : 1; ds.bypass = { stage: 0, entry: hubX + side * 1.55, exit: hubX - side * 1.55, lane: r.y < 8.07 / 2 ? 2.51 : 8.07 - 2.51 }; ds.stuckSince = null;
  }
  if (ds.bypass) {
    const path = ds.bypass;
    if (path.stage === 0) { if (Math.abs(r.x - path.entry) > .25) return driveTo(path.entry, r.y, false, 1); path.stage = 1; }
    if (path.stage === 1) { if (Math.abs(r.y - path.lane) > .25) return driveTo(path.entry, path.lane, false, 1); path.stage = 2; }
    if (path.stage === 2) { if (Math.abs(r.x - path.exit) > .3) return driveTo(path.exit, path.lane, false, 1); ds.bypass = null; }
  }
  const bumpOnly = enemy && (enemy.height > .5652 || enemy.width > 1.30);
  // Defend the scoring zone when it has enough loose fuel for the opponent;
  // otherwise protect the bump to interrupt their next neutral-zone trip.
  if (bumpOnly && (!Number.isFinite(ds.zoneCheckedAt) || sim.time - ds.zoneCheckedAt > .5)) {
    const blue = enemy.alliance === 'blue';
    const count = sim.balls.filter(b => !b.shot && !b.hubInside && b.z < .3 && (blue ? b.x <= 4.03 : b.x >= 16.54 - 4.03)).length;
    ds.zoneDefense = ds.zoneDefense ? count >= 12 : count >= 20; ds.zoneCheckedAt = sim.time;
  }
  const enemyHome = enemy && (enemy.alliance === 'blue' ? player.x <= 4.03 : player.x >= 16.54 - 4.03);
  // Meet an approaching bump-only robot instead of waiting at the guard point.
  // Work from either side, and ease the drive command once bumpers meet.
  const approaching = (player.vx || 0) * dx > .12;
  const nearBump = Math.abs(player.x - hubX) < (hard ? 4 : 2) && Math.abs(r.x - hubX) < (hard ? 2.7 : 2);
  if (!nearBump || distance > 2.4) ds.bumpAnchor = null;
  // Travel around the near end of the hub before changing bump lanes. Driving
  // straight sideways at the hub face would leave the defender stuck there.
  if (hard && bumpOnly && Math.abs(player.x - hubX) < 4 && distance > 1.6) {
    const predictedY = player.y + (player.vy || 0) * .3;
    const lane = predictedY < 8.07 / 2 ? 2.51 : 8.07 - 2.51;
    if (!ds.laneShift && (r.y - 8.07 / 2) * (lane - 8.07 / 2) < 0 && Math.abs(r.x - hubX) < 1.5) {
      ds.laneShift = { x: hubX + (r.x < hubX ? -1 : 1) * 1.4, lane };
    }
    if (ds.laneShift) {
      const path = ds.laneShift; path.lane = lane;
      if ((r.y - 8.07 / 2) * (lane - 8.07 / 2) > 0 && Math.abs(r.y - lane) < .5) ds.laneShift = null;
      else if (Math.abs(r.x - path.x) > .2) return driveTo(path.x, path.lane, false, 1);
      else return driveTo(path.x, lane, false, 1);
    }
  } else if (!bumpOnly) ds.laneShift = null;
  if (bumpOnly && nearBump && distance < (hard ? 4.5 : 2.2) && Math.abs(dy) < 1.1 && (approaching || (hard && ds.bumpEngagedUntil > sim.time))) {
    if (hard && approaching) ds.bumpEngagedUntil = sim.time + 1.5;
    // Hard mode holds bumper pressure through contact instead of yielding as
    // soon as the opposing robot slows; use bounded displacement and the pin
    // release above rather than driving it across the field indefinitely.
    if (!ds.bumpAnchor && distance < 1.25) ds.bumpAnchor = {x: player.x, y: player.y};
    const pushed = ds.bumpAnchor ? ((player.x - ds.bumpAnchor.x) * -dx + (player.y - ds.bumpAnchor.y) * -dy) / distance : 0;
    const throttle = hard ? (pushed < .8 ? 1 : .25) : (distance > 1.2 ? .7 : .25);
    // Keep the bumper square to resist being deflected around the side.
    const e0 = Math.atan2(Math.sin(-r.a), Math.cos(-r.a)), e1 = Math.atan2(Math.sin(Math.PI-r.a), Math.cos(Math.PI-r.a));
    const error = Math.abs(e0) < Math.abs(e1) ? e0 : e1;
    return { moveX: -dx / distance * throttle, moveY: -dy / distance * throttle, turnAxis: Math.max(-1, Math.min(1, error * 2)), intake: false };
  }
  const returningOpponent = bumpOnly && !enemyHome && sim.activeAt(enemy.alliance);
  if (returningOpponent) {
    // Guard the home side of the bump while the opponent is outside, so it
    // must fight through the defender to return and shoot.
    const direction = enemyBlue ? 1 : -1, predictedY = player.y + (player.vy || 0) * .35;
    const lane = predictedY < 8.07 / 2 ? 2.51 : 8.07 - 2.51;
    const targetY = Math.max(lane - .5, Math.min(lane + .5, predictedY));
    const insideX = hubX - direction * 1.25, entryX = hubX + direction * 1.35;
    const onNeutralSide = (r.x - hubX) * direction > .3;
    if (onNeutralSide && Math.abs(r.y - lane) > .3) {
      const entryClear = (r.x - hubX) * direction > 1.2;
      return driveTo(entryClear ? entryX : r.x, lane, false, hard ? 1 : defenseSpeed);
    }
    return driveTo(insideX, targetY, false, hard ? 1 : defenseSpeed);
  }
  if (bumpOnly && !(ds.zoneDefense && enemyHome) && Math.abs(player.x - hubX) < 2.7) {
    const direction = enemyBlue ? 1 : -1;
    // Keep the simpler, forgiving bump block on easy and medium.
    if (!hard) {
      const side = player.y < 8.07 / 2 ? 2.51 : 8.07 - 2.51;
      return driveTo(hubX + direction * 1.1, side, false, 1);
    }
    // Intercept only while the opponent is approaching its bump. Once it has
    // crossed, pursue its corner instead of guarding an empty lane behind it.
    if ((player.x - hubX) * direction < .35) {
      const predictedY = player.y + (player.vy || 0) * .45;
      const lane = predictedY < 8.07 / 2 ? 2.51 : 8.07 - 2.51;
      const targetY = Math.max(lane - .62, Math.min(lane + .62, predictedY));
      const targetX = hubX + direction * .95;
      const bx = targetX - r.x, by = targetY - r.y, range = Math.hypot(bx, by);
      if (range < .035) return { intake: false };
      // React at full speed until nearly in position, including lateral changes
      // within the lane; braking still comes from the normal robot physics.
      const throttle = Math.min(1, range * 3.5), heading = Math.atan2(by, bx);
      const error = Math.atan2(Math.sin(heading - r.a), Math.cos(heading - r.a));
      return { moveX: bx / range * throttle, moveY: by / range * throttle, turnAxis: Math.max(-1, Math.min(1, error * 1.5)), intake: false };
    }
  }
  // Pursuit must route around the opponent hub and divider even when the
  // player is far away; a straight line into the hub wastes an entire shift.
  if (hard) {
    const obstacleX = player.x < 8.27 ? 4.627 : 11.913;
    const separated = (r.x - obstacleX) * (player.x - obstacleX) < 0 && Math.abs(r.x - obstacleX) > .65 && Math.abs(player.x - obstacleX) > .65;
    if (separated || ds.cross) {
      if (!ds.cross) {
        const lanes = crossingLanes, dir = Math.sign(player.x - r.x);
        const lane = lanes.reduce((best, y) => Math.abs(r.y - y) + Math.abs(player.y - y) < Math.abs(r.y - best) + Math.abs(player.y - best) ? y : best);
        ds.cross = { lane, dir, entry: obstacleX - dir * 1.35, exit: obstacleX + dir * 1.35 };
      }
      const p = ds.cross;
      if ((p.dir > 0 ? r.x >= p.exit : r.x <= p.exit) || Math.abs(player.x - r.x) < 1.6) ds.cross = null;
      else {
        // Move diagonally toward the entrance whenever the chassis is clear.
        if (Math.abs(r.y - p.lane) > .25) {
          const atSafeSide = p.dir > 0 ? r.x <= p.entry : r.x >= p.entry;
          return driveTo(atSafeSide ? p.entry : r.x, p.lane, false, 1);
        }
        const e0 = Math.atan2(Math.sin(-r.a), Math.cos(-r.a)), e1 = Math.atan2(Math.sin(Math.PI - r.a), Math.cos(Math.PI - r.a));
        const error = Math.abs(e0) < Math.abs(e1) ? e0 : e1;
        return { moveX: p.dir, moveY: Math.max(-.35, Math.min(.35, (p.lane - r.y) * 3)), turnAxis: (p.lane < 1 || p.lane > 7) ? Math.max(-1, Math.min(1, error * 2)) : 0 };
      }
    }
  }
  const lead = easy ? 0 : Math.min(hard ? .7 : .16, distance / (hard ? 6 : 12));
  if (hard && enemy) {
    // Aim at an offset on the near face rather than the center. Bumper contact
    // then applies a realistic turning impulse through the collision model.
    const c = Math.cos(player.a), s = Math.sin(player.a), localX = dx * c + dy * s, localY = -dx * s + dy * c;
    const xFace = Math.abs(localX) / (enemy.length || 1) >= Math.abs(localY) / (enemy.width || 1);
    const tangent = xFace ? { x: -s, y: c } : { x: c, y: s };
    const lateral = xFace ? localY : localX;
    let side = Math.abs(lateral) > .08 ? Math.sign(lateral) : (player.y < 4.035 ? 1 : -1);
    const offset = (xFace ? (enemy.width || 1) : (enemy.length || 1)) * .38;
    let tx = player.x + player.vx * lead + tangent.x * side * offset, ty = player.y + player.vy * lead + tangent.y * side * offset;
    if (ty < .5 || ty > 7.57) { side = -side; tx = player.x + player.vx * lead + tangent.x * side * offset; ty = player.y + player.vy * lead + tangent.y * side * offset; }
    // Close quickly and bump off-center, then hold position and slide toward a
    // corner instead of continuously driving through and towing the opponent.
    tx -= dx / distance * .2; ty -= dy / distance * .2;
    const ax = tx - r.x, ay = ty - r.y, span = Math.hypot(ax, ay) || 1;
    let mx = ax / span, my = ay / span;
    const contactRange = (Math.hypot(defender.config.length, defender.config.width) + Math.hypot(enemy.length, enemy.width)) * .39;
    if (distance < contactRange) {
      const towardX = -dx / distance, towardY = -dy / distance;
      const closing = mx * towardX + my * towardY;
      if (closing > 0) { const allowed = Math.max(0, Math.min(.22, (distance - contactRange + .25) * .88)); mx -= towardX * Math.max(0, closing - allowed); my -= towardY * Math.max(0, closing - allowed); }
    }
    const heading = Math.atan2(ay, ax), err = Math.atan2(Math.sin(heading - r.a), Math.cos(heading - r.a));
    return { moveX: mx, moveY: my, turnAxis: Math.max(-1, Math.min(1, err * 1.5)), intake: true };
  }
  return driveTo(ds.observed.x + ds.observed.vx * lead, ds.observed.y + ds.observed.vy * lead);
}

// Swiveling shooters can score while following their normal collection or
// evasion route. Only fire inside their scoring zone and effective range.
export function defenderInput(sim, difficulty = 'medium', botIndex = 1, opponentIndex = 0) {
  const role = sim.fleet[botIndex].config.aiRole || 'auto';
  const input = planDefenderInput(sim, difficulty, botIndex, opponentIndex, role);
  const bot = sim.fleet[botIndex], c = bot.config, r = bot.robot;
  const active = sim.phase.id === 'auto' || (sim.activeAt(c.alliance) && !(sim.phase.shift && sim.phaseRemaining <= 5));
  const home = c.alliance === 'red' ? r.x >= 16.54 - 4.03 : r.x <= 4.03;
  const hubX = c.alliance === 'red' ? 16.54 - 4.627 : 4.627;
  // Defenders should not pursue contact into either tower's endgame area.
  // Keep a robot-width buffer around the structure and steer out if already inside.
  if (sim.phase.id === 'endgame' && role === 'defend') {
    const margin = 1.30 + Math.hypot(c.length || .9, c.width || .85) / 2 + 1.05;
    const band = .83 / 2 + Math.hypot(c.length || .9, c.width || .85) / 2 + .55;
    const side = r.x < 16.54 / 2 ? 1 : -1, distance = side > 0 ? r.x : 16.54-r.x, lateral = r.y - 8.07 / 2;
    const mx=input.moveX||0,my=input.moveY||0;
    if (distance < margin && Math.abs(lateral) < band) {
      input.moveX=side;input.moveY=Math.abs(lateral) < .05 ? (opponentIndex % 2 ? 1 : -1)*.3 : Math.sign(lateral)*.3;
    } else if (distance < margin && lateral*my < 0 && Math.abs(lateral) < band+.5) {
      input.moveY=0;
    } else if (Math.abs(lateral) < band && distance < margin+.5 && mx*side < 0) {
      input.moveX=0;
    }
  }
  const waitingToScore = role === 'score' && sim.phase.id !== 'auto' && !sim.activeAt(c.alliance) && !(globalThis.FieldPhysics?.canUseTrench?.(c) ?? ((c.height ?? 0) <= .5652 && (c.width ?? 0) <= 1.30));
  if (waitingToScore || (!active && home && ['collect','pass'].includes(role))) input.shoot = false;
  else if (role === 'pass' && bot.inventory > 0 && !home && sim.phase.id !== 'auto' && (!sim.activeAt(c.alliance) || sim.phase.id === 'endgame')) input.shoot = true;
  else if (bot.inventory > 0 && ['turret','double_turret'].includes(c.archetype) && ((!home && !active) || (active && home && Math.hypot(r.x-hubX,r.y-8.07/2) <= c.maxRange))) input.shoot = true;
  return input;
}
