import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { SPRITES } from "../sprites.js";
import { fetchLeaderboard, getIsOffline } from "../cloud.js";
import { loadSave } from "../storage.js";
import { formatWithDiscriminator } from "../identity.js";
import { renderPanel, renderButton } from "../ui.js";
import { renderCRTEffect } from "../render.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";

const TABS = [
  { id: "RATING",    label: "RATING" },
  { id: "TOP_RUNS",  label: "BEST RUN" },
  { id: "PRECISION", label: "PRECISION" },
  { id: "STREAK",    label: "STREAK" },
  { id: "TITLES",    label: "TITLES" },
];

export const leaderboardScene = {
  name: "leaderboard",
  selectedTab: 0,
  entries: [],
  isLoading: true,
  isOffline: false,
  backBtn: { x: 12, y: 12, w: 60, h: 20 },
  tabBtns: [],
  scrollOffset: 0,

  async enter(params) {
    audio.playTrack("TOURNEY");
    this.selectedTab = (params && params.tab) ? params.tab : 0;
    this.scrollOffset = 0;
    this.buildTabButtons();
    await this.refreshData();
  },

  exit() {},

  buildTabButtons() {
    this.tabBtns = [];
    const startX = 84;
    const tabW = 80;
    const tabH = 20;
    const gap = 4;

    TABS.forEach((tab, i) => {
      this.tabBtns.push({
        x: startX + i * (tabW + gap),
        y: 12,
        w: tabW,
        h: tabH,
        id: tab.id,
        label: tab.label,
      });
    });
  },

  async refreshData() {
    this.isLoading = true;
    const tabId = TABS[this.selectedTab].id;
    const res = await fetchLeaderboard(tabId);
    this.isOffline = res.offline;

    const save = loadSave();
    const rawList = [...res.data];

    // Ensure current local player is included optimistically if not found
    const hasPlayer = rawList.some((p) => p.playerId === save.playerId);
    if (!hasPlayer && save.playerId) {
      const precision = save.career.shots > 0 ? save.career.ownPots / save.career.shots : 0;
      const titlesW = (save.career.titles.CHAMPION || 0) * 4 +
        (save.career.titles.GOLD || 0) * 3 +
        (save.career.titles.SILVER || 0) * 2 +
        (save.career.titles.BRONZE || 0) * 1;

      rawList.push({
        playerId: save.playerId,
        name: save.displayName || "PLAYER",
        rating: save.career.bestRunScore ? Math.round(save.career.bestRunScore * 0.8) : 400,
        tier: "BRONZE",
        bestRunScore: save.career.bestRunScore || 0,
        runsPlayed: save.career.runsPlayed || 0,
        matchesWon: save.career.matchesWon || 0,
        precision: Number(precision.toFixed(3)),
        longestRun: save.career.longestRun || 0,
        titlesWeighted: titlesW,
        firstSeenAt: Date.now(),
        isLocalOptimistic: true,
      });
    }

    // Sort according to tab and deterministic tie-breaks
    this.entries = this.sortBoard(rawList, tabId);
    this.isLoading = false;
  },

  sortBoard(list, tabId) {
    return list.sort((a, b) => {
      let metricA = 0;
      let metricB = 0;

      if (tabId === "RATING") {
        metricA = a.rating || 0;
        metricB = b.rating || 0;
      } else if (tabId === "TOP_RUNS") {
        metricA = a.bestRunScore || 0;
        metricB = b.bestRunScore || 0;
      } else if (tabId === "PRECISION") {
        // Minimum 5 runs required
        metricA = (a.runsPlayed >= 5 ? a.precision : -1) || 0;
        metricB = (b.runsPlayed >= 5 ? b.precision : -1) || 0;
      } else if (tabId === "STREAK") {
        metricA = a.longestRun || 0;
        metricB = b.longestRun || 0;
      } else if (tabId === "TITLES") {
        metricA = a.titlesWeighted || 0;
        metricB = b.titlesWeighted || 0;
      }

      // 1. Primary metric
      if (metricB !== metricA) return metricB - metricA;
      // 2. Best single run
      if ((b.bestRunScore || 0) !== (a.bestRunScore || 0)) return (b.bestRunScore || 0) - (a.bestRunScore || 0);
      // 3. Total matches won
      if ((b.matchesWon || 0) !== (a.matchesWon || 0)) return (b.matchesWon || 0) - (a.matchesWon || 0);
      // 4. Earliest first seen
      return (a.firstSeenAt || 0) - (b.firstSeenAt || 0);
    });
  },

  update(dt) {},

  render(ctx) {
    const bgGrad = ctx.createRadialGradient(256, 144, 40, 256, 144, 280);
    bgGrad.addColorStop(0, "#161130");
    bgGrad.addColorStop(0.6, "#0e0a21");
    bgGrad.addColorStop(1, "#07050e");

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // Back Button
    renderButton(ctx, this.backBtn, "< BACK", false);

    // Tab Buttons
    this.tabBtns.forEach((tab, idx) => {
      const isSelected = idx === this.selectedTab;
      renderButton(ctx, tab, tab.label, isSelected);
    });

    // Offline / Online Status
    if (this.isOffline || getIsOffline()) {
      ctx.fillStyle = PAL.YELLOW;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("! OFFLINE", 496, 38);
    }

    // Leaderboard Table Panel
    renderPanel(ctx, 12, 40, 488, 236);

    // Header Row
    ctx.fillStyle = PAL.SLATE;
    ctx.fillRect(14, 42, 484, 18);
    ctx.fillStyle = PAL.BRASS;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    ctx.fillText("RNK", 20, 51);
    ctx.fillText("TIER", 58, 51);
    ctx.fillText("PLAYER", 108, 51);

    const tabId = TABS[this.selectedTab].id;
    ctx.textAlign = "right";
    if (tabId === "RATING") ctx.fillText("RATING", 480, 51);
    else if (tabId === "TOP_RUNS") ctx.fillText("BEST SCORE", 480, 51);
    else if (tabId === "PRECISION") ctx.fillText("POT RATE", 480, 51);
    else if (tabId === "STREAK") ctx.fillText("BEST RUN", 480, 51);
    else if (tabId === "TITLES") ctx.fillText("TITLE PTS", 480, 51);

    const save = loadSave();
    const rowH = 18;
    const startY = 64;
    const visibleRows = 9;

    if (this.isLoading) {
      ctx.fillStyle = PAL.SILVER;
      ctx.textAlign = "center";
      ctx.fillText("CONNECTING TO LEADERBOARD...", 256, 140);
    } else if (this.entries.length === 0) {
      ctx.fillStyle = PAL.SILVER;
      ctx.textAlign = "center";
      ctx.fillText("NO ENTRIES YET - PLAY A MATCH!", 256, 140);
    } else {
      for (let i = 0; i < visibleRows; i++) {
        const itemIdx = this.scrollOffset + i;
        if (itemIdx >= this.entries.length) break;

        const row = this.entries[itemIdx];
        const ry = startY + i * rowH;
        const isPlayer = row.playerId === save.playerId;

        // Highlight player row in CYAN
        if (isPlayer) {
          ctx.fillStyle = PAL.DARKEST;
          ctx.fillRect(14, ry - 2, 484, rowH);
          ctx.strokeStyle = PAL.CYAN;
          ctx.strokeRect(14, ry - 2, 484, rowH);
        } else if (i % 2 === 1) {
          ctx.fillStyle = PAL.DARKEST;
          ctx.fillRect(14, ry - 2, 484, rowH);
        }

        // Rank
        ctx.fillStyle = isPlayer ? PAL.CYAN : PAL.WHITE;
        ctx.textAlign = "left";
        ctx.fillText(String(itemIdx + 1).padStart(2, "0"), 20, ry + 6);

        // Tier Badge
        const badge = SPRITES.tierBadges[row.tier || "BRONZE"];
        if (badge) {
          ctx.drawImage(badge, 64, ry + 2);
        }

        // Player Name with Discriminator
        const displayName = formatWithDiscriminator(row.name, row.playerId) + (row.isLocalOptimistic ? " *" : "");
        ctx.fillText(displayName, 108, ry + 6);

        // Metric Value
        ctx.textAlign = "right";
        let valStr = "-";
        if (tabId === "RATING") valStr = String(row.rating || 0);
        else if (tabId === "TOP_RUNS") valStr = String(row.bestRunScore || 0);
        else if (tabId === "PRECISION") valStr = row.runsPlayed >= 5 ? `${Math.round((row.precision || 0) * 100)}%` : "N/Q";
        else if (tabId === "STREAK") valStr = `${row.longestRun || 0} POTS`;
        else if (tabId === "TITLES") valStr = `${row.titlesWeighted || 0} PTS`;

        ctx.fillStyle = isPlayer ? PAL.CYAN : PAL.BRASS;
        ctx.fillText(valStr, 480, ry + 6);
      }
    }

    renderCRTEffect(ctx);
  },

  handlePointer(e) {
    if (e.type !== "pointerdown") return;

    // Back Button
    if (this.isInside(e.x, e.y, this.backBtn)) {
      audio.playSfx("uiSelect");
      go("title");
      return;
    }

    // Tabs
    this.tabBtns.forEach((tab, idx) => {
      if (this.isInside(e.x, e.y, tab)) {
        if (this.selectedTab !== idx) {
          audio.playSfx("uiMove");
          this.selectedTab = idx;
          this.refreshData();
        }
      }
    });
  },

  onPointer(e) {
    this.handlePointer(e);
  },

  onKey(e) {
    if (e.type === "keydown" && e.code === "Escape") {
      audio.playSfx("uiSelect");
      go("title");
    }
  },

  isInside(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  },
};
