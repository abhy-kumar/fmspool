import { CFG } from "./config.js";
import { POCKETS } from "./table.js";
import { dist, dot, sub, norm, mul, add, perp } from "./vec.js";

// Deep clone state for physics simulation & AI lookahead
export function cloneState(state) {
  return {
    ...state,
    balls: state.balls.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      r: b.r,
      spin: { x: b.spin.x, y: b.spin.y },
      inPlay: b.inPlay,
      pocketed: b.pocketed,
      pocketedInto: b.pocketedInto,
      distanceTravelled: b.distanceTravelled,
    })),
    firstContactMade: state.firstContactMade || false,
  };
}

// Check if all balls on table are stationary
export function allAtRest(state) {
  return state.balls.every((b) => !b.inPlay || (b.vx === 0 && b.vy === 0));
}

// Main Physics Integration Step (Deterministic, zero Math.random())
export function step(state, dt = CFG.DT) {
  const events = [];
  const balls = state.balls;
  const numBalls = balls.length;
  const r = CFG.BALL_R;

  // 1. Integrate Position & Distance
  for (let i = 0; i < numBalls; i++) {
    const b = balls[i];
    if (!b.inPlay) continue;

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const spd = Math.hypot(b.vx, b.vy);
    b.distanceTravelled = (b.distanceTravelled || 0) + spd * dt;
  }

  // 2. Rolling Friction
  for (let i = 0; i < numBalls; i++) {
    const b = balls[i];
    if (!b.inPlay) continue;

    const spd = Math.hypot(b.vx, b.vy);
    if (spd > 0) {
      const newSpd = Math.max(0, spd - CFG.ROLL_FRICTION * dt);
      if (newSpd < CFG.MIN_SPEED) {
        b.vx = 0;
        b.vy = 0;
      } else {
        const factor = newSpd / spd;
        b.vx *= factor;
        b.vy *= factor;
      }
    }
  }

  // 3. Cue Ball Spin Decay
  const cue = balls[0];
  if (cue && cue.inPlay) {
    const decay = Math.pow(CFG.SPIN_DECAY, dt);
    cue.spin.x *= decay;
    cue.spin.y *= decay;
    if (Math.abs(cue.spin.x) < 0.001) cue.spin.x = 0;
    if (Math.abs(cue.spin.y) < 0.001) cue.spin.y = 0;
  }

  // 4. Pocket Detection (Check before cushions so mouth balls fall in)
  for (let i = 0; i < numBalls; i++) {
    const b = balls[i];
    if (!b.inPlay) continue;

    for (let p = 0; p < POCKETS.length; p++) {
      const pocket = POCKETS[p];
      const d = dist(b, pocket);
      if (d < pocket.r) {
        b.pocketed = true;
        b.inPlay = false;
        b.pocketedInto = pocket.id;
        b.vx = 0;
        b.vy = 0;
        events.push({ type: "pocket", ball: b, pocket });
        break;
      }
    }
  }

  // 5. Cushion Collisions
  for (let i = 0; i < numBalls; i++) {
    const b = balls[i];
    if (!b.inPlay) continue;

    // Check if ball is near any pocket mouth (skip wall check if within pocket.r * 1.4)
    let nearPocketMouth = false;
    for (let p = 0; p < POCKETS.length; p++) {
      if (dist(b, POCKETS[p]) < POCKETS[p].r * 1.4) {
        nearPocketMouth = true;
        break;
      }
    }
    if (nearPocketMouth) continue;

    // Left cushion
    if (b.x - r < 0) {
      b.x = r;
      const vn = -b.vx;
      b.vx = vn * CFG.CUSHION_RESTITUTION;
      b.vy *= CFG.CUSHION_TANGENT_DAMP;
      if (b.id === 0 && cue.spin.x !== 0) {
        b.vy += cue.spin.x * Math.abs(vn) * CFG.SPIN_SIDE_FACTOR;
        cue.spin.x *= 0.5;
      }
      events.push({ type: "cushion", ball: b, speed: Math.abs(vn) });
    }
    // Right cushion
    else if (b.x + r > CFG.TABLE_W) {
      b.x = CFG.TABLE_W - r;
      const vn = b.vx;
      b.vx = -vn * CFG.CUSHION_RESTITUTION;
      b.vy *= CFG.CUSHION_TANGENT_DAMP;
      if (b.id === 0 && cue.spin.x !== 0) {
        b.vy -= cue.spin.x * Math.abs(vn) * CFG.SPIN_SIDE_FACTOR;
        cue.spin.x *= 0.5;
      }
      events.push({ type: "cushion", ball: b, speed: Math.abs(vn) });
    }

    // Top cushion
    if (b.y - r < 0) {
      b.y = r;
      const vn = -b.vy;
      b.vy = vn * CFG.CUSHION_RESTITUTION;
      b.vx *= CFG.CUSHION_TANGENT_DAMP;
      if (b.id === 0 && cue.spin.x !== 0) {
        b.vx -= cue.spin.x * Math.abs(vn) * CFG.SPIN_SIDE_FACTOR;
        cue.spin.x *= 0.5;
      }
      events.push({ type: "cushion", ball: b, speed: Math.abs(vn) });
    }
    // Bottom cushion
    else if (b.y + r > CFG.TABLE_H) {
      b.y = CFG.TABLE_H - r;
      const vn = b.vy;
      b.vy = -vn * CFG.CUSHION_RESTITUTION;
      b.vx *= CFG.CUSHION_TANGENT_DAMP;
      if (b.id === 0 && cue.spin.x !== 0) {
        b.vx += cue.spin.x * Math.abs(vn) * CFG.SPIN_SIDE_FACTOR;
        cue.spin.x *= 0.5;
      }
      events.push({ type: "cushion", ball: b, speed: Math.abs(vn) });
    }
  }

  // 6. Ball-Ball Pairwise Collisions
  for (let i = 0; i < numBalls; i++) {
    const a = balls[i];
    if (!a.inPlay) continue;

    for (let j = i + 1; j < numBalls; j++) {
      const b = balls[j];
      if (!b.inPlay) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const minD = r * 2;

      if (d >= minD || d === 0) continue;

      // Normal unit vector from a to b
      const nx = dx / d;
      const ny = dy / d;

      // Relative velocity
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      // If separating, skip impulse
      if (velAlongNormal > 0) continue;

      // Equal mass impulse calculation
      const impulse = -(1 + CFG.BALL_RESTITUTION) * velAlongNormal * 0.5;
      const ix = impulse * nx;
      const iy = impulse * ny;

      a.vx -= ix;
      a.vy -= iy;
      b.vx += ix;
      b.vy += iy;

      // Positional separation correction
      const overlap = minD - d;
      const push = overlap * 0.5 + CFG.SEPARATION_SLOP;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;

      // Cue Ball Spin Transfer on first contact
      const isCueCollision = (a.id === 0 || b.id === 0);
      if (isCueCollision && !state.firstContactMade) {
        state.firstContactMade = true;
        const cueBall = a.id === 0 ? a : b;
        const cueSpeed = Math.hypot(cueBall.vx, cueBall.vy);

        if (cueSpeed > 0) {
          const nForward = norm({ x: cueBall.vx, y: cueBall.vy });
          const nTangent = perp(nForward);

          // Topspin / Backspin follow/draw
          const follow = mul(nForward, cueBall.spin.y * cueSpeed * CFG.SPIN_FOLLOW_FACTOR);
          // Side spin deflection
          const side = mul(nTangent, cueBall.spin.x * cueSpeed * CFG.SPIN_SIDE_FACTOR);

          cueBall.vx += follow.x + side.x;
          cueBall.vy += follow.y + side.y;
          cueBall.spin.y = 0; // Follow/draw discharged on first hit
        }
      }

      events.push({
        type: "ballHit",
        a,
        b,
        speed: Math.abs(velAlongNormal),
      });
    }
  }

  // 7. Speed Clamping to MAX_SPEED
  for (let i = 0; i < numBalls; i++) {
    const b = balls[i];
    if (!b.inPlay) continue;

    const spd = Math.hypot(b.vx, b.vy);
    if (spd > CFG.MAX_SPEED) {
      const scale = CFG.MAX_SPEED / spd;
      b.vx *= scale;
      b.vy *= scale;
    }
  }

  return events;
}
