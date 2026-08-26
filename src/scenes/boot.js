import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { bakeAllSprites, bakeCueStick, bakeFelt } from "../sprites.js";
import { loadSave, loadSettings, COSMETIC_FELTS } from "../storage.js";
import { flushOutbox } from "../cloud.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";

export const bootScene = {
  name: "boot",
  loadTimer: 0,
  isReady: false,

  async enter() {
    console.log("[Boot] Initializing FMS POOL engine...");

    try {
      // 1. Procedural sprite generation
      bakeAllSprites();
    } catch (e) {
      console.error("[Boot] Error baking sprites:", e);
    }

    try {
      // 2. Load Local Save & Settings and apply cosmetics
      loadSave();
      const settings = loadSettings();
      audio.setVolumes(settings.masterVol, settings.musicVol, settings.sfxVol);

      if (settings.selectedCue) {
        bakeCueStick(settings.selectedCue);
      }
      if (settings.selectedFelt) {
        const curFelt = COSMETIC_FELTS.find((f) => f.id === settings.selectedFelt);
        if (curFelt) bakeFelt(curFelt.color, curFelt.light, curFelt.dark);
      }
    } catch (e) {
      console.error("[Boot] Error loading saves/settings:", e);
    }

    try {
      // 3. Attempt background cloud outbox sync
      flushOutbox().catch(() => {});
    } catch (e) {
      console.warn("[Boot] Outbox flush deferred:", e);
    }

    // 4. Font readiness check (with 1.5s fallback)
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
        console.log("[Boot] Press Start 2P font ready.");
      }
    } catch (e) {
      console.warn("[Boot] Font loading fallback to monospace.", e);
    }

    this.isReady = true;
  },

  exit() {},

  update(dt) {
    this.loadTimer += dt;
    // Transition to title after quick splash
    if (this.isReady && this.loadTimer >= 0.3) {
      go("title");
    }
  },

  render(ctx) {
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    ctx.fillStyle = PAL.CYAN;
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FMS POOL", CFG.BASE_W / 2, CFG.BASE_H / 2 - 10);

    ctx.fillStyle = PAL.YELLOW;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText("LOADING...", CFG.BASE_W / 2, CFG.BASE_H / 2 + 10);
  },

  onPointer() {},
  onKey() {},
};
