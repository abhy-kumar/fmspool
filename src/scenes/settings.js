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
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    renderButton(ctx, this.backBtn, "< BACK", false);

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("SETTINGS & COSMETICS", 256, 14);

    const s = this.settings;
    const save = loadSave();

    // 1. Audio & Display Panel (Left)
    renderPanel(ctx, 20, 40, 220, 220, "AUDIO & DISPLAY");

    // Master Vol
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.fillText(`MASTER: ${Math.round(s.masterVol * 100)}%`, 32, 66);
    renderButton(ctx, { x: 170, y: 62, w: 26, h: 16 }, "-", false);
    renderButton(ctx, { x: 202, y: 62, w: 26, h: 16 }, "+", false);

    // Music Vol
    ctx.fillText(`MUSIC:  ${Math.round(s.musicVol * 100)}%`, 32, 92);
    renderButton(ctx, { x: 170, y: 88, w: 26, h: 16 }, "-", false);
    renderButton(ctx, { x: 202, y: 88, w: 26, h: 16 }, "+", false);

    // SFX Vol
    ctx.fillText(`SFX:    ${Math.round(s.sfxVol * 100)}%`, 32, 118);
    renderButton(ctx, { x: 170, y: 114, w: 26, h: 16 }, "-", false);
    renderButton(ctx, { x: 202, y: 114, w: 26, h: 16 }, "+", false);

    // CRT Toggle
    ctx.fillText("CRT EFFECT:", 32, 146);
    renderButton(ctx, { x: 160, y: 142, w: 68, h: 18 }, s.crtEnabled ? "ON" : "OFF", s.crtEnabled);

    // Assist Level Toggle
    ctx.fillText("AIM ASSIST:", 32, 172);
    renderButton(ctx, { x: 146, y: 168, w: 82, h: 18 }, s.assistLevel, false);

    // Reset Progress Button
    renderButton(ctx, { x: 32, y: 220, w: 196, h: 22 }, "RESET PROGRESS", false);

    // 2. Cosmetics Panel (Right)
    renderPanel(ctx, 252, 40, 240, 220, "CUES & FELTS");

    ctx.fillText(`COINS: ${save.coins || 0}`, 264, 62);

    // Selected Cue
    ctx.fillText(`CUE: ${s.selectedCue}`, 264, 86);
    renderButton(ctx, { x: 430, y: 82, w: 50, h: 18 }, "NEXT", false);

    // Selected Felt
    ctx.fillText(`FELT: ${s.selectedFelt}`, 264, 116);
    renderButton(ctx, { x: 430, y: 112, w: 50, h: 18 }, "NEXT", false);

    // Unlock Status preview
    const cueDef = COSMETIC_CUES.find((c) => c.id === s.selectedCue) || COSMETIC_CUES[0];
    const feltDef = COSMETIC_FELTS.find((f) => f.id === s.selectedFelt) || COSMETIC_FELTS[0];

    const hasCue = save.unlocks.cues.includes(cueDef.id);
    const hasFelt = save.unlocks.felts.includes(feltDef.id);

    if (!hasCue) {
      renderButton(ctx, { x: 264, y: 146, w: 216, h: 22 }, `BUY CUE (${cueDef.cost} C)`, false);
    } else {
      ctx.fillStyle = PAL.GREEN;
      ctx.fillText("CUE EQUIPPED", 264, 152);
    }

    if (!hasFelt) {
      renderButton(ctx, { x: 264, y: 176, w: 216, h: 22 }, `BUY FELT (${feltDef.cost} C)`, false);
    } else {
      ctx.fillStyle = PAL.GREEN;
      ctx.fillText("FELT EQUIPPED", 264, 182);
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

    const s = this.settings;
    const save = loadSave();

    // Master Vol - / +
    if (e.x >= 170 && e.x <= 196 && e.y >= 62 && e.y <= 78) {
      s.masterVol = clamp(s.masterVol - 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("uiMove");
    } else if (e.x >= 202 && e.x <= 228 && e.y >= 62 && e.y <= 78) {
      s.masterVol = clamp(s.masterVol + 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("uiMove");
    }

    // Music Vol - / +
    if (e.x >= 170 && e.x <= 196 && e.y >= 88 && e.y <= 104) {
      s.musicVol = clamp(s.musicVol - 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("uiMove");
    } else if (e.x >= 202 && e.x <= 228 && e.y >= 88 && e.y <= 104) {
      s.musicVol = clamp(s.musicVol + 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("uiMove");
    }

    // SFX Vol - / +
    if (e.x >= 170 && e.x <= 196 && e.y >= 114 && e.y <= 130) {
      s.sfxVol = clamp(s.sfxVol - 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("keyPress");
    } else if (e.x >= 202 && e.x <= 228 && e.y >= 114 && e.y <= 130) {
      s.sfxVol = clamp(s.sfxVol + 0.1, 0, 1);
      audio.setVolumes(s.masterVol, s.musicVol, s.sfxVol);
      audio.playSfx("keyPress");
    }

    // CRT Toggle
    if (e.x >= 160 && e.x <= 228 && e.y >= 142 && e.y <= 160) {
      s.crtEnabled = !s.crtEnabled;
      audio.playSfx("uiSelect");
    }

    // Assist Level Toggle
    if (e.x >= 146 && e.x <= 228 && e.y >= 168 && e.y <= 186) {
      const levels = ["FULL", "HALF", "CUE_ONLY"];
      const nextIdx = (levels.indexOf(s.assistLevel) + 1) % levels.length;
      s.assistLevel = levels[nextIdx];
      audio.playSfx("uiSelect");
    }

    // Reset Progress Button
    if (e.x >= 32 && e.x <= 228 && e.y >= 220 && e.y <= 242) {
      audio.playSfx("uiSelect");
      this.resetConfirmOpen = true;
      this.resetInput = "";
    }

    // Next Cue
    if (e.x >= 430 && e.x <= 480 && e.y >= 82 && e.y <= 100) {
      const cueIds = COSMETIC_CUES.map((c) => c.id);
      const nextIdx = (cueIds.indexOf(s.selectedCue) + 1) % cueIds.length;
      s.selectedCue = cueIds[nextIdx];
      bakeCueStick(s.selectedCue);
      audio.playSfx("uiMove");
    }

    // Next Felt
    if (e.x >= 430 && e.x <= 480 && e.y >= 112 && e.y <= 130) {
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
      if (e.x >= 264 && e.x <= 480 && e.y >= 146 && e.y <= 168) {
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
      if (e.x >= 264 && e.x <= 480 && e.y >= 176 && e.y <= 198) {
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
