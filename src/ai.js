import { CFG, DIFFICULTY } from "./config.js";
import { POCKETS } from "./table.js";
import { cloneState, allAtRest, step } from "./physics.js";
import { getBallGroup, countRemaining, createShotReport, processPhysicsEvents, evaluateShot } from "./rules.js";
import { gauss, randRange } from "./rng.js";
import {
  dist,
  sub,
  norm,
  mul,
  add,
  dot,
  perp,
  angleBetween,
  clamp,
  distToSegment,
  fromAngle,
} from "./vec.js";

// Helper to check line of sight clearance between two physics points
function testPathClearance(from, to, balls, ignoreIds = [], requiredRadius = CFG.BALL_R * 2) {
  let minMargin = Infinity;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (!b.inPlay || ignoreIds.includes(b.id)) continue;
    const d = distToSegment(b, from, to);
    const margin = d - requiredRadius;
    if (margin < 0) return -1; // Blocked
    if (margin < minMargin) minMargin = margin;
  }
  return minMargin === Infinity ? 50 : minMargin;
}

// Compute fast heuristic prior for a target and pocket (0..1)
function computeShotPrior(cue, target, pocket, balls) {
  const toPocket = norm(sub(pocket, target));
  const ghostPos = sub(pocket, mul(toPocket, CFG.BALL_R * 2));
  const toGhost = sub(ghostPos, cue);
  const aim = norm(toGhost);

  const cutRad = angleBetween(toPocket, aim);
  const cutDeg = (cutRad * 180) / Math.PI;
  if (cutDeg > 78) return -1; // Physically near-impossible cut

  const cueMargin = testPathClearance(cue, ghostPos, balls, [0, target.id]);
  if (cueMargin < 0) return -1;

  const targetMargin = testPathClearance(target, pocket, balls, [0, target.id]);
  if (targetMargin < 0) return -1;

  const margin = Math.min(cueMargin, targetMargin);
  const distCueTarget = dist(cue, target);
  const distTargetPocket = dist(target, pocket);

  const prior =
    (1 - cutDeg / 78) * 0.45 +
    clamp(1 - distTargetPocket / 700, 0, 1) * 0.25 +
    clamp(1 - distCueTarget / 700, 0, 1) * 0.15 +
    clamp(margin / 20, 0, 1) * 0.15;

  const power = clamp(0.24 + distCueTarget / 1400 + distTargetPocket / 1100, 0.18, 0.92);
  const aimAngle = Math.atan2(aim.y, aim.x);

  return {
    target,
    pocket,
    prior,
    aimAngle,
    power,
    cutDeg,
    ghostPos,
  };
}

// Get the highest prior available for a player in a given state (cheap heuristic check)
function getBestPriorForShooter(state, shooterGroup, openTable) {
  const cue = state.balls[0];
  if (!cue || !cue.inPlay) return 0;

  const remaining = countRemaining(state.balls, shooterGroup);
  let best = 0;

  for (let i = 1; i <= 15; i++) {
    const b = state.balls[i];
    if (!b || !b.inPlay) continue;
    const bGroup = getBallGroup(b.id);

    let isLegal = false;
    if (openTable) isLegal = (b.id !== 8);
    else if (remaining > 0) isLegal = (bGroup === shooterGroup);
    else isLegal = (b.id === 8);

    if (!isLegal) continue;

    for (let p = 0; p < POCKETS.length; p++) {
      const cand = computeShotPrior(cue, b, POCKETS[p], state.balls);
      if (cand !== -1 && cand.prior > best) {
        best = cand.prior;
      }
    }
  }

  return best;
}

// Simulate a candidate shot using the real physics engine
function simulateShot(state, shot) {
  const simState = cloneState(state);
  const cue = simState.balls[0];
  if (!cue) return { score: -900, simState };

  const dir = fromAngle(shot.angle);
  const speed = shot.power * CFG.POWER_TO_SPEED;
  cue.vx = dir.x * speed;
  cue.vy = dir.y * speed;
  cue.spin = { ...shot.spin };

  const report = createShotReport();
  let steps = 0;

  while (!allAtRest(simState) && steps < CFG.AI_SIM_MAX_STEPS) {
    const events = step(simState, CFG.AI_SIM_DT);
    processPhysicsEvents(report, events, simState);
    steps++;
  }

  return { report, simState };
}

