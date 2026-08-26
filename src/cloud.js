import { CFG } from "./config.js";
import { mergePlayer } from "./merge.js";
import { normalizeName } from "./identity.js";
import { loadOutbox, saveOutbox, loadSave, saveImmediate } from "./storage.js";

// Firebase instances initialized dynamically / defensively
let db = null;
let firebaseLoaded = false;
let isOffline = false;

// Dynamic Firebase Loader
async function initFirebase() {
  if (firebaseLoaded) return db;
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getDatabase } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

    const app = initializeApp({ databaseURL: CFG.DB_URL });
    db = getDatabase(app);
    firebaseLoaded = true;
    isOffline = false;
    console.log("[Cloud] Firebase initialized.");
  } catch (e) {
    console.warn("[Cloud] Firebase offline or unavailable. Running in offline mode.", e);
    isOffline = true;
  }
  return db;
}

// Timeout helper for network promises
function withTimeout(promise, ms = CFG.CLOUD_TIMEOUT_MS) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Cloud request timed out")), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// FNV-1a Checksum (Obfuscation / integrity check)
export function computeChecksum(runId, playerId, score) {
  const str = `${runId}:${playerId}:${score}:fms_salt`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

// Generate collision-proof runId
export function generateRunId(playerId) {
  const rand4 = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${Date.now().toString(36)}-${(playerId || "player").slice(0, 8)}-${rand4()}`;
}

// Check network status
export function getIsOffline() {
  return isOffline || (typeof navigator !== "undefined" && !navigator.onLine);
}

// Submit a completed Run through the offline-first Outbox
export async function submitRun(playerId, runData, localSave) {
  const runId = generateRunId(playerId);
  const checksum = computeChecksum(runId, playerId, runData.score);

  const payload = {
    runId,
    playerId,
    score: runData.score,
    mode: runData.mode,
    difficulty: runData.difficulty,
    cup: runData.cup || null,
    won: runData.won,
    abandoned: runData.abandoned || false,
    at: Date.now(),
    stats: runData.stats,
    checksum,
  };

  // 1. Mark in local save first
  localSave.contributedRunIds = localSave.contributedRunIds || {};
  localSave.contributedRunIds[runId] = true;
  if (!runData.abandoned) {
    localSave.runScores = [...(localSave.runScores || []), runData.score].sort((a, b) => b - a).slice(0, 200);
  }
  saveImmediate(localSave);

  // 2. Queue into outbox
  const outbox = loadOutbox();
  outbox.push({
    id: runId,
    kind: "SUBMIT_RUN",
    playerId,
    runPayload: payload,
    localSnapshot: {
      displayName: localSave.displayName,
      updatedAt: localSave.updatedAt,
      career: { ...localSave.career },
      runScores: [...localSave.runScores],
      contributedRunIds: { ...localSave.contributedRunIds },
    },
    attempts: 0,
    nextAttemptAt: Date.now(),
  });

  // Cap outbox
  if (outbox.length > CFG.OUTBOX_MAX) {
    // Drop oldest non-run item first, or oldest
    const dropIdx = outbox.findIndex((item) => item.kind !== "SUBMIT_RUN");
    outbox.splice(dropIdx !== -1 ? dropIdx : 0, 1);
  }
  saveOutbox(outbox);

  // 3. Trigger immediate background flush attempt
  flushOutbox().catch(() => {});

  return runId;
}

// Outbox Flusher with Exponential Backoff
export async function flushOutbox() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    isOffline = true;
    return;
  }

  const database = await initFirebase();
  if (!database) {
    isOffline = true;
    return;
  }

  const outbox = loadOutbox();
  if (outbox.length === 0) return;

  const { ref, set, runTransaction } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");

  const now = Date.now();
  const remaining = [];

  for (let i = 0; i < outbox.length; i++) {
    const item = outbox[i];
    if (item.nextAttemptAt > now) {
      remaining.push(item);
      continue;
    }

    try {
      if (item.kind === "SUBMIT_RUN") {
        const { playerId, runPayload, localSnapshot } = item;
        const runId = runPayload.runId;

        // 1. Write Immutable Run Node
        await withTimeout(
          set(ref(database, `v1/runs/${playerId}/${runId}`), runPayload)
        );

        // 2. Atomic Player Transaction Merge
        let mergedPlayerState = null;
        await withTimeout(
          runTransaction(ref(database, `v1/players/${playerId}`), (current) => {
            const base = current || {
              displayName: localSnapshot.displayName || "PLAYER",
              nameNormalized: normalizeName(localSnapshot.displayName || "PLAYER"),
              firstSeenAt: Date.now(),
              updatedAt: 0,
              revision: 0,
            };
            if (base.appliedRuns && base.appliedRuns[runId]) {
              mergedPlayerState = base;
              return base; // Idempotency guard
            }
            mergedPlayerState = mergePlayer(base, localSnapshot, runId);
            return mergedPlayerState;
          })
        );

        // 3. Update Denormalized Leaderboards
        if (mergedPlayerState) {
          const lbPlayer = {
            name: mergedPlayerState.displayName,
            rating: mergedPlayerState.rating,
            tier: mergedPlayerState.tier,
            bestRunScore: mergedPlayerState.bestRunScore,
            runsPlayed: mergedPlayerState.runsPlayed,
            matchesWon: mergedPlayerState.matchesWon,
            precision: Number(mergedPlayerState.precision.toFixed(3)),
            longestRun: mergedPlayerState.longestRun,
            titlesWeighted: mergedPlayerState.titlesWeighted,
            firstSeenAt: mergedPlayerState.firstSeenAt,
            at: Date.now(),
          };
          await withTimeout(
            set(ref(database, `v1/leaderboard/players/${playerId}`), lbPlayer)
          );
        }

        const lbRun = {
          playerId,
          name: localSnapshot.displayName || "PLAYER",
          score: runPayload.score,
          mode: runPayload.mode,
          difficulty: runPayload.difficulty,
          cup: runPayload.cup,
          at: runPayload.at,
        };
        await withTimeout(
          set(ref(database, `v1/leaderboard/runs/${runId}`), lbRun)
        );

        // 4. Name Index entry
        const normName = normalizeName(localSnapshot.displayName || "PLAYER");
        await withTimeout(
          set(ref(database, `v1/nameIndex/${normName}/${playerId}`), true)
        );

        isOffline = false;
        console.log(`[Cloud] Successfully synced run ${runId}`);
      }
    } catch (err) {
      console.warn(`[Cloud] Outbox item sync failed: ${item.id}`, err);
      isOffline = true;
      item.attempts = (item.attempts || 0) + 1;
      const delayMs = CFG.OUTBOX_RETRY_MS[Math.min(item.attempts - 1, CFG.OUTBOX_RETRY_MS.length - 1)];
      item.nextAttemptAt = Date.now() + delayMs;
      remaining.push(item);
    }
  }

  saveOutbox(remaining);
}

// In-memory Leaderboard Cache
let lbCache = {
  data: null,
  timestamp: 0,
};

// Fetch Leaderboard for specific metric tab
export async function fetchLeaderboard(tab = "RATING") {
  const now = Date.now();
  if (lbCache.data && now - lbCache.timestamp < 60000) {
    return { data: lbCache.data, cached: true, offline: isOffline };
  }

  try {
    const database = await initFirebase();
    if (!database) throw new Error("Database offline");

    const { ref, query, orderByChild, limitToLast, get } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js"
    );

    let dbQuery = query(
      ref(database, "v1/leaderboard/players"),
      orderByChild("rating"),
      limitToLast(CFG.LEADERBOARD_PAGE)
    );

    const snapshot = await withTimeout(get(dbQuery));
    if (snapshot.exists()) {
      const records = [];
      snapshot.forEach((child) => {
        records.push({ playerId: child.key, ...child.val() });
      });
      lbCache.data = records;
      lbCache.timestamp = now;
      isOffline = false;
      return { data: records, cached: false, offline: false };
    }
    return { data: [], cached: false, offline: false };
  } catch (e) {
    console.warn("[Cloud] Leaderboard fetch failed, using cached / empty board.", e);
    isOffline = true;
    return { data: lbCache.data || [], cached: true, offline: true };
  }
}

// Check Top 10 Qualification
export async function checkQualifiesTop10(score) {
  try {
    const database = await initFirebase();
    if (!database) return true; // Optimistically assume yes

    const { ref, query, orderByChild, limitToLast, get } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js"
    );

    const q = query(ref(database, "v1/leaderboard/runs"), orderByChild("score"), limitToLast(10));
    const snapshot = await withTimeout(get(q), 1500); // Quick check 1.5s max

    if (!snapshot.exists()) return true;

    const scores = [];
    snapshot.forEach((child) => {
      scores.push(child.val().score || 0);
    });

    if (scores.length < 10) return true;
    return score > Math.min(...scores);
  } catch (e) {
    return true; // Fallback optimistic true
  }
}

// Background flusher interval every 5s & window online listener
if (typeof window !== "undefined") {
  setInterval(flushOutbox, 5000);
  window.addEventListener("online", () => {
    isOffline = false;
    flushOutbox();
  });
}
