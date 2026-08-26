import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { loadSave, ACHIEVEMENTS, loadSettings } from "../storage.js";
import { renderPanel, renderButton } from "../ui.js";
import { renderCRTEffect, renderRoomBackground } from "../render.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";

export const achievementsScene = {
  name: "achievements",
  page: 0,
  itemsPerPage: 4,
  backBtn: { x: 12, y: 12, w: 60, h: 20 },

  enter() {
    audio.playTrack("TITLE");
    this.page = 0;
  },

  exit() {},

  update(dt) {},

  render(ctx) {
    const settings = loadSettings();
    renderRoomBackground(ctx, settings.selectedBg || "DEFAULT");

    // Dark tint panel
    ctx.fillStyle = "rgba(10, 8, 20, 0.84)";
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
    ctx.fillText("ACHIEVEMENTS & TROPHIES", 256, 16);

    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`UNLOCKED: ${unlockedCount}/${totalCount}`, 256, 30);

    ctx.fillStyle = PAL.YELLOW;
    ctx.textAlign = "right";
    ctx.fillText(`COINS: ${save.coins || 0}`, 496, 22);

    // 4 Cards on current page (2x2 grid)
    const maxPages = Math.ceil(ACHIEVEMENTS.length / this.itemsPerPage);
    const startIdx = this.page * this.itemsPerPage;
    const currentItems = ACHIEVEMENTS.slice(startIdx, startIdx + this.itemsPerPage);

    const cardW = 232;
    const cardH = 92;
    const cardGapX = 16;
    const cardGapY = 12;
    const gridStartX = 16;
    const gridStartY = 46;

    currentItems.forEach((ach, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = gridStartX + col * (cardW + cardGapX);
      const cy = gridStartY + row * (cardH + cardGapY);

      const isUnlocked = save.achievements && save.achievements[ach.id];

      // Card Background & Frame
      ctx.fillStyle = isUnlocked ? "#1a1636" : "#0f0d1a";
      ctx.fillRect(cx, cy, cardW, cardH);
      ctx.strokeStyle = isUnlocked ? PAL.GOLD : "#2b2545";
      ctx.lineWidth = isUnlocked ? 1.5 : 1;
      ctx.strokeRect(cx, cy, cardW, cardH);

      // Title
      ctx.fillStyle = isUnlocked ? PAL.GOLD : PAL.SILVER;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(ach.title, cx + 8, cy + 8);

      // Status Badge (Top Right of Card)
      if (isUnlocked) {
        ctx.fillStyle = PAL.GREEN;
        ctx.textAlign = "right";
        ctx.fillText("UNLOCKED", cx + cardW - 8, cy + 8);
      } else {
        ctx.fillStyle = PAL.YELLOW;
        ctx.textAlign = "right";
        ctx.fillText(`+${ach.coins} C`, cx + cardW - 8, cy + 8);
      }

      // Pop Culture Quote
      ctx.fillStyle = PAL.CYAN;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.fillText(`"${ach.quote}"`, cx + 8, cy + 24);

      // Description
      ctx.fillStyle = isUnlocked ? PAL.WHITE : PAL.GREY;
      ctx.font = '8px "Press Start 2P", monospace';
      
      // Multi-line description rendering
      const words = ach.desc.split(" ");
      let line1 = "";
      let line2 = "";
      words.forEach((w) => {
        if ((line1 + w).length < 28) line1 += (line1 ? " " : "") + w;
        else line2 += (line2 ? " " : "") + w;
      });

      ctx.fillText(line1, cx + 8, cy + 44);
      if (line2) ctx.fillText(line2, cx + 8, cy + 58);

      // Reward Banner at bottom of card
      if (isUnlocked) {
        ctx.fillStyle = PAL.BRASS;
        ctx.fillText(`AWARDED +${ach.coins} COINS`, cx + 8, cy + 76);
      }
    });

    // Pagination Controls (< PREV | PAGE X/Y | NEXT >)
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
    if (e.x >= 12 && e.x <= 72 && e.y >= 12 && e.y <= 32) {
      audio.playSfx("uiSelect");
      go("title");
      return;
    }

    const maxPages = Math.ceil(ACHIEVEMENTS.length / this.itemsPerPage);

    // Prev Button (x=136, y=254, w=90, h=22)
    if (e.x >= 136 && e.x <= 226 && e.y >= 254 && e.y <= 276) {
      this.page = (this.page - 1 + maxPages) % maxPages;
      audio.playSfx("uiMove");
      return;
    }

    // Next Button (x=286, y=254, w=90, h=22)
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
