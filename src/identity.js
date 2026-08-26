const IDENTITY_KEY = "fmspool.identity.v1";

export function generateUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreatePlayerId() {
  let pid = null;
  try {
    pid = localStorage.getItem(IDENTITY_KEY);
    if (!pid) {
      pid = generateUUID();
      localStorage.setItem(IDENTITY_KEY, pid);
    }
  } catch (e) {
    console.warn("[Identity] localStorage error, generating fallback UUID", e);
    pid = generateUUID();
  }
  return pid;
}

export function normalizeName(name) {
  if (!name || typeof name !== "string") return "player";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function formatWithDiscriminator(name, playerId) {
  if (!name) return "PLAYER";
  if (!playerId) return name.toUpperCase();
  const disc = playerId.replace(/-/g, "").slice(-4).toUpperCase();
  return `${name.toUpperCase()}#${disc}`;
}

export function sanitizeDisplayName(name) {
  if (!name) return "PLAYER";
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 12);
  return cleaned.length >= 3 ? cleaned : "PLAYER";
}
