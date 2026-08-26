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
    runScores: [],
    contributedRunIds: {},
    activeMatch: null,
    activeTournament: null,
    unlocks: {
      cues: ["DEFAULT"],
      felts: ["DEFAULT"],
      backgrounds: ["DEFAULT"],
    },
    achievements: {},
    coins: 100, // Starting bonus
  };
}

// Expanded, affordable Cosmetics
export const COSMETIC_CUES = [
  { id: "DEFAULT", name: "CLASSIC MAPLE", cost: 0, desc: "Standard tournament-grade maple wood cue." },
  { id: "ASHOKA", name: "ASHOKA CHAKRA", cost: 50, desc: "Polished teak with navy brass rings." },
  { id: "DESI_CLUB", name: "DESI ROSEWOOD", cost: 100, desc: "Rich Indian rosewood with linen wrap." },
  { id: "MIDNIGHT", name: "MIDNIGHT PURPLE", cost: 150, desc: "Deep amethyst gloss with silver ferrule." },
  { id: "GOLDEN", name: "ROYAL RAJPUT", cost: 200, desc: "24-karat gold-leaf inlay on bleached maple." },
  { id: "EMERALD", name: "EMERALD HAVELI", cost: 250, desc: "Lush emerald lacquer with jade bumper." },
  { id: "CYBER", name: "CYBER NEON", cost: 300, desc: "Electric cyan and magenta pulse inlays." },
  { id: "DRAGON", name: "CRIMSON FLAME", cost: 400, desc: "Blazing red dragonscale hardwood." },
  { id: "KOHINOOR", name: "KOH-I-NOOR", cost: 500, desc: "Legendary diamond luster with pearl wrap." },
];

export const COSMETIC_FELTS = [
  { id: "DEFAULT", name: "ARCADE EMERALD", color: "#158450", light: "#2ecb7e", dark: "#0d5c36", cost: 0 },
  { id: "KASHMIR", name: "KASHMIR BLUE", color: "#12528c", light: "#2a82d2", dark: "#0a3660", cost: 50 },
  { id: "JAIPUR", name: "JAIPUR PINK", color: "#8c1c46", light: "#d23874", dark: "#5e0f2d", cost: 100 },
  { id: "ROYAL", name: "ROYAL VELVET", color: "#84152e", light: "#cb2e50", dark: "#5c0d1d", cost: 150 },
  { id: "VARANASI", name: "VARANASI SAFFRON", color: "#9e5c06", light: "#e6911c", dark: "#693902", cost: 200 },
  { id: "GOA", name: "GOA TURQUOISE", color: "#0d7a75", light: "#23beb8", dark: "#064f4c", cost: 250 },
  { id: "PURPLE", name: "MIDNIGHT PURPLE", color: "#5c1584", light: "#992ecb", dark: "#3c0d5c", cost: 300 },
  { id: "BLACK", name: "OBSIDIAN SHADOW", color: "#1f1d2b", light: "#3a364d", dark: "#0f0e17", cost: 400 },
];

export const COSMETIC_BACKGROUNDS = [
  { id: "DEFAULT", name: "RETRO ARCADE", color: "#161130", light: "#261d4a", dark: "#07050e", cost: 0, desc: "Classic 90s pool parlor ambiance." },
  { id: "HAVELI", name: "RAJASTHANI HAVELI", color: "#2e1208", light: "#4f2212", dark: "#140602", cost: 75, desc: "Warm carved sandstone and brass lamps." },
  { id: "MUMBAI", name: "MUMBAI JAZZ LOUNGE", color: "#091b29", light: "#143750", dark: "#030c14", cost: 150, desc: "Late-night Marine Drive lounge mood." },
  { id: "NEON", name: "CYBERPUNK NEON", color: "#1c082b", light: "#381452", dark: "#0a0212", cost: 250, desc: "Glowing violet grid and laser reflections." },
  { id: "CLUB", name: "COLONIAL GYMKHANA", color: "#0b2416", light: "#18452c", dark: "#04120a", cost: 350, desc: "Vintage dark teak wood and brass plaques." },
  { id: "PALACE", name: "MAHARAJA PALACE", color: "#2b1c06", light: "#4d3410", dark: "#140c02", cost: 500, desc: "Opulent royal gold and marble pillars." },
];

