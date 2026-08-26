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

// 9x9 circle mask definitions
const CIRCLE_MASK = [
  [3, 5],
  [2, 6],
  [1, 7],
  [0, 8],
  [0, 8],
  [0, 8],
  [1, 7],
  [2, 6],
  [3, 5],
];

function isInsideCircle(r, c) {
  if (r < 0 || r > 8) return false;
  return c >= CIRCLE_MASK[r][0] && c <= CIRCLE_MASK[r][1];
}

// Pre-baked sprite cache
export const SPRITES = {
  balls: [],
  felt: null,
  cue: null,
  ballShadow: null,
  portraits: {},
  tierBadges: {},
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
        // Cue ball
        for (let r = 0; r < 9; r++) {
          for (let c = CIRCLE_MASK[r][0]; c <= CIRCLE_MASK[r][1]; c++) {
            setPixel(c, r, PAL.WHITE);
          }
        }
        for (let r = 5; r <= 8; r++) {
          for (let c = 6; c <= 8; c++) {
            if (isInsideCircle(r, c)) setPixel(c, r, PAL.SILVER);
          }
        }
        setPixel(4, 4, PAL.RED);
        setPixel(2, 2, PAL.WHITE);
        if (frame === 1 || frame === 3) setPixel(3, 2, PAL.WHITE);
      } else {
        // Object balls
        const rollOffset = rollOffsets[frame];

        for (let r = 0; r < 9; r++) {
          for (let c = CIRCLE_MASK[r][0]; c <= CIRCLE_MASK[r][1]; c++) {
            if (ballDef.stripe) {
              const wrappedR = (r - rollOffset + 9) % 9;
              const isStripe = (wrappedR >= 2 && wrappedR <= 6);
              setPixel(c, r, isStripe ? ballDef.base : PAL.WHITE);
            } else {
              setPixel(c, r, ballDef.base);
            }
          }
        }

        for (let r = 5; r <= 8; r++) {
          for (let c = 6; c <= 8; c++) {
            if (isInsideCircle(r, c)) {
              if (ballDef.dark && ballDef.dark !== PAL.DARK) {
                setPixel(c, r, ballDef.dark);
              } else {
                const idx = (r * 9 + c) * 4;
                data[idx] = Math.round(data[idx] * 0.6);
                data[idx + 1] = Math.round(data[idx + 1] * 0.6);
                data[idx + 2] = Math.round(data[idx + 2] * 0.6);
              }
            }
          }
        }

        if (id !== 8) {
          setPixel(4, 3, PAL.WHITE);
          setPixel(3, 4, PAL.WHITE);
          setPixel(4, 4, PAL.WHITE);
          setPixel(5, 4, PAL.WHITE);
          setPixel(4, 5, PAL.WHITE);
          setPixel(4, 4, PAL.DARKEST);
        } else {
          setPixel(4, 3, PAL.WHITE);
          setPixel(3, 4, PAL.WHITE);
          setPixel(4, 4, PAL.WHITE);
          setPixel(5, 4, PAL.WHITE);
          setPixel(4, 5, PAL.WHITE);
          setPixel(4, 4, PAL.BLACK);
        }

        setPixel(2, 2, PAL.WHITE);
        if (frame === 1 || frame === 3) setPixel(3, 2, PAL.WHITE);
      }

      ctx.putImageData(imgData, 0, 0);
      SPRITES.balls[id][frame] = canvas;
    }
  }
}

// Bake felt with Bayer 2x2 dither
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

// Bake Cue stick sprite: 56px long.
// TIP IS AT x = 0, BUTT IS AT x = 55!
export function bakeCueStick(cueSkin = "DEFAULT") {
  const { canvas, ctx } = createOffscreen(56, 5);

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

  // 1. Tip: 1px at x = 0 (centered on y=1..2)
  ctx.fillStyle = tipColor;
  ctx.fillRect(0, 1, 1, 2);

  // 2. Ferrule: 1px at x = 1 (height 2px)
  ctx.fillStyle = PAL.WHITE;
  ctx.fillRect(1, 1, 1, 2);

  // 3. Shaft: 32px at x = 2..33 (tapering from 2px to 3px)
  ctx.fillStyle = shaftColor;
  ctx.fillRect(2, 1, 14, 2);  // 2px thick near tip
  ctx.fillRect(16, 1, 18, 3); // 3px thick toward wrap

  // 4. Wrap: 6px at x = 34..39 (3px thick)
  ctx.fillStyle = PAL.DARKEST;
  ctx.fillRect(34, 1, 6, 3);

  // 5. Butt: 16px at x = 40..55 (3px thick)
  ctx.fillStyle = buttColor;
  ctx.fillRect(40, 1, 16, 3);

  SPRITES.cue = canvas;
  return canvas;
}

// Bake ball shadow
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

// Bake 16x16 AI portraits
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

    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = PAL.DARK;
    ctx.fillRect(1, 1, 14, 14);

    const skin = skinTones[Math.floor(rng() * skinTones.length)];
    const hair = hairColors[Math.floor(rng() * hairColors.length)];

    ctx.fillStyle = skin;
    ctx.fillRect(4, 5, 8, 8);

    ctx.fillStyle = hair;
    ctx.fillRect(3, 3, 10, 3);
    ctx.fillRect(3, 5, 2, 4);

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

    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(6, 11, 4, 1);

    ctx.fillStyle = ai.tier === "LEGEND" ? PAL.RED : PAL.SLATE;
    ctx.fillRect(2, 13, 12, 3);

    SPRITES.portraits[ai.name] = canvas;
  });
}

// Bake tier badges
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
    ctx.fillRect(3, 1, 2, 6);
    ctx.fillRect(1, 3, 6, 2);
    ctx.fillRect(2, 2, 4, 4);

    ctx.fillStyle = PAL.WHITE;
    ctx.fillRect(3, 3, 2, 2);

    SPRITES.tierBadges[t.id] = canvas;
  });
}

// Global master bake
export function bakeAllSprites() {
  bakeBallSprites();
  bakeFelt();
  bakeCueStick("DEFAULT");
  bakeBallShadow();
  bakeAIPortraits();
  bakeTierBadges();
}
