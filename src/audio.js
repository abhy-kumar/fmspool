import { CFG } from "./config.js";
import { makeRng } from "./rng.js";
import { clamp } from "./vec.js";

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterBus = null;
    this.musicBus = null;
    this.sfxBus = null;

    this.pulse25Wave = null;
    this.pulse50Wave = null;
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

    // Master bus
    this.masterBus = this.ctx.createGain();
    this.masterBus.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);
    this.masterBus.connect(this.ctx.destination);

    // Music bus
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.setValueAtTime(this.musicMuted ? 0 : this.musicVol, this.ctx.currentTime);
    this.musicBus.connect(this.masterBus);

    // SFX bus
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.setValueAtTime(this.sfxMuted ? 0 : this.sfxVol, this.ctx.currentTime);
    this.sfxBus.connect(this.masterBus);

    // Build Pulse PeriodicWaves (Fourier series)
    this.pulse25Wave = this.createPulseWave(0.25);
    this.pulse50Wave = this.createPulseWave(0.50);

    // Create 1-second noise buffer
    const bufferSize = this.ctx.sampleRate;
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = this.noiseBuffer.getChannelData(0);
    const rng = makeRng(777);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = rng() * 2 - 1;
    }

    // Start 2-clocks scheduler
    this.startScheduler();
  }

  createPulseWave(duty) {
    const n = 28;
    const real = new Float32Array(n + 1);
    const imag = new Float32Array(n + 1);
    real[0] = 0;
    imag[0] = 0;
    for (let i = 1; i <= n; i++) {
      real[i] = 0;
      imag[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    }
    return this.ctx.createPeriodicWave(real, imag);
  }

  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // --- Algorithmic Track Generation ---
  generateTracks() {
    this.tracks.TITLE = this.composeTrack("TITLE", 101, [
      { root: 57, chords: [57, 60, 64] }, // Am
      { root: 53, chords: [53, 57, 60] }, // F
      { root: 48, chords: [48, 52, 55] }, // C
      { root: 55, chords: [55, 59, 62] }, // G
    ], 16, 0.55, true);

    this.tracks.MATCH = this.composeTrack("MATCH", 202, [
      { root: 50, chords: [50, 53, 57] }, // Dm
      { root: 50, chords: [50, 53, 57] }, // Dm
      { root: 55, chords: [55, 58, 62] }, // Gm
      { root: 57, chords: [57, 61, 64] }, // A7
    ], 32, 0.28, true);

    this.tracks.TOURNEY = this.composeTrack("TOURNEY", 303, [
      { root: 52, chords: [52, 55, 59] }, // Em
      { root: 48, chords: [48, 52, 55] }, // C
      { root: 55, chords: [55, 59, 62] }, // G
      { root: 50, chords: [50, 54, 57] }, // D
    ], 24, 0.62, true);

    this.tracks.VICTORY = this.composeTrack("VICTORY", 404, [
      { root: 48, chords: [48, 52, 55, 60] }, // C
      { root: 55, chords: [55, 59, 62, 67] }, // G
      { root: 57, chords: [57, 60, 64, 69] }, // Am
      { root: 53, chords: [53, 57, 60, 65] }, // F
    ], 4, 0.70, false);

    this.tracks.DEFEAT = this.composeTrack("DEFEAT", 505, [
      { root: 57, chords: [57, 60, 64] }, // Am
      { root: 52, chords: [52, 56, 59] }, // E7
    ], 2, 0.40, false);
  }

  composeTrack(id, seed, progression, numBars, density, loop) {
    const rng = makeRng(seed);
    const stepsPerBar = 16;
    const totalSteps = numBars * stepsPerBar;

    const bassTrack = new Array(totalSteps).fill(0);
    const arpHarmony = new Array(totalSteps).fill(0);
    const leadTrack = new Array(totalSteps).fill(0);
    const drums = new Array(totalSteps).fill(null);

    let lastLeadMidi = progression[0].chords[0] + 12;

    for (let bar = 0; bar < numBars; bar++) {
      const chord = progression[bar % progression.length];
      const barStart = bar * stepsPerBar;

      // Bass: root note on steps 0, 6, 8, 14 (octave 2/3)
      const bassRoot = chord.root - 24; // Octave 2
      bassTrack[barStart + 0] = bassRoot;
      bassTrack[barStart + 6] = bassRoot;
      bassTrack[barStart + 8] = bassRoot;
      bassTrack[barStart + 14] = bassRoot - 2;

      // Harmony: Arpeggio chord tones on 8th notes (octave 4)
      for (let s = 0; s < 16; s += 2) {
        const tone = chord.chords[(s / 2) % chord.chords.length];
        arpHarmony[barStart + s] = tone;
      }

      // Lead: 16th note melody walk with pentatonic passing tones
      for (let s = 0; s < 16; s++) {
        if (rng() < density) {
          const delta = Math.floor(rng() * 9) - 4; // -4..+4 semitones
          lastLeadMidi = clamp(lastLeadMidi + delta, 60, 84);
          leadTrack[barStart + s] = lastLeadMidi;
        } else {
          leadTrack[barStart + s] = 0;
        }

        // Drums: Kick on 0,8; Snare on 4,12; Hat on even steps
        const isKick = s === 0 || s === 8;
        const isSnare = s === 4 || s === 12;
        const isHat = s % 2 === 0 || rng() < 0.2;

        drums[barStart + s] = { kick: isKick, snare: isSnare, hat: isHat };
      }
    }

    return { id, totalSteps, loop, bassTrack, arpHarmony, leadTrack, drums };
  }

  playTrack(trackName) {
    this.initContext();
    const track = this.tracks[trackName];
    if (!track) return;

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

      const stepDuration = 60 / CFG.BPM / 4; // 16th note in seconds
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
    }, CFG.SCHEDULE_TICK_MS);
  }

  scheduleStep(track, step, time, dur) {
    if (!this.ctx || this.musicMuted) return;

    // 1. Bass (Triangle)
    const bassMidi = track.bassTrack[step];
    if (bassMidi > 0) {
      this.playSynthNote(this.midiToFreq(bassMidi), "triangle", 0.25, time, dur * 1.5, this.musicBus);
    }

    // 2. Harmony (Pulse 50%)
    const arpHarmMidi = track.arpHarmony[step];
    if (arpHarmMidi > 0) {
      this.playPulseNote(this.midiToFreq(arpHarmMidi), this.pulse50Wave, 0.08, time, dur * 0.9, this.musicBus);
    }

    // 3. Lead (Pulse 25%)
    const leadMidi = track.leadTrack[step];
    if (leadMidi > 0) {
      this.playPulseNote(this.midiToFreq(leadMidi), this.pulse25Wave, 0.12, time, dur * 0.95, this.musicBus);
    }

    // 4. Drums
    const drum = track.drums[step];
    if (drum) {
      if (drum.kick) this.playKick(time);
      if (drum.snare) this.playSnare(time);
      if (drum.hat) this.playHat(time);
    }
  }

  // --- Voice Generators with ADSR Envelope ---
  playPulseNote(freq, periodicWave, vol, time, dur, bus) {
    if (!this.ctx || vol <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (periodicWave) osc.setPeriodicWave(periodicWave);
    else osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);

    // ADSR
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(vol * 0.6, time + 0.06);
    gain.gain.setValueAtTime(vol * 0.6, Math.max(time + 0.06, time + dur - 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    gain.connect(bus);

    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  playSynthNote(freq, type, vol, time, dur, bus) {
    if (!this.ctx || vol <= 0) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(vol * 0.6, time + 0.06);
    gain.gain.setValueAtTime(vol * 0.6, Math.max(time + 0.06, time + dur - 0.03));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(gain);
    gain.connect(bus);

    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  // Drums
  playKick(time) {
    if (!this.ctx || !this.noiseBuffer) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.08);

    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.09);
  }

  playSnare(time) {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(300, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);

    src.start(time);
    src.stop(time + 0.13);
  }

  playHat(time) {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(2000, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);

    src.start(time);
    src.stop(time + 0.05);
  }

  // --- Duck Music ---
  duckMusic(durationMs = 400) {
    if (!this.ctx || !this.musicBus || this.musicMuted) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicVol, t);
    this.musicBus.gain.linearRampToValueAtTime(this.musicVol * 0.5, t + 0.05);
    this.musicBus.gain.linearRampToValueAtTime(this.musicVol, t + durationMs / 1000);
  }

  // --- Sound Effects (SFX) ---
  playSfx(name, params = {}) {
    this.initContext();
    if (!this.ctx || this.sfxMuted || this.activeSfxCount >= 8) return;

    this.activeSfxCount++;
    const done = () => { this.activeSfxCount = Math.max(0, this.activeSfxCount - 1); };

    const t = this.ctx.currentTime;

    switch (name) {
      case "cueStrike": {
        const power = clamp(params.power || 0.5, 0.1, 1.0);
        // Noise burst + sine sweep
        if (this.noiseBuffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = this.noiseBuffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(1800 * power, t);

          const nGain = this.ctx.createGain();
          nGain.gain.setValueAtTime(0.3 * power, t);
          nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

          noise.connect(filter);
          filter.connect(nGain);
          nGain.connect(this.sfxBus);
          noise.start(t);
          noise.stop(t + 0.05);
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(900 * power, t);
        osc.frequency.exponentialRampToValueAtTime(260, t + 0.06);

        gain.gain.setValueAtTime(0.4 * power, t);
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
        const vol = clamp(speed / 1400, 0.05, 0.5);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(900 + speed * 0.35, t);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.05);
        setTimeout(done, 60);
        break;
      }

      case "cushion": {
        if (this.noiseBuffer) {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(700, t);

          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.25, t);
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
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.26);

        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.27);
        setTimeout(done, 300);
        break;
      }

      case "foul": {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(180, t);

        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.connect(gain);
        gain.connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + 0.23);
        setTimeout(done, 240);
        break;
      }

      case "uiMove": {
        this.playSynthNote(660, "square", 0.15, t, 0.025, this.sfxBus);
        setTimeout(done, 40);
        break;
      }

      case "uiSelect": {
        this.playSynthNote(880, "square", 0.2, t, 0.04, this.sfxBus);
        this.playSynthNote(1320, "square", 0.2, t + 0.04, 0.04, this.sfxBus);
        setTimeout(done, 100);
        break;
      }

      case "keyPress": {
        this.playSynthNote(1100, "square", 0.1, t, 0.018, this.sfxBus);
        setTimeout(done, 30);
        break;
      }

      case "newRecord": {
        const notes = [523.25, 659.25, 783.99, 987.77, 1046.5]; // C5, E5, G5, B5, C6
        notes.forEach((freq, idx) => {
          this.playPulseNote(freq, this.pulse25Wave, 0.2, t + idx * 0.08, 0.07, this.sfxBus);
        });
        setTimeout(done, 500);
        break;
      }

      case "tick": {
        const pitch = params.pitch || 440;
        this.playSynthNote(pitch, "square", 0.2, t, 0.03, this.sfxBus);
        setTimeout(done, 50);
        break;
      }

      default:
        done();
        break;
    }
  }

  setVolumes(master, music, sfx) {
    this.masterVol = master;
    this.musicVol = music;
    this.sfxVol = sfx;

    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.masterBus) this.masterBus.gain.setValueAtTime(master, t);
      if (this.musicBus) this.musicBus.gain.setValueAtTime(this.musicMuted ? 0 : music, t);
      if (this.sfxBus) this.sfxBus.gain.setValueAtTime(this.sfxMuted ? 0 : sfx, t);
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
