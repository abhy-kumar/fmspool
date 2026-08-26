import { CFG } from "./config.js";
import { createInitialRack, createBall } from "./table.js";
import { dist } from "./vec.js";

export function createFreshStats() {
  return {
    shots: 0,
    pots: 0,
    ownPots: 0,
    opponentPots: 0,
    fouls: 0,
    scratches: 0,
    longestRun: 0,
    currentRun: 0,
    breakPots: 0,
    eightOnBreak: 0,
    tableRun: false,
    ballsRemaining: 7,
    seconds: 0,
    avgShotSeconds: 0,
    totalShotSeconds: 0,
  };
}

export function createMatchState(seed = Date.now(), startingTurn = "PLAYER") {
  return {
    balls: createInitialRack(seed),
    turn: startingTurn,
    groups: { PLAYER: null, AI: null }, // 'SOLIDS' | 'STRIPES'
    openTable: true,
    phase: "PLACE_CUE_BREAK", // 'PLACE_CUE_BREAK'|'AIMING'|'SHOT_RESOLVING'|'BALL_IN_HAND'|'CALL_POCKET'|'GAME_OVER'
    ballInHand: false,
    ballInHandBehindLine: true,
    calledPocket: null,
    shotClock: CFG.SHOT_CLOCK_S,
    stats: {
      PLAYER: createFreshStats(),
      AI: createFreshStats(),
    },
    winner: null,
    winReason: null,
    seed,
    shotIndex: 0,
    isBreakShot: true,
    startedAt: Date.now(),
    lastShotTime: Date.now(),
    message: "MATCH START - BREAK THE RACK",
    messageTimer: 3.0,
  };
}

export function createShotReport() {
  return {
    firstContact: null,
    cushionsAfterContact: 0,
    cushionsTotal: 0,
    pocketed: [], // [{ ball, pocket }]
    cueScratched: false,
    ballsOffTable: [],
    anyBallHitCushionAfterContact: false,
    breakCushionBalls: new Set(),
  };
}

// Check which group a ball belongs to
export function getBallGroup(ballId) {
  if (ballId >= 1 && ballId <= 7) return "SOLIDS";
  if (ballId >= 9 && ballId <= 15) return "STRIPES";
  if (ballId === 8) return "EIGHT";
  return "CUE";
}

// Count remaining balls for a group
export function countRemaining(balls, group) {
  if (!group) return 7;
  let count = 0;
  for (let i = 1; i <= 15; i++) {
    const b = balls[i];
    if (b && b.inPlay && getBallGroup(b.id) === group) {
      count++;
    }
  }
  return count;
}

// Accumulate events during a physics shot step
export function processPhysicsEvents(report, events, state) {
  events.forEach((ev) => {
    if (ev.type === "ballHit") {
      const isCue = ev.a.id === 0 || ev.b.id === 0;
      if (isCue && report.firstContact === null) {
        const objectBall = ev.a.id === 0 ? ev.b : ev.a;
        report.firstContact = objectBall.id;
      }
    } else if (ev.type === "cushion") {
      report.cushionsTotal++;
      if (report.firstContact !== null) {
        report.cushionsAfterContact++;
        report.anyBallHitCushionAfterContact = true;
      }
      if (state.isBreakShot) {
        report.breakCushionBalls.add(ev.ball.id);
      }
    } else if (ev.type === "pocket") {
      report.pocketed.push({ ball: ev.ball, pocket: ev.pocket });
      if (ev.ball.id === 0) {
        report.cueScratched = true;
      }
    }
  });
}

