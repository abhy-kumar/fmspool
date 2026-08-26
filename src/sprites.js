import { PAL } from "./palette.js";
import { makeRng } from "./rng.js";

// Ball color configuration for 32-bit rendering
export const BALL_DEFS = [
  { id: 0,  base: PAL.CUE_WHITE,     dark: PAL.CUE_SHADE,   stripe: false, name: "Cue" },
  { id: 1,  base: PAL.BALL_1_YELLOW, dark: PAL.BALL_1_DARK, stripe: false, name: "1 Solid" },
  { id: 2,  base: PAL.BALL_2_BLUE,   dark: PAL.BALL_2_DARK, stripe: false, name: "2 Solid" },
  { id: 3,  base: PAL.BALL_3_RED,    dark: PAL.BALL_3_DARK, stripe: false, name: "3 Solid" },
  { id: 4,  base: PAL.BALL_4_PURPLE, dark: PAL.BALL_4_DARK, stripe: false, name: "4 Solid" },
  { id: 5,  base: PAL.BALL_5_ORANGE, dark: PAL.BALL_5_DARK, stripe: false, name: "5 Solid" },
  { id: 6,  base: PAL.BALL_6_GREEN,  dark: PAL.BALL_6_DARK, stripe: false, name: "6 Solid" },
  { id: 7,  base: PAL.BALL_7_MAROON, dark: PAL.BALL_7_DARK, stripe: false, name: "7 Solid" },
  { id: 8,  base: PAL.BALL_8_BLACK,  dark: PAL.BALL_8_DARK, stripe: false, name: "8 Ball" },
  { id: 9,  base: PAL.BALL_1_YELLOW, dark: PAL.BALL_1_DARK, stripe: true,  name: "9 Stripe" },
  { id: 10, base: PAL.BALL_2_BLUE,   dark: PAL.BALL_2_DARK, stripe: true,  name: "10 Stripe" },
  { id: 11, base: PAL.BALL_3_RED,    dark: PAL.BALL_3_DARK, stripe: true,  name: "11 Stripe" },
  { id: 12, base: PAL.BALL_4_PURPLE, dark: PAL.BALL_4_DARK, stripe: true,  name: "12 Stripe" },
  { id: 13, base: PAL.BALL_5_ORANGE, dark: PAL.BALL_5_DARK, stripe: true,  name: "13 Stripe" },
  { id: 14, base: PAL.BALL_6_GREEN,  dark: PAL.BALL_6_DARK, stripe: true,  name: "14 Stripe" },
  { id: 15, base: PAL.BALL_7_MAROON, dark: PAL.BALL_7_DARK, stripe: true,  name: "15 Stripe" },
];

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
  ctx.imageSmoothingEnabled = true;
  return { canvas: c, ctx };
}

