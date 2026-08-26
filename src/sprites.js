import { PAL } from "./palette.js";
import { makeRng } from "./rng.js";

// Ball color configuration
export const BALL_COLORS = [
  { id: 0,  base: PAL.WHITE,   dark: PAL.SILVER,      stripe: false, name: "Cue" },
  { id: 1,  base: PAL.YELLOW,  dark: PAL.YELLOW_DARK, stripe: false, name: "1 Solid" },
  { id: 2,  base: PAL.BLUE,    dark: PAL.BLUE_DARK,   stripe: false, name: "2 Solid" },
  { id: 3,  base: PAL.RED,     dark: PAL.RED_DARK,    stripe: false, name: "3 Solid" },
  { id: 4,  base: PAL.PURPLE,  dark: PAL.DARK,        stripe: false, name: "4 Solid" },
  { id: 5,  base: PAL.ORANGE,  dark: PAL.DARK,        stripe: false, name: "5 Solid" },
  { id: 6,  base: PAL.GREEN,   dark: PAL.DARK,        stripe: false, name: "6 Solid" },
  { id: 7,  base: PAL.MAROON,  dark: PAL.DARK,        stripe: false, name: "7 Solid" },
  { id: 8,  base: PAL.DARKEST, dark: PAL.BLACK,       stripe: false, name: "8 Ball" },
  { id: 9,  base: PAL.YELLOW,  dark: PAL.YELLOW_DARK, stripe: true,  name: "9 Stripe" },
  { id: 10, base: PAL.BLUE,    dark: PAL.BLUE_DARK,   stripe: true,  name: "10 Stripe" },
  { id: 11, base: PAL.RED,     dark: PAL.RED_DARK,    stripe: true,  name: "11 Stripe" },
  { id: 12, base: PAL.PURPLE,  dark: PAL.DARK,        stripe: true,  name: "12 Stripe" },
  { id: 13, base: PAL.ORANGE,  dark: PAL.DARK,        stripe: true,  name: "13 Stripe" },
  { id: 14, base: PAL.GREEN,   dark: PAL.DARK,        stripe: true,  name: "14 Stripe" },
  { id: 15, base: PAL.MAROON,  dark: PAL.DARK,        stripe: true,  name: "15 Stripe" },
];

// 9x9 circle mask definitions (colStart, colEnd for each row 0..8)
const CIRCLE_MASK = [
  [3, 5], // row 0
  [2, 6], // row 1
  [1, 7], // row 2
  [0, 8], // row 3
  [0, 8], // row 4
  [0, 8], // row 5
  [1, 7], // row 6
  [2, 6], // row 7
  [3, 5], // row 8
];

function isInsideCircle(r, c) {
  if (r < 0 || r > 8) return false;
  return c >= CIRCLE_MASK[r][0] && c <= CIRCLE_MASK[r][1];
}

// Pre-baked sprite cache
export const SPRITES = {
  balls: [],       // [ballId][frame] -> HTMLCanvasElement (9x9)
  felt: null,      // HTMLCanvasElement (400x200)
  cue: null,       // HTMLCanvasElement (48x5)
  ballShadow: null,// HTMLCanvasElement (9x5)
  portraits: {},   // opponentName -> HTMLCanvasElement (16x16)
  tierBadges: {},  // tierId -> HTMLCanvasElement (8x8)
};

