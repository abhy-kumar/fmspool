import { PAL } from "./palette.js";
import { audio } from "./audio.js";
import { sanitizeDisplayName } from "./identity.js";

// Basic Profanity Filter with leetspeak and repeat stripping
const BLOCKED_WORDS = ["SHIT", "FUCK", "DAMN", "BITCH", "CUNT", "DICK", "COCK", "ASS", "BASTARD", "SLUT"];

export function isProfane(text) {
  if (!text) return false;
  let normalized = text.toLowerCase()
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/(.)\1+/g, "$1"); // Collapse repeats

  return BLOCKED_WORDS.some((word) => normalized.includes(word.toLowerCase()));
}

// Render Retro Pixel Panel
export function renderPanel(ctx, x, y, w, h, title = null) {
  // Drop shadow
  ctx.fillStyle = PAL.BLACK;
  ctx.fillRect(x + 1, y + 1, w, h);

  // Body fill
  ctx.fillStyle = PAL.DARK;
  ctx.fillRect(x, y, w, h);

  // Outer border
  ctx.strokeStyle = PAL.SILVER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Inner border
  ctx.strokeStyle = PAL.SLATE;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

  // Optional Title header banner
  if (title) {
    ctx.fillStyle = PAL.SLATE;
    ctx.fillRect(x + 2, y + 2, w - 4, 14);
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, x + w / 2, y + 9);
  }
}

// Render Retro Button
export function renderButton(ctx, rect, text, isSelected = false, isPressed = false) {
  const x = rect.x;
  const y = rect.y + (isPressed ? 1 : 0);
  const w = rect.w;
  const h = rect.h;

  ctx.fillStyle = isSelected ? PAL.GREY : PAL.SLATE;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = isSelected ? PAL.CYAN : PAL.SILVER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.fillStyle = isSelected ? PAL.WHITE : PAL.SILVER;
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2);
}

// Arcade On-Screen Keyboard Component
export class ArcadeKeyboard {
  constructor(initialName = "PLAYER", onConfirm = null, onCancel = null) {
    this.name = sanitizeDisplayName(initialName);
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.cursorTimer = 0;

    // 10 cols x 4 rows keys
    this.keys = [
      ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      ["K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"],
      ["U", "V", "W", "X", "Y", "Z", "0", "1", "2", "3"],
      ["4", "5", "6", "7", "8", "9", "_", "DEL", "OK", "ESC"],
    ];

    this.gridRect = { x: 56, y: 120, keyW: 36, keyH: 26, gap: 4 };
  }

  update(dt) {
    this.cursorTimer = (this.cursorTimer + dt) % 0.8;
  }

  render(ctx, score = null, rank = null) {
    // Backdrop Panel
    renderPanel(ctx, 40, 24, 432, 240, "ENTER YOUR INITIALS");

    // Rank & Score Banner
    const isShimmer = Math.floor(this.cursorTimer * 4) % 2 === 0;
    ctx.fillStyle = isShimmer ? PAL.BRASS : PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (rank) {
      ctx.fillText(`NEW HIGH SCORE! RANK #${rank}`, 256, 46);
    } else {
      ctx.fillText("HIGH SCORE RUN COMPLETE", 256, 46);
    }

    if (score !== null) {
      ctx.fillStyle = PAL.CYAN;
      ctx.fillText(`FINAL SCORE: ${score}`, 256, 60);
    }

    // Name Input Box
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(156, 80, 200, 24);
    ctx.strokeStyle = PAL.CYAN;
    ctx.strokeRect(156, 80, 200, 24);

    const showCursor = this.cursorTimer < 0.4;
    const displayText = this.name + (showCursor && this.name.length < 12 ? "_" : "");
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayText, 256, 92);

    // Render Keys Grid
    const g = this.gridRect;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 10; c++) {
        const key = this.keys[r][c];
        const kx = g.x + c * (g.keyW + g.gap);
        const ky = g.y + r * (g.keyH + g.gap);

        let kColor = PAL.SLATE;
        let borderCol = PAL.SILVER;
        if (key === "OK") { kColor = PAL.FELT; borderCol = PAL.GREEN; }
        else if (key === "DEL") { kColor = PAL.MAROON; borderCol = PAL.RED; }
        else if (key === "ESC") { kColor = PAL.DARK; borderCol = PAL.GREY; }

        ctx.fillStyle = kColor;
        ctx.fillRect(kx, ky, g.keyW, g.keyH);
        ctx.strokeStyle = borderCol;
        ctx.strokeRect(kx, ky, g.keyW, g.keyH);

        ctx.fillStyle = PAL.WHITE;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(key, kx + g.keyW / 2, ky + g.keyH / 2);
      }
    }
  }

  handlePointer(e) {
    if (e.type !== "pointerdown") return;
    const g = this.gridRect;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 10; c++) {
        const key = this.keys[r][c];
        const kx = g.x + c * (g.keyW + g.gap);
        const ky = g.y + r * (g.keyH + g.gap);

        if (e.x >= kx && e.x <= kx + g.keyW && e.y >= ky && e.y <= ky + g.keyH) {
          this.pressKey(key);
          return;
        }
      }
    }
  }

  handleKey(e) {
    if (e.type !== "keydown") return;
    if (e.code === "Backspace") {
      this.pressKey("DEL");
    } else if (e.code === "Enter") {
      this.pressKey("OK");
    } else if (e.code === "Escape") {
      this.pressKey("ESC");
    } else if (e.key && e.key.length === 1) {
      const char = e.key.toUpperCase();
      if (/^[A-Z0-9_]$/.test(char)) {
        this.pressKey(char);
      }
    }
  }

  pressKey(key) {
    if (key === "DEL") {
      if (this.name.length > 0) {
        this.name = this.name.slice(0, -1);
        audio.playSfx("keyPress");
      }
    } else if (key === "OK") {
      if (this.name.length >= 3 && !isProfane(this.name)) {
        audio.playSfx("uiSelect");
        if (typeof this.onConfirm === "function") this.onConfirm(this.name);
      } else {
        audio.playSfx("foul");
      }
    } else if (key === "ESC") {
      audio.playSfx("uiMove");
      if (typeof this.onCancel === "function") this.onCancel();
    } else {
      if (this.name.length < 12) {
        this.name += key;
        audio.playSfx("keyPress");
      }
    }
  }
}
