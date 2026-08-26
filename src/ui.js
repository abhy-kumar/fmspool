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
    .replace(/(.)\1+/g, "$1");

  return BLOCKED_WORDS.some((word) => normalized.includes(word.toLowerCase()));
}

// Render Retro Pixel Panel
export function renderPanel(ctx, x, y, w, h, title = null) {
  // Drop shadow
  ctx.fillStyle = PAL.BLACK;
  ctx.fillRect(x + 2, y + 2, w, h);

  // Body fill
  ctx.fillStyle = PAL.DARKEST;
  ctx.fillRect(x, y, w, h);

  // Outer border
  ctx.strokeStyle = PAL.SLATE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Inner border highlight
  ctx.strokeStyle = PAL.DARK;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);

  // Optional Title header banner
  if (title) {
    ctx.fillStyle = PAL.SLATE;
    ctx.fillRect(x + 2, y + 2, w - 4, 16);
    ctx.fillStyle = PAL.BRASS;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(title, x + w / 2, y + 10);
  }
}

// Render Retro Button
export function renderButton(ctx, rect, text, isSelected = false, isPressed = false) {
  const x = rect.x;
  const y = rect.y + (isPressed ? 1 : 0);
  const w = rect.w;
  const h = rect.h;

  ctx.fillStyle = isSelected ? PAL.SLATE : PAL.DARK;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = isSelected ? PAL.CYAN : PAL.SLATE;
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
    ctx.fillStyle = "rgba(10, 8, 20, 0.94)";
    ctx.fillRect(0, 0, 512, 288);

    renderPanel(ctx, 36, 16, 440, 256, "ENTER YOUR NAME");

    if (score !== null) {
      ctx.fillStyle = PAL.BRASS;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`SCORE: ${score}`, 256, 46);
    }

    if (rank !== null) {
      ctx.fillStyle = PAL.CYAN;
      ctx.fillText(`TOP 10 ENTRY! RANK #${rank}`, 256, 62);
    }

    // Name Display Box
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(136, 78, 240, 30);
    ctx.strokeStyle = PAL.CYAN;
    ctx.strokeRect(136, 78, 240, 30);

    const showCursor = this.cursorTimer < 0.4;
    const displayText = this.name + (showCursor && this.name.length < 12 ? "_" : "");

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '12px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayText, 256, 93);

    // Keyboard Grid
    const g = this.gridRect;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 10; c++) {
        const kx = g.x + c * (g.keyW + g.gap);
        const ky = g.y + r * (g.keyH + g.gap);
        const keyLabel = this.keys[r][c];

        let isAction = keyLabel === "OK" || keyLabel === "DEL" || keyLabel === "ESC";
        let btnCol = PAL.DARK;
        if (keyLabel === "OK") btnCol = PAL.GREEN;
        else if (keyLabel === "DEL") btnCol = PAL.RED;
        else if (keyLabel === "ESC") btnCol = PAL.SLATE;

        ctx.fillStyle = btnCol;
        ctx.fillRect(kx, ky, g.keyW, g.keyH);
        ctx.strokeStyle = PAL.SLATE;
        ctx.strokeRect(kx, ky, g.keyW, g.keyH);

        ctx.fillStyle = PAL.WHITE;
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(keyLabel, kx + g.keyW / 2, ky + g.keyH / 2);
      }
    }
  }

  handlePointer(e) {
    if (e.type !== "pointerdown") return;
    const g = this.gridRect;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 10; c++) {
        const kx = g.x + c * (g.keyW + g.gap);
        const ky = g.y + r * (g.keyH + g.gap);

        if (e.x >= kx && e.x <= kx + g.keyW && e.y >= ky && e.y <= ky + g.keyH) {
          const key = this.keys[r][c];
          this.pressKey(key);
          return;
        }
      }
    }
  }

  handleKey(e) {
    if (e.type !== "keydown") return;

    if (e.code === "Backspace") {
      audio.playSfx("keyPress");
      this.name = this.name.slice(0, -1);
    } else if (e.code === "Enter") {
      this.confirm();
    } else if (e.code === "Escape") {
      this.cancel();
    } else if (e.key && e.key.length === 1 && /[a-zA-Z0-9_]/.test(e.key)) {
      if (this.name.length < 12) {
        audio.playSfx("keyPress");
        this.name = (this.name + e.key.toUpperCase()).slice(0, 12);
      }
    }
  }

  pressKey(key) {
    if (key === "DEL") {
      audio.playSfx("keyPress");
      this.name = this.name.slice(0, -1);
    } else if (key === "OK") {
      this.confirm();
    } else if (key === "ESC") {
      this.cancel();
    } else {
      if (this.name.length < 12) {
        audio.playSfx("keyPress");
        this.name = (this.name + key).slice(0, 12);
      }
    }
  }

  confirm() {
    audio.playSfx("uiSelect");
    let finalName = this.name.trim();
    if (isProfane(finalName)) {
      finalName = "PLAYER";
    }
    if (finalName.length < 3) {
      finalName = "PLAYER";
    }
    if (typeof this.onConfirm === "function") {
      this.onConfirm(finalName);
    }
  }

  cancel() {
    audio.playSfx("uiSelect");
    if (typeof this.onCancel === "function") {
      this.onCancel();
    }
  }
}