// Evaluate simulated candidate outcome
function scoreSimulatedOutcome(state, shot, report, resultState, difficulty) {
  const aiGroup = state.groups.AI;
  const oppGroup = state.groups.PLAYER;
  const shooterBallsLeft = countRemaining(state.balls, aiGroup);

  let score = 0;
  const cueScratched = report.cueScratched;
  const eightPocketed = report.pocketed.some((p) => p.ball.id === 8);
  const ownPocketed = report.pocketed.filter((p) => getBallGroup(p.ball.id) === aiGroup && p.ball.id !== 8);
  const oppPocketed = report.pocketed.filter((p) => getBallGroup(p.ball.id) === oppGroup && p.ball.id !== 8);

  // Foul checks
  const foul = cueScratched || report.firstContact === null ||
    (!state.openTable && shooterBallsLeft > 0 && getBallGroup(report.firstContact) !== aiGroup) ||
    (!state.openTable && shooterBallsLeft === 0 && report.firstContact !== 8) ||
    (state.openTable && report.firstContact === 8) ||
    (report.pocketed.length === 0 && !report.anyBallHitCushionAfterContact);

  if (foul) score -= 900;
  if (cueScratched) score -= 700;

  if (eightPocketed) {
    if (foul || shooterBallsLeft > 0 || state.openTable) {
      return -100000; // Immediate loss
    } else {
      return 100000; // Legal win!
    }
  }

  score += ownPocketed.length * 1000;
  score -= oppPocketed.length * 260;

  if (!foul && (ownPocketed.length > 0 || (state.openTable && report.pocketed.length > 0))) {
    score += 300; // Turn continues
  }

  // Next shot quality (lookahead heuristic)
  const nextQ = getBestPriorForShooter(resultState, aiGroup, state.openTable && report.pocketed.length === 0);
  score += 320 * nextQ;

  // Opponent reply penalty for PRO and LEGEND
  if (difficulty.lookahead >= 1) {
    const oppReply = getBestPriorForShooter(resultState, oppGroup, state.openTable);
    score -= 140 * oppReply;
  }

  return score;
}

// Public API: Choose Shot
export async function chooseShot(state, difficultyDef, rng) {
  const startTime = performance.now();
  const cue = state.balls[0];
  const aiGroup = state.groups.AI;
  const ballsLeft = countRemaining(state.balls, aiGroup);

  // 1. Identify legal targets
  const legalTargets = [];
  for (let i = 1; i <= 15; i++) {
    const b = state.balls[i];
    if (!b || !b.inPlay) continue;
    const bGroup = getBallGroup(b.id);

    if (state.openTable) {
      if (b.id !== 8) legalTargets.push(b);
    } else if (ballsLeft > 0) {
      if (bGroup === aiGroup) legalTargets.push(b);
    } else {
      if (b.id === 8) legalTargets.push(b);
    }
  }

  // 2. Generate candidate shots
  const candidates = [];
  for (let t = 0; t < legalTargets.length; t++) {
    const target = legalTargets[t];
    for (let p = 0; p < POCKETS.length; p++) {
      const pocket = POCKETS[p];
      const cand = computeShotPrior(cue, target, pocket, state.balls);
      if (cand !== -1 && cand.prior > 0) {
        candidates.push(cand);
      }
    }
  }

  // Sort candidates by heuristic prior
  candidates.sort((a, b) => b.prior - a.prior);
  const topCandidates = candidates.slice(0, CFG.AI_MAX_CANDIDATES);

  // Expand candidates with power/spin variants
  const shotQueue = [];
  topCandidates.forEach((c) => {
    // Standard power
    shotQueue.push({
      angle: c.aimAngle,
      power: c.power,
      spin: { x: 0, y: 0 },
      calledPocket: c.pocket.id,
      targetId: c.target.id,
      prior: c.prior,
    });
    // Firm power
    shotQueue.push({
      angle: c.aimAngle,
      power: Math.min(1.0, c.power * 1.25),
      spin: { x: 0, y: 0 },
      calledPocket: c.pocket.id,
      targetId: c.target.id,
      prior: c.prior * 0.9,
    });

    if (difficultyDef.lookahead >= 1) {
      // Topspin variant
      shotQueue.push({
        angle: c.aimAngle,
        power: c.power,
        spin: { x: 0, y: 0.6 },
        calledPocket: c.pocket.id,
        targetId: c.target.id,
        prior: c.prior * 0.85,
      });
      // Backspin variant
      shotQueue.push({
        angle: c.aimAngle,
        power: c.power,
        spin: { x: 0, y: -0.6 },
        calledPocket: c.pocket.id,
        targetId: c.target.id,
        prior: c.prior * 0.85,
      });
    }
  });

  // Cap total simulations to budget
  const simulations = shotQueue.slice(0, CFG.AI_MAX_CANDIDATES);

  let bestShot = null;
  let bestScore = -Infinity;

  for (let i = 0; i < simulations.length; i++) {
    // Time budget check
    if (performance.now() - startTime > CFG.AI_TIME_BUDGET_MS) {
      break;
    }

    // Yield to browser periodically
    if (i % 8 === 7) {
      await new Promise((r) => setTimeout(r, 0));
    }

    const cand = simulations[i];
    const { report, simState } = simulateShot(state, cand);
    const score = scoreSimulatedOutcome(state, cand, report, simState, difficultyDef);

    if (score > bestScore) {
      bestScore = score;
      bestShot = { ...cand, score, kind: "POT" };
    }
  }

  // 3. Safety Play check if best shot is poor
  if ((bestScore < 250 || !bestShot) && rng() < difficultyDef.safetySkill && legalTargets.length > 0) {
    const safetyCandidates = [];
    legalTargets.forEach((target) => {
      const toTarget = norm(sub(target, cue));
      const baseAngle = Math.atan2(toTarget.y, toTarget.x);

      // Try grazing angles (-15 deg to +15 deg)
      [-0.26, -0.13, 0.13, 0.26].forEach((offset) => {
        safetyCandidates.push({
          angle: baseAngle + offset,
          power: randRange(rng, 0.20, 0.40),
          spin: { x: 0, y: 0 },
          calledPocket: POCKETS[0].id,
          kind: "SAFETY",
        });
      });
    });

    for (let s = 0; s < safetyCandidates.length; s++) {
      const sCand = safetyCandidates[s];
      const { report, simState } = simulateShot(state, sCand);
      const foul = report.cueScratched || report.firstContact === null;
      if (!foul) {
        const oppBest = getBestPriorForShooter(simState, state.groups.PLAYER, state.openTable);
        const safetyScore = 500 - oppBest * 600;
        if (safetyScore > bestScore) {
          bestScore = safetyScore;
          bestShot = { ...sCand, score: safetyScore };
        }
      }
    }
  }

  // 4. Fallback: Desperate shot if nothing found
  if (!bestShot) {
    let fallbackAngle = 0;
    if (legalTargets.length > 0) {
      const t = legalTargets[0];
      fallbackAngle = Math.atan2(t.y - cue.y, t.x - cue.x);
    }
    bestShot = {
      angle: fallbackAngle,
      power: 0.5,
      spin: { x: 0, y: 0 },
      calledPocket: POCKETS[0].id,
      kind: "DESPERATE",
    };
  }

  // 5. Calibrated Gaussian Error Injection
  const chosen = { ...bestShot };
  chosen.angle += gauss(rng) * ((difficultyDef.aimSigmaDeg * Math.PI) / 180);
  chosen.power = clamp(chosen.power * (1 + gauss(rng) * difficultyDef.powerSigma), 0.06, 1.0);
  if (rng() < difficultyDef.aimSigmaDeg * 0.05) {
    chosen.spin = { x: 0, y: 0 };
  }

  return chosen;
}

