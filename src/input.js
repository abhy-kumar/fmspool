import { CFG } from "./config.js";
import { PAL } from "./palette.js";
import { physToPx, pxToPhys } from "./render.js";
import { clamp, lerpAngle, dist, fromAngle, mul, sub, add } from "./vec.js";

export class InputController {
  constructor() {
    this.aimAngle = 0;
    this.targetAimAngle = 0;
    this.power = 0.3;
    this.spin = { x: 0, y: 0 }; // x: side spin (-1..1), y: top/back (-1..1)

    // Interaction states
    this.isDraggingAim = false;
    this.isDraggingPower = false;
    this.isDraggingSpin = false;
    this.isPullingBack = false;
    this.isPlacingBallInHand = false;

    this.pullBackStart = null;
    this.ballInHandPos = { x: CFG.HEAD_SPOT.x, y: CFG.HEAD_SPOT.y };
    this.ballInHandValid = true;

    // Key states
    this.spaceCharging = false;
    this.spaceChargeDir = 1;
    this.spaceChargeTime = 0;
    this.fineLeftHeld = false;
    this.fineRightHeld = false;

    // UI Regions (base pixels)
    this.powerBarRect = { x: 486, y: 70, w: 14, h: 140 };
    this.spinWidgetRect = { x: 466, y: 242, w: 36, h: 36 };
    this.fineLeftBtn = { x: 8, y: 254, w: 20, h: 20 };
    this.fineRightBtn = { x: 32, y: 254, w: 20, h: 20 };
    this.pauseBtn = { x: 8, y: 8, w: 22, h: 22 };
  }

  resetSpin() {
    this.spin = { x: 0, y: 0 };
  }

  update(dt, matchState) {
    // 1. Aim smoothing (1-frame exponential filter)
    this.aimAngle = lerpAngle(this.aimAngle, this.targetAimAngle, 0.5);

    // 2. Continuous fine aim when holding buttons/keys
    const fineRate = (0.04 * Math.PI) / 180; // 0.04 deg/frame
    if (this.fineLeftHeld) {
      this.targetAimAngle -= fineRate;
      this.aimAngle = this.targetAimAngle;
    }
    if (this.fineRightHeld) {
      this.targetAimAngle += fineRate;
      this.aimAngle = this.targetAimAngle;
    }

    // 3. Spacebar power oscillation (0 -> 1 over 1.2s)
    if (this.spaceCharging) {
      this.spaceChargeTime += dt;
      const t = (this.spaceChargeTime % 1.2) / 1.2;
      const pingPong = t < 0.5 ? t * 2 : (1 - t) * 2;
      this.power = clamp(pingPong, CFG.MIN_POWER, CFG.MAX_POWER);
    }
  }

