import { CFG } from "./config.js";
import { PAL } from "./palette.js";
import { SPRITES } from "./sprites.js";
import { POCKETS } from "./table.js";
import { isBallLegalFirstContact, getBallGroup } from "./rules.js";
import { norm, mul, add, sub, perp, dot, dist, clamp } from "./vec.js";

import { COSMETIC_BACKGROUNDS, COSMETIC_TABLES } from "./storage.js";

// Physics <-> Base Pixel coordinate conversions
export function physToPx(x, y) {
  return {
    x: CFG.PLAYFIELD_PX.x + x * CFG.PHYS_TO_PX,
    y: CFG.PLAYFIELD_PX.y + y * CFG.PHYS_TO_PX,
  };
}

export function pxToPhys(x, y) {
  return {
    x: (x - CFG.PLAYFIELD_PX.x) / CFG.PHYS_TO_PX,
    y: (y - CFG.PLAYFIELD_PX.y) / CFG.PHYS_TO_PX,
  };
}

// Render Room / Parlor Background with distinct visual architecture
export function renderRoomBackground(ctx, bgId = "DEFAULT") {
  const bgDef = COSMETIC_BACKGROUNDS.find((b) => b.id === bgId) || COSMETIC_BACKGROUNDS[0];

  // 1. Base Room Atmosphere & Lighting Vignette
  const bgGrad = ctx.createRadialGradient(256, 144, 30, 256, 144, 280);
  bgGrad.addColorStop(0, bgDef.light);
  bgGrad.addColorStop(0.55, bgDef.color);
  bgGrad.addColorStop(1, bgDef.dark);

  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

  // 2. Distinct Architectural Themes
  if (bgId === "HAVELI") {
    // Rajasthani Haveli Sandstone tile grid & warm ambient glow
    ctx.strokeStyle = "rgba(255, 180, 100, 0.10)";
    ctx.lineWidth = 1;
    for (let x = 0; x < CFG.BASE_W; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CFG.BASE_H); ctx.stroke();
    }
    for (let y = 0; y < CFG.BASE_H; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CFG.BASE_W, y); ctx.stroke();
    }
  } else if (bgId === "NEON") {
    // Cyberpunk Perspective Neon Grid & Laser reflection
    ctx.strokeStyle = "rgba(0, 240, 255, 0.18)";
    ctx.lineWidth = 1;
    for (let y = 46; y < CFG.BASE_H; y += 22) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CFG.BASE_W, y); ctx.stroke();
    }
    for (let x = -80; x < CFG.BASE_W + 80; x += 34) {
      ctx.beginPath(); ctx.moveTo(256, 0); ctx.lineTo(x, CFG.BASE_H); ctx.stroke();
    }
  } else if (bgId === "PALACE") {
    // Maharaja Palace Royal Diamond Marble
    ctx.strokeStyle = "rgba(255, 215, 0, 0.14)";
    ctx.lineWidth = 1;
    for (let d = -CFG.BASE_W; d < CFG.BASE_W * 2; d += 36) {
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + CFG.BASE_H, CFG.BASE_H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d - CFG.BASE_H, CFG.BASE_H); ctx.stroke();
    }
  } else if (bgId === "MUMBAI") {
    // Marine Drive Jazz Lounge Midnight Herringbone
    ctx.strokeStyle = "rgba(42, 130, 210, 0.12)";
    ctx.lineWidth = 1;
    for (let y = 44; y < CFG.BASE_H; y += 18) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CFG.BASE_W, y); ctx.stroke();
    }
  } else if (bgId === "CLUB") {
    // Colonial Gymkhana Vintage Teakwood Planks
    ctx.strokeStyle = "rgba(0, 0, 0, 0.28)";
    ctx.lineWidth = 1.5;
    for (let y = 46; y < CFG.BASE_H; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CFG.BASE_W, y); ctx.stroke();
    }
  } else {
    // Classic Retro Arcade Oak Planks
    ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
    ctx.lineWidth = 1;
    for (let y = 48; y < CFG.BASE_H; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CFG.BASE_W, y); ctx.stroke();
    }
  }
}

