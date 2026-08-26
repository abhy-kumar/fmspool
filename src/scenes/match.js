import { CFG, DIFFICULTY } from "../config.js";
import { PAL } from "../palette.js";
import { SPRITES, AI_PERSONALITIES } from "../sprites.js";
import { createMatchState, createShotReport, processPhysicsEvents, evaluateShot, countRemaining, getBallGroup } from "../rules.js";
import { step, allAtRest } from "../physics.js";
import { renderTable, renderBalls, renderCueStick, renderAimAssist, renderCRTEffect, physToPx, pxToPhys } from "../render.js";
import { InputController } from "../input.js";
import { chooseShot, chooseBallInHand } from "../ai.js";
import { matchScore, getTier } from "../scoring.js";
import { loadSave, saveMatchSnapshot, clearMatchSnapshot, saveImmediate, loadSettings } from "../storage.js";
import { submitRun, checkQualifiesTop10 } from "../cloud.js";
import { renderPanel, renderButton, ArcadeKeyboard } from "../ui.js";
import { makeRng } from "../rng.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";
import { fromAngle, mul, dist, clamp, lerpAngle } from "../vec.js";
import { POCKETS } from "../table.js";

export const matchScene = {
  name: "match",
  state: null,
  input: null,
  difficultyId: "AMATEUR",
  modeKey: "EXHIBITION",
  tournamentBracket: null,
  tournamentRound: null,

  // Shot resolution
  shotReport: null,
  shotTimer: 0,

  // AI Animation State
  aiThinkingTimer: 0,
  aiThinkingTotal: 1.0,
  aiPlannedShot: null,
  aiCueAngle: 0,
  aiCuePower: 0,
  aiPhase: "IDLE", // 'IDLE' | 'THINKING' | 'ROTATING' | 'PULLBACK' | 'STRIKE'
  aiAnimProgress: 0,

  // UI / Modals
  pauseOpen: false,
  resultsOpen: false,
  resultsData: null,
  arcadeKeyboard: null,
  top10Rank: null,

  enter(params = {}) {
    audio.playTrack("MATCH");
    this.input = new InputController();
    this.pauseOpen = false;
    this.resultsOpen = false;
    this.arcadeKeyboard = null;
    this.aiPhase = "IDLE";

    const save = loadSave();

    if (params.resume && save.activeMatch) {
      this.state = save.activeMatch;
      this.tournamentBracket = save.activeTournament || null;
      this.difficultyId = params.difficulty || "AMATEUR";
      this.modeKey = this.tournamentBracket ? "T_QUARTER" : "RANKED";
    } else {
      this.difficultyId = params.difficulty || "AMATEUR";
      this.modeKey = params.mode || "EXHIBITION";
      this.tournamentBracket = params.bracket || null;
      this.tournamentRound = params.round || null;
      this.state = createMatchState(Date.now(), "PLAYER");
    }

    this.input.aimAngle = 0;
    this.input.targetAimAngle = 0;
  },

  exit() {
    audio.stopMusic();
  },

  update(dt) {
    if (this.pauseOpen) return;

    if (this.arcadeKeyboard) {
      this.arcadeKeyboard.update(dt);
      return;
    }

    if (this.resultsOpen) return;

    // 1. Message timer countdown
    if (this.state.messageTimer > 0) {
      this.state.messageTimer -= dt;
    }

    // 2. Human Input Update (No shot clock timer restrictions)
    this.input.update(dt, this.state);

    // 3. AI Turn State Machine
    if (this.state.turn === "AI") {
      this.updateAITurn(dt);
    }

    // 4. Physics Shot Resolving
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

    if (this.state.phase === "CALL_POCKET") {
      this.state.calledPocket = POCKETS[0].id;
      this.state.phase = "AIMING";
      return;
    }

    if (this.state.phase !== "AIMING") return;

    if (this.aiPhase === "IDLE") {
      this.aiPhase = "THINKING";
      this.aiThinkingTotal = (CFG.AI_THINK_MIN_MS + rng() * (CFG.AI_THINK_MAX_MS - CFG.AI_THINK_MIN_MS)) / 1000;
      this.aiThinkingTimer = 0;

      chooseShot(this.state, diff, rng).then((shot) => {
        this.aiPlannedShot = shot;
        if (shot.kind === "SAFETY") {
          this.state.message = "AI: SAFETY PLAY";
          this.state.messageTimer = 2.0;
        }
      });
    } else if (this.aiPhase === "THINKING") {
      this.aiThinkingTimer += dt;
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

  executeShot(shot) {
    const cue = this.state.balls[0];
    if (!cue || !cue.inPlay) return;

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
    const result = evaluateShot(this.state, this.shotReport);

    if (result.foul) {
      audio.playSfx("foul");
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
    if (won) audio.playTrack("VICTORY");
    else audio.playTrack("DEFEAT");

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
    save.career.shots += this.state.stats.PLAYER.shots;
    save.career.ownPots += this.state.stats.PLAYER.ownPots;
    save.career.fouls += this.state.stats.PLAYER.fouls;
    save.career.longestRun = Math.max(save.career.longestRun, this.state.stats.PLAYER.longestRun);
    save.career.bestRunScore = Math.max(save.career.bestRunScore, res.score);
    save.career.runsPlayed++;
    save.coins = (save.coins || 0) + this.resultsData.coinsEarned;

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
        shots: this.state.stats.PLAYER.shots,
        ownPots: this.state.stats.PLAYER.ownPots,
        fouls: this.state.stats.PLAYER.fouls,
        longestRun: this.state.stats.PLAYER.longestRun,
        seconds: Math.round(this.state.stats.PLAYER.totalShotSeconds),
      },
    }, save);
  },

  render(ctx) {
    ctx.fillStyle = PAL.BLACK;
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    // 1. Render Pool Table & Pockets
    renderTable(ctx);

    // 2. Call Pocket Highlights
    if (this.state.phase === "CALL_POCKET") {
      POCKETS.forEach((p) => {
        const pPx = physToPx(p.x, p.y);
        ctx.strokeStyle = PAL.CYAN;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pPx.x, pPx.y, p.r * CFG.PHYS_TO_PX + 2, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // 3. Render Balls with halos
    renderBalls(ctx, this.state.balls, this.state);

    // 4. Render Aim Assist & Cue Stick
    const settings = loadSettings();
    if (this.state.phase === "AIMING" && this.state.balls[0] && this.state.balls[0].inPlay) {
      if (this.state.turn === "PLAYER") {
        renderAimAssist(ctx, this.state, this.input.aimAngle, settings.assistLevel);
        renderCueStick(ctx, this.state.balls[0], this.input.aimAngle, this.input.power, settings.selectedCue);
      } else if (this.state.turn === "AI" && (this.aiPhase === "ROTATING" || this.aiPhase === "PULLBACK")) {
        renderCueStick(ctx, this.state.balls[0], this.aiCueAngle, this.aiCuePower, "DEFAULT");
      }
    }

    // 5. Render HUD Strip (Top 46 px)
    this.renderHUD(ctx);

    // 6. Render Input Controls Overlay
    if (this.state.turn === "PLAYER") {
      this.input.renderControls(ctx, this.state);
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

  renderHUD(ctx) {
    const save = loadSave();

    // HUD Background (Rich dark indigo with bright slate/cyan borders)
    ctx.fillStyle = PAL.DARKEST;
    ctx.fillRect(0, 0, CFG.BASE_W, 46);
    ctx.strokeStyle = PAL.SLATE;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, CFG.BASE_W, 46);

    // Player Block (Left)
    ctx.fillStyle = this.state.turn === "PLAYER" ? PAL.CYAN : PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(save.displayName || "PLAYER", 8, 6);

    const pGroup = this.state.groups.PLAYER;
    if (pGroup) {
      const gBallId = pGroup === "SOLIDS" ? 1 : 9;
      if (SPRITES.balls[gBallId]) ctx.drawImage(SPRITES.balls[gBallId][0], 8, 18);
      ctx.fillStyle = PAL.SILVER;
      ctx.fillText(`${pGroup}`, 22, 19);

      // Remaining balls dots
      const startBall = pGroup === "SOLIDS" ? 1 : 9;
      const endBall = pGroup === "SOLIDS" ? 7 : 15;
      let dotX = 8;
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
      ctx.fillText("OPEN TABLE", 8, 20);
      ctx.fillStyle = PAL.SILVER;
      ctx.fillText("ANY BALL (EXCEPT 8)", 8, 32);
    }

    // AI Block (Right)
    const aiDef = AI_PERSONALITIES.find((a) => a.tier === this.difficultyId) || AI_PERSONALITIES[0];
    const portrait = SPRITES.portraits[aiDef.name];
    if (portrait) {
      ctx.drawImage(portrait, CFG.BASE_W - 22, 6);
    }

    ctx.fillStyle = this.state.turn === "AI" ? PAL.CYAN : PAL.WHITE;
    ctx.textAlign = "right";
    ctx.fillText(aiDef.name, CFG.BASE_W - 26, 6);

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

    // Center: Turn Banner & Game Messages (Large, clear, and unhurried)
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
      // Show active shooter turn banner
      const isPlayer = this.state.turn === "PLAYER";
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = isPlayer ? PAL.CYAN : PAL.MAGENTA;
      ctx.fillText(isPlayer ? "YOUR TURN" : `${aiDef.name}'S TURN`, msgX, 14);
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
      ctx.fillRect(barStartX + 1, my + 1, Math.round((barW - 2) * clamp(m.val, 0, 1)), 8);

      ctx.textAlign = "right";
      ctx.fillText(`${Math.round(m.val * 100)}%`, 430, my + 2);
    });

    ctx.fillStyle = PAL.SILVER;
    ctx.textAlign = "center";
    const fStr = `S:${(r.components.composite).toFixed(2)} x DIFF:${r.diffMult.toFixed(2)} x MODE:${r.modeMult.toFixed(2)} = ${r.score}`;
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

    // Call Pocket Tap
    if (this.state.phase === "CALL_POCKET" && this.state.turn === "PLAYER" && e.type === "pointerdown") {
      const phys = pxToPhys(e.x, e.y);
      for (let p = 0; p < POCKETS.length; p++) {
        if (dist(phys, POCKETS[p]) < POCKETS[p].r * 2) {
          this.state.calledPocket = POCKETS[p].id;
          this.state.phase = "AIMING";
          this.state.message = `POCKET ${POCKETS[p].id} CALLED`;
          this.state.messageTimer = 2.0;
          audio.playSfx("uiSelect");
          return;
        }
      }
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
