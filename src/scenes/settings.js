import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { loadSettings, saveSettings, loadSave, resetAllProgress, COSMETIC_CUES, COSMETIC_FELTS } from "../storage.js";
import { renderPanel, renderButton } from "../ui.js";
import { renderCRTEffect } from "../render.js";
import { bakeFelt, bakeCueStick } from "../sprites.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";

export const settingsScene = {
  name: "settings",
  settings: null,
  backBtn: { x: 12, y: 12, w: 60, h: 20 },
  resetConfirmOpen: false,
  resetInput: "",

  enter() {
    this.settings = loadSettings();
    this.resetConfirmOpen = false;
    this.resetInput = "";
  },

  exit() {
    saveSettings(this.settings);
  },

  update(dt) {},

  render(ctx) {
    const bgGrad = ctx.createRadialGradient(256, 144, 40, 256, 144, 280);
    bgGrad.addColorStop(0, "#161130");
    bgGrad.addColorStop(0.6, "#0e0a21");
    bgGrad.addColorStop(1, "#07050e");

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // Top Header
    renderButton(ctx, this.backBtn, "< BACK", false);

    const isFs = !!document.fullscreenElement;
    renderButton(ctx, { x: 400, y: 12, w: 100, h: 20 }, isFs ? "WINDOWED" : "FULLSCREEN", false);

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SETTINGS & COSMETICS", 256, 22);

    const s = this.settings;
    const save = loadSave();

    // 1. Audio & Display Panel (Left: x=16, y=42, w=232, h=230)
    renderPanel(ctx, 16, 42, 232, 230, "AUDIO & DISPLAY");

    const leftX = 26;
    const leftBtnX = 170;

    // Helper for aligned row rendering
    const drawSettingsRow = (label, valueText, y) => {
      ctx.fillStyle = PAL.WHITE;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, leftX, y);

      ctx.fillStyle = PAL.CYAN;
      ctx.textAlign = "right";
      ctx.fillText(valueText, leftBtnX - 8, y);

      renderButton(ctx, { x: leftBtnX, y: y - 8, w: 28, h: 16 }, "-", false);
      renderButton(ctx, { x: leftBtnX + 32, y: y - 8, w: 28, h: 16 }, "+", false);
    };

    drawSettingsRow("MASTER", `${Math.round(s.masterVol * 100)}%`, 68);
    drawSettingsRow("MUSIC", `${Math.round(s.musicVol * 100)}%`, 96);
    drawSettingsRow("SFX", `${Math.round(s.sfxVol * 100)}%`, 124);

    // CRT Toggle Row
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("CRT EFFECT", leftX, 154);
    renderButton(ctx, { x: 154, y: 145, w: 74, h: 18 }, s.crtEnabled ? "ON" : "OFF", s.crtEnabled);

    // Aim Assist Toggle Row
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("AIM ASSIST", leftX, 184);
    renderButton(ctx, { x: 144, y: 175, w: 84, h: 18 }, s.assistLevel, false);

    // Reset Progress Button
    renderButton(ctx, { x: 26, y: 232, w: 212, h: 24 }, "RESET PROGRESS", false);

    // 2. Cosmetics Panel (Right: x=264, y=42, w=232, h=230)
    renderPanel(ctx, 264, 42, 232, 230, "CUES & FELTS");

    const rightX = 276;

    // Coins header
    ctx.fillStyle = PAL.YELLOW;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`COINS: ${save.coins || 0}`, rightX, 68);

    // Cue Selection Row
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`CUE:`, rightX, 98);

    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`${s.selectedCue}`, rightX + 48, 98);
    renderButton(ctx, { x: 424, y: 89, w: 60, h: 18 }, "NEXT", false);

    // Felt Selection Row
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`FELT:`, rightX, 130);

    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`${s.selectedFelt}`, rightX + 54, 130);
    renderButton(ctx, { x: 424, y: 121, w: 60, h: 18 }, "NEXT", false);

    // Cue Equip / Buy Status
    const curCueDef = COSMETIC_CUES.find((c) => c.id === s.selectedCue) || COSMETIC_CUES[0];
    const hasCue = save.unlocks.cues.includes(curCueDef.id);

    if (!hasCue) {
      renderButton(ctx, { x: 276, y: 160, w: 208, h: 24 }, `BUY CUE (${curCueDef.cost} C)`, false);
    } else {
      ctx.fillStyle = PAL.GREEN;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[ CUE EQUIPPED ]", 380, 172);
    }

    // Felt Equip / Buy Status
    const curFeltDef = COSMETIC_FELTS.find((f) => f.id === s.selectedFelt) || COSMETIC_FELTS[0];
    const hasFelt = save.unlocks.felts.includes(curFeltDef.id);

    if (!hasFelt) {
      renderButton(ctx, { x: 276, y: 196, w: 208, h: 24 }, `BUY FELT (${curFeltDef.cost} C)`, false);
    } else {
      ctx.fillStyle = PAL.GREEN;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("[ FELT EQUIPPED ]", 380, 208);
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

    // Text Input Box
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
    if (e.x >= 12 && e.x <= 72 && e.y >= 12 && e.y <= 32) {
      audio.playSfx("uiSelect");
      saveSettings(this.settings);
      go("title");
      return;
    }

    // Fullscreen Toggle
    if (e.x >= 400 && e.x <= 500 && e.y >= 12 && e.y <= 32) {
      audio.playSfx("uiSelect");
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      return;
    }

    if (this.resetConfirmOpen) {
      // Confirm Reset
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
      // Cancel Reset
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

    // Volume Buttons (x=170, w=28, + at x=202)
    // Master Vol
    if (e.y >= 60 && e.y <= 76) {
      if (e.x >= 170 && e.x <= 198) {
        s.masterVol = Math.max(0, parseFloat((s.masterVol - 0.1).toFixed(1)));
        audio.setMasterVolume(s.masterVol);
        audio.playSfx("uiMove");
      } else if (e.x >= 202 && e.x <= 230) {
        s.masterVol = Math.min(1.0, parseFloat((s.masterVol + 0.1).toFixed(1)));
        audio.setMasterVolume(s.masterVol);
        audio.playSfx("uiMove");
      }
    }
    // Music Vol
    if (e.y >= 88 && e.y <= 104) {
      if (e.x >= 170 && e.x <= 198) {
        s.musicVol = Math.max(0, parseFloat((s.musicVol - 0.1).toFixed(1)));
        audio.setMusicVolume(s.musicVol);
        audio.playSfx("uiMove");
      } else if (e.x >= 202 && e.x <= 230) {
        s.musicVol = Math.min(1.0, parseFloat((s.musicVol + 0.1).toFixed(1)));
        audio.setMusicVolume(s.musicVol);
        audio.playSfx("uiMove");
      }
    }
    // SFX Vol
    if (e.y >= 116 && e.y <= 132) {
      if (e.x >= 170 && e.x <= 198) {
        s.sfxVol = Math.max(0, parseFloat((s.sfxVol - 0.1).toFixed(1)));
        audio.setSfxVolume(s.sfxVol);
        audio.playSfx("ballHit");
      } else if (e.x >= 202 && e.x <= 230) {
        s.sfxVol = Math.min(1.0, parseFloat((s.sfxVol + 0.1).toFixed(1)));
        audio.setSfxVolume(s.sfxVol);
        audio.playSfx("ballHit");
      }
    }

    // CRT Toggle (x=154, y=145, w=74, h=18)
    if (e.x >= 154 && e.x <= 228 && e.y >= 145 && e.y <= 163) {
      s.crtEnabled = !s.crtEnabled;
      audio.playSfx("uiSelect");
      return;
    }

    // Aim Assist Toggle (x=144, y=175, w=84, h=18)
    if (e.x >= 144 && e.x <= 228 && e.y >= 175 && e.y <= 193) {
      const levels = ["FULL", "HALF", "CUE_ONLY", "OFF"];
      const nextIdx = (levels.indexOf(s.assistLevel) + 1) % levels.length;
      s.assistLevel = levels[nextIdx];
      audio.playSfx("uiSelect");
      return;
    }

    // Reset Progress Button (x=26, y=232, w=212, h=24)
    if (e.x >= 26 && e.x <= 238 && e.y >= 232 && e.y <= 256) {
      audio.playSfx("uiSelect");
      this.resetConfirmOpen = true;
      this.resetInput = "";
      return;
    }

    // Next Cue Button (x=424, y=89, w=60, h=18)
    if (e.x >= 424 && e.x <= 484 && e.y >= 89 && e.y <= 107) {
      const curIdx = COSMETIC_CUES.findIndex((c) => c.id === s.selectedCue);
      const nextIdx = (curIdx + 1) % COSMETIC_CUES.length;
      s.selectedCue = COSMETIC_CUES[nextIdx].id;
      bakeCueStick(s.selectedCue);
      audio.playSfx("uiMove");
      return;
    }

    // Next Felt Button (x=424, y=121, w=60, h=18)
    if (e.x >= 424 && e.x <= 484 && e.y >= 121 && e.y <= 139) {
      const curIdx = COSMETIC_FELTS.findIndex((f) => f.id === s.selectedFelt);
      const nextIdx = (curIdx + 1) % COSMETIC_FELTS.length;
      const newFelt = COSMETIC_FELTS[nextIdx];
      s.selectedFelt = newFelt.id;
      bakeFelt(newFelt.color, newFelt.light, newFelt.dark);
      audio.playSfx("uiMove");
      return;
    }

    // Buy Cue Button (x=276, y=160, w=208, h=24)
    const curCueDef = COSMETIC_CUES.find((c) => c.id === s.selectedCue) || COSMETIC_CUES[0];
    const hasCue = save.unlocks.cues.includes(curCueDef.id);
    if (!hasCue && e.x >= 276 && e.x <= 484 && e.y >= 160 && e.y <= 184) {
      if (save.coins >= curCueDef.cost) {
        save.coins -= curCueDef.cost;
        save.unlocks.cues.push(curCueDef.id);
        saveSettings(s);
        audio.playSfx("uiSelect");
      } else {
        audio.playSfx("foul");
      }
      return;
    }

    // Buy Felt Button (x=276, y=196, w=208, h=24)
    const curFeltDef = COSMETIC_FELTS.find((f) => f.id === s.selectedFelt) || COSMETIC_FELTS[0];
    const hasFelt = save.unlocks.felts.includes(curFeltDef.id);
    if (!hasFelt && e.x >= 276 && e.x <= 484 && e.y >= 196 && e.y <= 220) {
      if (save.coins >= curFeltDef.cost) {
        save.coins -= curFeltDef.cost;
        save.unlocks.felts.push(curFeltDef.id);
        saveSettings(s);
        audio.playSfx("uiSelect");
      } else {
        audio.playSfx("foul");
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