// Generate 32-bit shaded 3D billiard spheres
export function bakeBallSprites() {
  SPRITES.balls = [];
  const size = 12; // 12x12 high-detail sphere
  const radius = 5.2;
  const cx = 6;
  const cy = 6;

  for (let id = 0; id <= 15; id++) {
    const ballDef = BALL_DEFS[id];
    SPRITES.balls[id] = [];

    for (let frame = 0; frame < 4; frame++) {
      const { canvas, ctx } = createOffscreen(size, size);
      const rollAngle = (frame * Math.PI) / 2;

      // 1. Base Sphere Gradient (Spherical lighting from top-left)
      const grad = ctx.createRadialGradient(cx - 1.8, cy - 1.8, 0.5, cx, cy, radius);
      if (id === 0) {
        // Pure cue ball
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.65, "#f0f2fa");
        grad.addColorStop(1, "#c0c8db");
      } else if (id === 8) {
        // 8-ball (obsidian gloss)
        grad.addColorStop(0, "#3c384a");
        grad.addColorStop(0.5, "#171421");
        grad.addColorStop(1, "#08060d");
      } else {
        // Colored balls
        grad.addColorStop(0, ballDef.base);
        grad.addColorStop(0.7, ballDef.dark);
        grad.addColorStop(1, "#0a0712");
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // 2. Stripe band (for balls 9-15)
      if (ballDef.stripe) {
        const stripeGrad = ctx.createRadialGradient(cx - 1.8, cy - 1.8, 0.5, cx, cy, radius);
        stripeGrad.addColorStop(0, "#ffffff");
        stripeGrad.addColorStop(0.7, "#e1e4ee");
        stripeGrad.addColorStop(1, "#98a1b5");

        ctx.fillStyle = stripeGrad;
        // Top and bottom white caps
        ctx.fillRect(0, 0, size, 2.8);
        ctx.fillRect(0, size - 2.8, size, 2.8);
      }

      // 3. Center White Number Inlay Disc
      if (id !== 0) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx, cy + 0.2, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Pixel Number inside disc
        ctx.fillStyle = id === 8 ? "#000000" : "#141026";
        ctx.font = 'bold 4px monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(id), cx, cy + 0.6);
      } else {
        // Red Aiming Dot on Cue Ball
        ctx.fillStyle = "#ff2244";
        ctx.beginPath();
        ctx.arc(cx, cy, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Specular Highlight Gleam (Sharp 32-bit gloss reflections)
      const specGrad = ctx.createRadialGradient(cx - 2.0, cy - 2.0, 0.1, cx - 2.0, cy - 2.0, 1.8);
      specGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      specGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.5)");
      specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.fillStyle = specGrad;
      ctx.beginPath();
      ctx.arc(cx - 2.0, cy - 2.0, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Secondary soft bounce light (bottom-right rim)
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 0.4, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();

      ctx.restore();

      SPRITES.balls[id][frame] = canvas;
    }
  }
}

// Bake 32-bit luxury pool felt with dynamic overhead lamp lighting vignette
export function bakeFelt(feltColor = PAL.FELT, lightColor = PAL.FELT_LIGHT, darkColor = PAL.FELT_DARK) {
  const { canvas, ctx } = createOffscreen(400, 200);

  // 1. Base Felt with subtle gradient
  const feltGrad = ctx.createRadialGradient(200, 100, 20, 200, 100, 240);
  feltGrad.addColorStop(0, lightColor);
  feltGrad.addColorStop(0.5, feltColor);
  feltGrad.addColorStop(1, darkColor);

  ctx.fillStyle = feltGrad;
  ctx.fillRect(0, 0, 400, 200);

  // 2. Micro-texture weave
  const imgData = ctx.getImageData(0, 0, 400, 200);
  const data = imgData.data;
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 400; x++) {
      const idx = (y * 400 + x) * 4;
      const noise = ((x ^ y) * 71) % 11 - 5;
      data[idx] = Math.max(0, Math.min(255, data[idx] + noise));
      data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + noise));
      data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + noise));
    }
  }
  ctx.putImageData(imgData, 0, 0);

  SPRITES.felt = canvas;
  return canvas;
}

// Bake 32-bit Hardwood Cue Stick with Maple Shaft, Brass Joint & Inlays
export function bakeCueStick(cueSkin = "DEFAULT") {
  const { canvas, ctx } = createOffscreen(60, 6);

  let buttGradColors = ["#a8243c", "#590e1d"];
  let shaftColor = "#f3cb77";
  let tipColor = PAL.CYAN;
  let jointColor = PAL.GOLD;

  if (cueSkin === "MIDNIGHT") {
    buttGradColors = ["#6927b5", "#270b4a"];
    shaftColor = "#c5c0db";
    tipColor = PAL.MAGENTA;
  } else if (cueSkin === "GOLDEN") {
    buttGradColors = ["#ffcc00", "#996d00"];
    shaftColor = "#ffeaa3";
    tipColor = "#ffffff";
  } else if (cueSkin === "EMERALD") {
    buttGradColors = ["#158450", "#094227"];
    shaftColor = "#a6e3b5";
    tipColor = PAL.YELLOW;
  } else if (cueSkin === "CYBER") {
    buttGradColors = ["#0088ff", "#002a66"];
    shaftColor = "#66dcff";
    tipColor = PAL.MAGENTA;
  } else if (cueSkin === "DRAGON") {
    buttGradColors = ["#ff2244", "#770011"];
    shaftColor = "#ffaa66";
    tipColor = PAL.YELLOW;
  }

  // 1. Chalked Tip (x = 0..1)
  ctx.fillStyle = tipColor;
  ctx.fillRect(0, 1.5, 1.5, 3);

  // 2. White Ferrule (x = 1.5..3)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(1.5, 1.5, 1.5, 3);

  // 3. Maple Shaft (x = 3..36, tapering smoothly)
  const shaftGrad = ctx.createLinearGradient(0, 1, 0, 5);
  shaftGrad.addColorStop(0, "#fff5d9");
  shaftGrad.addColorStop(0.5, shaftColor);
  shaftGrad.addColorStop(1, "#b3883b");

  ctx.fillStyle = shaftGrad;
  ctx.fillRect(3, 1.5, 16, 3); // 3px near tip
  ctx.fillRect(19, 1, 18, 4);  // 4px near joint

  // 4. Brass Joint Collar (x = 37..39)
  ctx.fillStyle = jointColor;
  ctx.fillRect(37, 1, 2, 4);

  // 5. Hardwood Butt & Irish Linen Grip Wrap (x = 39..59)
  const buttGrad = ctx.createLinearGradient(0, 0.5, 0, 5.5);
  buttGrad.addColorStop(0, buttGradColors[0]);
  buttGrad.addColorStop(1, buttGradColors[1]);

  ctx.fillStyle = buttGrad;
  ctx.fillRect(39, 1, 20, 4);

  // Textured Grip Wrap (x = 42..48)
  ctx.fillStyle = "#100c1e";
  ctx.fillRect(42, 1, 7, 4);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  for (let i = 43; i < 48; i += 2) {
    ctx.fillRect(i, 1, 1, 4);
  }

  // Gold Bumper Cap (x = 59..60)
  ctx.fillStyle = PAL.GOLD_DARK;
  ctx.fillRect(59, 1.5, 1, 3);

  SPRITES.cue = canvas;
  return canvas;
}

