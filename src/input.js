import { CFG } from "./config.js";
import { PAL } from "./palette.js";
import { view } from "./view.js";
import { physToPx, pxToPhys } from "./render.js";
import { clamp, lerpAngle, dist, fromAngle, mul, sub, add, dot } from "./vec.js";

// Pointer travel, in base pixels, that corresponds to a full-power pull-back when
// there is room for it. Shorter travel is substituted automatically when the cue
// ball sits near an edge - see measureRearTravel.
const PULL_TRAVEL_PX = 80;
const MIN_PULL_TRAVEL_PX = 18;
const PULL_DEAD_ZONE_PX = 4;

export class InputController {
  constructor() {
    this.aimAngle = 0;
    this.targetAimAngle = 0;
    this.power = 0.40;
    this.spin = { x: 0, y: 0 }; // x: side spin (-1..1), y: top/back (-1..1)

    // Interaction states
    this.isDraggingAim = false;
    this.isDraggingPower = false;
    this.isDraggingSpin = false;
    this.isPullingBack = false;
    this.pullStartPos = { x: 0, y: 0 };
    this.pullStartRear = 0;
    this.pullTravel = PULL_TRAVEL_PX;
    this.atMaxPower = false;
    this.isPlacingBallInHand = false;

    this.ballInHandPos = { x: CFG.HEAD_SPOT.x, y: CFG.HEAD_SPOT.y };
    this.ballInHandValid = true;

    // Key states
    this.spaceCharging = false;
    this.spaceChargeTime = 0;
    this.fineLeftHeld = false;
    this.fineRightHeld = false;

    // UI Regions (base pixels)
    this.powerBarRect = { x: 474, y: 52, w: 32, h: 140 };
    this.shootBtn = { x: 472, y: 198, w: 36, h: 24 };
    this.spinWidgetRect = { x: 472, y: 236, w: 36, h: 36 };
    this.fineLeftBtn = { x: 8, y: 254, w: 22, h: 22 };
    this.fineRightBtn = { x: 34, y: 254, w: 22, h: 22 };
    this.pauseBtn = { x: 8, y: 8, w: 22, h: 22 };
  }

  resetSpin() {
    this.spin = { x: 0, y: 0 };
  }

  update(dt, matchState) {
    // 1. Aim smoothing
    this.aimAngle = lerpAngle(this.aimAngle, this.targetAimAngle, 0.5);

    // 2. Continuous fine aim when holding buttons/keys
    const fineRate = (0.04 * Math.PI) / 180;
    if (this.fineLeftHeld) {
      this.targetAimAngle -= fineRate;
      this.aimAngle = this.targetAimAngle;
    }
    if (this.fineRightHeld) {
      this.targetAimAngle += fineRate;
      this.aimAngle = this.targetAimAngle;
    }

    // 3. Spacebar power oscillation (smooth 2.0s period)
    if (this.spaceCharging) {
      this.spaceChargeTime += dt;
      const t = (this.spaceChargeTime % 2.0) / 2.0;
      const pingPong = t < 0.5 ? t * 2 : (1 - t) * 2;
      this.power = clamp(pingPong, CFG.MIN_POWER, CFG.MAX_POWER);
    }
  }

  isTouchingCueStick(px, py, cue) {
    if (!cue || !cue.inPlay) return false;
    const cuePx = physToPx(cue.x, cue.y);
    const aimDir = fromAngle(this.aimAngle);

    const toPointer = sub({ x: px, y: py }, cuePx);
    const rearDist = -(toPointer.x * aimDir.x + toPointer.y * aimDir.y);
    const perpDist = Math.abs(toPointer.x * (-aimDir.y) - toPointer.y * (-aimDir.x));

    const onBall = Math.hypot(toPointer.x, toPointer.y) <= 18;
    const onStick = rearDist >= 2 && rearDist <= 95 && perpDist <= 24;

    return onBall || onStick;
  }

