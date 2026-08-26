import { CFG } from "../config.js";
import { PAL } from "../palette.js";
import { SPRITES } from "../sprites.js";
import { CUPS, createTournamentBracket, advanceTournamentRound } from "../tournament.js";
import { loadSave, saveImmediate, unlockAchievement } from "../storage.js";
import { computeRunScore } from "../scoring.js";
import { renderPanel, renderButton } from "../ui.js";
import { renderCRTEffect } from "../render.js";
import { go } from "../sceneManager.js";
import { audio } from "../audio.js";

export const tournamentScene = {
  name: "tournament",
  bracket: null,
  viewMode: "CUP_SELECT", // 'CUP_SELECT' | 'BRACKET' | 'VICTORY'
  backBtn: { x: 12, y: 12, w: 60, h: 20 },
  startMatchBtn: { x: 196, y: 240, w: 120, h: 24 },

  enter(params = {}) {
    audio.playTrack("TOURNEY");
    const save = loadSave();

    if (params.resume && (params.bracket || save.activeTournament)) {
      this.bracket = params.bracket || save.activeTournament;
      this.viewMode = this.bracket.round === "COMPLETE" ? (this.bracket.champion ? "VICTORY" : "CUP_SELECT") : "BRACKET";
    } else {
      this.viewMode = "CUP_SELECT";
      this.bracket = null;
    }
  },

  exit() {},

  update(dt) {},

  render(ctx) {
    const bgGrad = ctx.createRadialGradient(256, 144, 40, 256, 144, 280);
    bgGrad.addColorStop(0, "#161130");
    bgGrad.addColorStop(0.6, "#0e0a21");
    bgGrad.addColorStop(1, "#07050e");

    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CFG.BASE_W, CFG.BASE_H);

    if (this.viewMode === "CUP_SELECT") {
      this.renderCupSelect(ctx);
    } else if (this.viewMode === "BRACKET") {
      this.renderBracket(ctx);
    } else if (this.viewMode === "VICTORY") {
      this.renderVictory(ctx);
    }

    renderCRTEffect(ctx);
  },

  renderCupSelect(ctx) {
    renderButton(ctx, this.backBtn, "< BACK", false);

    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("TOURNAMENT CUPS", 256, 16);

    const save = loadSave();
    const cupKeys = ["BRONZE", "SILVER", "GOLD", "CHAMPION"];
    const startY = 44;
    const cardW = 110;
    const cardH = 190;
    const gap = 12;

    cupKeys.forEach((key, i) => {
      const cup = CUPS[key];
      const cx = 16 + i * (cardW + gap);
      const cy = startY;

      // Unlock requirement check
      let isUnlocked = true;
      if (cup.unlocksAfter) {
        isUnlocked = (save.career.titles[cup.unlocksAfter] || 0) > 0;
      }
      const canAfford = (save.coins || 0) >= cup.entryFee;

      renderPanel(ctx, cx, cy, cardW, cardH, cup.name);

      // 32-Bit Metallic Trophy Cup Icon
      const cupX = cx + 43;
      const cupY = cy + 24;
      const tGrad = ctx.createLinearGradient(cupX, cupY, cupX + 24, cupY + 24);
      if (key === "BRONZE") { tGrad.addColorStop(0, "#ffaa55"); tGrad.addColorStop(1, "#803800"); }
      else if (key === "SILVER") { tGrad.addColorStop(0, "#ffffff"); tGrad.addColorStop(1, "#7b8ea6"); }
      else if (key === "GOLD") { tGrad.addColorStop(0, "#ffea75"); tGrad.addColorStop(1, "#c98f00"); }
      else if (key === "CHAMPION") { tGrad.addColorStop(0, "#ff5599"); tGrad.addColorStop(1, "#800040"); }

      ctx.fillStyle = tGrad;
      // Trophy Bowl
      ctx.beginPath();
      ctx.moveTo(cupX + 2, cupY + 2);
      ctx.lineTo(cupX + 22, cupY + 2);
      ctx.lineTo(cupX + 18, cupY + 14);
      ctx.lineTo(cupX + 6, cupY + 14);
      ctx.closePath();
      ctx.fill();

      // Stem & Base
      ctx.fillRect(cupX + 10, cupY + 14, 4, 6);
      ctx.fillRect(cupX + 5, cupY + 20, 14, 4);

      // Specular highlight gleam
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(cupX + 5, cupY + 4, 3, 5);

      // Details
      ctx.fillStyle = isUnlocked ? PAL.WHITE : PAL.GREY;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.fillText(`PRIZE:`, cx + cardW / 2, cy + 60);
      ctx.fillStyle = PAL.YELLOW;
      ctx.fillText(`${cup.prize} C`, cx + cardW / 2, cy + 74);

      ctx.fillStyle = PAL.SILVER;
      ctx.fillText(`FEE: ${cup.entryFee} C`, cx + cardW / 2, cy + 96);
      ctx.fillText(`RACE: ${cup.raceTo.join("/")}`, cx + cardW / 2, cy + 114);

      // Button
      if (!isUnlocked) {
        ctx.fillStyle = PAL.RED;
        ctx.fillText(`WIN ${cup.unlocksAfter}`, cx + cardW / 2, cy + 148);
      } else {
        const btnRect = { x: cx + 10, y: cy + 144, w: 90, h: 26 };
        renderButton(ctx, btnRect, canAfford ? "ENTER" : "NO COINS", false);
      }
    });

    // Player Coins Bar
    ctx.fillStyle = PAL.YELLOW;
    ctx.textAlign = "right";
    ctx.fillText(`COINS: ${save.coins || 0}`, 496, 16);
  },

  renderBracket(ctx) {
    renderButton(ctx, this.backBtn, "< QUIT", false);

    const cup = CUPS[this.bracket.cupId];
    ctx.fillStyle = PAL.WHITE;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`${cup.name} - ${this.bracket.round}`, 256, 14);

    // Render 8-player bracket tree
    const qf = this.bracket.qf;
    const sf = this.bracket.sf;
    const finals = this.bracket.finals;

    // Draw QF Column (Left)
    const qfStartX = 24;
    const qfStartY = 44;
    const boxW = 86;
    const boxH = 20;
    const qfGap = 8;

    for (let m = 0; m < 4; m++) {
      const match = qf[m];
      const my = qfStartY + m * (boxH * 2 + qfGap);

      // P1
      this.drawBracketSlot(ctx, qfStartX, my, boxW, boxH, match.p1, match.winner === match.p1);
      // P2
      this.drawBracketSlot(ctx, qfStartX, my + boxH, boxW, boxH, match.p2, match.winner === match.p2);

      // Connecting line to SF
      ctx.strokeStyle = match.winner ? PAL.BRASS : PAL.SLATE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(qfStartX + boxW, my + boxH);
      ctx.lineTo(qfStartX + boxW + 16, my + boxH);
      ctx.stroke();
    }

    // Draw SF Column
    const sfStartX = 146;
    for (let m = 0; m < 2; m++) {
      const match = sf[m];
      const my = qfStartY + 14 + m * (boxH * 2 + 56);

      this.drawBracketSlot(ctx, sfStartX, my, boxW, boxH, match.p1, match.winner && match.winner === match.p1);
      this.drawBracketSlot(ctx, sfStartX, my + boxH, boxW, boxH, match.p2, match.winner && match.winner === match.p2);

      ctx.strokeStyle = match.winner ? PAL.BRASS : PAL.SLATE;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sfStartX + boxW, my + boxH);
      ctx.lineTo(sfStartX + boxW + 20, my + boxH);
      ctx.stroke();
    }

    // Draw Final Column
    const fStartX = 272;
    const fy = qfStartY + 42;
    const fMatch = finals[0];
    this.drawBracketSlot(ctx, fStartX, fy, boxW, boxH, fMatch.p1, fMatch.winner && fMatch.winner === fMatch.p1);
    this.drawBracketSlot(ctx, fStartX, fy + boxH, boxW, boxH, fMatch.p2, fMatch.winner && fMatch.winner === fMatch.p2);

    // Champion Plate
    const champX = 390;
    const champY = fy + 10;
    renderPanel(ctx, champX, champY, 96, 32, "CHAMPION");
    if (this.bracket.champion) {
      ctx.fillStyle = PAL.BRASS;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "center";
      ctx.fillText(this.bracket.champion.name, champX + 48, champY + 20);
    }

    // Next Match Button
    if (this.bracket.round !== "COMPLETE") {
      renderButton(ctx, this.startMatchBtn, "PLAY MATCH", false);
    } else {
      renderButton(ctx, this.startMatchBtn, "FINISH", false);
    }
  },

  drawBracketSlot(ctx, x, y, w, h, player, isWinner) {
    ctx.fillStyle = isWinner ? PAL.DARKEST : PAL.DARK;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = isWinner ? PAL.BRASS : (player && player.isPlayer ? PAL.CYAN : PAL.SLATE);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    if (player) {
      // Small portrait if AI
      if (!player.isPlayer && SPRITES.portraits[player.name]) {
        ctx.drawImage(SPRITES.portraits[player.name], x + 2, y + 2);
      }
      ctx.fillStyle = player.isPlayer ? PAL.CYAN : (isWinner ? PAL.BRASS : PAL.WHITE);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const pName = player.name.slice(0, 7);
      ctx.fillText(pName, x + (player.isPlayer ? 4 : 20), y + h / 2);
    } else {
      ctx.fillStyle = PAL.GREY;
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("TBD", x + 6, y + h / 2);
    }
  },

  renderVictory(ctx) {
    renderPanel(ctx, 56, 30, 400, 228, "TOURNAMENT CHAMPION!");

    const cup = CUPS[this.bracket.cupId];
    ctx.fillStyle = PAL.BRASS;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`YOU WON THE ${cup.name}!`, 256, 56);

    ctx.fillStyle = PAL.YELLOW;
    ctx.fillText(`PRIZE: +${cup.prize} COINS`, 256, 80);

    const runRes = computeRunScore(this.bracket.matchScores, this.bracket.roundsAdvanced, true, this.bracket.cupId);
    ctx.fillStyle = PAL.CYAN;
    ctx.fillText(`TOTAL RUN SCORE: ${runRes.runScore}`, 256, 110);
    ctx.fillStyle = PAL.SILVER;
    ctx.fillText(`(MATCHES + TITLE BONUS +1500)`, 256, 126);

    renderButton(ctx, { x: 196, y: 190, w: 120, h: 26 }, "CLAIM & EXIT", false);
  },

  handlePointer(e) {
    if (e.type !== "pointerdown") return;

    // Back Button
    if (e.x >= 12 && e.x <= 72 && e.y >= 12 && e.y <= 32) {
      audio.playSfx("uiSelect");
      go("title");
      return;
    }

    if (this.viewMode === "CUP_SELECT") {
      const save = loadSave();
      const cupKeys = ["BRONZE", "SILVER", "GOLD", "CHAMPION"];
      const startY = 44;
      const cardW = 110;
      const cardH = 190;
      const gap = 12;

      cupKeys.forEach((key, i) => {
        const cup = CUPS[key];
        const cx = 16 + i * (cardW + gap);
        const cy = startY;

        let isUnlocked = true;
        if (cup.unlocksAfter) {
          isUnlocked = (save.career.titles[cup.unlocksAfter] || 0) > 0;
        }
        const canAfford = (save.coins || 0) >= cup.entryFee;

        // Check Enter Button
        if (isUnlocked && canAfford) {
          if (e.x >= cx + 10 && e.x <= cx + 100 && e.y >= cy + 144 && e.y <= cy + 170) {
            audio.playSfx("uiSelect");
            save.coins -= cup.entryFee;
            saveImmediate(save);
            this.bracket = createTournamentBracket(key, save.displayName, Date.now());
            save.activeTournament = this.bracket;
            saveImmediate(save);
            this.viewMode = "BRACKET";
          }
        }
      });
    } else if (this.viewMode === "BRACKET") {
      if (e.x >= 196 && e.x <= 316 && e.y >= 240 && e.y <= 264) {
        audio.playSfx("uiSelect");
        if (this.bracket.round === "COMPLETE") {
          this.viewMode = this.bracket.champion ? "VICTORY" : "CUP_SELECT";
        } else {
          // Launch match for current round
          let currentOpponent = null;
          let modeKey = "T_QUARTER";
          let diff = "ROOKIE";

          if (this.bracket.round === "QF") {
            currentOpponent = this.bracket.qf[0].p2;
            modeKey = "T_QUARTER";
            diff = this.bracket.qf[0].diff;
          } else if (this.bracket.round === "SF") {
            currentOpponent = this.bracket.sf[0].p2;
            modeKey = "T_SEMI";
            diff = this.bracket.sf[0].diff;
          } else if (this.bracket.round === "FINAL") {
            currentOpponent = this.bracket.finals[0].p2;
            modeKey = "T_FINAL";
            diff = this.bracket.finals[0].diff;
          }

          go("match", {
            difficulty: diff,
            mode: modeKey,
            bracket: this.bracket,
            round: this.bracket.round,
          });
        }
      }
    } else if (this.viewMode === "VICTORY") {
      if (e.x >= 196 && e.x <= 316 && e.y >= 190 && e.y <= 216) {
        audio.playSfx("uiSelect");
        const save = loadSave();
        const cup = CUPS[this.bracket.cupId];
        save.coins = (save.coins || 0) + cup.prize;
        save.career.titles[this.bracket.cupId] = (save.career.titles[this.bracket.cupId] || 0) + 1;
        save.activeTournament = null;
        saveImmediate(save);

        unlockAchievement("CHAK_DE");
        if (this.bracket.cupId === "CHAMPION") {
          unlockAchievement("BAHUBALI");
        }

        go("leaderboard");
      }
    }
  },

  onPointer(e) {
    this.handlePointer(e);
  },

  onKey(e) {
    if (e.type === "keydown" && e.code === "Escape") {
      audio.playSfx("uiSelect");
      go("title");
    }
  },
};
