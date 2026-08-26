import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { bakeAllSprites } from "../sprites.js";
import { loadSave, loadSettings } from "../storage.js";
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
      // 2. Load Local Save & Settings
      loadSave();
      const settings = loadSettings();
      audio.setVolumes(settings.masterVol, settings.musicVol, settings.sfxVol);
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
    if (this.isReady && this.loadTimer >= 0.4) {
      go("title");
    }
  },

  render(ctx) {
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FMS POOL", Math.round(CFG.BASE_W / 2), 130);

    ctx.fillStyle = PAL.CYAN;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText("LOADING...", Math.round(CFG.BASE_W / 2), 160);
  },

  onPointer() {},
  onKey() {},
};
