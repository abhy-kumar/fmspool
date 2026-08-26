import { CFG } from "./config.js";
import { getOrCreatePlayerId } from "./identity.js";

const SAVE_KEY = "fmspool.save.v1";
const SAVE_BAK_KEY = "fmspool.save.v1.bak";
const OUTBOX_KEY = "fmspool.outbox.v1";
const SETTINGS_KEY = "fmspool.settings.v1";

let saveCache = null;
let saveTimer = null;

// Initial fresh save shape
export function createFreshSave(playerId = null) {
  const pid = playerId || getOrCreatePlayerId();
  return {
    schemaVersion: CFG.SCHEMA_VERSION,
    playerId: pid,
    displayName: "PLAYER",
    updatedAt: Date.now(),
    revision: 1,
    career: {
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
    },
    runScores: [], // Sorted descending, max 200
    contributedRunIds: {}, // Idempotency set
    activeMatch: null, // Mid-match snapshot
    activeTournament: null, // Bracket snapshot
    unlocks: {
      cues: ["DEFAULT"],
      felts: ["DEFAULT"],
    },
    coins: 0,
  };
}

// Migrations chain
const MIGRATIONS = {
  // v1 is current baseline
  1: (data) => data,
};

function migrate(data) {
  let current = data;
  let version = current.schemaVersion || 1;
  while (MIGRATIONS[version + 1]) {
    version++;
    current = MIGRATIONS[version](current);
    current.schemaVersion = version;
  }
  return current;
}

// Load save data safely with .bak fallback and corruption renaming
export function loadSave() {
  if (saveCache) return saveCache;

  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      saveCache = migrate(parsed);
      return saveCache;
    }
  } catch (e) {
    console.warn("[Storage] Corrupt primary save, attempting backup load...", e);
  }

  // Try backup
  try {
    const rawBak = localStorage.getItem(SAVE_BAK_KEY);
    if (rawBak) {
      const parsedBak = JSON.parse(rawBak);
      saveCache = migrate(parsedBak);
      console.log("[Storage] Successfully restored save from .bak");
      return saveCache;
    }
  } catch (e2) {
    console.warn("[Storage] Backup save also unreadable.", e2);
  }

  // If corrupt primary existed, preserve it under timestamp
  if (raw) {
    try {
      localStorage.setItem(`fmspool.save.v1.corrupt.${Date.now()}`, raw);
    } catch (_) {}
  }

  // Create fresh save
  saveCache = createFreshSave();
  saveImmediate(saveCache);
  return saveCache;
}

// Write save with .bak copy
export function saveImmediate(data = null) {
  const save = data || saveCache;
  if (!save) return;

  save.updatedAt = Date.now();
  save.revision = (save.revision || 1) + 1;

  try {
    const currentRaw = localStorage.getItem(SAVE_KEY);
    if (currentRaw) {
      localStorage.setItem(SAVE_BAK_KEY, currentRaw);
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    saveCache = save;
  } catch (e) {
    console.error("[Storage] Failed to write save to localStorage", e);
  }
}

// Debounced save (400ms)
export function saveDebounced(data = null) {
  if (data) saveCache = data;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveImmediate(saveCache);
    saveTimer = null;
  }, 400);
}

// Mid-match Snapshot
export function saveMatchSnapshot(matchState, tournamentState = null) {
  const save = loadSave();
  if (!matchState || matchState.phase === "GAME_OVER") {
    save.activeMatch = null;
    save.activeTournament = tournamentState;
  } else {
    // Snapshot table and ball positions
    save.activeMatch = {
      balls: matchState.balls.map((b) => ({
        id: b.id,
        x: b.x,
        y: b.y,
        vx: 0,
        vy: 0,
        r: b.r,
        spin: { x: 0, y: 0 },
        inPlay: b.inPlay,
        pocketed: b.pocketed,
        pocketedInto: b.pocketedInto,
        distanceTravelled: b.distanceTravelled,
      })),
      turn: matchState.turn,
      groups: { ...matchState.groups },
      openTable: matchState.openTable,
      phase: matchState.phase,
      ballInHand: matchState.ballInHand,
      ballInHandBehindLine: matchState.ballInHandBehindLine,
      calledPocket: matchState.calledPocket,
      shotClock: matchState.shotClock,
      stats: JSON.parse(JSON.stringify(matchState.stats)),
      seed: matchState.seed,
      shotIndex: matchState.shotIndex,
      isBreakShot: matchState.isBreakShot,
      startedAt: matchState.startedAt,
    };
    save.activeTournament = tournamentState;
  }
  saveImmediate(save);
}

export function clearMatchSnapshot() {
  const save = loadSave();
  save.activeMatch = null;
  saveImmediate(save);
}

// Settings Persistence
export function loadSettings() {
  const defaults = {
    masterVol: 0.7,
    musicVol: 0.5,
    sfxVol: 0.8,
    musicMuted: false,
    sfxMuted: false,
    crtEnabled: true,
    assistLevel: "FULL", // 'FULL' | 'HALF' | 'CUE_ONLY'
    leftHanded: false,
    selectedCue: "DEFAULT",
    selectedFelt: "DEFAULT",
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch (e) {
    return defaults;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[Storage] Failed to save settings", e);
  }
}

// Outbox Persistence
export function loadOutbox() {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveOutbox(outbox) {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  } catch (e) {
    console.warn("[Storage] Failed to save outbox", e);
  }
}

// Safe Reset (Cleans only fmspool.* keys without touch to other domain data)
export function resetGameData() {
  const keysToRemove = [SAVE_KEY, SAVE_BAK_KEY, OUTBOX_KEY, SETTINGS_KEY];
  keysToRemove.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch (_) {}
  });
  saveCache = createFreshSave();
  saveImmediate(saveCache);
  return saveCache;
}

// Cosmetics Definitions
export const COSMETIC_CUES = [
  { id: "DEFAULT", name: "CLASSIC MAPLE", cost: 0 },
  { id: "MIDNIGHT", name: "MIDNIGHT PURPLE", cost: 250 },
  { id: "GOLDEN", name: "ROYAL GOLD", cost: 500 },
  { id: "EMERALD", name: "EMERALD DRAGON", cost: 750 },
  { id: "CYBER", name: "CYBER NEON", cost: 1000 },
  { id: "DRAGON", name: "CRIMSON FLAME", cost: 1500 },
];

export const COSMETIC_FELTS = [
  { id: "DEFAULT", name: "ARCADE EMERALD", color: "#158450", light: "#2ecb7e", dark: "#0d5c36", cost: 0 },
  { id: "BLUE", name: "TOURNAMENT BLUE", color: "#154e84", light: "#2e7ecb", dark: "#0d365c", cost: 250 },
  { id: "RED", name: "ROYAL VELVET", color: "#84152e", light: "#cb2e50", dark: "#5c0d1d", cost: 500 },
  { id: "PURPLE", name: "MIDNIGHT PURPLE", color: "#5c1584", light: "#992ecb", dark: "#3c0d5c", cost: 750 },
  { id: "BLACK", name: "OBSIDIAN SHADOW", color: "#1f1d2b", light: "#3a364d", dark: "#0f0e17", cost: 1000 },
];

export function resetAllProgress() {
  return resetGameData();
}

// Flush immediately on unload or tab hide
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveImmediate();
    }
  });
  window.addEventListener("pagehide", () => {
    saveImmediate();
  });
}
