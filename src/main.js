import { CFG } from "./config.js";
import { sceneManager, go } from "./sceneManager.js";
import { view } from "./view.js";
import { bootScene } from "./scenes/boot.js";
import { titleScene } from "./scenes/title.js";
import { matchScene } from "./scenes/match.js";
import { tournamentScene } from "./scenes/tournament.js";
import { leaderboardScene } from "./scenes/leaderboard.js";
import { settingsScene } from "./scenes/settings.js";
import { achievementsScene } from "./scenes/achievements.js";

// Verify core physics invariant at boot
console.assert(
  CFG.MAX_SPEED * CFG.DT < CFG.BALL_R,
  `Invariant broken: MAX_SPEED * DT (${(CFG.MAX_SPEED * CFG.DT).toFixed(2)}) must be < BALL_R (${CFG.BALL_R})`
);

export const canvas = document.getElementById("game-canvas");
export const ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;

export { view };

// Register all scenes into the decoupled sceneManager
sceneManager.register("boot", bootScene);
sceneManager.register("title", titleScene);
sceneManager.register("match", matchScene);
sceneManager.register("tournament", tournamentScene);
sceneManager.register("leaderboard", leaderboardScene);
sceneManager.register("settings", settingsScene);
sceneManager.register("achievements", achievementsScene);

export { go };

// Window resize & viewport scaling to fill 100% of the available display
function updateViewport() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (vh > vw * 1.05) {
    // Portrait mode -> rotate 90 degrees and fit rotated canvas to full screen bounds
    view.rotated = true;
    const scale = Math.min(vw / CFG.BASE_H, vh / CFG.BASE_W);
    view.scale = scale > 0 ? scale : 1;

    const w = Math.round(CFG.BASE_W * view.scale);
    const h = Math.round(CFG.BASE_H * view.scale);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.transform = "rotate(90deg)";

    // Rotated: the canvas x axis runs down the screen, y axis runs across it.
    const padX = Math.max(0, (vh - w) / 2) / view.scale;
    const padY = Math.max(0, (vw - h) / 2) / view.scale;
    view.baseBounds = { minX: -padX, minY: -padY, maxX: CFG.BASE_W + padX, maxY: CFG.BASE_H + padY };
  } else {
    // Landscape mode -> fit canvas to 100% maximum possible width and height
    view.rotated = false;
    const scale = Math.min(vw / CFG.BASE_W, vh / CFG.BASE_H);
    view.scale = scale > 0 ? scale : 1;

    const w = Math.round(CFG.BASE_W * view.scale);
    const h = Math.round(CFG.BASE_H * view.scale);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.transform = "none";

    const padX = Math.max(0, (vw - w) / 2) / view.scale;
    const padY = Math.max(0, (vh - h) / 2) / view.scale;
    view.baseBounds = { minX: -padX, minY: -padY, maxX: CFG.BASE_W + padX, maxY: CFG.BASE_H + padY };
  }
}

window.addEventListener("resize", updateViewport);
window.addEventListener("orientationchange", updateViewport);
document.addEventListener("fullscreenchange", updateViewport);

// Helper to safely toggle fullscreen via button click without key conflicts
export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

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

  // Raw values may sit outside the canvas: pointer capture keeps delivering moves
  // once a finger leaves the letterboxed area, and drags need that extra travel.
  const rawX = sx * CFG.BASE_W;
  const rawY = sy * CFG.BASE_H;

  return {
    x: Math.max(0, Math.min(CFG.BASE_W, rawX)),
    y: Math.max(0, Math.min(CFG.BASE_H, rawY)),
    rawX,
    rawY,
  };
}

// Pointer Event Handlers
function handlePointer(type, originalEvent) {
  const coords = screenToBase(originalEvent.clientX, originalEvent.clientY);
  const event = {
    type,
    x: coords.x,
    y: coords.y,
    rawX: coords.rawX,
    rawY: coords.rawY,
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

// Keyboard Event Handlers (Dispatched directly to the active scene without global key hijacking)
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
