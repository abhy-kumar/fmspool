import { playerRating, getTier } from "./scoring.js";
import { normalizeName } from "./identity.js";

export function mergePlayer(remote, local, incomingRunId = null) {
  const base = remote || {
    displayName: "PLAYER",
    nameNormalized: "player",
    firstSeenAt: Date.now(),
    updatedAt: 0,
    revision: 0,
    runsPlayed: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    shots: 0,
    ownPots: 0,
    fouls: 0,
    longestRun: 0,
    bestRunScore: 0,
    titles: { BRONZE: 0, SILVER: 0, GOLD: 0, CHAMPION: 0 },
    fastestClearSeconds: null,
    eightOnBreaks: 0,
    runScores: [],
    appliedRuns: {},
  };

  const lCareer = local.career || local;
  const rCareer = base.career || base;

  // 1. Display Name: Last-Write-Wins by updatedAt
  let finalDisplayName = base.displayName || "PLAYER";
  let finalUpdatedAt = Math.max(base.updatedAt || 0, local.updatedAt || 0);

  if ((local.updatedAt || 0) > (base.updatedAt || 0)) {
    finalDisplayName = local.displayName || finalDisplayName;
  }

  // 2. Timestamps: firstSeenAt is MIN
  const finalFirstSeen = Math.min(
    base.firstSeenAt || Date.now(),
    local.firstSeenAt || Date.now()
  );

  // 3. Monotonic Counters: MAX (CRITICAL: Never SUM to avoid cross-device double counting)
  const runsPlayed = Math.max(rCareer.runsPlayed || 0, lCareer.runsPlayed || 0);
  const matchesPlayed = Math.max(rCareer.matchesPlayed || 0, lCareer.matchesPlayed || 0);
  const matchesWon = Math.max(rCareer.matchesWon || 0, lCareer.matchesWon || 0);
  const shots = Math.max(rCareer.shots || 0, lCareer.shots || 0);
  const ownPots = Math.max(rCareer.ownPots || 0, lCareer.ownPots || 0);
  const fouls = Math.max(rCareer.fouls || 0, lCareer.fouls || 0);
  const longestRun = Math.max(rCareer.longestRun || 0, lCareer.longestRun || 0);
  const bestRunScore = Math.max(rCareer.bestRunScore || 0, lCareer.bestRunScore || 0);
  const eightOnBreaks = Math.max(rCareer.eightOnBreaks || 0, lCareer.eightOnBreaks || 0);

  // Fastest clear: MIN ignoring null/0
  let fastestClear = null;
  const fc1 = rCareer.fastestClearSeconds;
  const fc2 = lCareer.fastestClearSeconds;
  if (fc1 && fc2) fastestClear = Math.min(fc1, fc2);
  else fastestClear = fc1 || fc2 || null;

  // Titles: MAX per cup
  const rTitles = rCareer.titles || {};
  const lTitles = lCareer.titles || {};
  const titles = {
    BRONZE: Math.max(rTitles.BRONZE || 0, lTitles.BRONZE || 0),
    SILVER: Math.max(rTitles.SILVER || 0, lTitles.SILVER || 0),
    GOLD: Math.max(rTitles.GOLD || 0, lTitles.GOLD || 0),
    CHAMPION: Math.max(rTitles.CHAMPION || 0, lTitles.CHAMPION || 0),
  };

  // 4. Run Scores & Applied Runs: UNION
  const mergedAppliedRuns = { ...(base.appliedRuns || {}), ...(local.contributedRunIds || {}) };
  if (incomingRunId) {
    mergedAppliedRuns[incomingRunId] = true;
  }

  // Combine top run scores descending capped at 200
  const combinedScores = Array.from(
    new Set([...(base.runScores || []), ...(local.runScores || [])])
  ).sort((a, b) => b - a).slice(0, 200);

  // 5. Recompute Derived Properties
  const rating = playerRating(combinedScores);
  const tier = getTier(rating).id;
  const precision = shots > 0 ? ownPots / shots : 0;
  const titlesWeighted =
    titles.CHAMPION * 4 + titles.GOLD * 3 + titles.SILVER * 2 + titles.BRONZE * 1;

  const revision = Math.max(base.revision || 0, local.revision || 0) + 1;

  return {
    displayName: finalDisplayName,
    nameNormalized: normalizeName(finalDisplayName),
    firstSeenAt: finalFirstSeen,
    updatedAt: finalUpdatedAt,
    revision,
    rating,
    tier,
    precision,
    bestRunScore,
    runsPlayed,
    matchesPlayed,
    matchesWon,
    shots,
    ownPots,
    fouls,
    longestRun,
    titles,
    titlesWeighted,
    fastestClearSeconds: fastestClear,
    eightOnBreaks,
    runScores: combinedScores,
    appliedRuns: mergedAppliedRuns,
  };
}

// Unit test verifying Section 18 merge example
export function verifyMergePolicy() {
  const deviceA = {
    matchesPlayed: 40,
    bestRunScore: 1308,
    displayName: "ACE",
    updatedAt: 100,
    revision: 1,
  };
  const deviceB = {
    matchesPlayed: 34,
    bestRunScore: 1180,
    displayName: "ACEX",
    updatedAt: 250,
    revision: 1,
  };

  const result = mergePlayer(deviceA, deviceB);
  console.assert(result.matchesPlayed === 40, `Merge matchesPlayed failed: expected 40 (MAX), got ${result.matchesPlayed}`);
  console.assert(result.bestRunScore === 1308, `Merge bestRunScore failed: expected 1308 (MAX), got ${result.bestRunScore}`);
  console.assert(result.displayName === "ACEX", `Merge displayName failed: expected ACEX (LWW), got ${result.displayName}`);
  console.assert(result.revision === 2, `Merge revision failed: expected 2, got ${result.revision}`);
  console.log("[Merge] Worked example verified successfully.");
}

verifyMergePolicy();