  handlePointer(e, matchState, onShoot, onPause, onPlaceBall) {
    const cue = matchState.balls[0];
    const isHumanTurn = matchState.turn === "PLAYER";
    const canInteract = isHumanTurn && (matchState.phase === "AIMING" || matchState.phase === "BALL_IN_HAND" || matchState.phase === "PLACE_CUE_BREAK");

    if (!canInteract) return;

    // Hit-testing uses canvas-clamped coordinates; drags use the raw ones so a
    // finger that leaves the letterboxed canvas keeps contributing travel.
    const px = e.x;
    const py = e.y;
    const dragX = e.rawX !== undefined ? e.rawX : e.x;
    const dragY = e.rawY !== undefined ? e.rawY : e.y;

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

      // Check Dedicated SHOOT Button
      if (this.isInside(px, py, this.shootBtn)) {
        if (typeof onShoot === "function") {
          onShoot({
            angle: this.aimAngle,
            power: Math.max(CFG.MIN_POWER, this.power),
            spin: { ...this.spin },
          });
          this.resetSpin();
        }
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

      // Check Power Bar (broad interactive area on right)
      if (this.isInside(px, py, this.powerBarRect) || (px >= 460 && px <= 512 && py >= 44 && py <= 196)) {
        this.isDraggingPower = true;
        this.updatePowerFromBar(py);
        return;
      }

      // Check Cue Stick / Cue Ball Pull-Back
      if (this.isTouchingCueStick(px, py, cue)) {
        this.isPullingBack = true;
        this.pullStartPos = { x: px, y: py };
        const cuePx = physToPx(cue.x, cue.y);
        const aimDir = fromAngle(this.aimAngle);
        const toPointer = sub({ x: px, y: py }, cuePx);
        this.pullStartRear = Math.max(0, -(toPointer.x * aimDir.x + toPointer.y * aimDir.y));
        this.pullTravel = this.measureRearTravel(this.pullStartPos, aimDir);
        return;
      }

      // Default: Aiming on felt
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
      } else if (this.isPullingBack && cue && cue.inPlay) {
        const cuePx = physToPx(cue.x, cue.y);
        const aimDir = fromAngle(this.aimAngle);

        // Calculate both absolute rear distance from cue ball AND relative drag delta
        const toPointer = sub({ x: dragX, y: dragY }, cuePx);
        const absRearDist = -(toPointer.x * aimDir.x + toPointer.y * aimDir.y);
        const perpDist = Math.abs(toPointer.x * (-aimDir.y) - toPointer.y * (-aimDir.x));

        // Relative delta from where touch started (allows full power anywhere on table, even at edges!)
        const dragDelta = sub({ x: dragX, y: dragY }, this.pullStartPos);
        const deltaRear = -(dragDelta.x * aimDir.x + dragDelta.y * aimDir.y);
        const effectiveRear = Math.max(absRearDist, this.pullStartRear + deltaRear);

        // When user pushes stick back to 0 power (effectiveRear <= 4) or drags far sideways
        if (effectiveRear <= 4 || (perpDist > 42 && deltaRear < 20)) {
          this.power = 0;
          this.isPullingBack = false;
          this.isDraggingAim = true;
          const cuePhys = { x: cue.x, y: cue.y };
          const pointerPhys = pxToPhys(px, py);
          this.targetAimAngle = Math.atan2(pointerPhys.y - cuePhys.y, pointerPhys.x - cuePhys.x);
        } else {
          // Power travel is measured against the room actually available behind the
          // cue ball. With a fixed 80px requirement a cue ball near a rail could only
          // ever reach ~65% power, because the pointer ran out of screen first.
          const travel = this.pullTravel || PULL_TRAVEL_PX;
          const norm = clamp((effectiveRear - PULL_DEAD_ZONE_PX) / travel, 0, 1);
          this.power = clamp(Math.pow(norm, 1.15), 0, CFG.MAX_POWER);
          this.atMaxPower = this.power >= CFG.MAX_POWER - 0.001;
        }
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
        this.atMaxPower = false;
        if (this.power >= CFG.MIN_POWER && typeof onShoot === "function") {
          onShoot({
            angle: this.aimAngle,
            power: this.power,
            spin: { ...this.spin },
          });
          this.resetSpin();
        } else {
          this.power = 0.40;
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

      const stepDeg = e.shiftKey ? 0.02 : 0.15;
      const stepRad = (stepDeg * Math.PI) / 180;
      if (e.code === "ArrowLeft") {
        this.targetAimAngle -= stepRad;
        this.aimAngle = this.targetAimAngle;
      } else if (e.code === "ArrowRight") {
        this.targetAimAngle += stepRad;
        this.aimAngle = this.targetAimAngle;
      }

      if (e.code >= "Digit1" && e.code <= "Digit9") {
        this.power = parseInt(e.code.slice(5), 10) * 0.1;
      } else if (e.code === "Digit0") {
        this.power = 1.0;
      }

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
            power: Math.max(CFG.MIN_POWER, this.power),
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

    if (len < 0.12) {
      sx = 0;
      sy = 0;
    }

    this.spin = { x: sx, y: sy };
  }

  updateBallInHand(px, py, matchState) {
    const phys = pxToPhys(px, py);
    const r = CFG.BALL_R;

    let valid = true;
    let clampedX = clamp(phys.x, r, CFG.TABLE_W - r);
    let clampedY = clamp(phys.y, r, CFG.TABLE_H - r);

    if (matchState.ballInHandBehindLine) {
      if (clampedX > CFG.HEAD_STRING_X - r) {
        clampedX = CFG.HEAD_STRING_X - r;
        valid = false;
      }
    }

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

  // How far the pointer can travel straight backwards from `from` before it runs off
  // the reachable area. Clamped so full power always stays achievable, and so a cue
  // ball in open space still uses the familiar 80px stroke.
  measureRearTravel(from, aimDir) {
    const b = (view && view.baseBounds) || { minX: 0, minY: 0, maxX: CFG.BASE_W, maxY: CFG.BASE_H };
    const dx = -aimDir.x;
    const dy = -aimDir.y;

    let room = Infinity;
    if (dx > 0.0001) room = Math.min(room, (b.maxX - from.x) / dx);
    else if (dx < -0.0001) room = Math.min(room, (b.minX - from.x) / dx);
    if (dy > 0.0001) room = Math.min(room, (b.maxY - from.y) / dy);
    else if (dy < -0.0001) room = Math.min(room, (b.minY - from.y) / dy);

    if (!isFinite(room)) room = PULL_TRAVEL_PX;
    // Leave a 2px margin so the very last pixel of screen is not required.
    const usable = room - 2 - PULL_DEAD_ZONE_PX + this.pullStartRear;
    return clamp(usable, MIN_PULL_TRAVEL_PX, PULL_TRAVEL_PX);
  }

  // Pause control on its own, for phases where the full control overlay is hidden.
  renderPauseButton(ctx) {
    const b = this.pauseBtn;
    ctx.fillStyle = PAL.SLATE;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = PAL.CYAN;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("=", b.x + b.w / 2, b.y + b.h / 2);
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
    ctx.strokeStyle = PAL.CYAN;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.pauseBtn.x, this.pauseBtn.y, this.pauseBtn.w, this.pauseBtn.h);
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("=", this.pauseBtn.x + this.pauseBtn.w / 2, this.pauseBtn.y + this.pauseBtn.h / 2);

    // 3. Vibrant Power Bar with Neon segments & Power percentage readout
    const bar = this.powerBarRect;
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4);
    ctx.strokeStyle = this.isDraggingPower || this.isPullingBack ? PAL.CYAN : PAL.SLATE;
    ctx.lineWidth = 1;
    ctx.strokeRect(bar.x - 2, bar.y - 2, bar.w + 4, bar.h + 4);

    // Header label: PWR & numeric percentage
    ctx.fillStyle = PAL.BRASS;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PWR", bar.x + bar.w / 2, bar.y - 8);

    const numSegments = 10;
    const segH = Math.floor((bar.h - 8) / numSegments);
    const activeSegments = Math.round(this.power * numSegments);

    for (let s = 0; s < numSegments; s++) {
      const segIndexFromBottom = numSegments - 1 - s;
      const segY = bar.y + 4 + segIndexFromBottom * (segH + 1);
      const isActive = s < activeSegments;

      let segColor = PAL.DARK;
      if (isActive) {
        if (s <= 3) segColor = PAL.GREEN;        // Emerald Green (0..40%)
        else if (s <= 6) segColor = PAL.YELLOW;  // Gold (40..70%)
        else if (s <= 8) segColor = PAL.ORANGE;  // Orange (70..90%)
        else segColor = PAL.RED;                 // Blazing Crimson (90..100%)
      }

      ctx.fillStyle = segColor;
      ctx.fillRect(bar.x + 2, segY, bar.w - 4, segH);
    }

    // Power percentage indicator below slider
    const maxed = this.power >= CFG.MAX_POWER - 0.001;
    ctx.fillStyle = maxed ? PAL.RED : PAL.CYAN;
    ctx.fillText(maxed ? "MAX" : `${Math.round(this.power * 100)}%`, bar.x + bar.w / 2, bar.y + bar.h + 8);

    // 4. Dedicated HIT / SHOOT Button
    const sb = this.shootBtn;
    ctx.fillStyle = this.isPullingBack ? PAL.RED : PAL.GREEN;
    ctx.fillRect(sb.x, sb.y, sb.w, sb.h);
    ctx.strokeStyle = PAL.WHITE;
    ctx.lineWidth = 1;
    ctx.strokeRect(sb.x, sb.y, sb.w, sb.h);
    ctx.fillStyle = PAL.DARKEST;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("HIT", sb.x + sb.w / 2, sb.y + sb.h / 2);

    // 5. Spin Control Widget (34x34 cue ball disc)
    const sw = this.spinWidgetRect;
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(sw.x, sw.y, sw.w, sw.h);
    ctx.strokeStyle = PAL.SLATE;
    ctx.lineWidth = 1;
    ctx.strokeRect(sw.x, sw.y, sw.w, sw.h);

    const scx = sw.x + sw.w / 2;
    const scy = sw.y + sw.h / 2;
    ctx.fillStyle = PAL.WHITE;
    ctx.beginPath();
    ctx.arc(scx, scy, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAL.SILVER;
    ctx.stroke();

    const markerX = scx + this.spin.x * 12;
    const markerY = scy - this.spin.y * 12;
    ctx.fillStyle = PAL.RED;
    ctx.fillRect(Math.round(markerX - 1.5), Math.round(markerY - 1.5), 3, 3);

    // 6. Ball-in-Hand Ghost Placement Display
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
