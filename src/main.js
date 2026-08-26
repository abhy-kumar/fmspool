import { CFG } from "./config.js";
import { sceneManager, go } from "./sceneManager.js";
import { bootScene } from "./scenes/boot.js";
import { titleScene } from "./scenes/title.js";
import { matchScene } from "./scenes/match.js";
import { tournamentScene } from "./scenes/tournament.js";
import { leaderboardScene } from "./scenes/leaderboard.js";
import { settingsScene } from "./scenes/settings.js";

// Verify core physics invariant at boot
console.assert(
  CFG.MAX_SPEED * CFG.DT < CFG.BALL_R,
  `Invariant broken: MAX_SPEED * DT (${(CFG.MAX_SPEED * CFG.DT).toFixed(2)}) must be < BALL_R (${CFG.BALL_R})`
);

export const canvas = document.getElementById("game-canvas");
export const ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;

export const view = {
  scale: 1,
  rotated: false,
  width: CFG.BASE_W,
  height: CFG.BASE_H,
};

// Register all scenes into the decoupled sceneManager
sceneManager.register("boot", bootScene);
sceneManager.register("title", titleScene);
sceneManager.register("match", matchScene);
sceneManager.register("tournament", tournamentScene);
sceneManager.register("leaderboard", leaderboardScene);
sceneManager.register("settings", settingsScene);

export { go };

// Window resize & viewport scaling
function updateViewport() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (vh > vw) {
    // Portrait mode -> rotate 90 degrees
    view.rotated = true;
    const rawScale = Math.min(vw / CFG.BASE_H, vh / CFG.BASE_W);
    view.scale = rawScale >= 1 ? Math.floor(rawScale) : rawScale;
    if (view.scale <= 0) view.scale = 1;

    canvas.style.width = `${Math.round(CFG.BASE_W * view.scale)}px`;
    canvas.style.height = `${Math.round(CFG.BASE_H * view.scale)}px`;
    canvas.style.transform = "rotate(90deg)";
  } else {
    // Landscape mode -> normal orientation
    view.rotated = false;
    const rawScale = Math.min(vw / CFG.BASE_W, vh / CFG.BASE_H);
    view.scale = rawScale >= 1 ? Math.floor(rawScale) : rawScale;
    if (view.scale <= 0) view.scale = 1;

    canvas.style.width = `${Math.round(CFG.BASE_W * view.scale)}px`;
    canvas.style.height = `${Math.round(CFG.BASE_H * view.scale)}px`;
    canvas.style.transform = "none";
  }
}

window.addEventListener("resize", updateViewport);
window.addEventListener("orientationchange", updateViewport);

// Screen space -> Base pixel coordinate unprojection (including 90 deg inverse)
export function screenToBase(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  let sx = (clientX - r.left) / r.width;
  let sy = (clientY - r.top) / r.height;

  if (view.rotated) {
    const t = sx;
    sx = sy;
    sy = 1 - t;
  }

  return {
    x: Math.max(0, Math.min(CFG.BASE_W, sx * CFG.BASE_W)),
    y: Math.max(0, Math.min(CFG.BASE_H, sy * CFG.BASE_H)),
  };
}

// Pointer Event Handlers
function handlePointer(type, originalEvent) {
  const coords = screenToBase(originalEvent.clientX, originalEvent.clientY);
  const event = {
    type,
    x: coords.x,
    y: coords.y,
    button: originalEvent.button,
    buttons: originalEvent.buttons,
    pointerId: originalEvent.pointerId,
    originalEvent,
  };

  if (sceneManager.current && typeof sceneManager.current.onPointer === "function") {
    sceneManager.current.onPointer(event);
  }
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  handlePointer("pointerdown", e);
});

canvas.addEventListener("pointermove", (e) => {
  e.preventDefault();
  handlePointer("pointermove", e);
});

canvas.addEventListener("pointerup", (e) => {
  e.preventDefault();
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  handlePointer("pointerup", e);
});

canvas.addEventListener("pointercancel", (e) => {
  e.preventDefault();
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  handlePointer("pointercancel", e);
});

// Keyboard Event Handlers
window.addEventListener("keydown", (e) => {
  if (sceneManager.current && typeof sceneManager.current.onKey === "function") {
    sceneManager.current.onKey(e);
  }
});

window.addEventListener("keyup", (e) => {
  if (sceneManager.current && typeof sceneManager.current.onKey === "function") {
    sceneManager.current.onKey(e);
  }
});

// Main Game Loop (Fixed Timestep Physics + Render)
let lastTime = performance.now();
let accumulator = 0;

function frame(currentTime) {
  const frameTime = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  sceneManager.updateSceneTransition();

  accumulator += frameTime;
  let substeps = 0;
  while (accumulator >= CFG.DT && substeps < CFG.MAX_SUBSTEPS) {
    if (sceneManager.current && typeof sceneManager.current.update === "function") {
      sceneManager.current.update(CFG.DT);
    }
    accumulator -= CFG.DT;
    substeps++;
  }

  if (substeps >= CFG.MAX_SUBSTEPS) {
    accumulator = 0;
  }

  // Render
  ctx.imageSmoothingEnabled = false;
  if (sceneManager.current && typeof sceneManager.current.render === "function") {
    sceneManager.current.render(ctx);
  }

  requestAnimationFrame(frame);
}

// Initial Boot
updateViewport();
sceneManager.go("boot");
requestAnimationFrame(frame);