// Bake soft radial ball shadow
export function bakeBallShadow() {
  const { canvas, ctx } = createOffscreen(14, 8);
  const grad = ctx.createRadialGradient(7, 4, 1, 7, 4, 6);
  grad.addColorStop(0, "rgba(7, 5, 14, 0.70)");
  grad.addColorStop(0.6, "rgba(7, 5, 14, 0.35)");
  grad.addColorStop(1, "rgba(7, 5, 14, 0)");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 14, 8);
  SPRITES.ballShadow = canvas;
}

// 32-Bit AI Portraits
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
  const skinTones = ["#ffd08a", "#f5ad58", "#e69138", "#ffc570", "#d47a28"];
  const hairColors = [PAL.MAROON, PAL.DARKEST, PAL.YELLOW, PAL.RED, PAL.BLUE];

  AI_PERSONALITIES.forEach((ai) => {
    const rng = makeRng(ai.seed);
    const { canvas, ctx } = createOffscreen(18, 18);

    // Card frame
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(0, 0, 18, 18);
    ctx.fillStyle = PAL.DARK;
    ctx.fillRect(1, 1, 16, 16);

    const skin = skinTones[Math.floor(rng() * skinTones.length)];
    const hair = hairColors[Math.floor(rng() * hairColors.length)];

    ctx.fillStyle = skin;
    ctx.fillRect(4, 5, 10, 9);

    ctx.fillStyle = hair;
    ctx.fillRect(3, 3, 12, 4);
    ctx.fillRect(3, 5, 2, 5);

    const hasShades = rng() > 0.4;
    if (hasShades || ai.tier === "LEGEND") {
      ctx.fillStyle = PAL.BLACK;
      ctx.fillRect(5, 7, 8, 3);
      ctx.fillStyle = PAL.CYAN;
      ctx.fillRect(6, 7, 2, 1);
      ctx.fillRect(10, 7, 2, 1);
    } else {
      ctx.fillStyle = PAL.WHITE;
      ctx.fillRect(5, 7, 3, 2);
      ctx.fillRect(10, 7, 3, 2);
      ctx.fillStyle = PAL.DARKEST;
      ctx.fillRect(6, 7, 2, 2);
      ctx.fillRect(11, 7, 2, 2);
    }

    ctx.fillStyle = PAL.RED;
    ctx.fillRect(7, 11, 4, 1);

    ctx.fillStyle = ai.tier === "LEGEND" ? PAL.MAGENTA : PAL.CYAN;
    ctx.fillRect(2, 14, 14, 3);

    SPRITES.portraits[ai.name] = canvas;
  });
}

// 32-Bit Metallic Luster Tier Badges
export function bakeTierBadges() {
  const tierBadges = [
    { id: "BRONZE",   c1: "#ff9d42", c2: "#9e4800" },
    { id: "SILVER",   c1: "#ffffff", c2: "#8393ad" },
    { id: "GOLD",     c1: "#ffea75", c2: "#c98f00" },
    { id: "PLATINUM", c1: "#b3ffff", c2: "#00a3cc" },
    { id: "DIAMOND",  c1: "#ff8ae2", c2: "#c7008f" },
    { id: "MASTER",   c1: "#ff6b85", c2: "#b30024" },
  ];

  tierBadges.forEach((t) => {
    const { canvas, ctx } = createOffscreen(10, 10);
    const grad = ctx.createLinearGradient(0, 0, 10, 10);
    grad.addColorStop(0, t.c1);
    grad.addColorStop(1, t.c2);

    ctx.fillStyle = grad;
    // Diamond Shield Shape
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(9, 4);
    ctx.lineTo(5, 9);
    ctx.lineTo(1, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(4, 3, 2, 3);

    SPRITES.tierBadges[t.id] = canvas;
  });
}

export function bakeAllSprites() {
  bakeBallSprites();
  bakeFelt();
  bakeCueStick("DEFAULT");
  bakeBallShadow();
  bakeAIPortraits();
  bakeTierBadges();
}
