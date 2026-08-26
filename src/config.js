export const CFG = {
  // ---- Render ----
  BASE_W: 512,
  BASE_H: 288,
  PLAYFIELD_PX: { x: 56, y: 62, w: 400, h: 200 },
  RAIL_PX: 14,
  PHYS_TO_PX: 0.5,

  // ---- Table (physics units) ----
  TABLE_W: 800,
  TABLE_H: 400,
  BALL_R: 9,
  BALL_MASS: 1,
  POCKET_R_CORNER: 17,   // capture radius, centre-to-centre
  POCKET_R_SIDE: 16,
  HEAD_STRING_X: 200,    // cue ball placed behind this on break (x < 200)
  FOOT_SPOT: { x: 600, y: 200 },
  HEAD_SPOT: { x: 200, y: 200 },

  // ---- Physics ----
  DT: 1 / 240,           // fixed physics timestep, seconds
  MAX_SUBSTEPS: 12,      // per rendered frame, to avoid spiral-of-death
  MAX_SPEED: 1900,       // u/s. INVARIANT: MAX_SPEED * DT (7.92) < BALL_R (9). Never break this.
  MIN_SPEED: 6,          // below this, ball is snapped to rest
  ROLL_FRICTION: 260,    // u/s^2, linear deceleration
  BALL_RESTITUTION: 0.94,
  CUSHION_RESTITUTION: 0.75,
  CUSHION_TANGENT_DAMP: 0.85,
  SPIN_DECAY: 0.88,          // per second multiplier on cue-ball spin
  SPIN_FOLLOW_FACTOR: 0.55,  // topspin/backspin transferred after object-ball hit
  SPIN_SIDE_FACTOR: 0.28,    // side spin effect on cushion rebound angle
  SEPARATION_SLOP: 0.02,     // positional correction epsilon

  // ---- Shot ----
  MIN_POWER: 0.06,
  MAX_POWER: 1.0,
  POWER_TO_SPEED: 1900,      // speed = power * POWER_TO_SPEED
  SHOT_CLOCK_S: 30,
  SETTLE_TIMEOUT_S: 14,      // hard cap on a shot resolving

  // ---- AI ----
  AI_SIM_DT: 1 / 120,        // coarser timestep for AI look-ahead (2x faster)
  AI_SIM_MAX_STEPS: 900,     // ~7.5s of simulated time
  AI_MAX_CANDIDATES: 48,
  AI_TIME_BUDGET_MS: 220,    // hard cap on search; degrade gracefully
  AI_THINK_MIN_MS: 650,      // artificial delay so it feels human
  AI_THINK_MAX_MS: 1500,

  // ---- Audio ----
  BPM: 108,
  SCHEDULE_AHEAD_S: 0.12,
  SCHEDULE_TICK_MS: 25,

  // ---- Cloud ----
  DB_URL: "https://sarthiai-41e8e-default-rtdb.asia-southeast1.firebasedatabase.app/",
  SCHEMA_VERSION: 1,
  LEADERBOARD_PAGE: 100,
  TOP10_PROMPT_THRESHOLD: 10,
  CLOUD_TIMEOUT_MS: 8000,
  OUTBOX_MAX: 50,
  OUTBOX_RETRY_MS: [2000, 6000, 15000, 45000, 120000],
};

export const DIFFICULTY = {
  ROOKIE:  { id: "ROOKIE",  label: "ROOKIE",  aimSigmaDeg: 2.20, powerSigma: 0.14, safetySkill: 0.15, lookahead: 0, mult: 0.70, searchN: 1 },
  AMATEUR: { id: "AMATEUR", label: "AMATEUR", aimSigmaDeg: 1.20, powerSigma: 0.09, safetySkill: 0.40, lookahead: 0, mult: 1.00, searchN: 1 },
  PRO:     { id: "PRO",     label: "PRO",     aimSigmaDeg: 0.55, powerSigma: 0.05, safetySkill: 0.70, lookahead: 1, mult: 1.35, searchN: 2 },
  LEGEND:  { id: "LEGEND",  label: "LEGEND",  aimSigmaDeg: 0.15, powerSigma: 0.02, safetySkill: 0.92, lookahead: 1, mult: 1.70, searchN: 3 },
};

export const MODE_MULT = {
  EXHIBITION: 0.85,
  RANKED: 1.00,
  T_QUARTER: 1.10,
  T_SEMI: 1.20,
  T_FINAL: 1.35,
};

export const TITLE_BONUS = {
  BRONZE: 500,
  SILVER: 900,
  GOLD: 1500,
  CHAMPION: 2400,
};

export const TIERS = [
  { id: "BRONZE",   name: "BRONZE",   minRating: 0,    maxRating: 499,  badgeColor: "#a3673d" },
  { id: "SILVER",   name: "SILVER",   minRating: 500,  maxRating: 799,  badgeColor: "#c0bcd0" },
  { id: "GOLD",     name: "GOLD",     minRating: 800,  maxRating: 1099, badgeColor: "#d8a03a" },
  { id: "PLATINUM", name: "PLATINUM", minRating: 1100, maxRating: 1399, badgeColor: "#45e0d8" },
  { id: "DIAMOND",  name: "DIAMOND",  minRating: 1400, maxRating: 1699, badgeColor: "#e04fa8" },
  { id: "MASTER",   name: "MASTER",   minRating: 1700, maxRating: Infinity, badgeColor: "#d92b3a", shimmer: true },
];
