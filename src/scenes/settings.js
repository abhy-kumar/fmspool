import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import {
  loadSettings,
  saveSettings,
  loadSave,
  resetAllProgress,
  COSMETIC_CUES,
  COSMETIC_FELTS,
  COSMETIC_TABLES,
  COSMETIC_BALLS,
  COSMETIC_MENU_THEMES,
  COSMETIC_BACKGROUNDS,
  saveImmediate,
  unlockAchievement,
} from "../storage.js";
import { renderPanel, renderButton } from "../ui.js";
import { renderCRTEffect, renderRoomBackground } from "../render.js";
import { bakeFelt, bakeCueStick, bakeBallSprites, SPRITES } from "../sprites.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";

function wrapText(text, maxChars) {
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let cur = "";

  words.forEach((w) => {
    if ((cur + (cur ? " " : "") + w).length <= maxChars) {
      cur += (cur ? " " : "") + w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  });
  if (cur) lines.push(cur);
  return lines;
}

// 1. Dedicated High-Detail Cue Stick Preview
function renderCuePreview(ctx, cueId, x, y, w, h) {
  let buttGrad = ["#a8243c", "#590e1d"];
  let shaftColor = "#f3cb77";
  let tipColor = PAL.CYAN;
  let jointColor = PAL.GOLD;
  let ringColor = PAL.GOLD;
  let auraColor = null;

  if (cueId === "ASHOKA") {
    buttGrad = ["#1e3a8a", "#0f172a"];
    shaftColor = "#fde047";
    tipColor = PAL.CYAN;
    jointColor = "#eab308";
    ringColor = "#38bdf8";
  } else if (cueId === "DESI_CLUB") {
    buttGrad = ["#78350f", "#3b1a07"];
    shaftColor = "#fcd34d";
    tipColor = PAL.YELLOW;
    jointColor = PAL.BRASS;
    ringColor = "#d97706";
  } else if (cueId === "MIDNIGHT") {
    buttGrad = ["#6927b5", "#270b4a"];
    shaftColor = "#c5c0db";
    tipColor = PAL.MAGENTA;
    jointColor = "#e2e8f0";
    ringColor = "#a855f7";
  } else if (cueId === "GOLDEN") {
    buttGrad = ["#ffcc00", "#996d00"];
    shaftColor = "#ffeaa3";
    tipColor = "#ffffff";
    jointColor = "#ffd700";
    ringColor = "#fffbeb";
    auraColor = "rgba(255, 215, 0, 0.25)";
  } else if (cueId === "EMERALD") {
    buttGrad = ["#158450", "#094227"];
    shaftColor = "#a6e3b5";
    tipColor = PAL.YELLOW;
    jointColor = "#fbbf24";
    ringColor = "#34d399";
  } else if (cueId === "CYBER") {
    buttGrad = ["#0088ff", "#002a66"];
    shaftColor = "#66dcff";
    tipColor = PAL.MAGENTA;
    jointColor = "#00f0ff";
    ringColor = "#ff00ff";
    auraColor = "rgba(0, 240, 255, 0.35)";
  } else if (cueId === "DRAGON") {
    buttGrad = ["#ff2244", "#770011"];
    shaftColor = "#ffaa66";
    tipColor = PAL.YELLOW;
    jointColor = "#fbbf24";
    ringColor = "#f97316";
    auraColor = "rgba(255, 34, 68, 0.3)";
  } else if (cueId === "KOHINOOR") {
    buttGrad = ["#e2e8f0", "#94a3b8"];
    shaftColor = "#f8fafc";
    tipColor = "#00f0ff";
    jointColor = "#ffffff";
    ringColor = "#38bdf8";
    auraColor = "rgba(255, 255, 255, 0.4)";
  }

  const cy = y + h / 2;
  const cueW = w - 16;
  const startX = x + 8;

  // Optional glow aura
  if (auraColor) {
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(startX, cy);
    ctx.lineTo(startX + cueW, cy);
    ctx.stroke();
  }

  // 1. Chalked Tip (4px)
  ctx.fillStyle = tipColor;
  ctx.fillRect(startX, cy - 2, 4, 4);

  // 2. White Ferrule (6px)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(startX + 4, cy - 2.5, 6, 5);

  // 3. Shaft
  const shaftG = ctx.createLinearGradient(0, cy - 3, 0, cy + 3);
  shaftG.addColorStop(0, "#ffffff");
  shaftG.addColorStop(0.4, shaftColor);
  shaftG.addColorStop(1, "#85581a");
  ctx.fillStyle = shaftG;
  ctx.fillRect(startX + 10, cy - 3, 76, 6);

  // 4. Joint Collar (6px)
  ctx.fillStyle = jointColor;
  ctx.fillRect(startX + 86, cy - 3.5, 6, 7);
  ctx.fillStyle = ringColor;
  ctx.fillRect(startX + 88, cy - 3.5, 2, 7);

  // 5. Forearm & Butt
  const buttG = ctx.createLinearGradient(0, cy - 4, 0, cy + 4);
  buttG.addColorStop(0, buttGrad[0]);
  buttG.addColorStop(1, buttGrad[1]);
  ctx.fillStyle = buttG;
  ctx.fillRect(startX + 92, cy - 4, cueW - 98, 8);

  // 6. Textured Grip Wrap
  ctx.fillStyle = "#120e20";
  ctx.fillRect(startX + 116, cy - 4, 46, 8);
  ctx.fillStyle = ringColor;
  for (let i = startX + 118; i < startX + 160; i += 4) {
    ctx.fillRect(i, cy - 4, 1.5, 8);
  }

  // 7. Butt Plate & Bumper (6px)
  ctx.fillStyle = jointColor;
  ctx.fillRect(startX + cueW - 6, cy - 4, 3, 8);
  ctx.fillStyle = "#1a1626";
  ctx.fillRect(startX + cueW - 3, cy - 3, 3, 6);
}

// 2. Dedicated 3D Ball Set Preview
function renderBallSetPreview(ctx, ballSkinId, x, y, w, h) {
  const cy = y + h / 2;
  const ballDefs = [
    { id: 0, base: "#ffffff", dark: "#c0c8db", stripe: false },
    { id: 1, base: "#ffd000", dark: "#b38600", stripe: false },
    { id: 8, base: "#3c384a", dark: "#08060d", stripe: false },
    { id: 9, base: "#ffd000", dark: "#b38600", stripe: true },
  ];
  const radius = 9;
  const spacing = 46;
  const startX = x + (w - 3 * spacing) / 2;

  ballDefs.forEach((b, i) => {
    const bx = startX + i * spacing;

    // Drop Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.ellipse(bx, cy + radius - 1, radius, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sphere clipping
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // 1. Base Sphere Gradient
    const grad = ctx.createRadialGradient(bx - 3, cy - 3, 1, bx, cy, radius);

    if (ballSkinId === "NEON") {
      if (b.id === 0) {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.5, "#a6f8ff");
        grad.addColorStop(1, "#00c8ff");
      } else if (b.id === 8) {
        grad.addColorStop(0, "#4a3b63");
        grad.addColorStop(0.6, "#1f1035");
        grad.addColorStop(1, "#0a0414");
      } else {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.3, b.base);
        grad.addColorStop(0.8, b.dark);
        grad.addColorStop(1, "#0a001a");
      }
    } else if (ballSkinId === "VINTAGE") {
      if (b.id === 0) {
        grad.addColorStop(0, "#fffcf0");
        grad.addColorStop(0.6, "#ebd9b0");
        grad.addColorStop(1, "#9e8455");
      } else if (b.id === 8) {
        grad.addColorStop(0, "#3d3630");
        grad.addColorStop(0.6, "#1f1a16");
        grad.addColorStop(1, "#0a0806");
      } else {
        grad.addColorStop(0, b.base);
        grad.addColorStop(0.65, b.dark);
        grad.addColorStop(1, "#261a08");
      }
    } else if (ballSkinId === "MARBLE") {
      if (b.id === 0) {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.5, "#f0e6ff");
        grad.addColorStop(1, "#9980b3");
      } else if (b.id === 8) {
        grad.addColorStop(0, "#4a4659");
        grad.addColorStop(0.5, "#1e1b29");
        grad.addColorStop(1, "#0a0910");
      } else {
        grad.addColorStop(0, b.base);
        grad.addColorStop(0.6, b.dark);
        grad.addColorStop(1, "#12081f");
      }
    } else if (ballSkinId === "OBSIDIAN") {
      if (b.id === 0) {
        grad.addColorStop(0, "#e8f8ff");
        grad.addColorStop(0.6, "#829ab1");
        grad.addColorStop(1, "#243b53");
      } else {
        grad.addColorStop(0, "#2c2838");
        grad.addColorStop(0.6, "#14121c");
        grad.addColorStop(1, "#06050a");
      }
    } else if (ballSkinId === "GEMSTONE") {
      if (b.id === 0) {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.4, "#d8f6ff");
        grad.addColorStop(1, "#40a0c0");
      } else if (b.id === 8) {
        grad.addColorStop(0, "#604878");
        grad.addColorStop(0.5, "#251636");
        grad.addColorStop(1, "#0a0212");
      } else {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.35, b.base);
        grad.addColorStop(0.85, b.dark);
        grad.addColorStop(1, "#100010");
      }
    } else {
      // DEFAULT TOURNAMENT PRO
      if (b.id === 0) {
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.65, "#f0f2fa");
        grad.addColorStop(1, "#c0c8db");
      } else if (b.id === 8) {
        grad.addColorStop(0, "#3c384a");
        grad.addColorStop(0.5, "#171421");
        grad.addColorStop(1, "#08060d");
      } else {
        grad.addColorStop(0, b.base);
        grad.addColorStop(0.7, b.dark);
        grad.addColorStop(1, "#0a0712");
      }
    }

    ctx.fillStyle = grad;
    ctx.fillRect(bx - radius, cy - radius, radius * 2, radius * 2);

    // 2. Stripe band
    if (b.stripe) {
      const stripeG = ctx.createRadialGradient(bx - 3, cy - 3, 1, bx, cy, radius);
      if (ballSkinId === "VINTAGE") {
        stripeG.addColorStop(0, "#fffef5");
        stripeG.addColorStop(0.7, "#ebd9b0");
        stripeG.addColorStop(1, "#8a7348");
      } else if (ballSkinId === "OBSIDIAN") {
        stripeG.addColorStop(0, b.base);
        stripeG.addColorStop(0.7, b.dark);
        stripeG.addColorStop(1, "#0a0512");
      } else {
        stripeG.addColorStop(0, "#ffffff");
        stripeG.addColorStop(0.7, "#e1e4ee");
        stripeG.addColorStop(1, "#98a1b5");
      }
      ctx.fillStyle = stripeG;
      ctx.fillRect(bx - radius, cy - radius, radius * 2, 4.5);
      ctx.fillRect(bx - radius, cy + radius - 4.5, radius * 2, 4.5);
    }

    // 3. Center Inlay Disc & Numeral
    if (b.id !== 0) {
      const discColor =
        ballSkinId === "MARBLE"
          ? "#ffd000"
          : ballSkinId === "VINTAGE"
          ? "#f5e8c4"
          : ballSkinId === "OBSIDIAN"
          ? b.base
          : "#ffffff";
      ctx.fillStyle = discColor;
      ctx.beginPath();
      ctx.arc(bx, cy, 3.8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle =
        b.id === 8 || ballSkinId === "MARBLE" || ballSkinId === "OBSIDIAN"
          ? "#08060e"
          : "#141026";
      ctx.font = 'bold 5px monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(b.id), bx, cy + 0.5);
    } else {
      // Cue ball aiming dot
      ctx.fillStyle =
        ballSkinId === "NEON"
          ? "#00f0ff"
          : ballSkinId === "VINTAGE"
          ? "#8c2a38"
          : ballSkinId === "OBSIDIAN"
          ? "#00ffaa"
          : "#ff2244";
      ctx.beginPath();
      ctx.arc(bx, cy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Specular Highlight Gleam
    const specG = ctx.createRadialGradient(bx - 3.5, cy - 3.5, 0.2, bx - 3.5, cy - 3.5, 3.5);
    specG.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    specG.addColorStop(0.4, "rgba(255, 255, 255, 0.45)");
    specG.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = specG;
    ctx.beginPath();
    ctx.arc(bx - 3.5, cy - 3.5, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });
}

// 3. Dedicated Felt Preview
function renderFeltPreview(ctx, item, x, y, w, h) {
  const fx = x + 4;
  const fy = y + 2;
  const fw = w - 8;
  const fh = h - 4;

  const feltG = ctx.createRadialGradient(fx + fw / 2, fy + fh / 2, 8, fx + fw / 2, fy + fh / 2, fw * 0.65);
  feltG.addColorStop(0, item.light);
  feltG.addColorStop(0.5, item.color);
  feltG.addColorStop(1, item.dark);

  ctx.fillStyle = feltG;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = item.light;
  ctx.lineWidth = 1;
  ctx.strokeRect(fx, fy, fw, fh);

  // Dashed Headstring
  ctx.save();
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.moveTo(fx + fw * 0.28, fy);
  ctx.lineTo(fx + fw * 0.28, fy + fh);
  ctx.stroke();
  ctx.restore();

  // Inlaid Spots
  ctx.fillStyle = PAL.GOLD;
  ctx.fillRect(fx + fw * 0.28 - 1, fy + fh / 2 - 1, 3, 3);
  ctx.fillRect(fx + fw * 0.72 - 1, fy + fh / 2 - 1, 3, 3);
}

// 4. Dedicated Table Rails Preview
function renderTablePreview(ctx, item, x, y, w, h) {
  const tx = x + 4;
  const ty = y + 2;
  const tw = w - 8;
  const th = h - 4;

  // Rails Wood Gradient
  const woodG = ctx.createLinearGradient(tx, ty, tx, ty + th);
  woodG.addColorStop(0, item.railLight);
  woodG.addColorStop(0.5, item.railColor);
  woodG.addColorStop(1, item.railDark);
  ctx.fillStyle = woodG;
  ctx.fillRect(tx, ty, tw, th);

  // Bevel Lip
  ctx.strokeStyle = item.railHi;
  ctx.lineWidth = 1;
  ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);

  // Inner felt cutout
  ctx.fillStyle = PAL.FELT;
  ctx.fillRect(tx + 6, ty + 5, tw - 12, th - 10);
  ctx.strokeStyle = item.railDarkest || "rgba(0,0,0,0.6)";
  ctx.strokeRect(tx + 6, ty + 5, tw - 12, th - 10);

  // Inlaid Diamond Sights
  [tx + tw * 0.25, tx + tw * 0.5, tx + tw * 0.75].forEach((dx) => {
    ctx.fillStyle = item.diamondColor;
    ctx.fillRect(dx - 1, ty + 1.5, 3, 2);
    ctx.fillRect(dx - 1, ty + th - 3.5, 3, 2);
  });

  // 6 Miniature Pockets
  const pockets = [
    { x: tx + 6, y: ty + 5 },
    { x: tx + tw / 2, y: ty + 5 },
    { x: tx + tw - 6, y: ty + 5 },
    { x: tx + 6, y: ty + th - 5 },
    { x: tx + tw / 2, y: ty + th - 5 },
    { x: tx + tw - 6, y: ty + th - 5 },
  ];
  pockets.forEach((p) => {
    ctx.fillStyle = item.diamondColor;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

// 5. Dedicated Menu Theme Preview
function renderMenuThemePreview(ctx, item, x, y, w, h) {
  const mx = x + 4;
  const my = y + 2;
  const mw = w - 8;
  const mh = h - 4;

  ctx.fillStyle = "#120e24";
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = item.panelBorder || "#2b2352";
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mw, mh);

  // Mini Title Logo with 3D shadow
  const textX = mx + mw * 0.32;
  const textY = my + mh / 2;

  ctx.font = 'bold 9px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = item.shadow2 || "#420914";
  ctx.fillText("FMS POOL", textX + 1.5, textY + 1.5);
  ctx.fillStyle = item.shadow1 || "#801226";
  ctx.fillText("FMS POOL", textX + 0.8, textY + 0.8);

  const lg = item.logoGrad || ["#ffffff", "#ffd000"];
  const tGrad = ctx.createLinearGradient(0, textY - 4, 0, textY + 4);
  tGrad.addColorStop(0, lg[0]);
  tGrad.addColorStop(0.5, lg[1] || lg[0]);
  tGrad.addColorStop(1, lg[lg.length - 1]);
  ctx.fillStyle = tGrad;
  ctx.fillText("FMS POOL", textX, textY);

  // Mini Button Chip on Right
  const btnX = mx + mw * 0.64;
  const btnY = my + 3;
  const btnW = mw * 0.32;
  const btnH = mh - 6;

  ctx.fillStyle = "#1f1838";
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.strokeStyle = item.accentColor || PAL.CYAN;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(btnX, btnY, btnW, btnH);

  ctx.fillStyle = PAL.WHITE;
  ctx.font = '6px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  ctx.fillText("> PLAY", btnX + btnW / 2, btnY + btnH / 2);
}

// 6. Dedicated Room Background Preview
function renderRoomPreview(ctx, item, x, y, w, h) {
  const rx = x + 4;
  const ry = y + 2;
  const rw = w - 8;
  const rh = h - 4;

  const bgG = ctx.createRadialGradient(rx + rw / 2, ry + rh / 2, 4, rx + rw / 2, ry + rh / 2, rw * 0.65);
  bgG.addColorStop(0, item.light);
  bgG.addColorStop(0.5, item.color);
  bgG.addColorStop(1, item.dark);

  ctx.fillStyle = bgG;
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeStyle = item.light;
  ctx.lineWidth = 1;
  ctx.strokeRect(rx, ry, rw, rh);

  // Architectural Pattern
  ctx.save();
  if (item.id === "HAVELI") {
    ctx.strokeStyle = "rgba(255, 180, 100, 0.25)";
    for (let px = rx; px < rx + rw; px += 12) {
      ctx.beginPath(); ctx.moveTo(px, ry); ctx.lineTo(px, ry + rh); ctx.stroke();
    }
  } else if (item.id === "NEON") {
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    for (let py = ry; py < ry + rh; py += 6) {
      ctx.beginPath(); ctx.moveTo(rx, py); ctx.lineTo(rx + rw, py); ctx.stroke();
    }
  } else if (item.id === "PALACE") {
    ctx.strokeStyle = "rgba(255, 215, 0, 0.3)";
    for (let px = rx - 20; px < rx + rw + 20; px += 14) {
      ctx.beginPath(); ctx.moveTo(px, ry); ctx.lineTo(px + rh, ry + rh); ctx.stroke();
    }
  } else if (item.id === "MUMBAI") {
    ctx.strokeStyle = "rgba(42, 130, 210, 0.3)";
    for (let py = ry; py < ry + rh; py += 5) {
      ctx.beginPath(); ctx.moveTo(rx, py); ctx.lineTo(rx + rw, py); ctx.stroke();
    }
  } else {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    for (let py = ry; py < ry + rh; py += 6) {
      ctx.beginPath(); ctx.moveTo(rx, py); ctx.lineTo(rx + rw, py); ctx.stroke();
    }
  }
  ctx.restore();
}

export const settingsScene = {
  name: "settings",
  settings: null,
  backBtn: { x: 12, y: 10, w: 60, h: 20 },
  cosmeticTab: "CUES", // 'CUES' | 'FELTS' | 'TABLES' | 'BALLS' | 'BACKGROUNDS' | 'MENU'
  previewCueIdx: 0,
  previewFeltIdx: 0,
  previewTableIdx: 0,
  previewBallIdx: 0,
  previewBgIdx: 0,
  previewThemeIdx: 0,
  resetConfirmOpen: false,
  resetInput: "",

  enter() {
    this.settings = loadSettings();
    this.resetConfirmOpen = false;
    this.resetInput = "";
    this.cosmeticTab = "CUES";

    this.previewCueIdx = Math.max(0, COSMETIC_CUES.findIndex((c) => c.id === this.settings.selectedCue));
    this.previewFeltIdx = Math.max(0, COSMETIC_FELTS.findIndex((f) => f.id === this.settings.selectedFelt));
    this.previewTableIdx = Math.max(0, COSMETIC_TABLES.findIndex((t) => t.id === (this.settings.selectedTable || "DEFAULT")));
    this.previewBallIdx = Math.max(0, COSMETIC_BALLS.findIndex((b) => b.id === (this.settings.selectedBall || "DEFAULT")));
    this.previewBgIdx = Math.max(0, COSMETIC_BACKGROUNDS.findIndex((b) => b.id === (this.settings.selectedBg || "DEFAULT")));
    this.previewThemeIdx = Math.max(0, COSMETIC_MENU_THEMES.findIndex((m) => m.id === (this.settings.selectedMenuTheme || "DEFAULT")));
  },

  exit() {
    saveSettings(this.settings);
    // Guarantee equipped cosmetics are loaded into active game cache
    bakeCueStick(this.settings.selectedCue || "DEFAULT");
    const curFelt = COSMETIC_FELTS.find((f) => f.id === this.settings.selectedFelt);
    if (curFelt) bakeFelt(curFelt.color, curFelt.light, curFelt.dark);
    bakeBallSprites(this.settings.selectedBall || "DEFAULT");
  },

  update(dt) {},

  render(ctx) {
    // Dynamic Room Background (Previews active room selection in real-time)
    const activeBgToRender = this.cosmeticTab === "BACKGROUNDS"
      ? (COSMETIC_BACKGROUNDS[this.previewBgIdx] ? COSMETIC_BACKGROUNDS[this.previewBgIdx].id : "DEFAULT")
      : (this.settings.selectedBg || "DEFAULT");
    renderRoomBackground(ctx, activeBgToRender);

    // Dark tint plate
    ctx.fillStyle = "rgba(10, 8, 20, 0.78)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // Top Header
    renderButton(ctx, this.backBtn, "< BACK", false);

    const isFs = !document.fullscreenElement;
    renderButton(ctx, { x: 400, y: 10, w: 100, h: 20 }, isFs ? "FULLSCREEN" : "WINDOWED", false);

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SETTINGS & PRO SHOP", 256, 20);

    const s = this.settings;
    const save = loadSave();

    // 1. Audio & Display Panel (Left: x=16, y=40, w=232, h=234)
    renderPanel(ctx, 16, 40, 232, 234, "AUDIO & DISPLAY");

    const leftX = 28;
    const leftBtnX = 166;

    const drawSettingsRow = (label, valueText, y) => {
      ctx.fillStyle = PAL.WHITE;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, leftX, y);

      ctx.fillStyle = PAL.CYAN;
      ctx.textAlign = "right";
      ctx.fillText(valueText, leftBtnX - 8, y);

      renderButton(ctx, { x: leftBtnX, y: y - 9, w: 26, h: 18 }, "-", false);
      renderButton(ctx, { x: leftBtnX + 30, y: y - 9, w: 26, h: 18 }, "+", false);
    };

    drawSettingsRow("MASTER", `${Math.round(s.masterVol * 100)}%`, 66);
    drawSettingsRow("MUSIC", `${Math.round(s.musicVol * 100)}%`, 94);
    drawSettingsRow("SFX", `${Math.round(s.sfxVol * 100)}%`, 122);

    // CRT Toggle Row
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("CRT EFFECT", leftX, 152);
    renderButton(ctx, { x: 154, y: 142, w: 68, h: 20 }, s.crtEnabled ? "ON" : "OFF", s.crtEnabled);

    // Aim Assist Toggle Row
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("AIM ASSIST", leftX, 182);
    renderButton(ctx, { x: 144, y: 172, w: 78, h: 20 }, s.assistLevel, false);

    // Reset Progress Button
    renderButton(ctx, { x: 26, y: 234, w: 212, h: 24 }, "RESET PROGRESS", false);

    // 2. Pro Shop Panel (Right: x=264, y=40, w=232, h=234)
    renderPanel(ctx, 264, 40, 232, 234, "PRO SHOP");

    // Coins header
    ctx.fillStyle = PAL.YELLOW;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`COINS: ${save.coins || 0}`, 484, 54);

    // Category Tabs: 2 Rows of 3 buttons
    const tabW = 68;
    const tabH = 16;
    const tabY1 = 64;
    const tabY2 = 82;

    renderButton(ctx, { x: 272, y: tabY1, w: tabW, h: tabH }, "CUES", this.cosmeticTab === "CUES");
    renderButton(ctx, { x: 344, y: tabY1, w: tabW, h: tabH }, "FELTS", this.cosmeticTab === "FELTS");
    renderButton(ctx, { x: 416, y: tabY1, w: tabW, h: tabH }, "TABLES", this.cosmeticTab === "TABLES");

    renderButton(ctx, { x: 272, y: tabY2, w: tabW, h: tabH }, "BALLS", this.cosmeticTab === "BALLS");
    renderButton(ctx, { x: 344, y: tabY2, w: tabW, h: tabH }, "ROOMS", this.cosmeticTab === "BACKGROUNDS");
    renderButton(ctx, { x: 416, y: tabY2, w: tabW, h: tabH }, "MENU", this.cosmeticTab === "MENU");

    // Active Item Display Card
    let curList = COSMETIC_CUES;
    let curIdx = this.previewCueIdx;
    let unlockKey = "cues";
    let activeKey = s.selectedCue;

    if (this.cosmeticTab === "FELTS") {
      curList = COSMETIC_FELTS;
      curIdx = this.previewFeltIdx;
      unlockKey = "felts";
      activeKey = s.selectedFelt;
    } else if (this.cosmeticTab === "TABLES") {
      curList = COSMETIC_TABLES;
      curIdx = this.previewTableIdx;
      unlockKey = "tables";
      activeKey = s.selectedTable || "DEFAULT";
    } else if (this.cosmeticTab === "BALLS") {
      curList = COSMETIC_BALLS;
      curIdx = this.previewBallIdx;
      unlockKey = "balls";
      activeKey = s.selectedBall || "DEFAULT";
    } else if (this.cosmeticTab === "BACKGROUNDS") {
      curList = COSMETIC_BACKGROUNDS;
      curIdx = this.previewBgIdx;
      unlockKey = "backgrounds";
      activeKey = s.selectedBg || "DEFAULT";
    } else if (this.cosmeticTab === "MENU") {
      curList = COSMETIC_MENU_THEMES;
      curIdx = this.previewThemeIdx;
      unlockKey = "menuThemes";
      activeKey = s.selectedMenuTheme || "DEFAULT";
    }

    const item = curList[curIdx] || curList[0];
    const isUnlocked = save.unlocks[unlockKey] && save.unlocks[unlockKey].includes(item.id);
    const isEquipped = activeKey === item.id;

    // Item Name Banner
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.name, 380, 108);

    // Item Cost / Status
    if (isEquipped) {
      ctx.fillStyle = PAL.GREEN;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText("[ EQUIPPED ]", 380, 122);
    } else if (isUnlocked) {
      ctx.fillStyle = PAL.CYAN;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText("[ OWNED ]", 380, 122);
    } else {
      ctx.fillStyle = PAL.YELLOW;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText(`COST: ${item.cost} COINS`, 380, 122);
    }

    // Visual Preview Swatch Box (x=274, y=134, w=212, h=30)
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(274, 134, 212, 30);
    ctx.strokeStyle = PAL.SLATE;
    ctx.lineWidth = 1;
    ctx.strokeRect(274, 134, 212, 30);

    // Render category-specific visual preview
    if (this.cosmeticTab === "CUES") {
      renderCuePreview(ctx, item.id, 274, 134, 212, 30);
    } else if (this.cosmeticTab === "FELTS") {
      renderFeltPreview(ctx, item, 274, 134, 212, 30);
    } else if (this.cosmeticTab === "TABLES") {
      renderTablePreview(ctx, item, 274, 134, 212, 30);
    } else if (this.cosmeticTab === "BALLS") {
      renderBallSetPreview(ctx, item.id, 274, 134, 212, 30);
    } else if (this.cosmeticTab === "MENU") {
      renderMenuThemePreview(ctx, item, 274, 134, 212, 30);
    } else if (this.cosmeticTab === "BACKGROUNDS") {
      renderRoomPreview(ctx, item, 274, 134, 212, 30);
    }

    // Item Description (Wrapped with clean 6px font)
    ctx.fillStyle = PAL.SILVER;
    ctx.font = '6px "Press Start 2P", monospace';
    const descLines = wrapText(item.desc || (item.name + " theme"), 30);
    if (descLines[0]) ctx.fillText(descLines[0], 380, 174);
    if (descLines[1]) ctx.fillText(descLines[1], 380, 184);

    // Navigation Controls (< PREV | NEXT >)
    renderButton(ctx, { x: 274, y: 194, w: 96, h: 20 }, "< PREV", false);
    renderButton(ctx, { x: 390, y: 194, w: 96, h: 20 }, "NEXT >", false);

    // Main Action Button (BUY / EQUIP / ACTIVE)
    const actionBtnRect = { x: 274, y: 220, w: 212, h: 24 };
    if (!isUnlocked) {
      const canAfford = (save.coins || 0) >= item.cost;
      renderButton(ctx, actionBtnRect, canAfford ? `BUY ITEM (${item.cost} C)` : "NEED MORE COINS", false);
    } else if (!isEquipped) {
      renderButton(ctx, actionBtnRect, "EQUIP ITEM", false);
    } else {
      ctx.fillStyle = PAL.GREEN;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[ CURRENTLY ACTIVE ]", 380, 232);
    }

    // 3. Reset Confirmation Modal
    if (this.resetConfirmOpen) {
      this.renderResetModal(ctx);
    }

    if (s.crtEnabled) {
      renderCRTEffect(ctx);
    }
  },

  renderResetModal(ctx) {
    ctx.fillStyle = "rgba(7, 5, 14, 0.94)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    renderPanel(ctx, 96, 44, 320, 200, "RESET ALL PROGRESS?");

    ctx.fillStyle = PAL.RED;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("WARNING: THIS CANNOT BE UNDONE!", 256, 72);

    ctx.fillStyle = PAL.WHITE;
    ctx.fillText("TYPE 'RESET' TO CONFIRM:", 256, 96);

    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(166, 116, 180, 26);
    ctx.strokeStyle = PAL.CYAN;
    ctx.strokeRect(166, 116, 180, 26);

    ctx.fillStyle = PAL.YELLOW;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.resetInput || "_", 256, 129);

    renderButton(ctx, { x: 136, y: 168, w: 100, h: 24 }, "CONFIRM", false);
    renderButton(ctx, { x: 276, y: 168, w: 100, h: 24 }, "CANCEL", false);
  },

  handlePointer(e) {
    if (e.type !== "pointerdown") return;

    // Back Button
    if (e.x >= 12 && e.x <= 72 && e.y >= 10 && e.y <= 30) {
      audio.playSfx("uiSelect");
      saveSettings(this.settings);
      go("title");
      return;
    }

    // Fullscreen Toggle
    if (e.x >= 400 && e.x <= 500 && e.y >= 10 && e.y <= 30) {
      audio.playSfx("uiSelect");
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      return;
    }

    if (this.resetConfirmOpen) {
      if (e.x >= 136 && e.x <= 236 && e.y >= 168 && e.y <= 192) {
        if (this.resetInput.trim().toUpperCase() === "RESET") {
          audio.playSfx("foul");
          resetAllProgress();
          this.resetConfirmOpen = false;
          this.resetInput = "";
          go("title");
        } else {
          audio.playSfx("uiMove");
        }
        return;
      }
      if (e.x >= 276 && e.x <= 376 && e.y >= 168 && e.y <= 192) {
        audio.playSfx("uiSelect");
        this.resetConfirmOpen = false;
        this.resetInput = "";
        return;
      }
      return;
    }

    const s = this.settings;
    const save = loadSave();

    // Volume Sliders (leftBtnX = 166, width = 26, + at x = 196, h = 18)
    if (e.y >= 57 && e.y <= 75) {
      if (e.x >= 166 && e.x <= 192) {
        s.masterVol = Math.max(0, parseFloat((s.masterVol - 0.1).toFixed(1)));
        audio.setMasterVolume(s.masterVol);
        audio.playSfx("uiMove");
      } else if (e.x >= 196 && e.x <= 222) {
        s.masterVol = Math.min(1.0, parseFloat((s.masterVol + 0.1).toFixed(1)));
        audio.setMasterVolume(s.masterVol);
        audio.playSfx("uiMove");
      }
    }
    if (e.y >= 85 && e.y <= 103) {
      if (e.x >= 166 && e.x <= 192) {
        s.musicVol = Math.max(0, parseFloat((s.musicVol - 0.1).toFixed(1)));
        audio.setMusicVolume(s.musicVol);
        audio.playSfx("uiMove");
      } else if (e.x >= 196 && e.x <= 222) {
        s.musicVol = Math.min(1.0, parseFloat((s.musicVol + 0.1).toFixed(1)));
        audio.setMusicVolume(s.musicVol);
        audio.playSfx("uiMove");
      }
    }
    if (e.y >= 113 && e.y <= 131) {
      if (e.x >= 166 && e.x <= 192) {
        s.sfxVol = Math.max(0, parseFloat((s.sfxVol - 0.1).toFixed(1)));
        audio.setSfxVolume(s.sfxVol);
        audio.playSfx("ballHit");
      } else if (e.x >= 196 && e.x <= 222) {
        s.sfxVol = Math.min(1.0, parseFloat((s.sfxVol + 0.1).toFixed(1)));
        audio.setSfxVolume(s.sfxVol);
        audio.playSfx("ballHit");
      }
    }

    // CRT Toggle (x=154, y=142, w=68, h=20)
    if (e.x >= 154 && e.x <= 222 && e.y >= 142 && e.y <= 162) {
      s.crtEnabled = !s.crtEnabled;
      audio.playSfx("uiSelect");
      return;
    }

    // Aim Assist Toggle (x=144, y=172, w=78, h=20)
    if (e.x >= 144 && e.x <= 222 && e.y >= 172 && e.y <= 192) {
      const levels = ["FULL", "HALF", "CUE_ONLY", "OFF"];
      const nextIdx = (levels.indexOf(s.assistLevel) + 1) % levels.length;
      s.assistLevel = levels[nextIdx];
      audio.playSfx("uiSelect");
      return;
    }

    // Reset Progress Button (x=26, y=234, w=212, h=24)
    if (e.x >= 26 && e.x <= 238 && e.y >= 234 && e.y <= 258) {
      audio.playSfx("uiSelect");
      this.resetConfirmOpen = true;
      this.resetInput = "";
      return;
    }

    // Tab Switches Row 1 (y = 64..80)
    if (e.y >= 64 && e.y <= 80) {
      if (e.x >= 272 && e.x <= 340) {
        this.cosmeticTab = "CUES";
        audio.playSfx("uiSelect");
        return;
      } else if (e.x >= 344 && e.x <= 412) {
        this.cosmeticTab = "FELTS";
        audio.playSfx("uiSelect");
        return;
      } else if (e.x >= 416 && e.x <= 484) {
        this.cosmeticTab = "TABLES";
        audio.playSfx("uiSelect");
        return;
      }
    }

    // Tab Switches Row 2 (y = 82..98)
    if (e.y >= 82 && e.y <= 98) {
      if (e.x >= 272 && e.x <= 340) {
        this.cosmeticTab = "BALLS";
        audio.playSfx("uiSelect");
        return;
      } else if (e.x >= 344 && e.x <= 412) {
        this.cosmeticTab = "BACKGROUNDS";
        audio.playSfx("uiSelect");
        return;
      } else if (e.x >= 416 && e.x <= 484) {
        this.cosmeticTab = "MENU";
        audio.playSfx("uiSelect");
        return;
      }
    }

    // Cosmetics Prev / Next Navigation
    let curList = COSMETIC_CUES;
    let propIdxName = "previewCueIdx";
    let unlockKey = "cues";

    if (this.cosmeticTab === "FELTS") {
      curList = COSMETIC_FELTS;
      propIdxName = "previewFeltIdx";
      unlockKey = "felts";
    } else if (this.cosmeticTab === "TABLES") {
      curList = COSMETIC_TABLES;
      propIdxName = "previewTableIdx";
      unlockKey = "tables";
    } else if (this.cosmeticTab === "BALLS") {
      curList = COSMETIC_BALLS;
      propIdxName = "previewBallIdx";
      unlockKey = "balls";
    } else if (this.cosmeticTab === "BACKGROUNDS") {
      curList = COSMETIC_BACKGROUNDS;
      propIdxName = "previewBgIdx";
      unlockKey = "backgrounds";
    } else if (this.cosmeticTab === "MENU") {
      curList = COSMETIC_MENU_THEMES;
      propIdxName = "previewThemeIdx";
      unlockKey = "menuThemes";
    }

    // Prev Button (x=274, y=194, w=96, h=20)
    if (e.x >= 274 && e.x <= 370 && e.y >= 194 && e.y <= 214) {
      this[propIdxName] = (this[propIdxName] - 1 + curList.length) % curList.length;
      audio.playSfx("uiMove");
      return;
    }

    // Next Button (x=390, y=194, w=96, h=20)
    if (e.x >= 390 && e.x <= 486 && e.y >= 194 && e.y <= 214) {
      this[propIdxName] = (this[propIdxName] + 1) % curList.length;
      audio.playSfx("uiMove");
      return;
    }

    // Action Button (x=274, y=220, w=212, h=24)
    if (e.x >= 274 && e.x <= 486 && e.y >= 220 && e.y <= 244) {
      const curItem = curList[this[propIdxName]] || curList[0];
      const isUnlocked = save.unlocks[unlockKey] && save.unlocks[unlockKey].includes(curItem.id);

      if (!isUnlocked) {
        if ((save.coins || 0) >= curItem.cost) {
          save.coins -= curItem.cost;
          if (!save.unlocks[unlockKey].includes(curItem.id)) {
            save.unlocks[unlockKey].push(curItem.id);
          }
          saveImmediate(save);

          // Auto-equip on purchase
          if (this.cosmeticTab === "CUES") {
            s.selectedCue = curItem.id;
            bakeCueStick(curItem.id);
          } else if (this.cosmeticTab === "FELTS") {
            s.selectedFelt = curItem.id;
            bakeFelt(curItem.color, curItem.light, curItem.dark);
          } else if (this.cosmeticTab === "TABLES") {
            s.selectedTable = curItem.id;
          } else if (this.cosmeticTab === "BALLS") {
            s.selectedBall = curItem.id;
            bakeBallSprites(curItem.id);
          } else if (this.cosmeticTab === "BACKGROUNDS") {
            s.selectedBg = curItem.id;
          } else if (this.cosmeticTab === "MENU") {
            s.selectedMenuTheme = curItem.id;
          }
          saveSettings(s);
          audio.playSfx("uiSelect");

          // Check customizer achievements
          if (
            (save.unlocks.cues || []).length >= 3 &&
            (save.unlocks.felts || []).length >= 3
          ) {
            unlockAchievement("KABHI_KHUSHI");
          }
          if (
            (save.unlocks.menuThemes || []).length >= 2 &&
            (save.unlocks.balls || []).length >= 2 &&
            (save.unlocks.tables || []).length >= 2
          ) {
            unlockAchievement("STYLE_ICON");
          }
        } else {
          audio.playSfx("foul");
        }
      } else {
        // Equip item
        if (this.cosmeticTab === "CUES") {
          s.selectedCue = curItem.id;
          bakeCueStick(curItem.id);
        } else if (this.cosmeticTab === "FELTS") {
          s.selectedFelt = curItem.id;
          bakeFelt(curItem.color, curItem.light, curItem.dark);
        } else if (this.cosmeticTab === "TABLES") {
          s.selectedTable = curItem.id;
        } else if (this.cosmeticTab === "BALLS") {
          s.selectedBall = curItem.id;
          bakeBallSprites(curItem.id);
        } else if (this.cosmeticTab === "BACKGROUNDS") {
          s.selectedBg = curItem.id;
        } else if (this.cosmeticTab === "MENU") {
          s.selectedMenuTheme = curItem.id;
        }
        saveSettings(s);
        audio.playSfx("uiSelect");
      }
      return;
    }
  },

  onPointer(e) {
    this.handlePointer(e);
  },

  onKey(e) {
    if (e.type !== "keydown") return;

    if (this.resetConfirmOpen) {
      if (e.code === "Backspace") {
        this.resetInput = this.resetInput.slice(0, -1);
        audio.playSfx("keyPress");
      } else if (e.code === "Enter") {
        if (this.resetInput.trim().toUpperCase() === "RESET") {
          audio.playSfx("foul");
          resetAllProgress();
          this.resetConfirmOpen = false;
          this.resetInput = "";
          go("title");
        }
      } else if (e.code === "Escape") {
        this.resetConfirmOpen = false;
        this.resetInput = "";
        audio.playSfx("uiSelect");
      } else if (e.key && e.key.length === 1 && this.resetInput.length < 10) {
        this.resetInput += e.key.toUpperCase();
        audio.playSfx("keyPress");
      }
      return;
    }

    if (e.code === "Escape") {
      audio.playSfx("uiSelect");
      saveSettings(this.settings);
      go("title");
    }
  },
};
