import { CFG } from "./config.js";

// Live viewport description shared by main.js (which maintains it) and any module
// that needs to map pointer travel back into base pixels. Kept in its own module so
// input handling does not have to import main.js and create a cycle.
export const view = {
  scale: 1,
  rotated: false,
  width: CFG.BASE_W,
  height: CFG.BASE_H,
  // The window is usually larger than the letterboxed canvas. These are the base-pixel
  // bounds a pointer can actually reach, which drag gestures use so a pull-back is
  // never cut short just because the cue ball sits near the edge of the playfield.
  baseBounds: { minX: 0, minY: 0, maxX: CFG.BASE_W, maxY: CFG.BASE_H },
};
