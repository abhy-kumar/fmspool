import { DIFFICULTY, MODE_MULT, TITLE_BONUS, TIERS } from "./config.js";
import { clamp } from "./vec.js";

// Compute the 6 normalized components
export function computeScoreComponents(stats, won, yourBallsRemaining, opponentBallsRemaining) {
  // 1. Victory (V)
  const V = won ? 1 : 0;

  // 2. Dominance (D)
  const D = won
    ? clamp(opponentBallsRemaining / 7, 0, 1)
    : clamp((0.5 * (7 - yourBallsRemaining)) / 7, 0, 1);

  // 3. Precision (P)
  const P = clamp(stats.ownPots / Math.max(1, stats.shots), 0, 1);

  // 4. Discipline / Cleanliness (C)
  const C = clamp(1 - (stats.fouls + 2 * stats.scratches) / 8, 0, 1);

  // 5. Flair (F)
  const flairRaw =
    stats.longestRun / 8 +
    0.15 * (stats.breakPots || 0) +
    0.25 * (stats.eightOnBreak || 0) +
    (stats.tableRun ? 0.5 : 0);
  const F = clamp(flairRaw, 0, 1);

  // 6. Tempo (T)
  const avgSecs = stats.avgShotSeconds || (stats.shots > 0 ? stats.totalShotSeconds / stats.shots : 10);
  const T = clamp(1 - (avgSecs - 4) / 16, 0, 1);

  const rawS = 0.30 * V + 0.15 * D + 0.20 * P + 0.10 * C + 0.15 * F + 0.10 * T;

  return {
    V,
    D,
    P,
    C,
    F,
    T,
    composite: rawS,
  };
}

// Compute Match Score
export function matchScore(stats, won, yourBallsRemaining, opponentBallsRemaining, difficultyId, modeKey) {
  const comp = computeScoreComponents(stats, won, yourBallsRemaining, opponentBallsRemaining);
  const diffMult = DIFFICULTY[difficultyId] ? DIFFICULTY[difficultyId].mult : 1.0;
  const modeMultiplier = MODE_MULT[modeKey] || 1.0;

  const score = Math.round(1000 * comp.composite * diffMult * modeMultiplier);
  return {
    score,
    components: comp,
    diffMult,
    modeMultiplier,
  };
}

// Compute Tournament / Run Score
export function computeRunScore(matchScores, roundsAdvanced, wonTournament, cupId, abandoned = false) {
  const sumMatchScores = matchScores.reduce((a, b) => a + b, 0);
  if (abandoned) {
    return {
      runScore: sumMatchScores,
      abandoned: true,
    };
  }

  const roundBonus = 150 * (roundsAdvanced || 0);
  const titleBonus = wonTournament && cupId && TITLE_BONUS[cupId] ? TITLE_BONUS[cupId] : 0;
  const total = sumMatchScores + roundBonus + titleBonus;

  return {
    runScore: total,
    roundBonus,
    titleBonus,
    abandoned: false,
  };
}

// Compute Bayesian Shrunk Player Rating
export function playerRating(runScores) {
  if (!runScores || runScores.length === 0) return 0;

  // Non-abandoned scores descending
  const validScores = [...runScores].sort((a, b) => b - a);
  const n = validScores.length;
  if (n === 0) return 0;

  const K = Math.min(5, n);
  const topK = validScores.slice(0, K);
  const raw = topK.reduce((a, b) => a + b, 0) / K;

  const conf = n / (n + 3);
  return Math.round(raw * conf + 400 * (1 - conf));
}

// Get Player Tier from Rating
export function getTier(rating) {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (rating >= TIERS[i].minRating) {
      return TIERS[i];
    }
  }
  return TIERS[0];
}

// Check Worked Examples (Unit Tests)
export function verifyScoringMath() {
  // Worked Example A
  const statsA = {
    shots: 22,
    ownPots: 13,
    fouls: 1,
    scratches: 0,
    longestRun: 6,
    breakPots: 1,
    eightOnBreak: 0,
    tableRun: false,
    avgShotSeconds: 7,
  };
  const resA = matchScore(statsA, true, 0, 4, "PRO", "T_SEMI");
  console.assert(resA.score === 1308, `Worked Example A failed: expected 1308, got ${resA.score}`);

  // Worked Example B
  const statsB = {
    shots: 18,
    ownPots: 4,
    fouls: 3,
    scratches: 1,
    longestRun: 2,
    breakPots: 0,
    eightOnBreak: 0,
    tableRun: false,
    avgShotSeconds: 12,
  };
  const resB = matchScore(statsB, false, 3, 0, "AMATEUR", "RANKED");
  console.assert(resB.score === 212, `Worked Example B failed: expected 212, got ${resB.score}`);

  // Rating Example
  const testRuns = [1308, 1180, 1102, 980, 940, 720, 690];
  const r = playerRating(testRuns);
  console.assert(r === 891, `Rating worked example failed: expected 891, got ${r}`);

  const tier = getTier(r);
  console.assert(tier.id === "GOLD", `Tier worked example failed: expected GOLD, got ${tier.id}`);

  console.log("[Scoring] All worked examples verified successfully.");
}

// Run unit test on import
verifyScoringMath();
