import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { loadSave, ACHIEVEMENTS, loadSettings } from "../storage.js";
import { renderPanel, renderButton } from "../ui.js";
import { renderCRTEffect, renderRoomBackground } from "../render.js";
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

export const achievementsScene = {
  name: "achievements",
  page: 0,
  itemsPerPage: 4,
  backBtn: { x: 12, y: 10, w: 60, h: 20 },

  enter() {
    audio.playTrack("TITLE");
    this.page = 0;
  },

  exit() {},

  update(dt) {},

  render(ctx) {
    const settings = loadSettings();
    renderRoomBackground(ctx, settings.selectedBg || "DEFAULT");

    // Dark tint background
    ctx.fillStyle = "rgba(10, 8, 20, 0.86)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // Top Header
    renderButton(ctx, this.backBtn, "< BACK", false);

    const save = loadSave();
    const unlockedCount = Object.keys(save.achievements || {}).length;
    const totalCount = ACHIEVEMENTS.length;

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ACHIEVEMENTS & TROPHIES", 256, 14);

    ctx.fillStyle = PAL.CYAN;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillText(`UNLOCKED: ${unlockedCount}/${totalCount}`, 256, 26);

    ctx.fillStyle = PAL.YELLOW;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = "right";
    ctx.fillText(`COINS: ${save.coins || 0}`, 496, 20);

    // 4 Cards (2x2 Grid)
    const maxPages = Math.ceil(ACHIEVEMENTS.length / this.itemsPerPage);
    const startIdx = this.page * this.itemsPerPage;
    const currentItems = ACHIEVEMENTS.slice(startIdx, startIdx + this.itemsPerPage);

    const cardW = 232;
    const cardH = 98;
    const gridStartX = 16;
    const gridStartY = 42;
    const gutterX = 16;
    const gutterY = 8;

    currentItems.forEach((ach, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = gridStartX + col * (cardW + gutterX);
      const cy = gridStartY + row * (cardH + gutterY);

      const isUnlocked = !!(save.achievements && save.achievements[ach.id]);

      // Card Body & Double Border
      ctx.fillStyle = isUnlocked ? "#1c173b" : "#100d1e";
      ctx.fillRect(cx, cy, cardW, cardH);

      ctx.strokeStyle = isUnlocked ? PAL.GOLD : "#2d264f";
      ctx.lineWidth = isUnlocked ? 1.5 : 1;
      ctx.strokeRect(cx, cy, cardW, cardH);

      // 1. Header: Title (Left) and Reward / Status (Right)
      ctx.fillStyle = isUnlocked ? PAL.GOLD : PAL.SILVER;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      // Truncate title if extremely long to guarantee no overlap with right badge
      const displayTitle = ach.title.length > 18 ? ach.title.slice(0, 17) + "." : ach.title;
      ctx.fillText(displayTitle, cx + 8, cy + 8);

      if (isUnlocked) {
        ctx.fillStyle = PAL.GREEN;
        ctx.textAlign = "right";
        ctx.fillText("UNLOCKED", cx + cardW - 8, cy + 8);
      } else {
        ctx.fillStyle = PAL.YELLOW;
        ctx.textAlign = "right";
        ctx.fillText(`+${ach.coins} C`, cx + cardW - 8, cy + 8);
      }

      // 2. Pop Culture Quote (Wrapped with 6px font, max 30 chars per line)
      ctx.fillStyle = PAL.CYAN;
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const quoteLines = wrapText(`"${ach.quote}"`, 32);
      let textY = cy + 22;
      quoteLines.slice(0, 2).forEach((qLine) => {
        ctx.fillText(qLine, cx + 8, textY);
        textY += 10;
      });

      // 3. Description (Wrapped with 6px font, max 32 chars per line)
      ctx.fillStyle = isUnlocked ? PAL.WHITE : PAL.GREY;
      ctx.font = '6px "Press Start 2P", monospace';
      const descLines = wrapText(ach.desc, 32);

      textY = Math.max(textY, cy + 44);
      descLines.slice(0, 3).forEach((dLine) => {
        ctx.fillText(dLine, cx + 8, textY);
        textY += 10;
      });

      // 4. Reward Footer
      if (isUnlocked) {
        ctx.fillStyle = PAL.BRASS;
        ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillText(`AWARDED +${ach.coins} COINS`, cx + 8, cy + 84);
      }
    });

    // Pagination Footer
    renderButton(ctx, { x: 136, y: 254, w: 90, h: 22 }, "< PREV", false);

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`PAGE ${this.page + 1}/${maxPages}`, 256, 265);

    renderButton(ctx, { x: 286, y: 254, w: 90, h: 22 }, "NEXT >", false);

    if (settings.crtEnabled) {
      renderCRTEffect(ctx);
    }
  },

  handlePointer(e) {
    if (e.type !== "pointerdown") return;

    // Back Button
    if (e.x >= 12 && e.x <= 72 && e.y >= 10 && e.y <= 30) {
      audio.playSfx("uiSelect");
      go("title");
      return;
    }

    const maxPages = Math.ceil(ACHIEVEMENTS.length / this.itemsPerPage);

    // Prev Button
    if (e.x >= 136 && e.x <= 226 && e.y >= 254 && e.y <= 276) {
      this.page = (this.page - 1 + maxPages) % maxPages;
      audio.playSfx("uiMove");
      return;
    }

    // Next Button
    if (e.x >= 286 && e.x <= 376 && e.y >= 254 && e.y <= 276) {
      this.page = (this.page + 1) % maxPages;
      audio.playSfx("uiMove");
      return;
    }
  },

  onPointer(e) {
    this.handlePointer(e);
  },

  onKey(e) {
    if (e.type !== "keydown") return;

    const maxPages = Math.ceil(ACHIEVEMENTS.length / this.itemsPerPage);

    if (e.code === "ArrowLeft") {
      this.page = (this.page - 1 + maxPages) % maxPages;
      audio.playSfx("uiMove");
    } else if (e.code === "ArrowRight") {
      this.page = (this.page + 1) % maxPages;
      audio.playSfx("uiMove");
    } else if (e.code === "Escape") {
      audio.playSfx("uiSelect");
      go("title");
    }
  },
};
