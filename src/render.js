import { CFG } from "./config.js";
import { PAL } from "./palette.js";
import { SPRITES } from "./sprites.js";
import { POCKETS } from "./table.js";
import { isBallLegalFirstContact, getBallGroup } from "./rules.js";
import { norm, mul, add, sub, perp, dot, dist, clamp } from "./vec.js";

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

// Render complete static table
export function renderTable(ctx) {
  const px = CFG.PLAYFIELD_PX.x;
  const py = CFG.PLAYFIELD_PX.y;
  const pw = CFG.PLAYFIELD_PX.w;
  const ph = CFG.PLAYFIELD_PX.h;
  const rw = CFG.RAIL_PX;

  const tableLeft = px - rw;
  const tableTop = py - rw;
  const tableWidth = pw + rw * 2;
  const tableHeight = ph + rw * 2;

  // 1. Table Rails outer body
  ctx.fillStyle = PAL.RAIL;
  ctx.fillRect(tableLeft, tableTop, tableWidth, tableHeight);

  // Outer 2px RAIL_DARK border
  ctx.strokeStyle = PAL.RAIL_DARK;
  ctx.lineWidth = 2;
  ctx.strokeRect(tableLeft + 1, tableTop + 1, tableWidth - 2, tableHeight - 2);

  // Next 3px RAIL_LIGHT band
  ctx.strokeStyle = PAL.RAIL_LIGHT;
  ctx.lineWidth = 1;
  ctx.strokeRect(tableLeft + 3, tableTop + 3, tableWidth - 6, tableHeight - 6);

  // Inner 1px RAIL_HI highlight lip
  ctx.strokeStyle = PAL.RAIL_HI;
  ctx.lineWidth = 1;
  ctx.strokeRect(px - 1, py - 1, pw + 2, ph + 2);

  // 2. Playfield Felt
  if (SPRITES.felt) {
    ctx.drawImage(SPRITES.felt, px, py);
  } else {
    ctx.fillStyle = PAL.FELT;
    ctx.fillRect(px, py, pw, ph);
  }

  ctx.strokeStyle = PAL.FELT_DARK;
  ctx.lineWidth = 1;
  ctx.strokeRect(px, py, pw, ph);

  // 3. Head string & Spots
  const headStrPx = physToPx(CFG.HEAD_STRING_X, 0).x;
  ctx.save();
  ctx.setLineDash([2, 4]);
  ctx.strokeStyle = PAL.FELT_LIGHT;
  ctx.beginPath();
  ctx.moveTo(Math.round(headStrPx), py);
  ctx.lineTo(Math.round(headStrPx), py + ph);
  ctx.stroke();
  ctx.restore();

  const headSpotPx = physToPx(CFG.HEAD_SPOT.x, CFG.HEAD_SPOT.y);
  const footSpotPx = physToPx(CFG.FOOT_SPOT.x, CFG.FOOT_SPOT.y);

  ctx.fillStyle = PAL.BRASS;
  ctx.fillRect(Math.round(headSpotPx.x - 1), Math.round(headSpotPx.y - 1), 3, 3);
  ctx.fillRect(Math.round(footSpotPx.x - 1), Math.round(footSpotPx.y - 1), 3, 3);

  // 4. Rail Diamonds
  const drawDiamond = (dx, dy) => {
    ctx.fillStyle = PAL.BRASS;
    ctx.fillRect(Math.round(dx), Math.round(dy - 1), 1, 3);
    ctx.fillRect(Math.round(dx - 1), Math.round(dy), 3, 1);
  };

  const diamondXs = [px + 100, px + 200, px + 300];
  diamondXs.forEach((dx) => {
    drawDiamond(dx, py - 7);
    drawDiamond(dx, py + ph + 7);
  });

  const diamondY = py + 100;
  drawDiamond(px - 7, diamondY);
  drawDiamond(px + pw + 7, diamondY);

  // 5. Pockets
  POCKETS.forEach((p) => {
    const pos = physToPx(p.x, p.y);
    const radius = p.r * CFG.PHYS_TO_PX;

    ctx.fillStyle = PAL.POCKET;
    ctx.beginPath();
    ctx.arc(Math.round(pos.x), Math.round(pos.y), radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = PAL.RAIL_DARK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.round(pos.x), Math.round(pos.y), radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = PAL.BLACK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.round(pos.x), Math.round(pos.y), radius - 1, Math.PI * 0.75, Math.PI * 1.75);
    ctx.stroke();
  });
}