  handlePointer(e, matchState, onShoot, onPause, onPlaceBall) {
    const cue = matchState.balls[0];
    const isHumanTurn = matchState.turn === "PLAYER";
    const canInteract = isHumanTurn && (matchState.phase === "AIMING" || matchState.phase === "BALL_IN_HAND" || matchState.phase === "PLACE_CUE_BREAK");

    if (!canInteract) return;

    const px = e.x;
    const py = e.y;

    if (e.type === "pointerdown") {
      // Check Pause button
      if (this.isInside(px, py, this.pauseBtn)) {
        if (typeof onPause === "function") onPause();
        return;
      }

      // Check Ball in Hand Placement Phase
      if (matchState.phase === "BALL_IN_HAND" || matchState.phase === "PLACE_CUE_BREAK") {
        this.isPlacingBallInHand = true;
        this.updateBallInHand(px, py, matchState);
        return;
      }

      // Check Fine Aim Buttons
      if (this.isInside(px, py, this.fineLeftBtn)) {
        this.targetAimAngle -= (0.15 * Math.PI) / 180;
        this.fineLeftHeld = true;
        return;
      }
      if (this.isInside(px, py, this.fineRightBtn)) {
        this.targetAimAngle += (0.15 * Math.PI) / 180;
        this.fineRightHeld = true;
        return;
      }

      // Check Spin Widget
      if (this.isInside(px, py, this.spinWidgetRect)) {
        this.isDraggingSpin = true;
        this.updateSpin(px, py);
        return;
      }

      // Check Power Bar
      if (this.isInside(px, py, this.powerBarRect)) {
        this.isDraggingPower = true;
        this.updatePowerFromBar(py);
        return;
      }

      // Check Pull-back on Cue Ball
      if (cue && cue.inPlay) {
        const cuePx = physToPx(cue.x, cue.y);
        const dToCue = Math.hypot(px - cuePx.x, py - cuePx.y);
        if (dToCue < 18) {
          this.isPullingBack = true;
          this.pullBackStart = { x: px, y: py };
          return;
        }
      }

      // Default: Coarse Aiming on table
      if (cue && cue.inPlay && this.isInsidePlayfield(px, py)) {
        this.isDraggingAim = true;
        const cuePhys = { x: cue.x, y: cue.y };
        const pointerPhys = pxToPhys(px, py);
        this.targetAimAngle = Math.atan2(pointerPhys.y - cuePhys.y, pointerPhys.x - cuePhys.x);
        this.aimAngle = this.targetAimAngle;
      }
    } else if (e.type === "pointermove") {
      if (this.isPlacingBallInHand) {
        this.updateBallInHand(px, py, matchState);
      } else if (this.isDraggingSpin) {
        this.updateSpin(px, py);
      } else if (this.isDraggingPower) {
        this.updatePowerFromBar(py);
      } else if (this.isPullingBack) {
        // Drag away from aim direction
        const cuePx = physToPx(cue.x, cue.y);
        const aimDir = fromAngle(this.aimAngle);
        const pointerVec = sub({ x: px, y: py }, cuePx);
        // Project onto opposite of aim direction
        const dragDist = -(pointerVec.x * aimDir.x + pointerVec.y * aimDir.y);
        this.power = clamp(dragDist / 90, CFG.MIN_POWER, CFG.MAX_POWER);
      } else if (this.isDraggingAim && cue && cue.inPlay) {
        const cuePhys = { x: cue.x, y: cue.y };
        const pointerPhys = pxToPhys(px, py);
        this.targetAimAngle = Math.atan2(pointerPhys.y - cuePhys.y, pointerPhys.x - cuePhys.x);
      }
    } else if (e.type === "pointerup" || e.type === "pointercancel") {
      if (this.fineLeftHeld) this.fineLeftHeld = false;
      if (this.fineRightHeld) this.fineRightHeld = false;
      if (this.isDraggingSpin) this.isDraggingSpin = false;
      if (this.isDraggingPower) this.isDraggingPower = false;
      if (this.isDraggingAim) this.isDraggingAim = false;

      if (this.isPlacingBallInHand) {
        this.isPlacingBallInHand = false;
        if (this.ballInHandValid && typeof onPlaceBall === "function") {
          onPlaceBall(this.ballInHandPos);
        }
      }

      if (this.isPullingBack) {
        this.isPullingBack = false;
        if (this.power >= CFG.MIN_POWER && typeof onShoot === "function") {
          onShoot({
            angle: this.aimAngle,
            power: this.power,
            spin: { ...this.spin },
          });
          this.resetSpin();
        }
      }
    }
  }

  handleKey(e, matchState, onShoot, onPause) {
    const isHumanTurn = matchState.turn === "PLAYER" && matchState.phase === "AIMING";

    if (e.type === "keydown") {
      if (e.code === "Escape") {
        if (typeof onPause === "function") onPause();
        return;
      }

      if (!isHumanTurn) return;

      // Fine aim keys
      const stepDeg = e.shiftKey ? 0.02 : 0.15;
      const stepRad = (stepDeg * Math.PI) / 180;
      if (e.code === "ArrowLeft") {
        this.targetAimAngle -= stepRad;
        this.aimAngle = this.targetAimAngle;
      } else if (e.code === "ArrowRight") {
        this.targetAimAngle += stepRad;
        this.aimAngle = this.targetAimAngle;
      }

      // Direct Power Keys 1..9, 0
      if (e.code >= "Digit1" && e.code <= "Digit9") {
        this.power = parseInt(e.code.slice(5), 10) * 0.1;
      } else if (e.code === "Digit0") {
        this.power = 1.0;
      }

      // Space to charge shot
      if (e.code === "Space" && !this.spaceCharging && !e.repeat) {
        this.spaceCharging = true;
        this.spaceChargeTime = 0;
      }
    } else if (e.type === "keyup") {
      if (e.code === "Space" && this.spaceCharging) {
        this.spaceCharging = false;
        if (isHumanTurn && typeof onShoot === "function") {
          onShoot({
            angle: this.aimAngle,
            power: this.power,
            spin: { ...this.spin },
          });
          this.resetSpin();
        }
      }
    }
  }

  updatePowerFromBar(py) {
    const bar = this.powerBarRect;
    const relY = py - bar.y;
    const normalized = 1 - clamp(relY / bar.h, 0, 1);
    this.power = clamp(normalized, CFG.MIN_POWER, CFG.MAX_POWER);
  }

  updateSpin(px, py) {
    const widget = this.spinWidgetRect;
    const cx = widget.x + widget.w / 2;
    const cy = widget.y + widget.h / 2;
    const radius = 15;

    let sx = (px - cx) / radius;
    let sy = -(py - cy) / radius;

    const len = Math.hypot(sx, sy);
    if (len > 1) {
      sx /= len;
      sy /= len;
    }

    // Snap to zero if very close to center
    if (len < 0.12) {
      sx = 0;
      sy = 0;
    }

    this.spin = { x: sx, y: sy };
  }