// Public API: Choose Ball-in-Hand position (6x4 grid evaluation)
export function chooseBallInHand(state, difficultyDef, rng) {
  const r = CFG.BALL_R;
  const candidates = [];
  const aiGroup = state.groups.AI;

  const cols = 6;
  const rows = 4;
  const dx = (CFG.TABLE_W - r * 6) / (cols - 1);
  const dy = (CFG.TABLE_H - r * 6) / (rows - 1);

  for (let c = 0; c < cols; c++) {
    for (let row = 0; row < rows; row++) {
      const x = r * 3 + c * dx;
      const y = r * 3 + row * dy;

      // Check overlap against all in-play balls
      let overlaps = false;
      for (let i = 1; i <= 15; i++) {
        const b = state.balls[i];
        if (b && b.inPlay && dist({ x, y }, b) < r * 2.5) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        // Evaluate candidate quality
        const fakeCue = { x, y, inPlay: true, id: 0 };
        let bestPrior = 0;

        for (let i = 1; i <= 15; i++) {
          const b = state.balls[i];
          if (!b || !b.inPlay) continue;
          const bGroup = getBallGroup(b.id);
          const isLegal = state.openTable ? (b.id !== 8) : (bGroup === aiGroup || countRemaining(state.balls, aiGroup) === 0 && b.id === 8);
          if (!isLegal) continue;

          for (let p = 0; p < POCKETS.length; p++) {
            const cand = computeShotPrior(fakeCue, b, POCKETS[p], state.balls);
            if (cand !== -1 && cand.prior > bestPrior) {
              bestPrior = cand.prior;
            }
          }
        }

        candidates.push({ x, y, quality: bestPrior });
      }
    }
  }

  if (candidates.length === 0) {
    return { x: CFG.HEAD_SPOT.x, y: CFG.HEAD_SPOT.y };
  }

  candidates.sort((a, b) => b.quality - a.quality);
  // Pick from top 2 with slight randomization based on difficulty
  const pickIndex = rng() < 0.8 ? 0 : Math.min(candidates.length - 1, 1);
  return { x: candidates[pickIndex].x, y: candidates[pickIndex].y };
}