// Render complete 32-bit luxury pool table with customizable Rails & Hardware
export function renderTable(ctx, tableSkinId = "DEFAULT") {
  const px = CFG.PLAYFIELD_PX.x;
  const py = CFG.PLAYFIELD_PX.y;
  const pw = CFG.PLAYFIELD_PX.w;
  const ph = CFG.PLAYFIELD_PX.h;
  const rw = CFG.RAIL_PX;

  const tableDef = COSMETIC_TABLES.find((t) => t.id === tableSkinId) || COSMETIC_TABLES[0];

  const tableLeft = px - rw;
  const tableTop = py - rw;
  const tableWidth = pw + rw * 2;
  const tableHeight = ph + rw * 2;

  // 1. Table Outer Drop Shadow
  ctx.fillStyle = tableDef.dropShadow || "rgba(4, 3, 8, 0.65)";
  ctx.fillRect(tableLeft + 4, tableTop + 4, tableWidth, tableHeight);

  // 2. Hardwood Wood Rails (Gradient bevel)
  const woodGrad = ctx.createLinearGradient(tableLeft, tableTop, tableLeft, tableTop + tableHeight);
  woodGrad.addColorStop(0, tableDef.railLight);
  woodGrad.addColorStop(0.5, tableDef.railColor);
  woodGrad.addColorStop(1, tableDef.railDark);

  ctx.fillStyle = woodGrad;
  ctx.fillRect(tableLeft, tableTop, tableWidth, tableHeight);

  // Polished outer bevel lip
  ctx.strokeStyle = tableDef.railHi;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tableLeft + 1, tableTop + 1, tableWidth - 2, tableHeight - 2);

  // Inner Cushion Shadow Band
  ctx.strokeStyle = tableDef.railDarkest;
  ctx.lineWidth = 2;
  ctx.strokeRect(tableLeft + 3, tableTop + 3, tableWidth - 6, tableHeight - 6);

  // 3. Playfield Felt (with overhead pool lamp radial lighting)
  if (SPRITES.felt) {
    ctx.drawImage(SPRITES.felt, px, py);
  } else {
    ctx.fillStyle = PAL.FELT;
    ctx.fillRect(px, py, pw, ph);
  }

  // Overhead Warm Spotlight Vignette on Felt
  const spotGrad = ctx.createRadialGradient(px + pw / 2, py + ph / 2, 20, px + pw / 2, py + ph / 2, pw * 0.65);
  spotGrad.addColorStop(0, "rgba(255, 255, 200, 0.08)");
  spotGrad.addColorStop(0.6, "rgba(0, 0, 0, 0.0)");
  spotGrad.addColorStop(1, "rgba(4, 18, 10, 0.35)");

  ctx.fillStyle = spotGrad;
  ctx.fillRect(px, py, pw, ph);

  // Inner Rail Cushion Ambient Occlusion Lip
  ctx.strokeStyle = "rgba(4, 20, 10, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px, py, pw, ph);

  // 4. Head string & Gold Spots
  const headStrPx = physToPx(CFG.HEAD_STRING_X, 0).x;
  ctx.save();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
  ctx.beginPath();
  ctx.moveTo(Math.round(headStrPx), py);
  ctx.lineTo(Math.round(headStrPx), py + ph);
  ctx.stroke();
  ctx.restore();

  const headSpotPx = physToPx(CFG.HEAD_SPOT.x, CFG.HEAD_SPOT.y);
  const footSpotPx = physToPx(CFG.FOOT_SPOT.x, CFG.FOOT_SPOT.y);

  // Inlaid brass / diamond spots
  ctx.fillStyle = tableDef.diamondColor || PAL.GOLD;
  ctx.fillRect(Math.round(headSpotPx.x - 1), Math.round(headSpotPx.y - 1), 3, 3);
  ctx.fillRect(Math.round(footSpotPx.x - 1), Math.round(footSpotPx.y - 1), 3, 3);

  // 5. Polished Diamond Sights
  const drawDiamond = (dx, dy) => {
    ctx.fillStyle = tableDef.diamondColor || PAL.GOLD_LIGHT;
    ctx.fillRect(Math.round(dx), Math.round(dy - 1), 1, 3);
    ctx.fillRect(Math.round(dx - 1), Math.round(dy), 3, 1);
    ctx.fillStyle = tableDef.diamondLight || "#ffffff";
    ctx.fillRect(Math.round(dx), Math.round(dy), 1, 1);
  };

  // Top and bottom rails: 3 diamonds per half-rail
  const topBottomXs = [
    px + pw * 0.125,
    px + pw * 0.25,
    px + pw * 0.375,
    px + pw * 0.625,
    px + pw * 0.75,
    px + pw * 0.875,
  ];
  topBottomXs.forEach((dx) => {
    drawDiamond(dx, py - 7);
    drawDiamond(dx, py + ph + 7);
  });

  // Left and right side rails: 3 diamonds each
  const sideYs = [
    py + ph * 0.25,
    py + ph * 0.50,
    py + ph * 0.75,
  ];
  sideYs.forEach((dy) => {
    drawDiamond(px - 7, dy);
    drawDiamond(px + pw + 7, dy);
  });

  // 6. Leather Pocket Drop Wells & Corner Castings
  POCKETS.forEach((p) => {
    const pos = physToPx(p.x, p.y);
    const radius = p.r * CFG.PHYS_TO_PX;

    // Corner casting ring
    ctx.strokeStyle = tableDef.diamondColor || PAL.GOLD_DARK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Math.round(pos.x), Math.round(pos.y), radius + 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // Deep leather pocket hole
    const pocketGrad = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, radius);
    pocketGrad.addColorStop(0, "#000000");
    pocketGrad.addColorStop(0.7, PAL.POCKET);
    pocketGrad.addColorStop(1, PAL.POCKET_RIM);

    ctx.fillStyle = pocketGrad;
    ctx.beginPath();
    ctx.arc(Math.round(pos.x), Math.round(pos.y), radius, 0, Math.PI * 2);
    ctx.fill();

    // Subtle leather rim shadow
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.round(pos.x), Math.round(pos.y), radius - 0.5, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// Render all 32-bit billiard balls (with soft drop shadows & pulsing legal halos)
export function renderBalls(ctx, balls, matchState = null) {
  const time = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);

  // 1. Legal target ball halos (glowing cyan / brass rings)
  if (matchState && matchState.turn === "PLAYER" && (matchState.phase === "AIMING" || matchState.phase === "CALL_POCKET")) {
    balls.forEach((ball) => {
      if (!ball.inPlay || ball.id === 0) return;
      const isLegal = isBallLegalFirstContact(ball.id, matchState, "PLAYER");
      if (isLegal) {
        const pos = physToPx(ball.x, ball.y);
        ctx.save();
        ctx.strokeStyle = ball.id === 8 ? PAL.GOLD : PAL.CYAN;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4 + 0.5 * pulse;
        ctx.beginPath();
        ctx.arc(Math.round(pos.x), Math.round(pos.y), 7.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  // 2. Soft radial ball drop shadows
  if (SPRITES.ballShadow) {
    balls.forEach((ball) => {
      if (!ball.inPlay) return;
      const pos = physToPx(ball.x, ball.y);
      ctx.drawImage(
        SPRITES.ballShadow,
        Math.round(pos.x - 7 + 1.5),
        Math.round(pos.y - 4 + 2.5)
      );
    });
  }

  // 3. 32-bit 3D spheres
  balls.forEach((ball) => {
    if (!ball.inPlay) return;
    const pos = physToPx(ball.x, ball.y);
    const frame = Math.floor((ball.distanceTravelled || 0) / 5) % 4;
    const sprite = SPRITES.balls[ball.id] ? SPRITES.balls[ball.id][frame] : null;

    if (sprite) {
      // 12x12 sprite centered at pos.x, pos.y
      ctx.drawImage(
        sprite,
        Math.round(pos.x - 6),
        Math.round(pos.y - 6)
      );
    }
  });
}

// Render Cue Stick
export function renderCueStick(ctx, cueBall, aimAngle, power = 0, cueSkin = "DEFAULT") {
  if (!cueBall || !cueBall.inPlay || !SPRITES.cue) return;

  const pos = physToPx(cueBall.x, cueBall.y);
  const pullback = 7.5 + power * 28;

  ctx.save();
  ctx.translate(Math.round(pos.x), Math.round(pos.y));
  ctx.rotate(aimAngle + Math.PI);

  ctx.drawImage(
    SPRITES.cue,
    Math.round(pullback),
    -3
  );

  ctx.restore();
}

// Render Aim Assist with Laser Line and Deflection Physics
export function renderAimAssist(ctx, state, aimAngle, assistLevel = "FULL") {
  const cue = state.balls[0];
  if (!cue || !cue.inPlay) return;

  const cuePhys = { x: cue.x, y: cue.y };
  const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };

  // Ray-cast against balls
  let nearestHit = null;
  let minHitDist = Infinity;
  const collisionRadius = CFG.BALL_R * 2;

  for (let i = 1; i <= 15; i++) {
    const target = state.balls[i];
    if (!target.inPlay) continue;

    const toTarget = sub(target, cuePhys);
    const proj = dot(toTarget, dir);
    if (proj <= 0) continue;

    const perpDistSq = dot(toTarget, toTarget) - proj * proj;
    if (perpDistSq < collisionRadius * collisionRadius) {
      const d = proj - Math.sqrt(Math.max(0, collisionRadius * collisionRadius - perpDistSq));
      if (d > 0 && d < minHitDist) {
        minHitDist = d;
        nearestHit = {
          target,
          dist: d,
          ghostPos: add(cuePhys, mul(dir, d)),
        };
      }
    }
  }

  // Ray-cast against cushions
  let cushionDist = Infinity;
  let hitCushionNormal = null;
  const r = CFG.BALL_R;

  if (dir.x > 0) {
    const t = (CFG.TABLE_W - r - cuePhys.x) / dir.x;
    if (t > 0 && t < cushionDist) { cushionDist = t; hitCushionNormal = { x: -1, y: 0 }; }
  } else if (dir.x < 0) {
    const t = (r - cuePhys.x) / dir.x;
    if (t > 0 && t < cushionDist) { cushionDist = t; hitCushionNormal = { x: 1, y: 0 }; }
  }

  if (dir.y > 0) {
    const t = (CFG.TABLE_H - r - cuePhys.y) / dir.y;
    if (t > 0 && t < cushionDist) { cushionDist = t; hitCushionNormal = { x: 0, y: -1 }; }
  } else if (dir.y < 0) {
    const t = (r - cuePhys.y) / dir.y;
    if (t > 0 && t < cushionDist) { cushionDist = t; hitCushionNormal = { x: 0, y: 1 }; }
  }

  const cuePx = physToPx(cuePhys.x, cuePhys.y);

  if (nearestHit && nearestHit.dist < cushionDist) {
    const isLegalTarget = isBallLegalFirstContact(nearestHit.target.id, state, state.turn);
    const ghostPx = physToPx(nearestHit.ghostPos.x, nearestHit.ghostPos.y);

    // Aim Laser Line (Dashed White or Neon Red)
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isLegalTarget ? "rgba(255, 255, 255, 0.85)" : PAL.RED;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.round(cuePx.x), Math.round(cuePx.y));
    ctx.lineTo(Math.round(ghostPx.x), Math.round(ghostPx.y));
    ctx.stroke();
    ctx.restore();

    // Ghost Ball
    ctx.strokeStyle = isLegalTarget ? PAL.CYAN : PAL.RED;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(Math.round(ghostPx.x), Math.round(ghostPx.y), CFG.BALL_R * CFG.PHYS_TO_PX, 0, Math.PI * 2);
    ctx.stroke();

    // Target Legal / Foul Banner
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const labelY = Math.round(ghostPx.y - 8);

    if (isLegalTarget) {
      const bGroup = getBallGroup(nearestHit.target.id);
      ctx.fillStyle = PAL.BLACK;
      ctx.fillText(`#${nearestHit.target.id} ${bGroup}`, Math.round(ghostPx.x) + 1, labelY + 1);
      ctx.fillStyle = PAL.CYAN;
      ctx.fillText(`#${nearestHit.target.id} ${bGroup}`, Math.round(ghostPx.x), labelY);
    } else {
      ctx.fillStyle = PAL.BLACK;
      ctx.fillText("! FOUL TARGET", Math.round(ghostPx.x) + 1, labelY + 1);
      ctx.fillStyle = PAL.RED;
      ctx.fillText("! FOUL TARGET", Math.round(ghostPx.x), labelY);
    }

    if (assistLevel !== "CUE_ONLY") {
      const targetNormal = norm(sub(nearestHit.target, nearestHit.ghostPos));
      const targetLen = assistLevel === "HALF" ? 14 : 28;
      const targetEndPx = add(ghostPx, mul(targetNormal, targetLen));

      ctx.strokeStyle = isLegalTarget ? PAL.CYAN : PAL.RED;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.round(ghostPx.x), Math.round(ghostPx.y));
      ctx.lineTo(Math.round(targetEndPx.x), Math.round(targetEndPx.y));
      ctx.stroke();

      const cueTangent = perp(targetNormal);
      const sign = dot(dir, cueTangent) >= 0 ? 1 : -1;
      const cueDir = mul(cueTangent, sign);
      const cueLen = assistLevel === "HALF" ? 10 : 20;
      const cueEndPx = add(ghostPx, mul(cueDir, cueLen));

      ctx.strokeStyle = PAL.MAGENTA;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.round(ghostPx.x), Math.round(ghostPx.y));
      ctx.lineTo(Math.round(cueEndPx.x), Math.round(cueEndPx.y));
      ctx.stroke();
    }
  } else if (cushionDist < Infinity) {
    const hitPhys = add(cuePhys, mul(dir, cushionDist));
    const hitPx = physToPx(hitPhys.x, hitPhys.y);

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.round(cuePx.x), Math.round(cuePx.y));
    ctx.lineTo(Math.round(hitPx.x), Math.round(hitPx.y));
    ctx.stroke();

    if (hitCushionNormal) {
      const dotVal = dot(dir, hitCushionNormal);
      const reflectDir = sub(dir, mul(hitCushionNormal, 2 * dotVal));
      const bounceEndPx = add(hitPx, mul(reflectDir, 32));

      ctx.beginPath();
      ctx.moveTo(Math.round(hitPx.x), Math.round(hitPx.y));
      ctx.lineTo(Math.round(bounceEndPx.x), Math.round(bounceEndPx.y));
      ctx.stroke();
    }
    ctx.restore();
  }
}

// CRT Post-Effect
export function renderCRTEffect(ctx) {
  const w = CFG.BASE_W;
  const h = CFG.BASE_H;

  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  for (let y = 1; y < h; y += 2) {
    ctx.fillRect(0, y, w, 1);
  }

  ctx.fillStyle = "rgba(7, 5, 14, 0.15)";
  ctx.fillRect(0, 0, w, 2);
  ctx.fillRect(0, h - 2, w, 2);
  ctx.fillRect(0, 0, 2, h);
  ctx.fillRect(w - 2, 0, 2, h);
}
