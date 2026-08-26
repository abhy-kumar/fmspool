import { CFG, DIFFICULTY } from "../config.js";
import { PAL } from "../palette.js";
import { SPRITES } from "../sprites.js";
import { loadSave, loadSettings } from "../storage.js";
import { playerRating, getTier } from "../scoring.js";
import { formatWithDiscriminator } from "../identity.js";
import { getIsOffline } from "../cloud.js";
import { renderButton, renderPanel } from "../ui.js";
import { renderCRTEffect, renderRoomBackground } from "../render.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";

export const titleScene = {
  name: "title",
  menuItems: [],
  selectedItem: 0,
  shimmerTimer: 0,
  bgBalls: [
    { x: 60, y: 70, vx: 22, vy: 14, id: 1 },
    { x: 440, y: 90, vx: -18, vy: 20, id: 9 },
    { x: 120, y: 220, vx: 25, vy: -18, id: 3 },
    { x: 380, y: 200, vx: -20, vy: -16, id: 2 },
    { x: 256, y: 140, vx: 15, vy: -22, id: 8 },
    { x: 480, y: 240, vx: -24, vy: 12, id: 5 },
  ],
  difficultyModalOpen: false,
  howToPlayOpen: false,
  howToPlayPage: 0,

  enter() {
    audio.playTrack("TITLE");
    this.difficultyModalOpen = false;
    this.howToPlayOpen = false;
    this.buildMenu();
  },

  exit() {},

  buildMenu() {
    const save = loadSave();
    const hasContinue = !!(save.activeMatch || save.activeTournament);
    const items = [];

    if (hasContinue) {
      items.push({ id: "CONTINUE", label: "CONTINUE MATCH", color: PAL.GREEN });
    }
    items.push({ id: "QUICK", label: "QUICK MATCH", color: PAL.CYAN });
    items.push({ id: "TOURNAMENT", label: "TOURNAMENT CUPS", color: PAL.GOLD });
    items.push({ id: "ACHIEVEMENTS", label: "ACHIEVEMENTS & TROPHIES", color: PAL.YELLOW });
    items.push({ id: "LEADERBOARD", label: "GLOBAL RANKINGS", color: PAL.MAGENTA });
    items.push({ id: "SETTINGS", label: "PRO SHOP & CUES", color: PAL.GREY });
    items.push({ id: "HOWTO", label: "HOW TO PLAY", color: PAL.SILVER });

    this.menuItems = items;
    this.selectedItem = 0;
  },

  update(dt) {
    this.shimmerTimer += dt;

    // Smoothly bounce drifting 3D background billiard balls
    this.bgBalls.forEach((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 14) { b.x = 14; b.vx = Math.abs(b.vx); }
      if (b.x > CFG.BASE_W - 14) { b.x = CFG.BASE_W - 14; b.vx = -Math.abs(b.vx); }
      if (b.y < 14) { b.y = 14; b.vy = Math.abs(b.vy); }
      if (b.y > CFG.BASE_H - 14) { b.y = CFG.BASE_H - 14; b.vy = -Math.abs(b.vy); }
    });
  },

  render(ctx) {
    const settings = loadSettings();
    renderRoomBackground(ctx, settings.selectedBg || "DEFAULT");

    // Render Drifting 3D Billiard Balls in Background
    this.bgBalls.forEach((b) => {
      if (SPRITES.ballShadow) {
        ctx.drawImage(SPRITES.ballShadow, Math.round(b.x - 7), Math.round(b.y - 2));
      }
      const sprite = SPRITES.balls[b.id] ? SPRITES.balls[b.id][0] : null;
      if (sprite) {
        ctx.drawImage(sprite, Math.round(b.x - 6), Math.round(b.y - 6));
      }
    });

    // Dark semi-transparent atmospheric overlay plate
    ctx.fillStyle = "rgba(10, 8, 20, 0.78)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // 32-Bit 3D Arcade Logo ("FMS POOL")
    const logoX = 256;
    const logoY = 30;

    // 3D Extrusion Shadows
    ctx.font = 'bold 18px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let s = 3; s >= 1; s--) {
      ctx.fillStyle = s >= 2 ? "#420914" : "#801226";
      ctx.fillText("FMS POOL", logoX + s, logoY + s);
    }

    // Front Face: Metallic Gold Gradient with Chrome Shimmer
    const goldGrad = ctx.createLinearGradient(0, logoY - 8, 0, logoY + 8);
    const shimmerProgress = (this.shimmerTimer % 2.6) / 2.6;
    const isShimmer = shimmerProgress > 0.8 && shimmerProgress < 0.96;

    if (isShimmer) {
      goldGrad.addColorStop(0, "#ffffff");
      goldGrad.addColorStop(0.5, "#fff3b3");
      goldGrad.addColorStop(1, "#ffd000");
    } else {
      goldGrad.addColorStop(0, "#fff5b8");
      goldGrad.addColorStop(0.4, "#ffd000");
      goldGrad.addColorStop(0.8, "#d49b00");
      goldGrad.addColorStop(1, "#8a6000");
    }

    ctx.fillStyle = goldGrad;
    ctx.fillText("FMS POOL", logoX, logoY);

    // Subtitle Banner
    ctx.fillStyle = PAL.CYAN;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText("CLASSIC 8-BALL BILLIARDS", logoX, logoY + 18);

    // Top Fullscreen Button
    const isFs = !!document.fullscreenElement;
    renderButton(ctx, { x: 406, y: 10, w: 96, h: 20 }, isFs ? "WINDOW" : "FULLSCREEN", false);

    // Offline Tag if disconnected
    if (getIsOffline()) {
      ctx.fillStyle = PAL.RED;
      ctx.textAlign = "left";
      ctx.fillText("! OFFLINE", 12, 18);
    }

    // Polished 32-Bit Menu Buttons
    const startY = 66;
    const btnW = 230;
    const btnH = 20;
    const gap = 5;

    this.menuItems.forEach((item, idx) => {
      const bx = logoX - btnW / 2;
      const by = startY + idx * (btnH + gap);
      const isSelected = idx === this.selectedItem;

      ctx.fillStyle = isSelected ? "#2d2454" : "#191430";
      ctx.fillRect(bx, by, btnW, btnH);

      ctx.strokeStyle = isSelected ? PAL.CYAN : "#3c3363";
      ctx.lineWidth = isSelected ? 1.5 : 1;
      ctx.strokeRect(bx, by, btnW, btnH);

      const blink = isSelected && Math.floor(this.shimmerTimer * 4) % 2 === 0;
      const labelText = (isSelected ? (blink ? "> " : "  ") : "") + item.label;

      ctx.fillStyle = isSelected ? PAL.WHITE : PAL.SILVER;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, logoX, by + btnH / 2);
    });

    // Bottom Player Profile & Career Showcase Bar
    const save = loadSave();
    const rating = playerRating(save.runScores);
    const tier = getTier(rating);

    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(0, CFG.BASE_H - 26, CFG.BASE_W, 26);
    ctx.strokeStyle = PAL.SLATE;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, CFG.BASE_H - 26, CFG.BASE_W, 26);

    const formattedName = formatWithDiscriminator(save.displayName, save.playerId);
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(formattedName, 12, CFG.BASE_H - 13);

    const badge = SPRITES.tierBadges[tier.id];
    if (badge) {
      ctx.drawImage(badge, 178, CFG.BASE_H - 18);
    }
    ctx.fillStyle = tier.badgeColor || PAL.GOLD;
    ctx.fillText(tier.name, 194, CFG.BASE_H - 13);

    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`RATING: ${rating}`, 296, CFG.BASE_H - 13);

    ctx.fillStyle = PAL.GOLD;
    ctx.fillText(`COINS: ${save.coins || 0}`, 404, CFG.BASE_H - 13);

    // Modals
    if (this.difficultyModalOpen) {
      this.renderDifficultyModal(ctx);
    }
    if (this.howToPlayOpen) {
      this.renderHowToPlayModal(ctx);
    }

    renderCRTEffect(ctx);
  },

  renderDifficultyModal(ctx) {
    ctx.fillStyle = "rgba(7, 5, 14, 0.88)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    renderPanel(ctx, 116, 36, 280, 210, "SELECT DIFFICULTY");

    const diffs = [DIFFICULTY.ROOKIE, DIFFICULTY.AMATEUR, DIFFICULTY.PRO, DIFFICULTY.LEGEND];
    const startY = 66;

    diffs.forEach((d, i) => {
      const by = startY + i * 36;
      renderButton(ctx, { x: 136, y: by, w: 240, h: 28 }, `${d.label} (${d.mult.toFixed(2)}x)`, false);
    });

    renderButton(ctx, { x: 206, y: 216, w: 100, h: 22 }, "CANCEL", false);
  },

  renderHowToPlayModal(ctx) {
    ctx.fillStyle = "rgba(7, 5, 14, 0.90)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    const pages = [
      {
        title: "HOW TO PLAY (1/3): RULES",
        lines: [
          "- Pocket solids (1-7) or stripes (9-15).",
          "- 8-Ball is pocketed LAST into ANY pocket.",
          "- Scratch or potting 8-ball early = LOSS.",
          "- Hit your own ball group first each shot.",
        ],
      },
      {
        title: "HOW TO PLAY (2/3): CONTROLS",
        lines: [
          "- AIM: Tap or drag on table felt.",
          "- POWER: Drag vertical power slider on right.",
          "- STRIKE: Tap HIT button or pull back cue.",
          "- SPIN: Drag red marker on cue disc.",
        ],
      },
      {
        title: "HOW TO PLAY (3/3): ACHIEVEMENTS & PRO SHOP",
        lines: [
          "- Unlock pop culture achievements for coins.",
          "- Customize Cues, Felts, and Backgrounds.",
          "- Single-elimination Tournament Cups.",
          "- Compete on the global live leaderboard.",
        ],
      },
    ];

    const cur = pages[this.howToPlayPage];
    renderPanel(ctx, 40, 24, 432, 240, cur.title);

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    cur.lines.forEach((line, i) => {
      ctx.fillText(line, 60, 68 + i * 24);
    });

    renderButton(ctx, { x: 60, y: 218, w: 90, h: 22 }, "< PREV", false);
    renderButton(ctx, { x: 362, y: 218, w: 90, h: 22 }, "NEXT >", false);
    renderButton(ctx, { x: 211, y: 218, w: 90, h: 22 }, "CLOSE", false);
  },

  handlePointer(e) {
    if (e.type !== "pointerdown") return;

    if (e.x >= 406 && e.x <= 502 && e.y >= 10 && e.y <= 30) {
      audio.playSfx("uiSelect");
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      return;
    }

    if (this.howToPlayOpen) {
      if (e.x >= 60 && e.x <= 150 && e.y >= 218 && e.y <= 240) {
        audio.playSfx("uiMove");
        this.howToPlayPage = (this.howToPlayPage + 2) % 3;
      } else if (e.x >= 362 && e.x <= 452 && e.y >= 218 && e.y <= 240) {
        audio.playSfx("uiMove");
        this.howToPlayPage = (this.howToPlayPage + 1) % 3;
      } else if (e.x >= 211 && e.x <= 301 && e.y >= 218 && e.y <= 240) {
        audio.playSfx("uiSelect");
        this.howToPlayOpen = false;
      }
      return;
    }

    if (this.difficultyModalOpen) {
      const diffs = ["ROOKIE", "AMATEUR", "PRO", "LEGEND"];
      const startY = 66;
      diffs.forEach((dId, i) => {
        const by = startY + i * 36;
        if (e.x >= 136 && e.x <= 376 && e.y >= by && e.y <= by + 28) {
          audio.playSfx("uiSelect");
          this.difficultyModalOpen = false;
          go("match", { difficulty: dId, mode: "EXHIBITION" });
        }
      });

      if (e.x >= 206 && e.x <= 306 && e.y >= 216 && e.y <= 238) {
        audio.playSfx("uiMove");
        this.difficultyModalOpen = false;
      }
      return;
    }

    const logoX = 256;
    const startY = 66;
    const btnW = 230;
    const btnH = 20;
    const gap = 5;

    this.menuItems.forEach((item, idx) => {
      const bx = logoX - btnW / 2;
      const by = startY + idx * (btnH + gap);

      if (e.x >= bx && e.x <= bx + btnW && e.y >= by && e.y <= by + btnH) {
        this.selectedItem = idx;
        audio.playSfx("uiSelect");
        this.activateMenuItem(item.id);
      }
    });
  },

  activateMenuItem(id) {
    if (id === "CONTINUE") {
      const save = loadSave();
      if (save.activeMatch) {
        go("match", { resume: true });
      } else if (save.activeTournament) {
        go("tournament", { resume: true });
      }
    } else if (id === "QUICK") {
      this.difficultyModalOpen = true;
    } else if (id === "TOURNAMENT") {
      go("tournament");
    } else if (id === "ACHIEVEMENTS") {
      go("achievements");
    } else if (id === "LEADERBOARD") {
      go("leaderboard");
    } else if (id === "HOWTO") {
      this.howToPlayOpen = true;
      this.howToPlayPage = 0;
    } else if (id === "SETTINGS") {
      go("settings");
    }
  },

  onPointer(e) {
    this.handlePointer(e);
  },

  onKey(e) {
    if (e.type !== "keydown") return;

    if (this.difficultyModalOpen) {
      if (e.code === "Escape") this.difficultyModalOpen = false;
      return;
    }

    if (this.howToPlayOpen) {
      if (e.code === "Escape") this.howToPlayOpen = false;
      return;
    }

    if (e.code === "ArrowUp") {
      this.selectedItem = (this.selectedItem - 1 + this.menuItems.length) % this.menuItems.length;
      audio.playSfx("uiMove");
    } else if (e.code === "ArrowDown") {
      this.selectedItem = (this.selectedItem + 1) % this.menuItems.length;
      audio.playSfx("uiMove");
    } else if (e.code === "Enter" || e.code === "Space") {
      audio.playSfx("uiSelect");
      this.activateMenuItem(this.menuItems[this.selectedItem].id);
    }
  },
};
