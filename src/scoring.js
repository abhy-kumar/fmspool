import { DIFFICULTY, MODE_MULT, TITLE_BONUS, TIERS } from "./config.js";
import { clamp } from "./vec.js";

// Compute the 6 normalized components with complete NaN protection
export function computeScoreComponents(stats, won, yourBallsRemaining = 0, opponentBallsRemaining = 7) {
  const safeStats = stats || {};
  const shots = Math.max(0, Number(safeStats.shots) || 0);
  const ownPots = Math.max(0, Number(safeStats.ownPots) || 0);
  const fouls = Math.max(0, Number(safeStats.fouls) || 0);
  const scratches = Math.max(0, Number(safeStats.scratches) || 0);
  const longestRun = Math.max(0, Number(safeStats.longestRun) || 0);
  const breakPots = Math.max(0, Number(safeStats.breakPots) || 0);
  const eightOnBreak = Math.max(0, Number(safeStats.eightOnBreak) || 0);
  const tableRun = !!safeStats.tableRun;

  // 1. Victory (V)
  const V = won ? 1.0 : 0.0;

  // 2. Dominance (D)
  const oppLeft = clamp(Number(opponentBallsRemaining) || 0, 0, 7);
  const yourLeft = clamp(Number(yourBallsRemaining) || 0, 0, 7);
  const D = won
    ? clamp(oppLeft / 7, 0, 1)
    : clamp((0.5 * (7 - yourLeft)) / 7, 0, 1);

  // 3. Precision (P)
  const P = clamp(shots > 0 ? ownPots / shots : (won ? 0.8 : 0.4), 0, 1);

  // 4. Discipline / Cleanliness (C)
  const C = clamp(1 - (fouls + 2 * scratches) / 8, 0, 1);

  // 5. Flair (F)
  const flairRaw =
    longestRun / 8 +
    0.15 * breakPots +
    0.25 * eightOnBreak +
    (tableRun ? 0.5 : 0);
  const F = clamp(flairRaw, 0, 1);

  // 6. Tempo (T)
  let avgSecs = Number(safeStats.avgShotSeconds);
  if (!avgSecs || isNaN(avgSecs)) {
    const totalSecs = Number(safeStats.totalShotSeconds);
    avgSecs = (shots > 0 && !isNaN(totalSecs) && totalSecs > 0) ? totalSecs / shots : 8;
  }
  if (isNaN(avgSecs) || avgSecs <= 0) avgSecs = 8;
  const T = clamp(1 - (avgSecs - 4) / 16, 0, 1);

  const rawS = 0.30 * V + 0.15 * D + 0.20 * P + 0.10 * C + 0.15 * F + 0.10 * T;

  return {
    V: isNaN(V) ? 0 : V,
    D: isNaN(D) ? 0 : D,
    P: isNaN(P) ? 0 : P,
    C: isNaN(C) ? 0 : C,
    F: isNaN(F) ? 0 : F,
    T: isNaN(T) ? 0.5 : T,
    composite: isNaN(rawS) ? 0.5 : rawS,
  };
}

// Compute Match Score
export function matchScore(stats, won, yourBallsRemaining, opponentBallsRemaining, difficultyId, modeKey) {
  const comp = computeScoreComponents(stats, won, yourBallsRemaining, opponentBallsRemaining);
  const diffMult = DIFFICULTY[difficultyId] ? DIFFICULTY[difficultyId].mult : 1.0;
  const modeMultiplier = MODE_MULT[modeKey] || 1.0;

  const score = Math.round(1000 * comp.composite * diffMult * modeMultiplier);
  return {
    score: isNaN(score) ? 500 : score,
    components: comp,
    diffMult,
    modeMultiplier,
  };
}

// Compute Tournament / Run Score
export function computeRunScore(matchScores, roundsAdvanced, wonTournament, cupId, abandoned = false) {
  const safeScores = (matchScores || []).map((s) => (isNaN(s) ? 500 : Number(s)));
  const sumMatchScores = safeScores.reduce((a, b) => a + b, 0);
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

  const validScores = [...runScores].map((s) => Number(s) || 0).filter((s) => !isNaN(s) && s > 0).sort((a, b) => b - a);
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
  const safeRating = Number(rating) || 0;
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (safeRating >= TIERS[i].minRating) {
      return TIERS[i];
    }
  }
  return TIERS[0];
}
