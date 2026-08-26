import { CFG, DIFFICULTY } from "../config.js";
import { PAL } from "../palette.js";
import { SPRITES } from "../sprites.js";
import { loadSave } from "../storage.js";
import { playerRating, getTier } from "../scoring.js";
import { formatWithDiscriminator } from "../identity.js";
import { getIsOffline } from "../cloud.js";
import { renderButton, renderPanel } from "../ui.js";
import { renderCRTEffect } from "../render.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";

export const titleScene = {
  name: "title",
  menuItems: [],
  selectedItem: 0,
  shimmerTimer: 0,
  bgBalls: [
    { x: 80, y: 120, vx: 25, vy: 18, id: 1 },
    { x: 300, y: 200, vx: -20, vy: 22, id: 9 },
    { x: 420, y: 80, vx: 18, vy: -26, id: 8 },
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
      items.push({ id: "CONTINUE", label: "CONTINUE MATCH" });
    }
    items.push({ id: "QUICK", label: "QUICK MATCH" });
    items.push({ id: "TOURNAMENT", label: "TOURNAMENT" });
    items.push({ id: "LEADERBOARD", label: "LEADERBOARD" });
    items.push({ id: "HOWTO", label: "HOW TO PLAY" });
    items.push({ id: "SETTINGS", label: "SETTINGS" });

    this.menuItems = items;
    this.selectedItem = 0;
  },

  update(dt) {
    this.shimmerTimer += dt;

    // Update drifting background balls
    this.bgBalls.forEach((b) => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 10) { b.x = 10; b.vx = -b.vx; }
      if (b.x > CFG.BASE_W - 10) { b.x = CFG.BASE_W - 10; b.vx = -b.vx; }
      if (b.y < 10) { b.y = 10; b.vy = -b.vy; }
      if (b.y > CFG.BASE_H - 10) { b.y = CFG.BASE_H - 10; b.vy = -b.vy; }
    });
  },

  render(ctx) {
    // 1. Dark felt background with drifting balls
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // Drifting animated balls behind semi-transparent dark plate
    this.bgBalls.forEach((b) => {
      const sprite = SPRITES.balls[b.id] ? SPRITES.balls[b.id][0] : null;
      if (sprite) {
        ctx.drawImage(sprite, Math.round(b.x - 4.5), Math.round(b.y - 4.5));
      }
    });

    // Dark tint panel over background
    ctx.fillStyle = "rgba(22, 19, 31, 0.82)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // 2. FMS POOL Main Title Logo (16px + drop shadow + shimmer)
    const logoX = 256;
    const logoY = 32;

    // Red drop shadow
    ctx.fillStyle = PAL.RED_DARK;
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FMS POOL", logoX + 1, logoY + 1);

    // Shimmer effect (sweeps every 3s)
    const shimmerCycle = (this.shimmerTimer % 3.0) / 3.0;
    const isShimmer = shimmerCycle > 0.8 && shimmerCycle < 0.95;
    ctx.fillStyle = isShimmer ? PAL.WHITE : PAL.BRASS;
    ctx.fillText("FMS POOL", logoX, logoY);

    // Subtitle
    ctx.fillStyle = PAL.CYAN;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText("RETRO 8-BALL RETROFIT", logoX, logoY + 20);

    // 3. Menu Items
    const startY = 86;
    const btnW = 200;
    const btnH = 22;
    const gap = 6;

    this.menuItems.forEach((item, idx) => {
      const bx = logoX - btnW / 2;
      const by = startY + idx * (btnH + gap);
      const isSelected = idx === this.selectedItem;

      ctx.fillStyle = isSelected ? PAL.GREY : PAL.SLATE;
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = isSelected ? PAL.CYAN : PAL.SILVER;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, btnW, btnH);

      const blink = isSelected && Math.floor(this.shimmerTimer * 3.3) % 2 === 0;
      const labelText = (isSelected ? (blink ? "> " : "  ") : "") + item.label;

      ctx.fillStyle = isSelected ? PAL.WHITE : PAL.SILVER;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, logoX, by + btnH / 2);
    });

    // 4. Bottom Player Stats Bar
    const save = loadSave();
    const rating = playerRating(save.runScores);
    const tier = getTier(rating);

    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(0, CFG.BASE_H - 24, CFG.BASE_W, 24);
    ctx.strokeStyle = PAL.SLATE;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, CFG.BASE_H - 24, CFG.BASE_W, 24);

    // Player Name & Discriminator
    const formattedName = formatWithDiscriminator(save.displayName, save.playerId);
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(formattedName, 12, CFG.BASE_H - 12);

    // Tier badge
    const badge = SPRITES.tierBadges[tier.id];
    if (badge) {
      ctx.drawImage(badge, 180, CFG.BASE_H - 16);
    }
    ctx.fillStyle = tier.badgeColor || PAL.BRASS;
    ctx.fillText(tier.name, 194, CFG.BASE_H - 12);

    // Rating & Coins
    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`RATING: ${rating}`, 300, CFG.BASE_H - 12);
    ctx.fillStyle = PAL.YELLOW;
    ctx.fillText(`COINS: ${save.coins || 0}`, 404, CFG.BASE_H - 12);

    // Top Fullscreen Button
    const isFs = !!document.fullscreenElement;
    renderButton(ctx, { x: 412, y: 12, w: 88, h: 18 }, isFs ? "WINDOW" : "FULLSCRN", false);

    // Offline Tag
    if (getIsOffline()) {
      ctx.fillStyle = PAL.RED;
      ctx.textAlign = "right";
      ctx.fillText("! OFFLINE", 400, 20);
    }

    // 5. Difficulty Modal Overlay
    if (this.difficultyModalOpen) {
      this.renderDifficultyModal(ctx);
    }

    // 6. How To Play Modal Overlay
    if (this.howToPlayOpen) {
      this.renderHowToPlayModal(ctx);
    }

    renderCRTEffect(ctx);
  },

  renderDifficultyModal(ctx) {
    ctx.fillStyle = "rgba(5, 4, 9, 0.85)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    renderPanel(ctx, 116, 40, 280, 200, "SELECT DIFFICULTY");

    const diffs = [DIFFICULTY.ROOKIE, DIFFICULTY.AMATEUR, DIFFICULTY.PRO, DIFFICULTY.LEGEND];
    const startY = 70;

    diffs.forEach((d, i) => {
      const by = startY + i * 36;
      renderButton(ctx, { x: 136, y: by, w: 240, h: 28 }, `${d.label} (${d.mult.toFixed(2)}x)`, false);
    });

    renderButton(ctx, { x: 206, y: 214, w: 100, h: 20 }, "CANCEL", false);
  },

  renderHowToPlayModal(ctx) {
    ctx.fillStyle = "rgba(5, 4, 9, 0.88)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    const pages = [
      {
        title: "HOW TO PLAY (1/3): RULES",
        lines: [
          "- Pocket solids (1-7) or stripes (9-15).",
          "- 8-Ball is pocketed LAST into called pocket.",
          "- Scratch or potting 8-ball early = LOSS.",
          "- Hit your own ball group first each shot.",
        ],
      },
      {
        title: "HOW TO PLAY (2/3): CONTROLS",
        lines: [
          "- AIM: Tap or drag on table.",
          "- FINE AIM: Tap < > buttons or Arrow keys.",
          "- POWER: Drag power bar, pull back, or Space.",
          "- SPIN: Drag red marker on cue disc (bottom-right).",
        ],
      },
      {
        title: "HOW TO PLAY (3/3): SCORING",
        lines: [
          "- 6 Metrics: Win, Dominance, Precision,",
          "  Discipline, Flair (runs/breaks), Tempo.",
          "- Tournaments earn big coins & Title Bonus.",
          "- Bayesian rating ranks ~600 global players.",
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

    // Fullscreen Toggle
    if (e.x >= 412 && e.x <= 500 && e.y >= 12 && e.y <= 30) {
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
      const startY = 70;
      diffs.forEach((dId, i) => {
        const by = startY + i * 36;
        if (e.x >= 136 && e.x <= 376 && e.y >= by && e.y <= by + 28) {
          audio.playSfx("uiSelect");
          this.difficultyModalOpen = false;
          go("match", { difficulty: dId, mode: "EXHIBITION" });
        }
      });

      if (e.x >= 206 && e.x <= 306 && e.y >= 214 && e.y <= 234) {
        audio.playSfx("uiMove");
        this.difficultyModalOpen = false;
      }
      return;
    }

    // Main Menu Click Handling
    const logoX = 256;
    const startY = 86;
    const btnW = 200;
    const btnH = 22;
    const gap = 6;

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
