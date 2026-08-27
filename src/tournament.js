import { PAL } from "./palette.js";
import { AI_PERSONALITIES } from "./sprites.js";
import { makeRng, shuffle } from "./rng.js";

export const CUPS = {
  BRONZE: {
    id: "BRONZE",
    name: "BRONZE CUP",
    entryFee: 0,
    prize: 250,
    unlocksAfter: null,
    fieldDifficulties: ["ROOKIE", "ROOKIE", "AMATEUR"], // QF, SF, F
    raceTo: [1, 1, 2],
    badgeColor: PAL.RAIL_HI,
  },
  SILVER: {
    id: "SILVER",
    name: "SILVER CUP",
    entryFee: 200,
    prize: 600,
    unlocksAfter: "BRONZE",
    fieldDifficulties: ["ROOKIE", "AMATEUR", "AMATEUR"],
    raceTo: [1, 2, 2],
    badgeColor: PAL.SILVER,
  },
  GOLD: {
    id: "GOLD",
    name: "GOLD CUP",
    entryFee: 500,
    prize: 1400,
    unlocksAfter: "SILVER",
    fieldDifficulties: ["AMATEUR", "PRO", "PRO"],
    raceTo: [2, 2, 3],
    badgeColor: PAL.BRASS,
  },
  CHAMPION: {
    id: "CHAMPION",
    name: "CHAMPION CUP",
    entryFee: 1200,
    prize: 3500,
    unlocksAfter: "GOLD",
    fieldDifficulties: ["PRO", "PRO", "LEGEND"],
    raceTo: [2, 3, 3],
    badgeColor: PAL.MAGENTA,
  },
};

// Helper to get strength rating for instant AI vs AI matches
const TIER_WEIGHT = {
  ROOKIE: 1,
  AMATEUR: 2,
  PRO: 4,
  LEGEND: 7,
};

// Create a new 8-player bracket
export function createTournamentBracket(cupId, playerName, seed = Date.now()) {
  const rng = makeRng(seed);
  const cup = CUPS[cupId] || CUPS.BRONZE;

  // 7 AI opponents shuffled
  const shuffledAIs = shuffle(rng, AI_PERSONALITIES);

  // 8 seeds
  const seeds = [
    { id: "PLAYER", name: playerName || "PLAYER", isPlayer: true, tier: "PLAYER" },
    ...shuffledAIs.slice(0, 7).map((ai) => ({ id: ai.name, name: ai.name, isPlayer: false, tier: ai.tier })),
  ];

  // Quarterfinals (4 matches)
  const qf = [
    { matchId: "QF1", p1: seeds[0], p2: seeds[1], winner: null, p1Score: 0, p2Score: 0, raceTo: cup.raceTo[0], diff: cup.fieldDifficulties[0] },
    { matchId: "QF2", p1: seeds[2], p2: seeds[3], winner: null, p1Score: 0, p2Score: 0, raceTo: cup.raceTo[0], diff: cup.fieldDifficulties[0] },
    { matchId: "QF3", p1: seeds[4], p2: seeds[5], winner: null, p1Score: 0, p2Score: 0, raceTo: cup.raceTo[0], diff: cup.fieldDifficulties[0] },
    { matchId: "QF4", p1: seeds[6], p2: seeds[7], winner: null, p1Score: 0, p2Score: 0, raceTo: cup.raceTo[0], diff: cup.fieldDifficulties[0] },
  ];

  // Semifinals (2 matches)
  const sf = [
    { matchId: "SF1", p1: null, p2: null, winner: null, p1Score: 0, p2Score: 0, raceTo: cup.raceTo[1], diff: cup.fieldDifficulties[1] },
    { matchId: "SF2", p1: null, p2: null, winner: null, p1Score: 0, p2Score: 0, raceTo: cup.raceTo[1], diff: cup.fieldDifficulties[1] },
  ];

  // Final (1 match)
  const finals = [
    { matchId: "F1", p1: null, p2: null, winner: null, p1Score: 0, p2Score: 0, raceTo: cup.raceTo[2], diff: cup.fieldDifficulties[2] },
  ];

  return {
    cupId,
    round: "QF", // 'QF' | 'SF' | 'FINAL' | 'COMPLETE'
    qf,
    sf,
    finals,
    matchScores: [],
    roundsAdvanced: 0,
    eliminated: false,
    champion: null,
    seed,
  };
}

// Simulate an AI vs AI match via weighted coin flip
export function simulateAIMatch(match, rng) {
  const w1 = TIER_WEIGHT[match.p1.tier] || 1;
  const w2 = TIER_WEIGHT[match.p2.tier] || 1;
  const p1WinProb = w1 / (w1 + w2);

  const p1Wins = rng() < p1WinProb;
  match.winner = p1Wins ? match.p1 : match.p2;
  match.p1Score = p1Wins ? match.raceTo : Math.floor(rng() * match.raceTo);
  match.p2Score = p1Wins ? Math.floor(rng() * match.raceTo) : match.raceTo;
}

// Advance bracket after player finishes a match
export function advanceTournamentRound(bracket, playerWonMatch, matchScoreVal, rng = Math.random) {
  bracket.matchScores.push(matchScoreVal);

  if (!playerWonMatch) {
    bracket.eliminated = true;
    bracket.round = "COMPLETE";
    return;
  }

  bracket.roundsAdvanced++;

  if (bracket.round === "QF") {
    // Player won QF1
    bracket.qf[0].winner = bracket.qf[0].p1;
    // Simulate AI QF2, QF3, QF4
    simulateAIMatch(bracket.qf[1], rng);
    simulateAIMatch(bracket.qf[2], rng);
    simulateAIMatch(bracket.qf[3], rng);

    // Setup SF
    bracket.sf[0].p1 = bracket.qf[0].winner;
    bracket.sf[0].p2 = bracket.qf[1].winner;
    bracket.sf[1].p1 = bracket.qf[2].winner;
    bracket.sf[1].p2 = bracket.qf[3].winner;

    bracket.round = "SF";
  } else if (bracket.round === "SF") {
    // Player won SF1
    bracket.sf[0].winner = bracket.sf[0].p1;
    // Simulate AI SF2
    simulateAIMatch(bracket.sf[1], rng);

    // Setup Final
    bracket.finals[0].p1 = bracket.sf[0].winner;
    bracket.finals[0].p2 = bracket.sf[1].winner;

    bracket.round = "FINAL";
  } else if (bracket.round === "FINAL") {
    bracket.finals[0].winner = bracket.finals[0].p1;
    bracket.champion = bracket.finals[0].p1;
    bracket.round = "COMPLETE";
  }
}
