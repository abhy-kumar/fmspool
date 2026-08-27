import { CFG } from "./config.js";
import { makeRng } from "./rng.js";
import { clamp } from "./vec.js";

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
    this.musicBus = null;
    this.musicFilter = null;
    this.sfxBus = null;

    this.noiseBuffer = null;

    // Volume settings
    this.masterVol = 0.7;
    this.musicVol = 0.5;
    this.sfxVol = 0.8;
    this.musicMuted = false;
    this.sfxMuted = false;

    // Scheduler state
    this.currentTrack = null;
    this.currentStep = 0;
    this.nextNoteTime = 0;
    this.schedulerTimer = null;
    this.activeSfxCount = 0;

    // Pre-generated tracks
    this.tracks = {};
  }

  initContext() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();

    // 1. Master bus
    this.masterBus = this.ctx.createGain();
    this.masterBus.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);
    this.masterBus.connect(this.ctx.destination);

    // 2. Music Warmth Filter (removes harsh digital top-end and gives warm vintage feel)
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.setValueAtTime(3600, this.ctx.currentTime);
    this.musicFilter.Q.setValueAtTime(0.7, this.ctx.currentTime);
    this.musicFilter.connect(this.masterBus);

    // 3. Music bus
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.setValueAtTime(this.musicMuted ? 0 : this.musicVol, this.ctx.currentTime);
    this.musicBus.connect(this.musicFilter);

    // 4. SFX bus
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.setValueAtTime(this.sfxMuted ? 0 : this.sfxVol, this.ctx.currentTime);
    this.sfxBus.connect(this.masterBus);

    // 5. Create 1-second noise buffer for percussion & organic sound effects
    const bufferSize = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    const rng = makeRng(777);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = rng() * 2 - 1;
    }

    // Start playback scheduler
    this.startScheduler();
  }

  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // --- Volume Control API ---
  setMasterVolume(vol) {
    this.masterVol = clamp(vol, 0, 1);
    if (this.ctx && this.masterBus) {
      this.masterBus.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);
    }
  }

  setMusicVolume(vol) {
    this.musicVol = clamp(vol, 0, 1);
    if (this.ctx && this.musicBus) {
      this.musicBus.gain.setValueAtTime(this.musicMuted ? 0 : this.musicVol, this.ctx.currentTime);
    }
  }

  setSfxVolume(vol) {
    this.sfxVol = clamp(vol, 0, 1);
    if (this.ctx && this.sfxBus) {
      this.sfxBus.gain.setValueAtTime(this.sfxMuted ? 0 : this.sfxVol, this.ctx.currentTime);
    }
  }

  setVolumes(master, music, sfx) {
    this.setMasterVolume(master);
    this.setMusicVolume(music);
    this.setSfxVolume(sfx);
  }

  // ==========================================
  // --- WARM INSTRUMENT SYNTHESIS (WEB AUDIO) ---
  // ==========================================

  // Warm Rhodes Electric Piano (Dual-sine blend + subtle bell overtone + warm lowpass)
  playRhodesNote(freq, vol, time, dur) {
    if (!this.ctx || vol <= 0) return;

    const baseOsc = this.ctx.createOscillator();
    const bellOsc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    baseOsc.type = "sine";
    baseOsc.frequency.setValueAtTime(freq, time);

    // Subtle 2nd harmonic overtone for electric piano tine strike
    bellOsc.type = "sine";
    bellOsc.frequency.setValueAtTime(freq * 2, time);

    // Warm note filter
    filter.type = "lowpass";
    const cutoff = Math.min(freq * 3.2, 2600);
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.2, 350), time + dur);

    // Envelope
    const aTime = 0.008; // Smooth 8ms attack to prevent click
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + aTime);
    gain.gain.exponentialRampToValueAtTime(vol * 0.45, time + 0.35);
    gain.gain.setValueAtTime(vol * 0.45, Math.max(time + 0.35, time + dur - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.12);

    baseOsc.connect(filter);
    bellOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);

    baseOsc.start(time);
    bellOsc.start(time);
    baseOsc.stop(time + dur + 0.15);
    bellOsc.stop(time + dur + 0.15);
  }

  // Deep Warm Bass (Sub sine + warm triangle with lowpass warmth)
  playWarmBass(freq, vol, time, dur) {
    if (!this.ctx || vol <= 0) return;

    const subOsc = this.ctx.createOscillator();
    const triOsc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(freq, time);

    triOsc.type = "triangle";
    triOsc.frequency.setValueAtTime(freq, time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, time);
    filter.frequency.exponentialRampToValueAtTime(220, time + dur);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(vol * 0.7, time + 0.25);
    gain.gain.setValueAtTime(vol * 0.7, Math.max(time + 0.25, time + dur - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.08);

    subOsc.connect(filter);
    triOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);

    subOsc.start(time);
    triOsc.start(time);
    subOsc.stop(time + dur + 0.1);
    triOsc.stop(time + dur + 0.1);
  }

  // Soft Vibraphone / Melodic Lead (Pure sine with subtle tremolo & gentle mallet tap)
  playVibeLead(freq, vol, time, dur) {
    if (!this.ctx || vol <= 0) return;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, time);

    // Subtle pitch vibrato after 60ms
    osc.frequency.setValueAtTime(freq, time + 0.06);
    osc.frequency.linearRampToValueAtTime(freq * 1.004, time + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(freq * 0.996, time + dur * 0.8);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(freq * 2.5, 2400), time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(vol * 0.55, time + 0.3);
    gain.gain.setValueAtTime(vol * 0.55, Math.max(time + 0.3, time + dur - 0.06));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);

    osc.start(time);
    osc.stop(time + dur + 0.12);
  }

  // Lo-Fi Warm Kick (Soft low-frequency punch)
  playLofiKick(time) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(75, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.09);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.24, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);

    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.12);
  }

  // Lo-Fi Soft Snare / Brush Tap (Bandpass filtered warmth)
  playLofiSnare(time) {
    if (!this.ctx || !this.noiseBuffer) return;

    // Noise layer (brush texture)
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(950, time);
    filter.Q.setValueAtTime(1.8, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.09, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    src.start(time);
    src.stop(time + 0.1);

    // Soft body pop
    const body = this.ctx.createOscillator();
    const bGain = this.ctx.createGain();
    body.frequency.setValueAtTime(160, time);
    body.frequency.exponentialRampToValueAtTime(90, time + 0.04);
    bGain.gain.setValueAtTime(0.08, time);
    bGain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    body.connect(bGain);
    bGain.connect(this.musicBus);
    body.start(time);
    body.stop(time + 0.06);
  }

  // Lo-Fi Soft Closed / Open Hi-Hat / Shaker
  playLofiHat(time, open = false) {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(3200, time);
    filter.Q.setValueAtTime(2.2, time);

    const dur = open ? 0.08 : 0.035;
    const vol = open ? 0.035 : 0.025;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);

    src.start(time);
    src.stop(time + dur + 0.01);
  }

  // ==========================================
  // --- TRACK COMPOSITIONS & ARRANGEMENTS ---
  // ==========================================

  generateTracks() {
    this.tracks.TITLE = this.buildTitleTrack();
    this.tracks.MATCH = this.buildMatchTrack();
    this.tracks.TOURNEY = this.buildTourneyTrack();
    this.tracks.VICTORY = this.buildVictoryTrack();
    this.tracks.DEFEAT = this.buildDefeatTrack();
  }

  // TRACK 1: TITLE ("Neon Velvet Lounge" - Smooth 80s / Neo-Soul Groove)
  buildTitleTrack() {
    const bpm = 94;
    const numBars = 8;
    const stepsPerBar = 16;
    const totalSteps = numBars * stepsPerBar;

    const chords = new Array(totalSteps).fill(null);
    const bass = new Array(totalSteps).fill(null);
    const lead = new Array(totalSteps).fill(null);
    const drums = new Array(totalSteps).fill(null);

    // 8-Bar Chord Progression:
    // Fmaj9 -> Em7 -> Dm9 -> Cmaj7 -> Fmaj9 -> Em7 -> Dm9 -> G13sus
    const progression = [
      { root: 41, notes: [53, 57, 60, 64, 67] }, // Fmaj9
      { root: 40, notes: [52, 55, 59, 62] },     // Em7
      { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
      { root: 36, notes: [48, 52, 55, 59, 62] }, // Cmaj7(9)
      { root: 41, notes: [53, 57, 60, 64, 67] }, // Fmaj9
      { root: 40, notes: [52, 55, 59, 62] },     // Em7
      { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
      { root: 43, notes: [55, 58, 62, 65, 69] }, // G13
    ];

    // Melodic Lead Motif (Vibraphone) - strictly pentatonic / dorian with phrasing
    const leadMotifs = [
      // Bar 1
      { step: 0, midi: 69, dur: 3 }, { step: 4, midi: 67, dur: 2 }, { step: 6, midi: 64, dur: 4 }, { step: 12, midi: 65, dur: 3 },
      // Bar 2
      { step: 16 + 0, midi: 64, dur: 4 }, { step: 16 + 6, midi: 62, dur: 2 }, { step: 16 + 8, midi: 59, dur: 4 },
      // Bar 3
      { step: 32 + 0, midi: 60, dur: 3 }, { step: 32 + 4, midi: 62, dur: 2 }, { step: 32 + 6, midi: 64, dur: 3 }, { step: 32 + 10, midi: 67, dur: 4 },
      // Bar 4
      { step: 48 + 0, midi: 69, dur: 6 }, { step: 48 + 8, midi: 67, dur: 6 },
      // Bar 5
      { step: 64 + 0, midi: 72, dur: 3 }, { step: 64 + 4, midi: 69, dur: 2 }, { step: 64 + 6, midi: 67, dur: 3 }, { step: 64 + 10, midi: 64, dur: 3 },
      // Bar 6
      { step: 80 + 0, midi: 67, dur: 4 }, { step: 80 + 6, midi: 64, dur: 2 }, { step: 80 + 8, midi: 62, dur: 4 },
      // Bar 7
      { step: 96 + 0, midi: 60, dur: 3 }, { step: 96 + 4, midi: 62, dur: 3 }, { step: 96 + 8, midi: 65, dur: 3 }, { step: 96 + 12, midi: 67, dur: 3 },
      // Bar 8
      { step: 112 + 0, midi: 71, dur: 6 }, { step: 112 + 8, midi: 69, dur: 6 },
    ];

    leadMotifs.forEach((m) => {
      lead[m.step] = { midi: m.midi, durSteps: m.dur, vel: 0.16 };
    });

    for (let bar = 0; bar < numBars; bar++) {
      const barStart = bar * stepsPerBar;
      const prog = progression[bar];

      // Rhodes Chords on steps 0, 6, 10
      chords[barStart + 0] = { notes: prog.notes, durSteps: 5, vel: 0.12 };
      chords[barStart + 6] = { notes: prog.notes, durSteps: 3, vel: 0.09 };
      chords[barStart + 10] = { notes: prog.notes, durSteps: 5, vel: 0.11 };

      // Bouncy Warm Bass
      bass[barStart + 0] = { midi: prog.root, durSteps: 3, vel: 0.22 };
      bass[barStart + 4] = { midi: prog.root, durSteps: 2, vel: 0.18 };
      bass[barStart + 6] = { midi: prog.root + 7, durSteps: 2, vel: 0.19 }; // 5th
      bass[barStart + 10] = { midi: prog.root, durSteps: 3, vel: 0.22 };
      bass[barStart + 14] = { midi: prog.root + (bar % 2 === 0 ? 12 : -2), durSteps: 2, vel: 0.17 };

      // Drum pattern (Lo-fi boom-bap / lounge groove)
      for (let s = 0; s < 16; s++) {
        const isKick = s === 0 || s === 10;
        const isSnare = s === 4 || s === 12;
        const isHat = s % 2 === 0;
        const isOpenHat = s === 14;
        drums[barStart + s] = { kick: isKick, snare: isSnare, hat: isHat, openHat: isOpenHat };
      }
    }

    return { id: "TITLE", bpm, totalSteps, loop: true, chords, bass, lead, drums };
  }

  // TRACK 2: MATCH ("Felt & Chalk" - Relaxed, Ambient Lo-Fi Jazz Poolroom Soundtrack)
  buildMatchTrack() {
    const bpm = 82; // Relaxed, meditative tempo
    const numBars = 16;
    const stepsPerBar = 16;
    const totalSteps = numBars * stepsPerBar;

    const chords = new Array(totalSteps).fill(null);
    const bass = new Array(totalSteps).fill(null);
    const lead = new Array(totalSteps).fill(null);
    const drums = new Array(totalSteps).fill(null);

    // 16-Bar Progression (Dm9 - G13 - Bbmaj9 - Am9 - Dm9 - Gm9 - Em7b5 - A7alt)
    const progression = [
      { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
      { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
      { root: 43, notes: [47, 53, 57, 59, 64] }, // G13
      { root: 43, notes: [47, 53, 57, 59, 64] }, // G13
      { root: 46, notes: [46, 50, 53, 57, 60] }, // Bbmaj9
      { root: 46, notes: [46, 50, 53, 57, 60] }, // Bbmaj9
      { root: 45, notes: [45, 48, 52, 55, 59] }, // Am9
      { root: 45, notes: [45, 48, 52, 55, 59] }, // Am9
      { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
      { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
      { root: 43, notes: [43, 46, 50, 53, 57] }, // Gm9
      { root: 43, notes: [43, 46, 50, 53, 57] }, // Gm9
      { root: 40, notes: [40, 43, 46, 50] },     // Em7b5
      { root: 40, notes: [40, 43, 46, 50] },     // Em7b5
      { root: 45, notes: [45, 49, 52, 55, 58] }, // A7b9
      { root: 45, notes: [45, 49, 52, 55, 58] }, // A7b9
    ];

    // Minimal, atmospheric vibraphone motifs with long spaces so the player can focus
    const matchLeadMotifs = [
      { step: 8, midi: 69, dur: 6 },
      { step: 16 + 4, midi: 67, dur: 4 },
      { step: 16 + 10, midi: 64, dur: 6 },
      { step: 32 + 8, midi: 62, dur: 8 },
      { step: 64 + 4, midi: 65, dur: 4 },
      { step: 64 + 10, midi: 69, dur: 6 },
      { step: 80 + 8, midi: 72, dur: 8 },
      { step: 128 + 4, midi: 64, dur: 6 },
      { step: 144 + 8, midi: 60, dur: 6 },
      { step: 160 + 4, midi: 62, dur: 8 },
      { step: 208 + 4, midi: 67, dur: 6 },
      { step: 224 + 8, midi: 64, dur: 8 },
    ];

    matchLeadMotifs.forEach((m) => {
      lead[m.step] = { midi: m.midi, durSteps: m.dur, vel: 0.10 };
    });

    for (let bar = 0; bar < numBars; bar++) {
      const barStart = bar * stepsPerBar;
      const prog = progression[bar];

      // Sustained warm Rhodes chords
      chords[barStart + 0] = { notes: prog.notes, durSteps: 7, vel: 0.08 };
      chords[barStart + 8] = { notes: prog.notes, durSteps: 6, vel: 0.06 };

      // Deep Sub Bass (Very mellow and round)
      bass[barStart + 0] = { midi: prog.root, durSteps: 6, vel: 0.18 };
      bass[barStart + 8] = { midi: prog.root + 7, durSteps: 4, vel: 0.14 };
      if (bar % 2 === 1) {
        bass[barStart + 14] = { midi: prog.root, durSteps: 2, vel: 0.12 };
      }

      // Minimalist brush drums
      for (let s = 0; s < 16; s++) {
        const isKick = s === 0 || (bar % 2 === 1 && s === 10);
        const isSnare = s === 8; // Soft rim click on 2 & 4
        const isHat = s === 0 || s === 4 || s === 8 || s === 12;
        drums[barStart + s] = { kick: isKick, snare: isSnare, hat: isHat, openHat: false };
      }
    }

    return { id: "MATCH", bpm, totalSteps, loop: true, chords, bass, lead, drums };
  }

  // TRACK 3: TOURNEY ("High Roller Suite" - Upbeat Retro Funk / Arcade Groove)
  buildTourneyTrack() {
    const bpm = 104;
    const numBars = 8;
    const stepsPerBar = 16;
    const totalSteps = numBars * stepsPerBar;

    const chords = new Array(totalSteps).fill(null);
    const bass = new Array(totalSteps).fill(null);
    const lead = new Array(totalSteps).fill(null);
    const drums = new Array(totalSteps).fill(null);

    // Em9 -> A7 -> Cmaj7 -> B7#9
    const progression = [
      { root: 40, notes: [52, 55, 59, 62, 66] }, // Em9
      { root: 45, notes: [45, 49, 52, 55, 59] }, // A9
      { root: 48, notes: [48, 52, 55, 59, 62] }, // Cmaj7
      { root: 47, notes: [47, 51, 54, 57, 62] }, // B7#9
      { root: 40, notes: [52, 55, 59, 62, 66] }, // Em9
      { root: 42, notes: [42, 45, 49, 52] },     // F#m7
      { root: 43, notes: [43, 47, 50, 54, 57] }, // Gmaj7
      { root: 47, notes: [47, 52, 54, 57] },     // B7sus4
    ];

    // Catchy Funk Lead Motif
    const tourneyLead = [
      // Bar 1
      { step: 0, midi: 64, dur: 2 }, { step: 3, midi: 67, dur: 2 }, { step: 6, midi: 71, dur: 3 }, { step: 10, midi: 69, dur: 4 },
      // Bar 2
      { step: 16 + 2, midi: 67, dur: 2 }, { step: 16 + 6, midi: 64, dur: 3 }, { step: 16 + 10, midi: 62, dur: 4 },
      // Bar 3
      { step: 32 + 0, midi: 60, dur: 2 }, { step: 32 + 4, midi: 64, dur: 2 }, { step: 32 + 8, midi: 67, dur: 3 }, { step: 32 + 12, midi: 71, dur: 3 },
      // Bar 4
      { step: 48 + 0, midi: 74, dur: 4 }, { step: 48 + 6, midi: 71, dur: 4 }, { step: 48 + 12, midi: 69, dur: 3 },
      // Bar 5
      { step: 64 + 0, midi: 64, dur: 2 }, { step: 64 + 3, midi: 67, dur: 2 }, { step: 64 + 6, midi: 71, dur: 3 }, { step: 64 + 10, midi: 74, dur: 4 },
      // Bar 6
      { step: 80 + 2, midi: 76, dur: 3 }, { step: 80 + 6, midi: 74, dur: 3 }, { step: 80 + 10, midi: 71, dur: 4 },
      // Bar 7
      { step: 96 + 0, midi: 67, dur: 2 }, { step: 96 + 4, midi: 71, dur: 2 }, { step: 96 + 8, midi: 74, dur: 3 }, { step: 96 + 12, midi: 76, dur: 3 },
      // Bar 8
      { step: 112 + 0, midi: 75, dur: 6 }, { step: 112 + 8, midi: 71, dur: 6 },
    ];

    tourneyLead.forEach((m) => {
      lead[m.step] = { midi: m.midi, durSteps: m.dur, vel: 0.16 };
    });

    for (let bar = 0; bar < numBars; bar++) {
      const barStart = bar * stepsPerBar;
      const prog = progression[bar];

      // Funk Comp Chords on the off-beats
      chords[barStart + 2] = { notes: prog.notes, durSteps: 2, vel: 0.13 };
      chords[barStart + 6] = { notes: prog.notes, durSteps: 2, vel: 0.11 };
      chords[barStart + 10] = { notes: prog.notes, durSteps: 2, vel: 0.13 };
      chords[barStart + 14] = { notes: prog.notes, durSteps: 2, vel: 0.10 };

      // Slap / Funky Warm Bass
      bass[barStart + 0] = { midi: prog.root, durSteps: 2, vel: 0.24 };
      bass[barStart + 3] = { midi: prog.root + 12, durSteps: 1, vel: 0.18 };
      bass[barStart + 6] = { midi: prog.root + 7, durSteps: 2, vel: 0.20 };
      bass[barStart + 8] = { midi: prog.root, durSteps: 2, vel: 0.22 };
      bass[barStart + 11] = { midi: prog.root + 10, durSteps: 1, vel: 0.18 };
      bass[barStart + 14] = { midi: prog.root + 12, durSteps: 2, vel: 0.20 };

      // Energetic funk drums
      for (let s = 0; s < 16; s++) {
        const isKick = s === 0 || s === 8 || s === 14;
        const isSnare = s === 4 || s === 12;
        const isHat = s % 2 === 0;
        const isOpenHat = s === 6 || s === 14;
        drums[barStart + s] = { kick: isKick, snare: isSnare, hat: isHat, openHat: isOpenHat };
      }
    }

    return { id: "TOURNEY", bpm, totalSteps, loop: true, chords, bass, lead, drums };
  }

  // TRACK 4: VICTORY ("Champion's Toast" - Warm, Triumphant Jazz Fanfare)
  buildVictoryTrack() {
    const bpm = 96;
    const numBars = 4;
    const stepsPerBar = 16;
    const totalSteps = numBars * stepsPerBar;

    const chords = new Array(totalSteps).fill(null);
    const bass = new Array(totalSteps).fill(null);
    const lead = new Array(totalSteps).fill(null);
    const drums = new Array(totalSteps).fill(null);

    // Abmaj7 -> Bb9 -> Cmaj9 -> Cmaj7(add9)
    const progression = [
      { root: 44, notes: [56, 60, 63, 67] },     // Abmaj7
      { root: 46, notes: [58, 62, 65, 68, 72] }, // Bb9
      { root: 48, notes: [60, 64, 67, 71, 74] }, // Cmaj9
      { root: 48, notes: [60, 64, 67, 71, 74] }, // Cmaj9
    ];

    const victoryLead = [
      { step: 0, midi: 63, dur: 2 }, { step: 3, midi: 67, dur: 2 }, { step: 6, midi: 70, dur: 3 }, { step: 10, midi: 72, dur: 4 },
      { step: 16 + 0, midi: 65, dur: 2 }, { step: 16 + 3, midi: 68, dur: 2 }, { step: 16 + 6, midi: 72, dur: 3 }, { step: 16 + 10, midi: 74, dur: 4 },
      { step: 32 + 0, midi: 76, dur: 8 }, { step: 32 + 10, midi: 74, dur: 3 }, { step: 32 + 14, midi: 72, dur: 3 },
      { step: 48 + 0, midi: 79, dur: 14 },
    ];

    victoryLead.forEach((m) => {
      lead[m.step] = { midi: m.midi, durSteps: m.dur, vel: 0.18 };
    });

    for (let bar = 0; bar < numBars; bar++) {
      const barStart = bar * stepsPerBar;
      const prog = progression[bar];

      chords[barStart + 0] = { notes: prog.notes, durSteps: 12, vel: 0.14 };
      bass[barStart + 0] = { midi: prog.root, durSteps: 8, vel: 0.22 };

      for (let s = 0; s < 16; s++) {
        const isKick = s === 0 || s === 6 || s === 10;
        const isSnare = s === 4 || s === 12;
        const isHat = s % 2 === 0;
        drums[barStart + s] = { kick: isKick, snare: isSnare, hat: isHat, openHat: s === 14 };
      }
    }

    return { id: "VICTORY", bpm, totalSteps, loop: false, chords, bass, lead, drums };
  }

  // TRACK 5: DEFEAT ("Last Call" - Smooth Soulful Fade)
  buildDefeatTrack() {
    const bpm = 74;
    const numBars = 2;
    const stepsPerBar = 16;
    const totalSteps = numBars * stepsPerBar;

    const chords = new Array(totalSteps).fill(null);
    const bass = new Array(totalSteps).fill(null);
    const lead = new Array(totalSteps).fill(null);
    const drums = new Array(totalSteps).fill(null);

    // Bar 1: Dm9 -> G7b9, Bar 2: Cmaj7
    chords[0] = { notes: [50, 53, 57, 60, 64], durSteps: 7, vel: 0.12 }; // Dm9
    chords[8] = { notes: [53, 56, 59, 65], durSteps: 7, vel: 0.10 };     // G7b9
    chords[16] = { notes: [48, 52, 55, 59, 62], durSteps: 15, vel: 0.10 }; // Cmaj7

    bass[0] = { midi: 38, durSteps: 7, vel: 0.20 };
    bass[8] = { midi: 43, durSteps: 7, vel: 0.18 };
    bass[16] = { midi: 36, durSteps: 15, vel: 0.18 };

    lead[2] = { midi: 69, durSteps: 5, vel: 0.12 };
    lead[10] = { midi: 65, durSteps: 5, vel: 0.10 };
    lead[18] = { midi: 64, durSteps: 12, vel: 0.10 };

    drums[0] = { kick: true, snare: false, hat: true, openHat: false };
    drums[8] = { kick: false, snare: true, hat: true, openHat: false };
    drums[16] = { kick: true, snare: false, hat: false, openHat: false };

    return { id: "DEFEAT", bpm, totalSteps, loop: false, chords, bass, lead, drums };
  }

  // ==========================================
  // --- PLAYBACK & SCHEDULING ENGINE ---
  // ==========================================

  playTrack(trackName) {
    this.initContext();
    const track = this.tracks[trackName];
    if (!track) return;

    // If same track is already playing, don't restart
    if (this.currentTrack && this.currentTrack.id === trackName) return;

    this.currentTrack = track;
    this.currentStep = 0;
    if (this.ctx) {
      this.nextNoteTime = this.ctx.currentTime + 0.05;
    }
  }

  stopMusic() {
    this.currentTrack = null;
  }

  startScheduler() {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);

    this.schedulerTimer = setInterval(() => {
      if (!this.ctx || !this.currentTrack || this.musicMuted) return;

      const bpm = this.currentTrack.bpm || CFG.BPM || 96;
      const stepDuration = 60 / bpm / 4; // 16th note duration in seconds

      while (this.nextNoteTime < this.ctx.currentTime + CFG.SCHEDULE_AHEAD_S) {
        this.scheduleStep(this.currentTrack, this.currentStep, this.nextNoteTime, stepDuration);
        this.nextNoteTime += stepDuration;
        this.currentStep++;

        if (this.currentStep >= this.currentTrack.totalSteps) {
          if (this.currentTrack.loop) {
            this.currentStep = 0;
          } else {
            this.currentTrack = null;
            break;
          }
        }
      }
    }, CFG.SCHEDULE_TICK_MS || 25);
  }

  scheduleStep(track, step, time, stepDur) {
    if (!this.ctx || this.musicMuted) return;

    // 1. Chords (Warm Rhodes Electric Piano)
    const chordEv = track.chords ? track.chords[step] : null;
    if (chordEv && chordEv.notes) {
      const durSec = stepDur * (chordEv.durSteps || 4);
      const vel = chordEv.vel || 0.12;
      chordEv.notes.forEach((midi) => {
        this.playRhodesNote(this.midiToFreq(midi), vel, time, durSec);
      });
    }

    // 2. Bass (Deep Warm Sub + Triangle)
    const bassEv = track.bass ? track.bass[step] : null;
    if (bassEv && bassEv.midi) {
      const durSec = stepDur * (bassEv.durSteps || 3);
      const vel = bassEv.vel || 0.22;
      this.playWarmBass(this.midiToFreq(bassEv.midi), vel, time, durSec);
    }

    // 3. Lead (Soft Vibraphone / Melodic Synth)
    const leadEv = track.lead ? track.lead[step] : null;
    if (leadEv && leadEv.midi) {
      const durSec = stepDur * (leadEv.durSteps || 3);
      const vel = leadEv.vel || 0.15;
      this.playVibeLead(this.midiToFreq(leadEv.midi), vel, time, durSec);
    }

    // 4. Lo-Fi Percussion
    const drumEv = track.drums ? track.drums[step] : null;
    if (drumEv) {
      if (drumEv.kick) this.playLofiKick(time);
      if (drumEv.snare) this.playLofiSnare(time);
      if (drumEv.openHat) this.playLofiHat(time, true);
      else if (drumEv.hat) this.playLofiHat(time, false);
    }
  }

  // --- Duck Music for impactful SFX ---
  duckMusic(durationMs = 400) {
    if (!this.ctx || !this.musicBus || this.musicMuted) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicVol, t);
    this.musicBus.gain.linearRampToValueAtTime(this.musicVol * 0.4, t + 0.04);
    this.musicBus.gain.linearRampToValueAtTime(this.musicVol, t + durationMs / 1000);
  }

  // ==========================================
  // --- SOUND EFFECTS (SFX) ---
  // ==========================================
  playSfx(name, params = {}) {
    this.initContext();
    if (!this.ctx || this.sfxMuted || this.activeSfxCount >= 8) return;

    this.activeSfxCount++;
    const done = () => { this.activeSfxCount = Math.max(0, this.activeSfxCount - 1); };

    const t = this.ctx.currentTime;

    switch (name) {
      case "cueStrike": {
        const power = clamp(params.power || 0.5, 0.1, 1.0);
        // Noise tap + sine transient
        if (this.noiseBuffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = this.noiseBuffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(1600 * power, t);

          const nGain = this.ctx.createGain();
          nGain.gain.setValueAtTime(0.28 * power, t);
          nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

          noise.connect(filter);
          filter.connect(nGain);
          nGain.connect(this.sfxBus);
          noise.start(t);
          noise.stop(t + 0.05);
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(800 * power, t);
        osc.frequency.exponentialRampToValueAtTime(240, t + 0.06);

        gain.gain.setValueAtTime(0.35 * power, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.07);
        setTimeout(done, 80);
        break;
      }

      case "ballHit": {
        const speed = params.speed || 400;
        const vol = clamp(speed / 1400, 0.05, 0.45);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(850 + speed * 0.3, t);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.045);
        setTimeout(done, 50);
        break;
      }

      case "cushion": {
        if (this.noiseBuffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(650, t);

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.22, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

          src.connect(filter);
          filter.connect(gain);
          gain.connect(this.sfxBus);
          src.start(t);
          src.stop(t + 0.08);
        }
        setTimeout(done, 90);
        break;
      }

      case "pocketDrop": {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(480, t);
        osc.frequency.exponentialRampToValueAtTime(110, t + 0.25);

        gain.gain.setValueAtTime(0.38, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.26);
        setTimeout(done, 280);
        break;
      }

      case "foul": {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(140, t);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(400, t);

        gain.gain.setValueAtTime(0.28, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.23);
        setTimeout(done, 240);
        break;
      }

      case "uiMove": {
        // Soft mellow blip
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, t); // D5

        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.035);
        setTimeout(done, 40);
        break;
      }

      case "uiSelect": {
        // Two-tone warm chime (D5 -> A5)
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        const gain2 = this.ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(587.33, t);
        gain1.gain.setValueAtTime(0.15, t);
        gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc1.connect(gain1);
        gain1.connect(this.sfxBus);
        osc1.start(t);
        osc1.stop(t + 0.045);

        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, t + 0.035);
        gain2.gain.setValueAtTime(0.15, t + 0.035);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc2.connect(gain2);
        gain2.connect(this.sfxBus);
        osc2.start(t + 0.035);
        osc2.stop(t + 0.085);

        setTimeout(done, 90);
        break;
      }

      case "keyPress": {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(783.99, t);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.025);
        setTimeout(done, 30);
        break;
      }

      case "newRecord": {
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5]; // C5, E5, G5, B5, C6
        notes.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, t + idx * 0.07);

          gain.gain.setValueAtTime(0.15, t + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.07 + 0.08);

          osc.connect(gain);
          gain.connect(this.sfxBus);
          osc.start(t + idx * 0.07);
          osc.stop(t + idx * 0.07 + 0.09);
        });
        setTimeout(done, 450);
        break;
      }

      case "tick": {
        const pitch = params.pitch || 440;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(pitch, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.03);
        setTimeout(done, 40);
        break;
      }

      default:
        done();
        break;
    }
  }
}

export const audio = new SoundEngine();
audio.generateTracks();

// Browsers refuse to start an AudioContext outside a user gesture, so the first
// track requested at boot would otherwise sit silently suspended. Unlock on the
// first real interaction and resume whatever track is already queued.
if (typeof window !== "undefined") {
  const unlock = () => {
    audio.initContext();
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
  };
  ["pointerdown", "touchstart", "keydown"].forEach((evt) => {
    window.addEventListener(evt, unlock, { passive: true });
  });
  // A suspended context also stalls when the tab is backgrounded on mobile.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && audio.ctx && audio.ctx.state === "suspended") {
      audio.ctx.resume().catch(() => {});
    }
  });
}