// Evaluate shot legality, fouls, wins/losses after settling
export function evaluateShot(state, report) {
  const shooter = state.turn;
  const opponent = shooter === "PLAYER" ? "AI" : "PLAYER";
  const shooterStats = state.stats[shooter];
  const shooterGroup = state.groups[shooter];

  shooterStats.shots++;
  state.shotIndex++;

  // Update shot duration tempo stats
  const now = Date.now();
  const shotSecs = Math.max(1, (now - state.lastShotTime) / 1000);
  state.lastShotTime = now;
  shooterStats.totalShotSeconds += shotSecs;
  shooterStats.avgShotSeconds = shooterStats.totalShotSeconds / shooterStats.shots;

  let foul = false;
  let foulReason = "";
  let reRack = false;

  const eightPocketed = report.pocketed.some((p) => p.ball.id === 8);
  const nonCuePocketed = report.pocketed.filter((p) => p.ball.id !== 0 && p.ball.id !== 8);

  // 1. Break Shot Evaluation
  if (state.isBreakShot) {
    state.isBreakShot = false;

    // 8-ball on break -> Re-rack and re-break
    if (eightPocketed) {
      shooterStats.eightOnBreak++;
      state.balls = createInitialRack(Date.now());
      state.openTable = true;
      state.groups = { PLAYER: null, AI: null };
      state.phase = "PLACE_CUE_BREAK";
      state.isBreakShot = true;
      state.message = "8-BALL ON BREAK! RE-RACK!";
      state.messageTimer = 3.0;
      return { foul: false, turnPasses: false, reRack: true, winner: null };
    }

    // Legal break test: at least 1 ball potted OR at least 4 distinct balls hit cushions
    const breakPotted = nonCuePocketed.length > 0;
    const breakCushionsLegal = report.breakCushionBalls.size >= 4;
    shooterStats.breakPots = nonCuePocketed.length;

    if (report.cueScratched) {
      foul = true;
      foulReason = "SCRATCH ON BREAK";
    } else if (!breakPotted && !breakCushionsLegal) {
      foul = true;
      foulReason = "ILLEGAL BREAK (NEED 4 RAILS)";
    }

    if (foul) {
      shooterStats.fouls++;
      if (report.cueScratched) shooterStats.scratches++;
      state.turn = opponent;
      state.phase = "BALL_IN_HAND";
      state.ballInHand = true;
      state.ballInHandBehindLine = false;
      state.message = `FOUL: ${foulReason}! BALL IN HAND`;
      state.messageTimer = 2.5;
      return { foul: true, turnPasses: true, reRack: false, winner: null };
    }

    // Legal break with balls potted -> table remains open, shooter continues
    if (breakPotted) {
      shooterStats.currentRun += nonCuePocketed.length;
      shooterStats.longestRun = Math.max(shooterStats.longestRun, shooterStats.currentRun);
      shooterStats.pots += nonCuePocketed.length;
      state.phase = "AIMING";
      state.message = "LEGAL BREAK - OPEN TABLE";
      state.messageTimer = 2.0;
      return { foul: false, turnPasses: false, reRack: false, winner: null };
    } else {
      // Legal break with nothing potted -> turn passes, table open
      state.turn = opponent;
      state.phase = "AIMING";
      state.message = "TABLE OPEN";
      state.messageTimer = 2.0;
      return { foul: false, turnPasses: true, reRack: false, winner: null };
    }
  }

  // 2. Regular Shot Foul Checking
  if (report.cueScratched) {
    foul = true;
    foulReason = "CUE BALL SCRATCH";
    shooterStats.scratches++;
  } else if (report.firstContact === null) {
    foul = true;
    foulReason = "NO BALL CONTACT";
  } else {
    const contactGroup = getBallGroup(report.firstContact);
    const shooterBallsLeft = countRemaining(state.balls, shooterGroup);

    if (state.openTable) {
      // Table is open: first contact cannot be 8-ball
      if (report.firstContact === 8) {
        foul = true;
        foulReason = "CANNOT HIT 8-BALL ON OPEN TABLE";
      }
    } else {
      // Table not open
      if (shooterBallsLeft > 0) {
        if (contactGroup !== shooterGroup) {
          foul = true;
          foulReason = `WRONG GROUP (HIT ${contactGroup})`;
        }
      } else {
        // Group cleared, must hit 8-ball
        if (report.firstContact !== 8) {
          foul = true;
          foulReason = "MUST HIT 8-BALL FIRST";
        }
      }
    }

    // Cushion after contact rule: at least one ball must be pocketed OR hit a cushion
    if (!foul && report.pocketed.length === 0 && !report.anyBallHitCushionAfterContact) {
      foul = true;
      foulReason = "NO RAIL AFTER CONTACT";
    }
  }

  // 3. 8-Ball Pocketed Resolution (Win / Loss)
  if (eightPocketed) {
    const shooterBallsLeft = countRemaining(state.balls, shooterGroup);

    if (shooterBallsLeft > 0 || state.openTable) {
      // Pocketed 8 early -> IMMEDIATE LOSS
      state.winner = opponent;
      state.winReason = `${shooter} POCKETED 8-BALL EARLY`;
      state.phase = "GAME_OVER";
      return { foul: true, turnPasses: true, winner: opponent };
    }

    if (foul) {
      // Pocketed 8 on a foul/scratch -> IMMEDIATE LOSS
      state.winner = opponent;
      state.winReason = `${shooter} SCRATCHED ON 8-BALL`;
      state.phase = "GAME_OVER";
      return { foul: true, turnPasses: true, winner: opponent };
    }

    const eightPocketObj = report.pocketed.find((p) => p.ball.id === 8);
    const pocketedPocketId = eightPocketObj ? eightPocketObj.pocket.id : null;

    if (state.calledPocket && pocketedPocketId !== state.calledPocket) {
      // Wrong pocket called -> LOSS
      state.winner = opponent;
      state.winReason = `${shooter} MISSED CALLED POCKET FOR 8`;
      state.phase = "GAME_OVER";
      return { foul: true, turnPasses: true, winner: opponent };
    }

    // LEGAL WIN!
    state.winner = shooter;
    state.winReason = `${shooter} POCKETED 8-BALL TO WIN!`;
    state.phase = "GAME_OVER";
    shooterStats.pots++;
    shooterStats.ownPots++;
    shooterStats.currentRun++;
    shooterStats.longestRun = Math.max(shooterStats.longestRun, shooterStats.currentRun);
    if (shooterStats.shots === shooterStats.pots && shooterStats.shots <= 8) {
      shooterStats.tableRun = true;
    }
    return { foul: false, turnPasses: false, winner: shooter };
  }

  // 4. Update Remaining Ball Counts & Group Assignments
  if (foul) {
    shooterStats.fouls++;
    shooterStats.currentRun = 0;

    // Respot cue ball for ball in hand
    const cue = state.balls[0];
    cue.inPlay = true;
    cue.pocketed = false;
    cue.vx = 0;
    cue.vy = 0;
    cue.x = CFG.HEAD_SPOT.x;
    cue.y = CFG.HEAD_SPOT.y;

    state.turn = opponent;
    state.phase = "BALL_IN_HAND";
    state.ballInHand = true;
    state.ballInHandBehindLine = false;
    state.message = `FOUL: ${foulReason}! BALL IN HAND`;
    state.messageTimer = 2.5;

    return { foul: true, turnPasses: true, winner: null };
  }

  // Legal Shot with no foul: Assign group if open
  let shooterPottedOwnGroup = false;

  if (nonCuePocketed.length > 0) {
    if (state.openTable) {
      const firstPottedGroup = getBallGroup(nonCuePocketed[0].ball.id);
      if (firstPottedGroup === "SOLIDS" || firstPottedGroup === "STRIPES") {
        state.openTable = false;
        state.groups[shooter] = firstPottedGroup;
        state.groups[opponent] = firstPottedGroup === "SOLIDS" ? "STRIPES" : "SOLIDS";
        state.message = `${shooter} IS ${state.groups[shooter]}`;
        state.messageTimer = 2.5;
      }
    }

    const currentShooterGroup = state.groups[shooter];
    nonCuePocketed.forEach((p) => {
      shooterStats.pots++;
      const bGroup = getBallGroup(p.ball.id);
      if (bGroup === currentShooterGroup || state.openTable) {
        shooterStats.ownPots++;
        shooterPottedOwnGroup = true;
      } else {
        shooterStats.opponentPots++;
      }
    });

    shooterStats.currentRun += nonCuePocketed.length;
    shooterStats.longestRun = Math.max(shooterStats.longestRun, shooterStats.currentRun);
  } else {
    shooterStats.currentRun = 0;
  }

  // Update remaining ball count for HUD
  state.stats.PLAYER.ballsRemaining = countRemaining(state.balls, state.groups.PLAYER);
  state.stats.AI.ballsRemaining = countRemaining(state.balls, state.groups.AI);

  // Turn Continuation
  const ballsLeft = countRemaining(state.balls, state.groups[shooter]);
  if (ballsLeft === 0) {
    // Ready for 8-ball -> Must call pocket
    state.phase = "CALL_POCKET";
    state.message = `${shooter}: CALL YOUR POCKET FOR 8-BALL`;
    state.messageTimer = 3.0;
  } else if (shooterPottedOwnGroup) {
    state.phase = "AIMING";
    state.message = `${shooter} CONTINUES`;
    state.messageTimer = 1.5;
  } else {
    // Turn passes
    state.turn = opponent;
    const oppBallsLeft = countRemaining(state.balls, state.groups[opponent]);
    if (oppBallsLeft === 0 && !state.openTable) {
      state.phase = "CALL_POCKET";
      state.message = `${opponent}: CALL POCKET FOR 8-BALL`;
      state.messageTimer = 3.0;
    } else {
      state.phase = "AIMING";
      state.message = `${opponent}'S TURN`;
      state.messageTimer = 1.5;
    }
  }

  return { foul: false, turnPasses: !shooterPottedOwnGroup, winner: null };
}
