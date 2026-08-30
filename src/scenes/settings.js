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

    if (this.cosmeticTab === "FELTS") {
      // Felt Color Swatch
      ctx.fillStyle = item.color;
      ctx.fillRect(280, 139, 200, 20);
      ctx.strokeStyle = item.light;
      ctx.strokeRect(280, 139, 200, 20);
    } else if (this.cosmeticTab === "TABLES") {
      // Table Rail Wood Swatch with Diamond Sights
      const woodGrad = ctx.createLinearGradient(280, 139, 480, 159);
      woodGrad.addColorStop(0, item.railLight);
      woodGrad.addColorStop(0.5, item.railColor);
      woodGrad.addColorStop(1, item.railDark);
      ctx.fillStyle = woodGrad;
      ctx.fillRect(280, 139, 200, 20);
      ctx.strokeStyle = item.railHi;
      ctx.strokeRect(280, 139, 200, 20);

      // Inlaid diamonds
      [320, 380, 440].forEach((dx) => {
        ctx.fillStyle = item.diamondColor;
        ctx.fillRect(dx - 2, 147, 5, 5);
        ctx.fillStyle = item.diamondLight || "#ffffff";
        ctx.fillRect(dx - 1, 148, 3, 3);
      });
    } else if (this.cosmeticTab === "BALLS") {
      // Live 3D Ball Set Preview (Cue, 1-Solid, 8-Ball, 9-Stripe)
      const ballIds = [0, 1, 8, 9];
      ballIds.forEach((bId, i) => {
        const bx = 310 + i * 46;
        const by = 149;
        if (SPRITES.ballShadow) {
          ctx.drawImage(SPRITES.ballShadow, bx - 7, by - 1);
        }
        const sprite = SPRITES.balls[bId] ? SPRITES.balls[bId][0] : null;
        if (sprite) {
          ctx.drawImage(sprite, bx - 6, by - 6);
        }
      });
    } else if (this.cosmeticTab === "MENU") {
      // Menu Theme Banner Swatch
      const lg = item.logoGrad || ["#ffd000", "#d49b00"];
      const tGrad = ctx.createLinearGradient(280, 139, 480, 159);
      tGrad.addColorStop(0, lg[0]);
      tGrad.addColorStop(1, lg[1]);
      ctx.fillStyle = tGrad;
      ctx.fillRect(280, 139, 200, 20);
      ctx.strokeStyle = item.accentColor;
      ctx.strokeRect(280, 139, 200, 20);

      ctx.fillStyle = item.shadow1 || "#000000";
      ctx.font = 'bold 7px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.fillText("THEME ACCENT", 380, 149);
    } else if (this.cosmeticTab === "CUES") {
      if (SPRITES.cue) {
        ctx.drawImage(SPRITES.cue, 350, 146);
      }
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
      if (this.cosmeticTab === "BALLS") {
        bakeBallSprites(curList[this[propIdxName]].id);
      }
      audio.playSfx("uiMove");
      return;
    }

    // Next Button (x=390, y=194, w=96, h=20)
    if (e.x >= 390 && e.x <= 486 && e.y >= 194 && e.y <= 214) {
      this[propIdxName] = (this[propIdxName] + 1) % curList.length;
      if (this.cosmeticTab === "BALLS") {
        bakeBallSprites(curList[this[propIdxName]].id);
      }
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