  updateBallInHand(px, py, matchState) {
    const phys = pxToPhys(px, py);
    const r = CFG.BALL_R;

    // Bounds check
    let valid = true;
    let clampedX = clamp(phys.x, r, CFG.TABLE_W - r);
    let clampedY = clamp(phys.y, r, CFG.TABLE_H - r);

    // Behind head string constraint if applicable
    if (matchState.ballInHandBehindLine) {
      if (clampedX > CFG.HEAD_STRING_X - r) {
        clampedX = CFG.HEAD_STRING_X - r;
        valid = false;
      }
    }

    // Ball overlap check against in-play object balls
    for (let i = 1; i <= 15; i++) {
      const b = matchState.balls[i];
      if (!b || !b.inPlay) continue;
      if (Math.hypot(clampedX - b.x, clampedY - b.y) < r * 2 + 1) {
        valid = false;
        break;
      }
    }

    this.ballInHandPos = { x: clampedX, y: clampedY };
    this.ballInHandValid = valid;
  }

  isInside(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
  }

  isInsidePlayfield(px, py) {
    return (
      px >= CFG.PLAYFIELD_PX.x &&
      px <= CFG.PLAYFIELD_PX.x + CFG.PLAYFIELD_PX.w &&
      py >= CFG.PLAYFIELD_PX.y &&
      py <= CFG.PLAYFIELD_PX.y + CFG.PLAYFIELD_PX.h
    );
  }

  renderControls(ctx, matchState) {
    // 1. Fine Aim Buttons (◀ ▶)
    const drawBtn = (btn, text, held) => {
      ctx.fillStyle = held ? PAL.GREY : PAL.SLATE;
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.strokeStyle = held ? PAL.CYAN : PAL.SILVER;
      ctx.lineWidth = 1;
      ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
      ctx.fillStyle = PAL.WHITE;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, btn.x + btn.w / 2, btn.y + btn.h / 2 + (held ? 1 : 0));
    };

    drawBtn(this.fineLeftBtn, "<", this.fineLeftHeld);
    drawBtn(this.fineRightBtn, ">", this.fineRightHeld);

    // 2. Pause Menu Button (☰)
    ctx.fillStyle = PAL.SLATE;
    ctx.fillRect(this.pauseBtn.x, this.pauseBtn.y, this.pauseBtn.w, this.pauseBtn.h);
    ctx.strokeStyle = PAL.SILVER;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.pauseBtn.x, this.pauseBtn.y, this.pauseBtn.w, this.pauseBtn.h);
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("=", this.pauseBtn.x + this.pauseBtn.w / 2, this.pauseBtn.y + this.pauseBtn.h / 2);

    // 3. Power Bar (7 discrete chunky retro segments)
    const bar = this.powerBarRect;
    // Outer border
    ctx.fillStyle = PAL.DARK;
    ctx.fillRect(bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4);
    ctx.strokeStyle = PAL.SILVER;
    ctx.strokeRect(bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4);

    const numSegments = 7;
    const segH = Math.floor((bar.h - 6) / numSegments);
    const activeSegments = Math.round(this.power * numSegments);

    for (let s = 0; s < numSegments; s++) {
      const segIndexFromBottom = numSegments - 1 - s;
      const segY = bar.y + 3 + segIndexFromBottom * (segH + 1);
      const isActive = s < activeSegments;

      let segColor = PAL.DARKEST;
      if (isActive) {
        if (s <= 2) segColor = PAL.GREEN;        // 0..0.4
        else if (s <= 5) segColor = PAL.YELLOW;  // 0.4..0.75
        else segColor = PAL.RED;                 // 0.75..1.0
      }

      ctx.fillStyle = segColor;
      ctx.fillRect(bar.x, segY, bar.w, segH);
    }

    // 4. Spin Control Widget (34x34 cue ball disc)
    const sw = this.spinWidgetRect;
    ctx.fillStyle = PAL.DARK;
    ctx.fillRect(sw.x, sw.y, sw.w, sw.h);
    ctx.strokeStyle = PAL.SILVER;
    ctx.lineWidth = 1;
    ctx.strokeRect(sw.x, sw.y, sw.w, sw.h);

    const scx = sw.x + sw.w / 2;
    const scy = sw.y + sw.h / 2;
    // Cue disc
    ctx.fillStyle = PAL.WHITE;
    ctx.beginPath();
    ctx.arc(scx, scy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.SILVER;
    ctx.stroke();

    // Red spin marker (3x3)
    const markerX = scx + this.spin.x * 12;
    const markerY = scy - this.spin.y * 12;
    ctx.fillStyle = PAL.RED;
    ctx.fillRect(Math.round(markerX - 1.5), Math.round(markerY - 1.5), 3, 3);

    // 5. Ball-in-Hand Ghost Placement Display
    if (this.isPlacingBallInHand || matchState.phase === "BALL_IN_HAND" || matchState.phase === "PLACE_CUE_BREAK") {
      const gpx = physToPx(this.ballInHandPos.x, this.ballInHandPos.y);
      ctx.strokeStyle = this.ballInHandValid ? PAL.CYAN : PAL.RED;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(Math.round(gpx.x), Math.round(gpx.y), CFG.BALL_R * CFG.PHYS_TO_PX, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