// Render all balls
export function renderBalls(ctx, balls, matchState = null) {
  const time = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);

  // 1. Legal target ball halos
  if (matchState && matchState.turn === "PLAYER" && (matchState.phase === "AIMING" || matchState.phase === "CALL_POCKET")) {
    balls.forEach((ball) => {
      if (!ball.inPlay || ball.id === 0) return;
      const isLegal = isBallLegalFirstContact(ball.id, matchState, "PLAYER");
      if (isLegal) {
        const pos = physToPx(ball.x, ball.y);
        ctx.save();
        ctx.strokeStyle = ball.id === 8 ? PAL.BRASS : PAL.CYAN;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4 + 0.5 * pulse;
        ctx.beginPath();
        ctx.arc(Math.round(pos.x), Math.round(pos.y), 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  // 2. Ball shadows
  if (SPRITES.ballShadow) {
    balls.forEach((ball) => {
      if (!ball.inPlay) return;
      const pos = physToPx(ball.x, ball.y);
      ctx.drawImage(
        SPRITES.ballShadow,
        Math.round(pos.x - 4 + 1),
        Math.round(pos.y - 2 + 2)
      );
    });
  }

  // 3. Balls
  balls.forEach((ball) => {
    if (!ball.inPlay) return;
    const pos = physToPx(ball.x, ball.y);
    const frame = Math.floor((ball.distanceTravelled || 0) / 6) % 4;
    const sprite = SPRITES.balls[ball.id] ? SPRITES.balls[ball.id][frame] : null;

    if (sprite) {
      ctx.drawImage(
        sprite,
        Math.round(pos.x - 4.5),
        Math.round(pos.y - 4.5)
      );
    }
  });
}

// Render Cue Stick (Tip is nearest cue ball at x=pullback, butt points away)
export function renderCueStick(ctx, cueBall, aimAngle, power = 0, cueSkin = "DEFAULT") {
  if (!cueBall || !cueBall.inPlay || !SPRITES.cue) return;

  const pos = physToPx(cueBall.x, cueBall.y);
  // Ball radius is 4.5px on screen.
  // Tip starts 7px from center (2.5px gap from ball rim) when power = 0.
  // Pulls back up to 34px away from cue ball at 100% power.
  const pullback = 7 + power * 27;

  ctx.save();
  ctx.translate(Math.round(pos.x), Math.round(pos.y));
  ctx.rotate(aimAngle + Math.PI); // Angle pointing away behind cue ball

  // Draw sprite (Tip is at x=0, butt is at x=55)
  ctx.drawImage(
    SPRITES.cue,
    Math.round(pullback),
    -2
  );

  ctx.restore();
}

// Render Aim Assist with Legal Target vs Foul Indicators
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

    // Aim Line
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = isLegalTarget ? PAL.WHITE : PAL.RED;
    ctx.lineWidth = 1;
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
      const targetLen = assistLevel === "HALF" ? 13 : 26;
      const targetEndPx = add(ghostPx, mul(targetNormal, targetLen));

      ctx.strokeStyle = isLegalTarget ? PAL.CYAN : PAL.RED;
      ctx.lineWidth = 1;
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
      ctx.lineWidth = 1;
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
    ctx.strokeStyle = PAL.WHITE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(cuePx.x), Math.round(cuePx.y));
    ctx.lineTo(Math.round(hitPx.x), Math.round(hitPx.y));
    ctx.stroke();

    if (hitCushionNormal) {
      const dotVal = dot(dir, hitCushionNormal);
      const reflectDir = sub(dir, mul(hitCushionNormal, 2 * dotVal));
      const bounceEndPx = add(hitPx, mul(reflectDir, 30));

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

  ctx.fillStyle = "rgba(0, 0, 0, 0.10)";
  for (let y = 1; y < h; y += 2) {
    ctx.fillRect(0, y, w, 1);
  }

  ctx.fillStyle = "rgba(5, 4, 9, 0.18)";
  ctx.fillRect(0, 0, w, 2);
  ctx.fillRect(0, h - 2, w, 2);
  ctx.fillRect(0, 0, 2, h);
  ctx.fillRect(w - 2, 0, 2, h);

  ctx.fillStyle = "rgba(5, 4, 9, 0.08)";
  ctx.fillRect(0, 2, w, 3);
  ctx.fillRect(0, h - 5, w, 3);
  ctx.fillRect(2, 0, 3, h);
  ctx.fillRect(w - 5, 0, 3, h);
}
