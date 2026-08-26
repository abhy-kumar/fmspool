import { CFG } from "./config.js";
import { PAL } from "./palette.js";
import { physToPx, pxToPhys } from "./render.js";
import { clamp, lerpAngle, dist, fromAngle, mul, sub, add, dot } from "./vec.js";

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

    // Fine aim buttons at bottom-left outside cushions
    this.fineLeftBtn = { x: 8, y: 258, w: 20, h: 20 };
    this.fineRightBtn = { x: 32, y: 258, w: 20, h: 20 };

    // Pause / Menu button in Top HUD bar (y=0..46, zero overlap!)
    this.pauseBtn = { x: 8, y: 11, w: 24, h: 24 };
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

    const px = e.x;
    const py = e.y;

    if (e.type === "pointerdown") {
      // Check Pause / Menu button in Top HUD bar (always clickable)
      if (this.isInside(px, py, this.pauseBtn)) {
        if (typeof onPause === "function") onPause();
        return;
      }

      if (!canInteract) return;

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

      // Check Power Bar (interactive slider on right)
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
      if (!canInteract) return;

      if (this.isPlacingBallInHand) {
        this.updateBallInHand(px, py, matchState);
      } else if (this.isDraggingSpin) {
        this.updateSpin(px, py);
      } else if (this.isDraggingPower) {
        this.updatePowerFromBar(py);
      } else if (this.isPullingBack && cue && cue.inPlay) {
        const cuePx = physToPx(cue.x, cue.y);
        const aimDir = fromAngle(this.aimAngle);

        const toPointer = sub({ x: px, y: py }, cuePx);
        const absRearDist = -(toPointer.x * aimDir.x + toPointer.y * aimDir.y);
        const perpDist = Math.abs(toPointer.x * (-aimDir.y) - toPointer.y * (-aimDir.x));

        const dragDelta = sub({ x: px, y: py }, this.pullStartPos);
        const deltaRear = -(dragDelta.x * aimDir.x + dragDelta.y * aimDir.y);
        const effectiveRear = Math.max(absRearDist, this.pullStartRear + deltaRear);

        if (effectiveRear <= 4 || (perpDist > 42 && deltaRear < 20)) {
          this.power = 0;
          this.isPullingBack = false;
          this.isDraggingAim = true;
          const cuePhys = { x: cue.x, y: cue.y };
          const pointerPhys = pxToPhys(px, py);
          this.targetAimAngle = Math.atan2(pointerPhys.y - cuePhys.y, pointerPhys.x - cuePhys.x);
        } else {
          const norm = clamp((effectiveRear - 4) / 80, 0, 1);
          this.power = clamp(Math.pow(norm, 1.15), 0, CFG.MAX_POWER);
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

  renderPauseButton(ctx) {
    // Menu / Pause Button inside Top HUD (x=8, y=11, w=24, h=24)
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(this.pauseBtn.x, this.pauseBtn.y, this.pauseBtn.w, this.pauseBtn.h);
    ctx.strokeStyle = PAL.CYAN;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.pauseBtn.x, this.pauseBtn.y, this.pauseBtn.w, this.pauseBtn.h);
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("=", this.pauseBtn.x + this.pauseBtn.w / 2, this.pauseBtn.y + this.pauseBtn.h / 2);
  }

  renderControls(ctx, matchState) {
    // 1. Fine Aim Buttons (◀ ▶) at bottom-left
    const drawBtn = (btn, text, held) => {
      ctx.fillStyle = held ? PAL.SLATE : PAL.DARKEST;
      ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
      ctx.strokeStyle = held ? PAL.CYAN : PAL.SLATE;
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

    // 2. Vibrant Power Bar with Neon segments & Power percentage readout
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
        if (s <= 3) segColor = PAL.GREEN;
        else if (s <= 6) segColor = PAL.YELLOW;
        else if (s <= 8) segColor = PAL.ORANGE || "#ff7700";
        else segColor = PAL.RED;
      }

      ctx.fillStyle = segColor;
      ctx.fillRect(bar.x + 2, segY, bar.w - 4, segH);
    }

    // Power percentage indicator below slider
    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`${Math.round(this.power * 100)}%`, bar.x + bar.w / 2, bar.y + bar.h + 8);

    // 3. Dedicated HIT / SHOOT Button
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

    // 4. Spin Control Widget (34x34 cue ball disc)
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
