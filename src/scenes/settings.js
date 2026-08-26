import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { loadSettings, saveSettings, loadSave, resetAllProgress, COSMETIC_CUES, COSMETIC_FELTS, COSMETIC_BACKGROUNDS, saveImmediate } from "../storage.js";
import { renderPanel, renderButton } from "../ui.js";
import { renderCRTEffect, renderRoomBackground } from "../render.js";
import { bakeFelt, bakeCueStick } from "../sprites.js";
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
  cosmeticTab: "CUES", // 'CUES' | 'FELTS' | 'BACKGROUNDS'
  previewCueIdx: 0,
  previewFeltIdx: 0,
  previewBgIdx: 0,
  resetConfirmOpen: false,
  resetInput: "",

  enter() {
    this.settings = loadSettings();
    this.resetConfirmOpen = false;
    this.resetInput = "";
    this.cosmeticTab = "CUES";

    this.previewCueIdx = Math.max(0, COSMETIC_CUES.findIndex((c) => c.id === this.settings.selectedCue));
    this.previewFeltIdx = Math.max(0, COSMETIC_FELTS.findIndex((f) => f.id === this.settings.selectedFelt));
    this.previewBgIdx = Math.max(0, COSMETIC_BACKGROUNDS.findIndex((b) => b.id === (this.settings.selectedBg || "DEFAULT")));
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

    // Dark tint plate (slightly lighter 0.78 so room atmosphere is clear)
    ctx.fillStyle = "rgba(10, 8, 20, 0.78)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // Top Header
    renderButton(ctx, this.backBtn, "< BACK", false);

    const isFs = !!document.fullscreenElement;
    renderButton(ctx, { x: 400, y: 10, w: 100, h: 20 }, isFs ? "WINDOWED" : "FULLSCREEN", false);

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SETTINGS & COSMETICS", 256, 20);

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
    ctx.fillText(`COINS: ${save.coins || 0}`, 484, 56);

    // Category Tabs: [CUES] [FELTS] [ROOMS]
    const tabW = 68;
    const tabH = 18;
    const tabY = 68;

    renderButton(ctx, { x: 274, y: tabY, w: tabW, h: tabH }, "CUES", this.cosmeticTab === "CUES");
    renderButton(ctx, { x: 346, y: tabY, w: tabW, h: tabH }, "FELTS", this.cosmeticTab === "FELTS");
    renderButton(ctx, { x: 418, y: tabY, w: tabW, h: tabH }, "ROOMS", this.cosmeticTab === "BACKGROUNDS");

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
    } else if (this.cosmeticTab === "BACKGROUNDS") {
      curList = COSMETIC_BACKGROUNDS;
      curIdx = this.previewBgIdx;
      unlockKey = "backgrounds";
      activeKey = s.selectedBg || "DEFAULT";
    }

    const item = curList[curIdx];
    const isUnlocked = save.unlocks[unlockKey] && save.unlocks[unlockKey].includes(item.id);
    const isEquipped = activeKey === item.id;

    // Item Name Banner
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.name, 380, 102);

    // Item Cost / Status
    if (isEquipped) {
      ctx.fillStyle = PAL.GREEN;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText("[ EQUIPPED ]", 380, 118);
    } else if (isUnlocked) {
      ctx.fillStyle = PAL.CYAN;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText("[ OWNED ]", 380, 118);
    } else {
      ctx.fillStyle = PAL.YELLOW;
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText(`COST: ${item.cost} COINS`, 380, 118);
    }

    // Item Description (Wrapped with clean 6px font)
    ctx.fillStyle = PAL.SILVER;
    ctx.font = '6px "Press Start 2P", monospace';
    const descLines = wrapText(item.desc || (item.name + " theme"), 30);
    if (descLines[0]) ctx.fillText(descLines[0], 380, 136);
    if (descLines[1]) ctx.fillText(descLines[1], 380, 148);

    // Navigation Controls (< PREV | NEXT >)
    renderButton(ctx, { x: 274, y: 166, w: 96, h: 22 }, "< PREV", false);
    renderButton(ctx, { x: 390, y: 166, w: 96, h: 22 }, "NEXT >", false);

    // Main Action Button (BUY / EQUIP / ACTIVE)
    const actionBtnRect = { x: 274, y: 198, w: 212, h: 26 };
    if (!isUnlocked) {
      const canAfford = (save.coins || 0) >= item.cost;
      renderButton(ctx, actionBtnRect, canAfford ? `BUY ITEM (${item.cost} C)` : "NEED MORE COINS", false);
    } else if (!isEquipped) {
      renderButton(ctx, actionBtnRect, "EQUIP ITEM", false);
    } else {
      ctx.fillStyle = PAL.GREEN;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[ CURRENTLY ACTIVE ]", 380, 211);
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

    // Tab Switches (y = 68..86)
    const tabY = 68;
    if (e.y >= tabY && e.y <= tabY + 18) {
      if (e.x >= 274 && e.x <= 342) {
        this.cosmeticTab = "CUES";
        audio.playSfx("uiSelect");
        return;
      } else if (e.x >= 346 && e.x <= 414) {
        this.cosmeticTab = "FELTS";
        audio.playSfx("uiSelect");
        return;
      } else if (e.x >= 418 && e.x <= 486) {
        this.cosmeticTab = "BACKGROUNDS";
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
    } else if (this.cosmeticTab === "BACKGROUNDS") {
      curList = COSMETIC_BACKGROUNDS;
      propIdxName = "previewBgIdx";
      unlockKey = "backgrounds";
    }

    // Prev Button (x=274, y=166, w=96, h=22)
    if (e.x >= 274 && e.x <= 370 && e.y >= 166 && e.y <= 188) {
      this[propIdxName] = (this[propIdxName] - 1 + curList.length) % curList.length;
      audio.playSfx("uiMove");
      return;
    }

    // Next Button (x=390, y=166, w=96, h=22)
    if (e.x >= 390 && e.x <= 486 && e.y >= 166 && e.y <= 188) {
      this[propIdxName] = (this[propIdxName] + 1) % curList.length;
      audio.playSfx("uiMove");
      return;
    }

    // Action Button (x=274, y=198, w=212, h=26)
    if (e.x >= 274 && e.x <= 486 && e.y >= 198 && e.y <= 224) {
      const curItem = curList[this[propIdxName]];
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
          } else if (this.cosmeticTab === "BACKGROUNDS") {
            s.selectedBg = curItem.id;
          }
          saveSettings(s);
          audio.playSfx("uiSelect");
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
        } else if (this.cosmeticTab === "BACKGROUNDS") {
          s.selectedBg = curItem.id;
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
      } else if (e.code === "Escape") {
        this.resetConfirmOpen = false;
        this.resetInput = "";
      } else if (e.key && e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        if (this.resetInput.length < 8) {
          this.resetInput += e.key.toUpperCase();
          audio.playSfx("keyPress");
        }
      }
      return;
    }

    if (e.code === "Escape") {
      saveSettings(this.settings);
      go("title");
    }
  },
};
