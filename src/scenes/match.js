import { CFG, DIFFICULTY } from "../config.js";
import { PAL } from "../palette.js";
import { SPRITES, AI_PERSONALITIES } from "../sprites.js";
import { createMatchState, createShotReport, processPhysicsEvents, evaluateShot, countRemaining, getBallGroup, isBallLegalFirstContact } from "../rules.js";
import { step, allAtRest } from "../physics.js";
import { renderTable, renderBalls, renderCueStick, renderAimAssist, renderCRTEffect, renderRoomBackground, physToPx, pxToPhys } from "../render.js";
import { InputController } from "../input.js";
import { chooseShot, chooseBallInHand } from "../ai.js";
import { matchScore, getTier } from "../scoring.js";
import { loadSave, saveMatchSnapshot, clearMatchSnapshot, saveImmediate, loadSettings, unlockAchievement } from "../storage.js";
import { advanceTournamentRound } from "../tournament.js";
import { submitRun, checkQualifiesTop10 } from "../cloud.js";
import { renderPanel, renderButton, ArcadeKeyboard } from "../ui.js";
import { makeRng } from "../rng.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";
import { fromAngle, mul, dist, clamp, lerpAngle } from "../vec.js";
import { POCKETS } from "../table.js";

function wrapText(text, maxChars) {
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let cur = "";

  words.forEach((w) => {
    if ((cur + (cur ? " " : "") + w).length <= maxChars) {
      cur += (cur ? " " : "") + w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  });
  if (cur) lines.push(cur);
  return lines;
}

export const matchScene = {
  name: "match",
  state: null,
  input: null,
  difficultyId: "AMATEUR",
  modeKey: "EXHIBITION",
  tournamentBracket: null,
  tournamentRound: null,
  opponentName: "CHALK",

  // Shot resolution
  shotReport: null,
  shotTimer: 0,
  lastShotPower: 0.5,

  // AI Animation State
  aiThinkingTimer: 0,
  aiThinkingTotal: 1.0,
  aiPlannedShot: null,
  aiCueAngle: 0,
  aiCuePower: 0,
  aiPhase: "IDLE",
  aiAnimProgress: 0,
  aiPlanWaited: 0,
  aiPlanError: false,

  // UI / Modals
  pauseOpen: false,
  resultsOpen: false,
  resultsData: null,
  arcadeKeyboard: null,
  top10Rank: null,
  achievementToast: null,
  toastTimer: 0,

  enter(params = {}) {
    audio.playTrack("MATCH");
    this.input = new InputController();
    this.pauseOpen = false;
    this.resultsOpen = false;
    this.arcadeKeyboard = null;
    this.aiPhase = "IDLE";
    this.settings = loadSettings();
    this.achievementToast = null;
    this.toastTimer = 0;

    const save = loadSave();

    if (params.resume && save.activeMatch) {
      this.state = save.activeMatch;
      this.tournamentBracket = save.activeTournament || null;
      this.difficultyId = params.difficulty || "AMATEUR";
      this.modeKey = this.tournamentBracket ? "T_QUARTER" : "RANKED";
    } else {
      this.difficultyId = params.difficulty || "AMATEUR";
      this.modeKey = params.mode || "EXHIBITION";
      this.tournamentBracket = params.bracket || save.activeTournament || null;
      this.tournamentRound = params.round || null;
      this.state = createMatchState(Date.now(), "PLAYER");
    }

    // Pick opponent name based on tournament or randomized pool
    if (this.tournamentBracket) {
      const b = this.tournamentBracket;
      if (b.round === "QF" && b.qf && b.qf[0] && b.qf[0].p2) {
        this.opponentName = b.qf[0].p2.name;
      } else if (b.round === "SF" && b.sf && b.sf[0] && b.sf[0].p2) {
        this.opponentName = b.sf[0].p2.name;
      } else if (b.round === "FINAL" && b.finals && b.finals[0] && b.finals[0].p2) {
        this.opponentName = b.finals[0].p2.name;
      } else {
        const pool = AI_PERSONALITIES.filter((a) => a.tier === this.difficultyId);
        this.opponentName = pool.length ? pool[Math.floor(Math.random() * pool.length)].name : "CHALK";
      }
    } else {
      const pool = AI_PERSONALITIES.filter((a) => a.tier === this.difficultyId);
      this.opponentName = pool.length ? pool[Math.floor(Math.random() * pool.length)].name : "CHALK";
    }

    // Ensure stats are never uninitialized
    if (!this.state.stats) {
      this.state.stats = { PLAYER: {}, AI: {} };
    }
    this.state.stats.PLAYER = this.state.stats.PLAYER || {};
    this.state.stats.AI = this.state.stats.AI || {};
    this.state.stats.PLAYER.totalShotSeconds = Number(this.state.stats.PLAYER.totalShotSeconds) || 0;
    this.state.stats.PLAYER.shots = Number(this.state.stats.PLAYER.shots) || 0;
    this.state.stats.PLAYER.ownPots = Number(this.state.stats.PLAYER.ownPots) || 0;
    this.state.lastShotTime = Date.now();

    this.input.aimAngle = 0;
    this.input.targetAimAngle = 0;
  },

  exit() {
    audio.stopMusic();
  },

  showAchievementToast(ach) {
    this.achievementToast = ach;
    this.toastTimer = 4.0;
    audio.playSfx("newRecord");
  },

  update(dt) {
    if (this.pauseOpen) return;

    if (this.arcadeKeyboard) {
      this.arcadeKeyboard.update(dt);
      return;
    }

    if (this.resultsOpen) return;

    // Toast Timer
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.achievementToast = null;
    }

    // Message timer countdown
    if (this.state.messageTimer > 0) {
      this.state.messageTimer -= dt;
    }

    // Human Input Update
    this.input.update(dt, this.state);

    // AI Turn State Machine
    if (this.state.turn === "AI") {
      this.updateAITurn(dt);
    }

    // Physics Shot Resolving
    if (this.state.phase === "SHOT_RESOLVING") {
      this.shotTimer += dt;

      const events = step(this.state, dt);
      if (events.length > 0) {
        processPhysicsEvents(this.shotReport, events, this.state);
        events.forEach((ev) => {
          if (ev.type === "ballHit") {
            audio.playSfx("ballHit", { speed: ev.speed });
          } else if (ev.type === "cushion") {
            audio.playSfx("cushion");
          } else if (ev.type === "pocket") {
            audio.playSfx("pocketDrop");
          }
        });
      }

      if (allAtRest(this.state) || this.shotTimer >= CFG.SETTLE_TIMEOUT_S) {
        this.state.balls.forEach((b) => { b.vx = 0; b.vy = 0; });
        this.finishShot();
      }
    }
  },

  updateAITurn(dt) {
    const diff = DIFFICULTY[this.difficultyId] || DIFFICULTY.AMATEUR;
    const rng = makeRng(this.state.seed + this.state.shotIndex * 31);

    if (this.state.phase === "BALL_IN_HAND" || this.state.phase === "PLACE_CUE_BREAK") {
      const pos = chooseBallInHand(this.state, diff, rng);
      const cue = this.state.balls[0];
      cue.x = pos.x;
      cue.y = pos.y;
      cue.inPlay = true;
      cue.pocketed = false;
      this.state.phase = "AIMING";
      this.state.ballInHand = false;
      this.aiPhase = "IDLE";
      return;
    }

    if (this.state.phase !== "AIMING") return;

    if (this.aiPhase === "IDLE") {
      this.aiPhase = "THINKING";
      this.aiThinkingTotal = (CFG.AI_THINK_MIN_MS + rng() * (CFG.AI_THINK_MAX_MS - CFG.AI_THINK_MIN_MS)) / 1000;
      this.aiThinkingTimer = 0;
      this.beginAIPlan(diff, rng);
    } else if (this.aiPhase === "THINKING") {
      this.aiThinkingTimer += dt;
      this.aiPlanWaited += dt;
      if (!this.aiPlannedShot && this.aiPlanWaited > 6) {
        this.aiPlannedShot = this.fallbackAIShot();
      }
      if (this.aiThinkingTimer >= this.aiThinkingTotal && this.aiPlannedShot) {
        this.aiPhase = "ROTATING";
        this.aiAnimProgress = 0;
      }
    } else if (this.aiPhase === "ROTATING") {
      this.aiAnimProgress += dt / 0.35;
      const t = Math.min(1, this.aiAnimProgress);
      this.aiCueAngle = lerpAngle(this.aiCueAngle, this.aiPlannedShot.angle, t);

      if (t >= 1) {
        this.aiPhase = "PULLBACK";
        this.aiAnimProgress = 0;
      }
    } else if (this.aiPhase === "PULLBACK") {
      this.aiAnimProgress += dt / 0.25;
      const t = Math.min(1, this.aiAnimProgress);
      this.aiCuePower = this.aiPlannedShot.power * t;

      if (t >= 1) {
        this.aiPhase = "STRIKE";
        this.executeShot(this.aiPlannedShot);
        this.aiPhase = "IDLE";
        this.aiPlannedShot = null;
      }
    }
  },

  beginAIPlan(diff, rng) {
    this.aiPlannedShot = null;
    this.aiPlanError = false;
    this.aiPlanWaited = 0;

    chooseShot(this.state, diff, rng)
      .then((shot) => {
        this.aiPlannedShot = shot || this.fallbackAIShot();
        if (shot && shot.kind === "SAFETY") {
          this.state.message = `${this.opponentName}: SAFETY PLAY`;
          this.state.messageTimer = 2.0;
        }
      })
      .catch((err) => {
        console.error("[Match] AI shot planning failed, falling back", err);
        this.aiPlanError = true;
        this.aiPlannedShot = this.fallbackAIShot();
      });
  },

  fallbackAIShot() {
    const cue = this.state.balls[0];
    let target = null;
    let bestD = Infinity;
    for (let i = 1; i <= 15; i++) {
      const b = this.state.balls[i];
      if (!b || !b.inPlay) continue;
      if (!isBallLegalFirstContact(b.id, this.state, "AI")) continue;
      const d = dist(cue, b);
      if (d < bestD) { bestD = d; target = b; }
    }
    const angle = target ? Math.atan2(target.y - cue.y, target.x - cue.x) : 0;
    return {
      angle,
      power: 0.55,
      spin: { x: 0, y: 0 },
      kind: "POT",
      targetId: target ? target.id : 1,
    };
  },

  executeShot(shot) {
    const cue = this.state.balls[0];
    if (!cue || !cue.inPlay) return;

    this.lastShotPower = shot.power;
    audio.playSfx("cueStrike", { power: shot.power });
    audio.duckMusic(400);

    const dir = fromAngle(shot.angle);
    const speed = shot.power * CFG.POWER_TO_SPEED;
    cue.vx = dir.x * speed;
    cue.vy = dir.y * speed;
    cue.spin = { ...shot.spin };

    this.shotReport = createShotReport();
    this.shotTimer = 0;
    this.state.phase = "SHOT_RESOLVING";
  },

  finishShot() {
    const isPlayer = this.state.turn === "PLAYER";
    const result = evaluateShot(this.state, this.shotReport);

    if (result.foul) {
      audio.playSfx("foul");
    } else if (isPlayer) {
      // In-Match Achievement Triggers
      if (this.shotReport.breakPots >= 2) {
        const ach = unlockAchievement("SHOLAY_BREAK");
        if (ach) this.showAchievementToast(ach);
      }
      if (this.state.stats.PLAYER.currentRun >= 4) {
        const ach = unlockAchievement("WASSEYPUR_RUN");
        if (ach) this.showAchievementToast(ach);
      }
      const eightPotted = this.shotReport.pocketed.some((p) => p.ball.id === 8);
      if (eightPotted && this.lastShotPower >= 0.92) {
        const ach = unlockAchievement("DHONI_FINISH");
        if (ach) this.showAchievementToast(ach);
      }
    }

    if (this.state.phase === "GAME_OVER") {
      this.handleGameOver();
    } else {
      saveMatchSnapshot(this.state, this.tournamentBracket);
    }
  },

  async handleGameOver() {
    clearMatchSnapshot();
    const won = this.state.winner === "PLAYER";
    if (won) {
      audio.playTrack("VICTORY");
      if (this.difficultyId === "PRO" || this.difficultyId === "LEGEND") {
        const ach = unlockAchievement("DON_INTEZAAR");
        if (ach) this.showAchievementToast(ach);
      }
      if (this.state.stats.PLAYER.fouls === 0) {
        const ach = unlockAchievement("MR_INDIA");
        if (ach) this.showAchievementToast(ach);
      }
    } else {
      audio.playTrack("DEFEAT");
    }

    const yourBallsLeft = countRemaining(this.state.balls, this.state.groups.PLAYER);
    const oppBallsLeft = countRemaining(this.state.balls, this.state.groups.AI);

    const res = matchScore(
      this.state.stats.PLAYER,
      won,
      yourBallsLeft,
      oppBallsLeft,
      this.difficultyId,
      this.modeKey
    );

    if (won && res.components.P >= 0.85) {
      const ach = unlockAchievement("JOHN_WICK");
      if (ach) this.showAchievementToast(ach);
    }

    this.resultsData = {
      score: res.score,
      won,
      components: res.components,
      diffMult: res.diffMult,
      modeMult: res.modeMultiplier,
      coinsEarned: won ? 150 : 25,
    };

    const save = loadSave();
    save.career.matchesPlayed++;
    if (won) save.career.matchesWon++;
    save.career.shots += (this.state.stats.PLAYER.shots || 0);
    save.career.ownPots += (this.state.stats.PLAYER.ownPots || 0);
    save.career.fouls += (this.state.stats.PLAYER.fouls || 0);
    save.career.longestRun = Math.max(save.career.longestRun || 0, this.state.stats.PLAYER.longestRun || 0);
    save.career.bestRunScore = Math.max(save.career.bestRunScore || 0, res.score || 0);
    save.career.runsPlayed++;
    save.coins = (save.coins || 0) + this.resultsData.coinsEarned;

    // Advance Tournament Bracket if in tournament mode
    if (this.tournamentBracket) {
      advanceTournamentRound(this.tournamentBracket, won, res.score, makeRng(Date.now()));
      save.activeTournament = this.tournamentBracket;
    }

    saveImmediate(save);

    const qualifies = await checkQualifiesTop10(res.score);
    if (qualifies || !save.displayName || save.displayName === "PLAYER") {
      this.arcadeKeyboard = new ArcadeKeyboard(save.displayName, (enteredName) => {
        save.displayName = enteredName;
        saveImmediate(save);
        this.submitRunCloud(res.score, won);
        this.arcadeKeyboard = null;
        this.resultsOpen = true;
      }, () => {
        this.submitRunCloud(res.score, won);
        this.arcadeKeyboard = null;
        this.resultsOpen = true;
      });
    } else {
      this.submitRunCloud(res.score, won);
      this.resultsOpen = true;
    }
  },

  submitRunCloud(score, won) {
    const save = loadSave();
    submitRun(save.playerId, {
      score,
      mode: this.modeKey,
      difficulty: this.difficultyId,
      cup: this.tournamentBracket ? this.tournamentBracket.cupId : null,
      won,
      stats: {
        shots: this.state.stats.PLAYER.shots || 0,
        ownPots: this.state.stats.PLAYER.ownPots || 0,
        fouls: this.state.stats.PLAYER.fouls || 0,
        longestRun: this.state.stats.PLAYER.longestRun || 0,
        seconds: Math.round(this.state.stats.PLAYER.totalShotSeconds || 0),
      },
    }, save);
  },

  render(ctx) {
    const settings = this.settings || loadSettings();
    renderRoomBackground(ctx, settings.selectedBg || "DEFAULT");

    // 1. Render Pool Table & Pockets
    renderTable(ctx);

    // 2. Render Balls with halos
    renderBalls(ctx, this.state.balls, this.state);

    // 3. Render Aim Assist & Cue Stick
    if (this.state.phase === "AIMING" && this.state.balls[0] && this.state.balls[0].inPlay) {
      if (this.state.turn === "PLAYER") {
        renderAimAssist(ctx, this.state, this.input.aimAngle, settings.assistLevel);
        renderCueStick(ctx, this.state.balls[0], this.input.aimAngle, this.input.power, settings.selectedCue);
      } else if (this.state.turn === "AI" && (this.aiPhase === "ROTATING" || this.aiPhase === "PULLBACK")) {
        renderCueStick(ctx, this.state.balls[0], this.aiCueAngle, this.aiCuePower, "DEFAULT");
      }
    }

    // 4. Render HUD Strip
    this.renderHUD(ctx);

    // 5. Render Input Controls Overlay
    if (this.state.turn === "PLAYER") {
      this.input.renderControls(ctx, this.state);
    } else {
      this.input.renderPauseButton(ctx);
    }

    // 6. Achievement Unlock Toast Notification Banner
    if (this.achievementToast && this.toastTimer > 0) {
      this.renderAchievementToast(ctx);
    }

    // 7. Results Modal Overlay
    if (this.resultsOpen && this.resultsData) {
      this.renderResultsModal(ctx);
    }

    // 8. Arcade Keyboard
    if (this.arcadeKeyboard) {
      this.arcadeKeyboard.render(ctx, this.resultsData ? this.resultsData.score : null, this.top10Rank);
    }

    // 9. Pause Menu Overlay
    if (this.pauseOpen) {
      this.renderPauseModal(ctx);
    }

    renderCRTEffect(ctx);
  },

  renderAchievementToast(ctx) {
    const ach = this.achievementToast;
    const toastW = 340;
    const toastH = 46;
    const tx = Math.round(CFG.BASE_W / 2 - toastW / 2);
    const ty = 48;

    // Toast Container with Gold Border
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(tx, ty, toastW, toastH);
    ctx.strokeStyle = PAL.GOLD;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx, ty, toastW, toastH);

    // Title
    ctx.fillStyle = PAL.GOLD;
    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`ACHIEVEMENT: ${ach.title}`, tx + toastW / 2, ty + 6);

    // Pop culture quote (Cleanly wrapped)
    ctx.fillStyle = PAL.CYAN;
    ctx.font = '6px "Press Start 2P", monospace';
    const quoteLines = wrapText(`"${ach.quote}"`, 44);
    if (quoteLines[0]) ctx.fillText(quoteLines[0], tx + toastW / 2, ty + 18);
    if (quoteLines[1]) ctx.fillText(quoteLines[1], tx + toastW / 2, ty + 27);

    // Reward line
    ctx.fillStyle = PAL.YELLOW;
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillText(`+${ach.coins} COINS AWARDED`, tx + toastW / 2, ty + 36);
  },

  renderHUD(ctx) {
    const save = loadSave();

    // HUD Background (Top 46 px)
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(0, 0, CFG.BASE_W, 46);
    ctx.strokeStyle = PAL.SLATE;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, CFG.BASE_W, 46);

    // Menu / Pause Button on Far Left
    this.input.renderPauseButton(ctx);

    // Player Block (Left)
    ctx.fillStyle = this.state.turn === "PLAYER" ? PAL.CYAN : PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(save.displayName || "PLAYER", 38, 6);

    const pGroup = this.state.groups.PLAYER;
    if (pGroup) {
      const gBallId = pGroup === "SOLIDS" ? 1 : 9;
      if (SPRITES.balls[gBallId]) ctx.drawImage(SPRITES.balls[gBallId][0], 38, 18);
      ctx.fillStyle = PAL.SILVER;
      ctx.fillText(`${pGroup}`, 52, 19);

      const startBall = pGroup === "SOLIDS" ? 1 : 9;
      const endBall = pGroup === "SOLIDS" ? 7 : 15;
      let dotX = 38;
      for (let bId = startBall; bId <= endBall; bId++) {
        const bObj = this.state.balls[bId];
        const isPotted = !bObj || !bObj.inPlay;
        ctx.fillStyle = isPotted ? PAL.DARK : (pGroup === "SOLIDS" ? PAL.YELLOW : PAL.BLUE);
        ctx.fillRect(dotX, 32, 6, 6);
        ctx.strokeStyle = PAL.SLATE;
        ctx.strokeRect(dotX, 32, 6, 6);
        dotX += 9;
      }
      const eightObj = this.state.balls[8];
      const eightPotted = !eightObj || !eightObj.inPlay;
      ctx.fillStyle = eightPotted ? PAL.DARK : PAL.DARKEST;
      ctx.fillRect(dotX + 3, 32, 6, 6);
      ctx.strokeStyle = PAL.BRASS;
      ctx.strokeRect(dotX + 3, 32, 6, 6);
    } else {
      ctx.fillStyle = PAL.GREEN;
      ctx.fillText("OPEN TABLE", 38, 20);
      ctx.fillStyle = PAL.SILVER;
      ctx.fillText("ANY BALL (EXCEPT 8)", 38, 32);
    }

    // AI Block (Right)
    const portrait = SPRITES.portraits[this.opponentName] || SPRITES.portraits["CHALK"];
    if (portrait) {
      ctx.drawImage(portrait, CFG.BASE_W - 22, 6);
    }

    ctx.fillStyle = this.state.turn === "AI" ? PAL.CYAN : PAL.WHITE;
    ctx.textAlign = "right";
    ctx.fillText(this.opponentName, CFG.BASE_W - 26, 6);

    const aiGroup = this.state.groups.AI;
    if (aiGroup) {
      ctx.fillStyle = PAL.SILVER;
      ctx.fillText(`${aiGroup}`, CFG.BASE_W - 26, 19);

      const startBall = aiGroup === "SOLIDS" ? 1 : 9;
      const endBall = aiGroup === "SOLIDS" ? 7 : 15;
      let dotX = CFG.BASE_W - 26;
      for (let bId = endBall; bId >= startBall; bId--) {
        const bObj = this.state.balls[bId];
        const isPotted = !bObj || !bObj.inPlay;
        ctx.fillStyle = isPotted ? PAL.DARK : (aiGroup === "SOLIDS" ? PAL.YELLOW : PAL.BLUE);
        ctx.fillRect(dotX - 6, 32, 6, 6);
        ctx.strokeStyle = PAL.SLATE;
        ctx.strokeRect(dotX - 6, 32, 6, 6);
        dotX -= 9;
      }
    } else {
      ctx.fillStyle = PAL.GREY;
      ctx.fillText("OPEN", CFG.BASE_W - 26, 20);
    }

    // Center: Turn Banner & Game Messages
    const msgX = Math.round(CFG.BASE_W / 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    if (this.state.message && this.state.messageTimer > 0) {
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = PAL.BLACK;
      ctx.fillText(this.state.message, msgX + 1, 15);
      ctx.fillStyle = PAL.YELLOW;
      ctx.fillText(this.state.message, msgX, 14);
    } else {
      const isPlayer = this.state.turn === "PLAYER";
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = isPlayer ? PAL.CYAN : PAL.MAGENTA;
      ctx.fillText(isPlayer ? "YOUR TURN" : `${this.opponentName}'S TURN`, msgX, 14);
    }
  },

  renderResultsModal(ctx) {
    ctx.fillStyle = "rgba(10, 8, 20, 0.90)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    const r = this.resultsData;
    const title = r.won ? "VICTORY!" : "DEFEAT";
    renderPanel(ctx, 46, 24, 420, 240, title);

    ctx.fillStyle = r.won ? PAL.BRASS : PAL.RED;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`FINAL SCORE: ${r.score}`, 256, 46);

    const metrics = [
      { key: "VICTORY (V)", val: r.components.V },
      { key: "DOMINANCE (D)", val: r.components.D },
      { key: "PRECISION (P)", val: r.components.P },
      { key: "DISCIPLINE (C)", val: r.components.C },
      { key: "FLAIR (F)", val: r.components.F },
      { key: "TEMPO (T)", val: r.components.T },
    ];

    const barStartX = 200;
    const barW = 120;
    const startY = 66;

    metrics.forEach((m, idx) => {
      const my = startY + idx * 18;
      ctx.fillStyle = PAL.WHITE;
      ctx.textAlign = "left";
      ctx.fillText(m.key, 60, my + 2);

      ctx.fillStyle = PAL.DARKEST;
      ctx.fillRect(barStartX, my, barW, 10);
      ctx.strokeStyle = PAL.SLATE;
      ctx.strokeRect(barStartX, my, barW, 10);

      ctx.fillStyle = PAL.CYAN;
      const fillW = Math.round((barW - 2) * clamp(m.val, 0, 1));
      ctx.fillRect(barStartX + 1, my + 1, fillW, 8);

      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(clamp(m.val, 0, 1) * 100)}%`, 430, my + 2);
    });

    ctx.fillStyle = PAL.SILVER;
    ctx.textAlign = "center";
    const compScore = isNaN(r.components.composite) ? "0.50" : r.components.composite.toFixed(2);
    const fStr = `S:${compScore} x DIFF:${r.diffMult.toFixed(2)} x MODE:${r.modeMult.toFixed(2)} = ${r.score}`;
    ctx.fillText(fStr, 256, 182);

    ctx.fillStyle = PAL.YELLOW;
    ctx.fillText(`+${r.coinsEarned} COINS AWARDED`, 256, 198);

    renderButton(ctx, { x: 196, y: 220, w: 120, h: 26 }, "CONTINUE", false);
  },

  renderPauseModal(ctx) {
    ctx.fillStyle = "rgba(10, 8, 20, 0.88)";
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    renderPanel(ctx, 156, 46, 200, 196, "PAUSED");

    const isFs = !!document.fullscreenElement;
    renderButton(ctx, { x: 176, y: 72, w: 160, h: 22 }, "RESUME", false);
    renderButton(ctx, { x: 176, y: 98, w: 160, h: 22 }, isFs ? "WINDOWED" : "FULLSCREEN", false);
    renderButton(ctx, { x: 176, y: 124, w: 160, h: 22 }, "SETTINGS", false);
    renderButton(ctx, { x: 176, y: 150, w: 160, h: 22 }, "CONCEDE", false);
    renderButton(ctx, { x: 176, y: 176, w: 160, h: 22 }, "QUIT TO TITLE", false);
  },

  handlePointer(e) {
    if (this.arcadeKeyboard) {
      this.arcadeKeyboard.handlePointer(e);
      return;
    }

    if (this.resultsOpen) {
      if (e.type === "pointerdown" && e.x >= 196 && e.x <= 316 && e.y >= 220 && e.y <= 246) {
        audio.playSfx("uiSelect");
        if (this.tournamentBracket) {
          go("tournament", { resume: true, bracket: this.tournamentBracket });
        } else {
          go("leaderboard");
        }
      }
      return;
    }

    if (this.pauseOpen) {
      if (e.type !== "pointerdown") return;
      if (e.x >= 176 && e.x <= 336) {
        if (e.y >= 72 && e.y <= 94) {
          audio.playSfx("uiSelect");
          this.pauseOpen = false;
        } else if (e.y >= 98 && e.y <= 120) {
          audio.playSfx("uiSelect");
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        } else if (e.y >= 124 && e.y <= 146) {
          audio.playSfx("uiSelect");
          go("settings");
        } else if (e.y >= 150 && e.y <= 172) {
          audio.playSfx("foul");
          this.pauseOpen = false;
          this.state.winner = "AI";
          this.state.phase = "GAME_OVER";
          this.handleGameOver();
        } else if (e.y >= 176 && e.y <= 198) {
          audio.playSfx("uiSelect");
          clearMatchSnapshot();
          go("title");
        }
      }
      return;
    }

    // Pause button always accessible (in top HUD bar)
    if (e.type === "pointerdown" && this.input.isInside(e.x, e.y, this.input.pauseBtn)) {
      this.pauseOpen = true;
      audio.playSfx("uiSelect");
      return;
    }

    // Controls Handling
    this.input.handlePointer(
      e,
      this.state,
      (shot) => this.executeShot(shot),
      () => { this.pauseOpen = true; audio.playSfx("uiSelect"); },
      (pos) => {
        const cue = this.state.balls[0];
        cue.x = pos.x;
        cue.y = pos.y;
        cue.inPlay = true;
        cue.pocketed = false;
        this.state.phase = "AIMING";
        this.state.ballInHand = false;
        audio.playSfx("uiSelect");
        saveMatchSnapshot(this.state, this.tournamentBracket);
      }
    );
  },

  onPointer(e) {
    this.handlePointer(e);
  },

  onKey(e) {
    if (this.arcadeKeyboard) {
      this.arcadeKeyboard.handleKey(e);
      return;
    }

    if (e.code === "Escape") {
      if (this.resultsOpen) return;
      this.pauseOpen = !this.pauseOpen;
      audio.playSfx("uiSelect");
      return;
    }

    if (this.pauseOpen || this.resultsOpen) return;

    this.input.handleKey(
      e,
      this.state,
      (shot) => this.executeShot(shot),
      () => { this.pauseOpen = true; }
    );
  },
};
