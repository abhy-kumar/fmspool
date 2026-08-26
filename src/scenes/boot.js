import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { bakeAllSprites } from "../sprites.js";
import { loadSave, loadSettings } from "../storage.js";
import { flushOutbox } from "../cloud.js";
import { go } from "../main.js";
import { audio } from "../audio.js";

export const bootScene = {
  name: "boot",
  loadTimer: 0,
  isReady: false,

  async enter() {
    console.log("[Boot] Initializing FMS POOL engine...");

    // 1. Procedural sprite generation
    bakeAllSprites();

    // 2. Load Local Save & Settings
    const save = loadSave();
    const settings = loadSettings();
    audio.setVolumes(settings.masterVol, settings.musicVol, settings.sfxVol);

    // 3. Attempt background cloud outbox sync
    flushOutbox().catch(() => {});

    // 4. Font readiness check (with 3s fallback)
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      console.log("[Boot] Press Start 2P font ready.");
    } catch (e) {
      console.warn("[Boot] Font loading fallback to monospace.", e);
    }

    this.isReady = true;
  },

  exit() {},

  update(dt) {
    this.loadTimer += dt;
    // Show splash for at least 0.5s then jump to title
    if (this.isReady && this.loadTimer >= 0.5) {
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
    ctx.fillText("FMS POOL", 256, 130);

    ctx.fillStyle = PAL.CYAN;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText("LOADING...", 256, 160);
  },

  onPointer() {},
  onKey() {},
};
