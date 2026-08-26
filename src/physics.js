import { CFG } from "./config.js";
import { POCKETS } from "./table.js";
import { dist, dot, sub, norm, mul, add, perp, distToSegment } from "./vec.js";

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
      prevX: b.prevX,
      prevY: b.prevY,
    })),
    firstContactMade: state.firstContactMade || false,
  };
}

// Check if all balls on table are stationary
export function allAtRest(state) {
  return state.balls.every((b) => !b.inPlay || (b.vx === 0 && b.vy === 0));
}

// True when this ball is at a pocket mouth and its path takes it inside the capture
// radius - i.e. it is going in, so the surrounding cushions must not deflect it.
function isEnteringPocket(b) {
  const reach = CFG.BALL_R * 2;
  for (let p = 0; p < POCKETS.length; p++) {
    const pocket = POCKETS[p];
    const tx = pocket.x - b.x;
    const ty = pocket.y - b.y;
    const distSq = tx * tx + ty * ty;
    const mouth = pocket.r + reach;
    if (distSq > mouth * mouth) continue;

    const speedSq = b.vx * b.vx + b.vy * b.vy;
    if (speedSq < 1e-6) return true; // at rest in the jaws

    // Closest approach of the ball's current path to the pocket centre.
    const t = (tx * b.vx + ty * b.vy) / speedSq;
    if (t < 0) continue; // heading away from this pocket
    const cx = tx - b.vx * t;
    const cy = ty - b.vy * t;
    if (cx * cx + cy * cy <= pocket.r * pocket.r) return true; // same threshold as capture
  }
  return false;
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

    // Remember where the ball started this step so pocket capture can be tested
    // against the whole path travelled, not just the sampled end point.
    b.prevX = b.x;
    b.prevY = b.y;
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

    const ax = b.prevX !== undefined ? b.prevX : b.x;
    const ay = b.prevY !== undefined ? b.prevY : b.y;

    for (let p = 0; p < POCKETS.length; p++) {
      const pocket = POCKETS[p];
      // Swept test: closest approach of this step's path to the pocket centre. A point
      // test could straddle the mouth at speed and let a ball skip over the pocket.
      const d = distToSegment(pocket, { x: ax, y: ay }, { x: b.x, y: b.y });
      if (d <= pocket.r) {
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

    // The cushions near a pocket are transparent only to a ball that is genuinely
    // dropping in - one already at the mouth whose current path passes inside the
    // capture radius. Suppressing the cushions for anything merely NEAR a pocket let
    // fast balls travelling along a rail sail straight out through the jaw.
    const entering = isEnteringPocket(b);
    const openLeftRight = entering;
    const openTopBottom = entering;

    // Left cushion
    if (!openLeftRight && b.x - r < 0) {
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
    else if (!openLeftRight && b.x + r > CFG.TABLE_W) {
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
    if (!openTopBottom && b.y - r < 0) {
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
    else if (!openTopBottom && b.y + r > CFG.TABLE_H) {
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

  // 5b. Containment backstop. Nothing should ever get past the jaws, but if a
  // pathological bounce ever puts a ball outside the slate we recover it rather
  // than letting it fly off and stall the shot on the settle timeout.
  const ESCAPE = CFG.POCKET_R_CORNER + r;
  for (let i = 0; i < numBalls; i++) {
    const b = balls[i];
    if (!b.inPlay) continue;
    if (b.x < -ESCAPE || b.x > CFG.TABLE_W + ESCAPE || b.y < -ESCAPE || b.y > CFG.TABLE_H + ESCAPE) {
      b.x = Math.min(CFG.TABLE_W - r, Math.max(r, b.x));
      b.y = Math.min(CFG.TABLE_H - r, Math.max(r, b.y));
      b.vx *= 0.3;
      b.vy *= 0.3;
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

      // Relative velocity is unchanged by rewinding, so it can be taken up front.
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;

      // Rewind the pair to the exact instant of contact before resolving. By the time
      // an overlap is visible the balls have already interpenetrated by up to
      // MAX_SPEED * DT, and resolving at that position tilts the contact normal - which
      // threw cut shots off by as much as 20 degrees at full power, for the aim line,
      // the player and the AI's own simulation alike.
      let toi = 0;
      const relSq = rvx * rvx + rvy * rvy;
      if (relSq > 1e-9) {
        const bCoef = 2 * (dx * rvx + dy * rvy);
        const cCoef = dx * dx + dy * dy - minD * minD;
        const disc = bCoef * bCoef - 4 * relSq * cCoef;
        if (disc > 0) {
          const t = (-bCoef - Math.sqrt(disc)) / (2 * relSq);
          // Only ever step backwards, and never further than the step we just took.
          if (t < 0 && t > -dt) toi = t;
        }
      }
      if (toi < 0) {
        a.x += a.vx * toi;
        a.y += a.vy * toi;
        b.x += b.vx * toi;
        b.y += b.vy * toi;
      }

      // Normal unit vector from a to b, measured at the true point of contact
      const cdx = b.x - a.x;
      const cdy = b.y - a.y;
      const cd = Math.hypot(cdx, cdy) || minD;
      const nx = cdx / cd;
      const ny = cdy / cd;

      const velAlongNormal = rvx * nx + rvy * ny;

      // If separating, put the pair back where it was and skip the impulse
      if (velAlongNormal > 0) {
        if (toi < 0) {
          a.x -= a.vx * toi;
          a.y -= a.vy * toi;
          b.x -= b.vx * toi;
          b.y -= b.vy * toi;
        }
        continue;
      }

      // Equal mass impulse calculation
      const impulse = -(1 + CFG.BALL_RESTITUTION) * velAlongNormal * 0.5;
      const ix = impulse * nx;
      const iy = impulse * ny;

      a.vx -= ix;
      a.vy -= iy;
      b.vx += ix;
      b.vy += iy;

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

      // Replay the remainder of the step with the post-impact velocities, so the pair
      // ends the step exactly where it would have without the discrete-step artefact.
      if (toi < 0) {
        a.x -= a.vx * toi;
        a.y -= a.vy * toi;
        b.x -= b.vx * toi;
        b.y -= b.vy * toi;
      }

      // Any residual overlap (resting contact, or a rewind we could not take) is
      // nudged apart so the pair does not re-collide on the next step.
      const fdx = b.x - a.x;
      const fdy = b.y - a.y;
      const fd = Math.hypot(fdx, fdy);
      if (fd > 0.0001 && fd < minD) {
        const push = (minD - fd) * 0.5 + CFG.SEPARATION_SLOP;
        a.x -= (fdx / fd) * push;
        a.y -= (fdy / fd) * push;
        b.x += (fdx / fd) * push;
        b.y += (fdy / fd) * push;
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