// Pop Culture & India-Themed Achievements Catalog
export const ACHIEVEMENTS = [
  {
    id: "SHOLAY_BREAK",
    title: "SHOLAY BREAK",
    quote: "Kitne aadmi the?",
    desc: "Pocket 2 or more balls on a single break shot.",
    coins: 100,
    icon: "GUN",
  },
  {
    id: "DON_INTEZAAR",
    title: "DON KA INTEZAAR",
    quote: "Don ko pakadna mushkil hi nahi...",
    desc: "Defeat a PRO or LEGEND AI opponent.",
    coins: 150,
    icon: "SHADES",
  },
  {
    id: "DHONI_FINISH",
    title: "DHONI FINISHES IN STYLE",
    quote: "India lifts the World Cup!",
    desc: "Pocket the 8-ball with 100% full cue power to win.",
    coins: 120,
    icon: "BAT",
  },
  {
    id: "GULLY_BOY",
    title: "APNA TIME AAYEGA",
    quote: "Tere jaisa shana koi nahi!",
    desc: "Win a match after trailing by 3 or more balls.",
    coins: 150,
    icon: "MIC",
  },
  {
    id: "WASSEYPUR_RUN",
    title: "SARDAR KHAN'S REVENGE",
    quote: "Sabka badla lega re tera Faizal.",
    desc: "Score a continuous run of 4 or more potted balls.",
    coins: 100,
    icon: "SKULL",
  },
  {
    id: "CHAK_DE",
    title: "CHAK DE! VICTORY",
    quote: "Sattar minute hai tumhare paas!",
    desc: "Win your first Tournament Championship Cup.",
    coins: 250,
    icon: "TROPHY",
  },
  {
    id: "BAHUBALI",
    title: "JAI MAHISHMATI",
    quote: "Mera vachan hi hai shasan!",
    desc: "Conquer the Champion Invitational Cup with undefeated record.",
    coins: 400,
    icon: "CROWN",
  },
  {
    id: "MR_INDIA",
    title: "MOGAMBO KHUSH HUA",
    quote: "Hawa hawai!",
    desc: "Win an entire match without committing a single foul.",
    coins: 150,
    icon: "MASK",
  },
  {
    id: "JOHN_WICK",
    title: "BABA YAGA",
    quote: "Yeah, I'm thinking I'm back.",
    desc: "Finish a match with 85% or higher shooting precision.",
    coins: 200,
    icon: "SUIT",
  },
  {
    id: "BIG_LEBOWSKI",
    title: "THE DUDE ABIDES",
    quote: "That rug really tied the room together.",
    desc: "Clear your entire ball group without missing a single shot.",
    coins: 180,
    icon: "BOWLING",
  },
  {
    id: "KABHI_KHUSHI",
    title: "IT'S ALL ABOUT FAMILY",
    quote: "Keh diya na... bas keh diya!",
    desc: "Own at least 3 custom cues and 3 custom felts.",
    coins: 120,
    icon: "HEART",
  },
  {
    id: "DILWALE_CORNER",
    title: "SENORITA'S CORNER",
    quote: "Bade bade deshon mein aisi baatein hoti rehti hain.",
    desc: "Pocket the 8-ball into a corner pocket from across the table.",
    coins: 100,
    icon: "ROSE",
  },
];

// Migrations chain
function migrate(data) {
  if (!data.unlocks) data.unlocks = { cues: ["DEFAULT"], felts: ["DEFAULT"], backgrounds: ["DEFAULT"] };
  if (!data.unlocks.backgrounds) data.unlocks.backgrounds = ["DEFAULT"];
  if (!data.achievements) data.achievements = {};
  if (data.coins === undefined) data.coins = 100;
  return data;
}

export function loadSave() {
  if (saveCache) return saveCache;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      saveCache = migrate(JSON.parse(raw));
      return saveCache;
    }
  } catch (e) {
    console.warn("[Storage] Primary save corrupted, attempting backup", e);
    try {
      const bak = localStorage.getItem(SAVE_BAK_KEY);
      if (bak) {
        saveCache = migrate(JSON.parse(bak));
        return saveCache;
      }
    } catch (_) {}
  }
  saveCache = createFreshSave();
  saveImmediate(saveCache);
  return saveCache;
}

export function saveImmediate(save = null) {
  const data = save || saveCache || createFreshSave();
  data.updatedAt = Date.now();
  data.revision = (data.revision || 0) + 1;
  saveCache = data;

  try {
    const json = JSON.stringify(data);
    localStorage.setItem(SAVE_KEY, json);
    localStorage.setItem(SAVE_BAK_KEY, json);
  } catch (e) {
    console.warn("[Storage] Failed immediate save", e);
  }
}

export function saveMatchSnapshot(matchState, tournamentState = null) {
  const save = loadSave();
  save.activeMatch = matchState;
  if (tournamentState) {
    save.activeTournament = tournamentState;
  }
  saveImmediate(save);
}

export function clearMatchSnapshot() {
  const save = loadSave();
  save.activeMatch = null;
  saveImmediate(save);
}

// Unlock Achievement Helper
export function unlockAchievement(achievementId) {
  const save = loadSave();
  if (save.achievements && save.achievements[achievementId]) {
    return false; // Already unlocked
  }

  const def = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!def) return false;

  save.achievements[achievementId] = {
    unlockedAt: Date.now(),
  };
  save.coins = (save.coins || 0) + def.coins;
  saveImmediate(save);

  return def;
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
    assistLevel: "FULL",
    leftHanded: false,
    selectedCue: "DEFAULT",
    selectedFelt: "DEFAULT",
    selectedBg: "DEFAULT",
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

export function resetAllProgress() {
  return resetGameData();
}

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