function createOffscreen(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

// Generate all 16 balls x 4 roll frames
export function bakeBallSprites() {
  SPRITES.balls = [];
  const rollOffsets = [0, 1, 0, -1];

  for (let id = 0; id <= 15; id++) {
    const ballDef = BALL_COLORS[id];
    SPRITES.balls[id] = [];

    for (let frame = 0; frame < 4; frame++) {
      const { canvas, ctx } = createOffscreen(9, 9);
      const imgData = ctx.createImageData(9, 9);
      const data = imgData.data;

      const setPixel = (x, y, hex, alpha = 1.0) => {
        if (x < 0 || x > 8 || y < 0 || y > 8) return;
        const idx = (y * 9 + x) * 4;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = Math.round(alpha * 255);
      };

      if (id === 0) {
        // Cue ball (all white circle, silver rim, red spin center dot)
        for (let r = 0; r < 9; r++) {
          for (let c = CIRCLE_MASK[r][0]; c <= CIRCLE_MASK[r][1]; c++) {
            setPixel(c, r, PAL.WHITE);
          }
        }
        // Silver rim on bottom-right
        for (let r = 5; r <= 8; r++) {
          for (let c = 6; c <= 8; c++) {
            if (isInsideCircle(r, c)) setPixel(c, r, PAL.SILVER);
          }
        }
        // Center red dot
        setPixel(4, 4, PAL.RED);
        // Specular highlight
        setPixel(2, 2, PAL.WHITE);
        if (frame === 1 || frame === 3) setPixel(3, 2, PAL.WHITE);
      } else {
        // Colored balls (solids and stripes)
        const rollOffset = rollOffsets[frame];

        for (let r = 0; r < 9; r++) {
          for (let c = CIRCLE_MASK[r][0]; c <= CIRCLE_MASK[r][1]; c++) {
            if (ballDef.stripe) {
              // Striped ball: white poles on rows 0-1 and 7-8 adjusted by roll
              const wrappedR = (r - rollOffset + 9) % 9;
              const isStripe = (wrappedR >= 2 && wrappedR <= 6);
              setPixel(c, r, isStripe ? ballDef.base : PAL.WHITE);
            } else {
              setPixel(c, r, ballDef.base);
            }
          }
        }

        // Shading on bottom-right rim
        for (let r = 5; r <= 8; r++) {
          for (let c = 6; c <= 8; c++) {
            if (isInsideCircle(r, c)) {
              if (ballDef.dark && ballDef.dark !== PAL.DARK) {
                setPixel(c, r, ballDef.dark);
              } else {
                // Dark blend overlay
                const idx = (r * 9 + c) * 4;
                data[idx] = Math.round(data[idx] * 0.6);
                data[idx + 1] = Math.round(data[idx + 1] * 0.6);
                data[idx + 2] = Math.round(data[idx + 2] * 0.6);
              }
            }
          }
        }

        // Number pip: 3x3 circle/patch at (3,3)
        if (id !== 8) {
          // White circle pip
          setPixel(4, 3, PAL.WHITE);
          setPixel(3, 4, PAL.WHITE);
          setPixel(4, 4, PAL.WHITE);
          setPixel(5, 4, PAL.WHITE);
          setPixel(4, 5, PAL.WHITE);
          // Dark center mark
          setPixel(4, 4, PAL.DARKEST);
        } else {
          // 8-ball white circle with 8 dot
          setPixel(4, 3, PAL.WHITE);
          setPixel(3, 4, PAL.WHITE);
          setPixel(4, 4, PAL.WHITE);
          setPixel(5, 4, PAL.WHITE);
          setPixel(4, 5, PAL.WHITE);
          setPixel(4, 4, PAL.BLACK);
        }

        // Specular highlight
        setPixel(2, 2, PAL.WHITE);
        if (frame === 1 || frame === 3) setPixel(3, 2, PAL.WHITE);
      }

      ctx.putImageData(imgData, 0, 0);
      SPRITES.balls[id][frame] = canvas;
    }
  }
}

// Bake felt with Bayer 2x2 dither once at boot
export function bakeFelt(feltColor = PAL.FELT, lightColor = PAL.FELT_LIGHT, darkColor = PAL.FELT_DARK) {
  const { canvas, ctx } = createOffscreen(400, 200);
  ctx.fillStyle = feltColor;
  ctx.fillRect(0, 0, 400, 200);

  const imgData = ctx.getImageData(0, 0, 400, 200);
  const data = imgData.data;

  const hexToRgb = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];

  const rgbLight = hexToRgb(lightColor);
  const rgbDark = hexToRgb(darkColor);

  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 400; x++) {
      const idx = (y * 400 + x) * 4;
      if ((x + y) % 4 === 0) {
        data[idx] = rgbLight[0];
        data[idx + 1] = rgbLight[1];
        data[idx + 2] = rgbLight[2];
      } else if ((x * 2 + y) % 7 === 0) {
        data[idx] = rgbDark[0];
        data[idx + 1] = rgbDark[1];
        data[idx + 2] = rgbDark[2];
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  SPRITES.felt = canvas;
  return canvas;
}

// Bake Cue stick sprite: 48px long, 3px thick tapered to 2px
export function bakeCueStick(cueSkin = "DEFAULT") {
  const { canvas, ctx } = createOffscreen(48, 5);

  let buttColor = PAL.MAROON;
  let shaftColor = PAL.YELLOW_DARK;
  let tipColor = PAL.CYAN;

  if (cueSkin === "MIDNIGHT") {
    buttColor = PAL.PURPLE;
    shaftColor = PAL.SLATE;
    tipColor = PAL.MAGENTA;
  } else if (cueSkin === "GOLDEN") {
    buttColor = PAL.BRASS;
    shaftColor = PAL.YELLOW;
    tipColor = PAL.WHITE;
  } else if (cueSkin === "EMERALD") {
    buttColor = PAL.FELT_DARK;
    shaftColor = PAL.GREEN;
    tipColor = PAL.YELLOW;
  } else if (cueSkin === "CYBER") {
    buttColor = PAL.BLUE_DARK;
    shaftColor = PAL.CYAN;
    tipColor = PAL.MAGENTA;
  } else if (cueSkin === "DRAGON") {
    buttColor = PAL.RED_DARK;
    shaftColor = PAL.RED;
    tipColor = PAL.YELLOW;
  }

  // Butt: 16px
  ctx.fillStyle = buttColor;
  ctx.fillRect(0, 1, 16, 3);

  // Wrap: 4px
  ctx.fillStyle = PAL.DARKEST;
  ctx.fillRect(16, 1, 4, 3);

  // Shaft: 26px (tapering from 3px to 2px)
  ctx.fillStyle = shaftColor;
  ctx.fillRect(20, 1, 14, 3);
  ctx.fillRect(34, 1, 12, 2);

  // Ferrule: 1px
  ctx.fillStyle = PAL.WHITE;
  ctx.fillRect(46, 1, 1, 2);

  // Tip: 1px
  ctx.fillStyle = tipColor;
  ctx.fillRect(47, 1, 1, 2);

  SPRITES.cue = canvas;
  return canvas;
}

// Bake ball shadow: 9x3 ellipse-ish blob of FELT_DARK at alpha 0.4
export function bakeBallShadow() {
  const { canvas, ctx } = createOffscreen(9, 5);
  ctx.fillStyle = PAL.FELT_DARK;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(2, 0, 5, 1);
  ctx.fillRect(1, 1, 7, 1);
  ctx.fillRect(0, 2, 9, 1);
  ctx.fillRect(1, 3, 7, 1);
  ctx.fillRect(2, 4, 5, 1);
  SPRITES.ballShadow = canvas;
}

// Bake 16x16 procedural AI portraits
export const AI_PERSONALITIES = [
  { name: "CHALK",   tier: "ROOKIE",  seed: 101, taunt: "Rack 'em up, rookie." },
  { name: "DIAMOND", tier: "ROOKIE",  seed: 102, taunt: "I only play for fun. Mostly." },
  { name: "SNOOKER", tier: "AMATEUR", seed: 103, taunt: "You'll never see the ball again." },
  { name: "BANKS",   tier: "AMATEUR", seed: 104, taunt: "Off two rails. Watch." },
  { name: "KISS",    tier: "PRO",     seed: 105, taunt: "Everything's a kiss shot." },
  { name: "SCRATCH", tier: "PRO",     seed: 106, taunt: "I never scratch. You will." },
  { name: "THE RUN", tier: "LEGEND",  seed: 107, taunt: "You get one shot. The break." },
];

export function bakeAIPortraits() {
  const skinTones = ["#f2c53d", "#d8a03a", "#c0bcd0", "#e8792b", "#8b849d"];
  const hairColors = [PAL.MAROON, PAL.DARKEST, PAL.YELLOW_DARK, PAL.SLATE, PAL.RED_DARK];

  AI_PERSONALITIES.forEach((ai) => {
    const rng = makeRng(ai.seed);
    const { canvas, ctx } = createOffscreen(16, 16);

    // Frame/Background
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = PAL.DARK;
    ctx.fillRect(1, 1, 14, 14);

    const skin = skinTones[Math.floor(rng() * skinTones.length)];
    const hair = hairColors[Math.floor(rng() * hairColors.length)];

    // Head / face block
    ctx.fillStyle = skin;
    ctx.fillRect(4, 5, 8, 8);

    // Hair
    ctx.fillStyle = hair;
    ctx.fillRect(3, 3, 10, 3);
    ctx.fillRect(3, 5, 2, 4);

    // Eyes / shades
    const hasShades = rng() > 0.5;
    if (hasShades || ai.tier === "LEGEND") {
      ctx.fillStyle = PAL.BLACK;
      ctx.fillRect(5, 7, 6, 2);
      ctx.fillStyle = PAL.CYAN;
      ctx.fillRect(5, 7, 2, 1);
      ctx.fillRect(9, 7, 2, 1);
    } else {
      ctx.fillStyle = PAL.WHITE;
      ctx.fillRect(5, 7, 2, 2);
      ctx.fillRect(9, 7, 2, 2);
      ctx.fillStyle = PAL.DARKEST;
      ctx.fillRect(6, 7, 1, 1);
      ctx.fillRect(10, 7, 1, 1);
    }

    // Mouth / expression
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(6, 11, 4, 1);

    // Shirt / body
    ctx.fillStyle = ai.tier === "LEGEND" ? PAL.RED : PAL.SLATE;
    ctx.fillRect(2, 13, 12, 3);

    SPRITES.portraits[ai.name] = canvas;
  });
}

// Bake tier badge icons (8x8)
export function bakeTierBadges() {
  const tierBadges = [
    { id: "BRONZE",   color: PAL.RAIL_HI },
    { id: "SILVER",   color: PAL.SILVER },
    { id: "GOLD",     color: PAL.BRASS },
    { id: "PLATINUM", color: PAL.CYAN },
    { id: "DIAMOND",  color: PAL.MAGENTA },
    { id: "MASTER",   color: PAL.RED },
  ];

  tierBadges.forEach((t) => {
    const { canvas, ctx } = createOffscreen(8, 8);
    ctx.fillStyle = t.color;
    // Diamond badge shape
    ctx.fillRect(3, 1, 2, 6);
    ctx.fillRect(1, 3, 6, 2);
    ctx.fillRect(2, 2, 4, 4);

    // Center jewel
    ctx.fillStyle = PAL.WHITE;
    ctx.fillRect(3, 3, 2, 2);

    SPRITES.tierBadges[t.id] = canvas;
  });
}

// Global master bake function
export function bakeAllSprites() {
  bakeBallSprites();
  bakeFelt();
  bakeCueStick("DEFAULT");
  bakeBallShadow();
  bakeAIPortraits();
  bakeTierBadges();
}
