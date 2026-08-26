import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { loadSettings, saveSettings, resetGameData, loadSave, saveImmediate } from "../storage.js";
import { COSMETIC_CUES, COSMETIC_FELTS } from "../tournament.js";
import { bakeFelt, bakeCueStick } from "../sprites.js";
import { renderPanel, renderButton } from "../ui.js";
import { renderCRTEffect } from "../render.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";
import { clamp } from "../vec.js";

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
    const leftBtnX = 168;

    // Helper for aligned row rendering
    const drawSettingsRow = (label, valueText, y, minusAction, plusAction) => {
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
    ctx.fillText(`CUE:`, rightX, 98);
    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`${s.selectedCue}`, rightX + 44, 98);
    renderButton(ctx, { x: 424, y: 89, w: 60, h: 18 }, "NEXT", false);

    // Felt Selection Row
    ctx.fillStyle = PAL.WHITE;
    ctx.fillText(`FELT:`, rightX, 130);
    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`${s.selectedFelt}`, rightX + 52, 130);
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
    ctx.fillStyle = "rgba(5, 4, 9, 0.92)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    renderPanel(ctx, 106, 60, 300, 160, "CONFIRM DATA RESET");

    ctx.fillStyle = PAL.RED;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("TYPE 'RESET' TO CONFIRM:", 256, 88);

    // Input box
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(176, 108, 160, 24);
    ctx.strokeStyle = PAL.RED;
    ctx.strokeRect(176, 108, 160, 24);

    ctx.fillStyle = PAL.WHITE;
    ctx.fillText(this.resetInput || "_", 256, 116);

    renderButton(ctx, { x: 136, y: 154, w: 100, h: 24 }, "CONFIRM", false);
    renderButton(ctx, { x: 276, y: 154, w: 100, h: 24 }, "CANCEL", false);
  },

  handlePointer(e) {
    if (e.type !== "pointerdown") return;

    if (this.resetConfirmOpen) {
      if (e.x >= 136 && e.x <= 236 && e.y >= 154 && e.y <= 178) {
        if (this.resetInput.trim().toUpperCase() === "RESET") {
          audio.playSfx("foul");
          resetGameData();
          this.resetConfirmOpen = false;
          go("title");
        } else {
          audio.playSfx("foul");
        }
      } else if (e.x >= 276 && e.x <= 376 && e.y >= 154 && e.y <= 178) {
        audio.playSfx("uiMove");
        this.resetConfirmOpen = false;
      }
      return;
    }

    // Back Button
    if (e.x >= 12 && e.x <= 72 && e.y >= 12 && e.y <= 32) {
      audio.playSfx("uiSelect");
      go("title");
      return;
    }

    // Fullscreen Button
    if (e.x >= 400 && e.x <= 500 && e.y >= 12 && e.y <= 32) {
      audio.playSfx("uiSelect");
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
      return;
    }

    const s = this.settings;
    const save = loadSave();
    const leftBtnX = 168;

    // Master Vol - / +
    if (e.x >= leftBtnX && e.x <= leftBtnX + 28 && e.y >= 60 && e.y <= 76) {
      s.masterVol = clamp(s.masterVol - 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("uiMove");
    } else if (e.x >= leftBtnX + 32 && e.x <= leftBtnX + 60 && e.y >= 60 && e.y <= 76) {
      s.masterVol = clamp(s.masterVol + 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("uiMove");
    }

    // Music Vol - / +
    if (e.x >= leftBtnX && e.x <= leftBtnX + 28 && e.y >= 88 && e.y <= 104) {
      s.musicVol = clamp(s.musicVol - 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("uiMove");
    } else if (e.x >= leftBtnX + 32 && e.x <= leftBtnX + 60 && e.y >= 88 && e.y <= 104) {
      s.musicVol = clamp(s.musicVol + 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("uiMove");
    }

    // SFX Vol - / +
    if (e.x >= leftBtnX && e.x <= leftBtnX + 28 && e.y >= 116 && e.y <= 132) {
      s.sfxVol = clamp(s.sfxVol - 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("keyPress");
    } else if (e.x >= leftBtnX + 32 && e.x <= leftBtnX + 60 && e.y >= 116 && e.y <= 132) {
      s.sfxVol = clamp(s.sfxVol + 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("keyPress");
    }

    // CRT Toggle
    if (e.x >= 154 && e.x <= 228 && e.y >= 145 && e.y <= 163) {
      s.crtEnabled = !s.crtEnabled;
      audio.playSfx("uiSelect");
    }

    // Assist Level Toggle
    if (e.x >= 144 && e.x <= 228 && e.y >= 175 && e.y <= 193) {
      const levels = ["FULL", "HALF", "CUE_ONLY"];
      const nextIdx = (levels.indexOf(s.assistLevel) + 1) % levels.length;
      s.assistLevel = levels[nextIdx];
      audio.playSfx("uiSelect");
    }

    // Reset Progress Button
    if (e.x >= 26 && e.x <= 238 && e.y >= 232 && e.y <= 256) {
      audio.playSfx("uiSelect");
      this.resetConfirmOpen = true;
      this.resetInput = "";
    }

    // Next Cue
    if (e.x >= 424 && e.x <= 484 && e.y >= 89 && e.y <= 107) {
      const cueIds = COSMETIC_CUES.map((c) => c.id);
      const nextIdx = (cueIds.indexOf(s.selectedCue) + 1) % cueIds.length;
      s.selectedCue = cueIds[nextIdx];
      bakeCueStick(s.selectedCue);
      audio.playSfx("uiMove");
    }

    // Next Felt
    if (e.x >= 424 && e.x <= 484 && e.y >= 121 && e.y <= 139) {
      const feltIds = COSMETIC_FELTS.map((f) => f.id);
      const nextIdx = (feltIds.indexOf(s.selectedFelt) + 1) % feltIds.length;
      s.selectedFelt = feltIds[nextIdx];
      const fDef = COSMETIC_FELTS[nextIdx];
      bakeFelt(fDef.felt, fDef.light, fDef.dark);
      audio.playSfx("uiMove");
    }

    // Buy Cue
    const curCueDef = COSMETIC_CUES.find((c) => c.id === s.selectedCue) || COSMETIC_CUES[0];
    if (!save.unlocks.cues.includes(curCueDef.id)) {
      if (e.x >= 276 && e.x <= 484 && e.y >= 160 && e.y <= 184) {
        if ((save.coins || 0) >= curCueDef.cost) {
          save.coins -= curCueDef.cost;
          save.unlocks.cues.push(curCueDef.id);
          saveImmediate(save);
          audio.playSfx("newRecord");
        } else {
          audio.playSfx("foul");
        }
      }
    }

    // Buy Felt
    const curFeltDef = COSMETIC_FELTS.find((f) => f.id === s.selectedFelt) || COSMETIC_FELTS[0];
    if (!save.unlocks.felts.includes(curFeltDef.id)) {
      if (e.x >= 276 && e.x <= 484 && e.y >= 196 && e.y <= 220) {
        if ((save.coins || 0) >= curFeltDef.cost) {
          save.coins -= curFeltDef.cost;
          save.unlocks.felts.push(curFeltDef.id);
          saveImmediate(save);
          audio.playSfx("newRecord");
        } else {
          audio.playSfx("foul");
        }
      }
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
      } else if (e.key && e.key.length === 1) {
        this.resetInput = (this.resetInput + e.key.toUpperCase()).slice(0, 5);
      }
      return;
    }

    if (e.code === "Escape") {
      audio.playSfx("uiSelect");
      go("title");
    }
  },
};
