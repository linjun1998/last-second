import { RhythmStage } from '../data/difficultyConfig';
import {
  classifyVibrationPattern,
  HapticIntensity,
  shouldCompensateHapticsVisually,
  supportsSystemVibration,
} from '../utils/haptics';
import { GameSettings } from '../utils/storage';

export type NearMissTier = 'GODLIKE' | 'EXTREME' | 'CLOSE';

// MIDI to Hz helper for clean musical tuning
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 4-Bar Clockwork Progression (Dm -> Bbmaj7 -> Gm7 -> A7b9)
const CHORD_PROGRESSION = [
  { bassMidi: 38, arpMidis: [62, 65, 69, 74, 69, 65, 72, 69], bellMidi: 74 }, // Dm (D2 | D4 F4 A4 D5...)
  { bassMidi: 34, arpMidis: [62, 65, 69, 72, 69, 65, 74, 72], bellMidi: 72 }, // Bbmaj7 (Bb1 | D4 F4 A4 C5...)
  { bassMidi: 43, arpMidis: [62, 67, 70, 74, 70, 67, 76, 74], bellMidi: 70 }, // Gm (G2 | D4 G4 Bb4 D5...)
  { bassMidi: 33, arpMidis: [61, 64, 67, 70, 73, 70, 67, 64], bellMidi: 73 }, // A7b9 (A1 | C#4 E4 G4 Bb4 C#5...)
];

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterMusicGain: GainNode | null = null;
  private musicBusFilter: BiquadFilterNode | null = null;
  private subBassGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;

  // Charge synthesis nodes + discrete ratchet tracking
  private chargeOsc: OscillatorNode | null = null;
  private chargeSubOsc: OscillatorNode | null = null;
  private chargeLfoOsc: OscillatorNode | null = null;
  private chargeLfoGain: GainNode | null = null;
  private chargeFilter: BiquadFilterNode | null = null;
  private chargeGain: GainNode | null = null;
  private lastChargeNotch = 0;
  private maxChargePinged = false;

  // Pre-rendered organic acoustic sample buffers
  private heartbeatBuf: AudioBuffer | null = null;
  private shatterDeathBuf: AudioBuffer | null = null;
  private cashOutReliefBuf: AudioBuffer | null = null;
  private horrorStingBufs: AudioBuffer[] = [];

  // Lookahead procedural music sequencer state
  private schedulerTimer: number | null = null;
  private nextStepTime = 0;
  private currentStep16 = 0;
  private currentRound = 1;

  private decisionHeartbeatTimer: number | null = null;
  private rhythmStage: RhythmStage = 'PRESSURE';
  private dangerLevel = 1;
  private settings: GameSettings;
  private isSilenced = false;

  /**
   * Optional hook invoked when `vibrate()` is requested on a device without `navigator.vibrate`
   * (such as iOS Safari), enabling synchronized visual haptic micro-impulses in `GameEngine`.
   */
  public onVisualHapticCompensation?: (intensity: HapticIntensity) => void;

  constructor(settings: GameSettings) {
    this.settings = { ...settings };
  }

  public updateSettings(settings: GameSettings): void {
    this.settings = { ...settings };
    if (!this.settings.musicEnabled) {
      this.stopAmbience();
    } else if (this.ctx && this.ctx.state === 'running' && !this.droneOsc1 && !this.isSilenced) {
      this.startAmbience();
    }
    if (!this.settings.soundEnabled) {
      this.stopCharge();
      this.stopDecisionHeartbeat();
    }
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.bakeRealisticSampleBuffers(this.ctx);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private bakeRealisticSampleBuffers(ctx: AudioContext): void {
    const sr = ctx.sampleRate;

    // 1. Visceral Chest Lub-Dub Heartbeat Buffer (0.50s)
    {
      const len = Math.floor(sr * 0.5);
      const buf = ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        let s = 0;
        if (t < 0.19) {
          const env = Math.exp(-t * 22) * Math.sin(Math.min(1, t * 88) * (Math.PI / 2));
          const freq = 35 + 38 * Math.exp(-t * 26);
          s += Math.sin(2 * Math.PI * freq * t) * env * 0.95;
          s += (Math.random() * 2 - 1) * Math.exp(-t * 58) * 0.12;
        }
        if (t >= 0.195 && t < 0.44) {
          const dt = t - 0.195;
          const env2 = Math.exp(-dt * 26) * Math.sin(Math.min(1, dt * 105) * (Math.PI / 2));
          const freq2 = 39 + 44 * Math.exp(-dt * 32);
          s += Math.sin(2 * Math.PI * freq2 * dt) * env2 * 0.78;
          s += (Math.random() * 2 - 1) * Math.exp(-dt * 65) * 0.09;
        }
        data[i] = Math.tanh(s * 1.4);
      }
      this.heartbeatBuf = buf;
    }

    // 2. Heavy Sub-Bass Impact + Sapphire Watch-Crystal Shatter Buffer (0.88s)
    {
      const len = Math.floor(sr * 0.88);
      const buf = ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      const shardFreqs = [1420, 2180, 2890, 3640, 4510, 5820];
      const shardOffsets = [0.005, 0.024, 0.052, 0.088, 0.125, 0.17];
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const subFreq = 25 + 98 * Math.exp(-t * 15);
        const sub = Math.sin(2 * Math.PI * subFreq * t) * Math.exp(-t * 6.2) * 0.98;
        const crunch = (Math.random() * 2 - 1) * Math.exp(-t * 22) * 0.68;
        const metal =
          (Math.sin(2 * Math.PI * 234 * t) + 0.6 * Math.sin(2 * Math.PI * 381 * t)) *
          Math.exp(-t * 9.5) *
          0.32;
        let shards = 0;
        for (let k = 0; k < shardFreqs.length; k++) {
          const st = t - shardOffsets[k];
          if (st > 0) {
            shards +=
              Math.sin(2 * Math.PI * shardFreqs[k] * st + Math.sin(st * 90)) *
              Math.exp(-st * (24 + k * 4)) *
              0.16;
          }
        }
        data[i] = Math.tanh((sub + crunch + metal + shards) * 1.3);
      }
      this.shatterDeathBuf = buf;
    }

    // 3. Warm Cash-Out "Escapement Vault Lock & Sanctuary Pad" Buffer (2.15s)
    {
      const len = Math.floor(sr * 2.15);
      const buf = ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      const notes = [
        { f: 130.81, amp: 0.3 },
        { f: 196.0, amp: 0.24 },
        { f: 329.63, amp: 0.2 },
        { f: 493.88, amp: 0.15 },
        { f: 587.33, amp: 0.13 },
        { f: 783.99, amp: 0.08 },
      ];
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const latch =
          t < 0.04 ? Math.sin(2 * Math.PI * 740 * t) * Math.exp(-t * 90) * 0.32 : 0;
        const swell = Math.min(1, t / 0.14) * Math.exp(-t * 1.45);
        let pad = 0;
        for (let c = 0; c < notes.length; c++) {
          const { f, amp } = notes[c];
          const vib = Math.sin(2 * Math.PI * 4.2 * t + c) * 0.002;
          pad +=
            (Math.sin(2 * Math.PI * f * (1 + vib) * t) +
              0.5 * Math.sin(2 * Math.PI * f * 1.003 * t)) *
            amp;
        }
        const breathEnv = Math.sin(Math.min(1, t / 0.28) * Math.PI * 0.5) * Math.exp(-t * 2.9);
        const breath = (Math.random() * 2 - 1) * breathEnv * 0.038;
        data[i] = Math.tanh((latch + pad * swell * 0.85 + breath) * 1.05);
      }
      this.cashOutReliefBuf = buf;
    }

    // 4. Horror Sting Buffers
    this.horrorStingBufs = [0, 1, 2].map((variant) => {
      const len = Math.floor(sr * 0.52);
      const buf = ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      const fBase = variant === 0 ? 490 : variant === 1 ? 370 : 640;
      const fRatio = variant === 0 ? 1.414 : variant === 1 ? 1.618 : 1.333;

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.012) * Math.exp(-t * 6.2);
        const glide = 1 + (variant === 1 ? 0.35 : -0.28) * (t / 0.52);
        const fm = Math.sin(2 * Math.PI * (68 + variant * 23) * t) * 1.8;
        const screech =
          Math.sin(2 * Math.PI * fBase * glide * t + fm) * 0.5 +
          Math.sin(2 * Math.PI * fBase * fRatio * glide * t - fm * 0.7) * 0.42;
        const subJolt = Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t * 14) * 0.65;
        data[i] = Math.tanh((screech * env + subJolt) * 1.25);
      }
      return buf;
    });
  }

  private playBuffer(buf: AudioBuffer | null, volume = 0.5, playbackRate = 1): void {
    if (!buf || !this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = playbackRate;
    gain.gain.value = volume;

    src.connect(gain);
    gain.connect(this.ctx.destination);
    src.start();
  }

  /**
   * Cross-platform Haptic Feedback with automatic iOS Compensation:
   * - Respects `vibrationEnabled` AND `reduceFlashAndShake`.
   * - Uses `navigator.vibrate` on Android/supported browsers.
   * - On iOS Safari (where `navigator.vibrate` is missing), synthesizes a tight low-end
   *   speaker Taptic thump (56Hz -> 32Hz) + triggers synchronized visual micro-impulse!
   */
  public vibrate(pattern: number | number[]): void {
    if (!this.settings.vibrationEnabled || this.settings.reduceFlashAndShake) return;

    if (supportsSystemVibration()) {
      try {
        navigator.vibrate(pattern);
        return;
      } catch {
        // Fall through to compensation if blocked
      }
    }

    const intensity = classifyVibrationPattern(pattern);
    this.playAcousticTapticThump(intensity);
    if (shouldCompensateHapticsVisually(this.settings)) {
      this.onVisualHapticCompensation?.(intensity);
    }
  }

  /**
   * Synthesizes a short, clean sub-bass speaker excursion impulse (32Hz–68Hz)
   * that produces perceptible physical fingertip resonance on iPhone stereo speakers.
   */
  private playAcousticTapticThump(intensity: HapticIntensity): void {
    if (!this.settings.soundEnabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const startHz =
      intensity === 'CRITICAL' ? 76 : intensity === 'HEAVY' ? 68 : intensity === 'MEDIUM' ? 62 : 56;
    const dur =
      intensity === 'CRITICAL'
        ? 0.045
        : intensity === 'HEAVY'
        ? 0.036
        : intensity === 'MEDIUM'
        ? 0.026
        : 0.018;
    const peakGain =
      intensity === 'CRITICAL'
        ? 0.22
        : intensity === 'HEAVY'
        ? 0.16
        : intensity === 'MEDIUM'
        ? 0.11
        : 0.07;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, now);
    osc.frequency.exponentialRampToValueAtTime(31, now + dur);

    gain.gain.setValueAtTime(peakGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + dur);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.005);
  }

  /**
   * Starts the Procedural Round-Progressive Clockwork Background Music!
   */
  public startAmbience(): void {
    if (!this.settings.musicEnabled) return;
    this.unlock();
    if (!this.ctx || this.droneOsc1) return;

    this.isSilenced = false;
    const now = this.ctx.currentTime;

    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.001, now);
    master.gain.exponentialRampToValueAtTime(0.86, now + 0.45);
    master.connect(this.ctx.destination);
    this.masterMusicGain = master;

    // Master musical bus lowpass filter (opens brighter as rounds progress, darkens during bullet-time)
    const busFilter = this.ctx.createBiquadFilter();
    busFilter.type = 'lowpass';
    busFilter.frequency.setValueAtTime(2400, now);
    busFilter.Q.setValueAtTime(0.8, now);
    busFilter.connect(master);
    this.musicBusFilter = busFilter;

    // Warm D1/D2 Horological Room Resonance Drone
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const subGain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(midiToFreq(38), now); // D2 (73.42 Hz)
    osc2.frequency.setValueAtTime(midiToFreq(26) * 1.003, now); // D1 sub (36.82 Hz)

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);
    filter.Q.setValueAtTime(2.6, now);

    subGain.gain.setValueAtTime(0.055, now);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(subGain);
    subGain.connect(busFilter);

    osc1.start(now);
    osc2.start(now);

    this.droneOsc1 = osc1;
    this.droneOsc2 = osc2;
    this.droneFilter = filter;
    this.subBassGain = subGain;

    this.currentStep16 = 0;
    this.nextStepTime = now + 0.05;
    this.startMusicScheduler();
  }

  public stopAmbience(): void {
    this.stopDecisionHeartbeat();
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.ctx && this.masterMusicGain) {
      const now = this.ctx.currentTime;
      try {
        this.masterMusicGain.gain.setTargetAtTime(0.0001, now, 0.06);
        this.droneOsc1?.stop(now + 0.16);
        this.droneOsc2?.stop(now + 0.16);
      } catch {
        // Ignore
      }
    }
    this.droneOsc1 = null;
    this.droneOsc2 = null;
    this.droneFilter = null;
    this.subBassGain = null;
    this.musicBusFilter = null;
    this.masterMusicGain = null;
  }

  /**
   * Updates BGM arrangement density, filter brightness, and tempo dynamically with `round` & `stage`!
   */
  public setIntensity(stage: RhythmStage, dangerLevel: number, round = this.currentRound): void {
    this.rhythmStage = stage;
    this.dangerLevel = dangerLevel;
    this.currentRound = Math.max(1, round);

    if (this.droneFilter && this.subBassGain && this.musicBusFilter && this.ctx) {
      const now = this.ctx.currentTime;
      const roundNorm = Math.min(1, (this.currentRound - 1) / 11);
      const targetDroneCutoff =
        stage === 'FRENZY'
          ? 340 + dangerLevel * 28
          : 135 + roundNorm * 140 + dangerLevel * 14;
      const targetSubVol =
        stage === 'FRENZY' ? 0.095 : 0.05 + roundNorm * 0.035;
      const targetBusCutoff =
        stage === 'FRENZY' ? 5200 : 1900 + roundNorm * 2600;

      this.droneFilter.frequency.setTargetAtTime(targetDroneCutoff, now, 0.25);
      this.subBassGain.gain.setTargetAtTime(targetSubVol, now, 0.25);
      this.musicBusFilter.frequency.setTargetAtTime(targetBusCutoff, now, 0.25);
    }
  }

  /**
   * Modulates music filter during slow-motion bullet-time so time dilation is audible!
   */
  public setBulletTimeAudio(active: boolean): void {
    if (!this.ctx || !this.musicBusFilter || !this.settings.musicEnabled) return;
    const now = this.ctx.currentTime;
    if (active) {
      this.musicBusFilter.frequency.setTargetAtTime(620, now, 0.03);
    } else {
      const roundNorm = Math.min(1, (this.currentRound - 1) / 11);
      const normalCutoff = this.rhythmStage === 'FRENZY' ? 5200 : 1900 + roundNorm * 2600;
      this.musicBusFilter.frequency.setTargetAtTime(normalCutoff, now, 0.14);
    }
  }

  private getCurrentBpm(): number {
    // Round 1 starts at a poised 104 BPM; accelerates progressively every round up to ~158 BPM in Frenzy!
    const roundBoost = Math.min(38, (this.currentRound - 1) * 3.5);
    const stageBoost =
      this.rhythmStage === 'FRENZY' ? 14 : this.rhythmStage === 'EXCITEMENT' ? 6 : 0;
    const dangerBoost = Math.max(0, this.dangerLevel - 1) * 1.8;
    return Math.min(162, 104 + roundBoost + stageBoost + dangerBoost);
  }

  private startMusicScheduler(): void {
    if (this.schedulerTimer !== null) {
      window.clearInterval(this.schedulerTimer);
    }
    const lookaheadMs = 35;
    const scheduleAheadSec = 0.13;

    this.schedulerTimer = window.setInterval(() => {
      if (
        !this.settings.musicEnabled ||
        !this.ctx ||
        this.ctx.state !== 'running' ||
        !this.musicBusFilter
      ) {
        return;
      }

      const now = this.ctx.currentTime;
      if (this.nextStepTime < now - 0.05) {
        this.nextStepTime = now + 0.02;
      }

      while (this.nextStepTime < now + scheduleAheadSec) {
        if (!this.isSilenced) {
          this.scheduleClockworkMusicStep(this.currentStep16, this.nextStepTime);
        }
        const secondsPerBeat = 60 / this.getCurrentBpm();
        const sixteenthSec = secondsPerBeat * 0.25;
        this.nextStepTime += sixteenthSec;
        this.currentStep16 = (this.currentStep16 + 1) % 64;
      }
    }, lookaheadMs);
  }

  /**
   * Schedules 1 sixteenth-note step of the 4-bar procedural Giant Clockwork soundtrack.
   */
  private scheduleClockworkMusicStep(step64: number, time: number): void {
    if (!this.ctx || !this.musicBusFilter) return;

    const barIdx = Math.floor(step64 / 16) % 4;
    const stepInBar = step64 % 16;
    const chord = CHORD_PROGRESSION[barIdx];
    const round = this.currentRound;
    const isFrenzy = this.rhythmStage === 'FRENZY';

    // LAYER 1 (All Rounds): Precision Watch Escapement Tick-Tock on 8th notes + Warm Pulse Kick
    if (stepInBar % 2 === 0) {
      const isDownbeatTick = stepInBar % 4 === 0;
      this.scheduleEscapementTick(time, isDownbeatTick, isFrenzy ? 0.052 : 0.036);
    }

    // Warm Horological Kick on beats 1 & 3 (plus syncopated ghost kick from Round 5+)
    if (
      stepInBar === 0 ||
      stepInBar === 8 ||
      ((round >= 5 || isFrenzy) && stepInBar === 14)
    ) {
      const kickVol =
        stepInBar === 0 ? 0.17 : stepInBar === 8 ? 0.135 : 0.09;
      this.scheduleWarmKick(time, kickVol + (isFrenzy ? 0.035 : 0));
    }

    // LAYER 2 (All Rounds): Plucked Horological Ostinato (Music-Box / Harpsichord Escapement)
    // Round 1-5: Poised 8th-note arpeggio; Round 6+ or Frenzy: Urgent 16th-note clockwork drive!
    const playArp =
      round >= 6 || isFrenzy ? true : stepInBar % 2 === 0;
    if (playArp) {
      const arpIdx = Math.floor(stepInBar / 2) % chord.arpMidis.length;
      const baseMidi = chord.arpMidis[arpIdx];
      // On odd 16ths in high rounds, jump an octave or fifth for sparkling perpetual-motion tension
      const noteMidi =
        stepInBar % 2 === 1 ? baseMidi + (stepInBar % 4 === 3 ? 12 : 0) : baseMidi;
      const accent = stepInBar % 4 === 0 ? 1.2 : 0.82;
      const arpVol = (0.048 + Math.min(0.032, round * 0.003)) * accent;
      this.scheduleClockworkPluck(time, midiToFreq(noteMidi), arpVol, round >= 5 || isFrenzy);
    }

    // LAYER 3 (Round 3+): Rolling Octave Synth Bass + Off-Beat Gear-Ratchet Hi-Hat
    if (round >= 3 || isFrenzy) {
      if (stepInBar % 2 === 0 || (round >= 7 && stepInBar % 4 === 3)) {
        const octaveUp = stepInBar % 4 === 2 ? 12 : 0;
        const bassFreq = midiToFreq(chord.bassMidi + octaveUp);
        const bassVol = isFrenzy ? 0.105 : 0.072 + Math.min(0.025, (round - 3) * 0.004);
        this.scheduleBassPulse(time, bassFreq, bassVol);
      }

      // Crisp metallic off-beat gear-ratchet hat on `step % 4 === 2`
      if (stepInBar % 4 === 2 || (isFrenzy && stepInBar % 2 === 1)) {
        this.scheduleGearHat(time, stepInBar % 4 === 2 ? 0.032 : 0.016);
      }
    }

    // LAYER 4 (Round 7+ or FRENZY): Grand Tower Carillon / Chime Bell Counter-Melody!
    if (round >= 7 || isFrenzy) {
      if (stepInBar === 0 || (isFrenzy && stepInBar === 6) || (barIdx === 3 && stepInBar === 12)) {
        const bellMidi =
          stepInBar === 6
            ? chord.bellMidi + 3
            : stepInBar === 12
            ? chord.bellMidi + 1
            : chord.bellMidi;
        const bellVol = isFrenzy ? 0.088 : 0.062;
        this.scheduleTowerChimeBell(time, midiToFreq(bellMidi), bellVol);
      }
    }
  }

  private scheduleEscapementTick(time: number, highTick: boolean, vol: number): void {
    if (!this.ctx || !this.musicBusFilter) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const f = highTick ? 2420 : 1680;
    osc.frequency.setValueAtTime(f, time);
    osc.frequency.exponentialRampToValueAtTime(f * 0.45, time + 0.018);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(f, time);
    filter.Q.setValueAtTime(3.2, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + 0.022);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBusFilter);
    osc.start(time);
    osc.stop(time + 0.026);
  }

  private scheduleWarmKick(time: number, vol: number): void {
    if (!this.ctx || !this.musicBusFilter) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.11);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + 0.13);

    osc.connect(gain);
    gain.connect(this.musicBusFilter);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private scheduleClockworkPluck(
    time: number,
    freq: number,
    vol: number,
    bright: boolean
  ): void {
    if (!this.ctx || !this.musicBusFilter) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = bright ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(bright ? freq * 5.2 : freq * 3.1, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.15, time + 0.16);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0006, time + 0.19);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBusFilter);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private scheduleBassPulse(time: number, freq: number, vol: number): void {
    if (!this.ctx || !this.musicBusFilter) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, time);
    filter.frequency.exponentialRampToValueAtTime(115, time + 0.12);
    filter.Q.setValueAtTime(2.4, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0008, time + 0.13);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBusFilter);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private scheduleGearHat(time: number, vol: number): void {
    if (!this.ctx || !this.musicBusFilter) return;
    // Dual inharmonic high square oscillators create a crisp metallic horological ratchet hat
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = 'square';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(3480, time);
    osc2.frequency.setValueAtTime(5190, time);

    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2800, time);

    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.0005, time + 0.038);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBusFilter);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.042);
    osc2.stop(time + 0.042);
  }

  private scheduleTowerChimeBell(time: number, freq: number, vol: number): void {
    if (!this.ctx || !this.musicBusFilter) return;
    // 2-Operator FM synthesis for authentic bronze clock-tower tubular bell harmonics (1 : 2.756)
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const outGain = this.ctx.createGain();

    carrier.type = 'sine';
    mod.type = 'sine';
    carrier.frequency.setValueAtTime(freq, time);
    mod.frequency.setValueAtTime(freq * 2.756, time);

    modGain.gain.setValueAtTime(freq * 1.35, time);
    modGain.gain.exponentialRampToValueAtTime(1, time + 0.35);

    outGain.gain.setValueAtTime(0.001, time);
    outGain.gain.linearRampToValueAtTime(vol, time + 0.008);
    outGain.gain.exponentialRampToValueAtTime(0.0006, time + 0.58);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(outGain);
    outGain.connect(this.musicBusFilter);

    carrier.start(time);
    mod.start(time);
    carrier.stop(time + 0.6);
    mod.stop(time + 0.6);
  }

  /** Deep sidechain-style BGM ducking during near-miss / last-second so adrenaline SFX cuts through! */
  public duckMusicForNearMiss(durationMs = 720): void {
    if (!this.ctx || !this.masterMusicGain || this.isSilenced) return;
    const now = this.ctx.currentTime;
    this.masterMusicGain.gain.cancelScheduledValues(now);
    this.masterMusicGain.gain.setTargetAtTime(0.06, now, 0.012);
    this.masterMusicGain.gain.setTargetAtTime(0.86, now + durationMs / 1000, 0.22);

    this.playBuffer(this.heartbeatBuf, 0.7, 1.15);
  }

  /**
   * Psychological Decision Phase Heartbeat
   */
  public startDecisionHeartbeat(round: number, dangerLevel: number, onBeat?: () => void): void {
    this.stopDecisionHeartbeat();
    if (!this.settings.soundEnabled) return;
    this.unlock();

    if (this.masterMusicGain && this.ctx && !this.isSilenced) {
      this.masterMusicGain.gain.setTargetAtTime(0.28, this.ctx.currentTime, 0.15);
    }

    // Intensity halved by design (review fix): gentler tempo climb, volume and vibration.
    const pressureScore = Math.min(12, round + dangerLevel * 1.4);
    const effPressure = pressureScore * 0.5;
    const intervalMs = Math.max(560, Math.round(920 - effPressure * 42));
    const vol = Math.min(0.45, 0.24 + effPressure * 0.03);
    const rate = 0.98 + effPressure * 0.022;

    const triggerOnce = () => {
      if (!this.settings.soundEnabled) return;
      this.playBuffer(this.heartbeatBuf, vol, rate);
      this.vibrate(pressureScore >= 7 ? [10, 30, 8] : 8);
      onBeat?.();
    };

    triggerOnce();
    this.decisionHeartbeatTimer = window.setInterval(triggerOnce, intervalMs);
  }

  public stopDecisionHeartbeat(): void {
    if (this.decisionHeartbeatTimer !== null) {
      window.clearInterval(this.decisionHeartbeatTimer);
      this.decisionHeartbeatTimer = null;
    }
    if (this.masterMusicGain && this.ctx && !this.isSilenced && this.settings.musicEnabled) {
      this.masterMusicGain.gain.setTargetAtTime(0.86, this.ctx.currentTime, 0.2);
    }
  }

  public triggerSuddenSilence(durationMs = 1100): void {
    this.isSilenced = true;
    if (this.masterMusicGain && this.ctx) {
      this.masterMusicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.masterMusicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.015);
    }
    window.setTimeout(() => {
      this.isSilenced = false;
      if (this.masterMusicGain && this.ctx && this.settings.musicEnabled) {
        this.masterMusicGain.gain.setTargetAtTime(0.86, this.ctx.currentTime, 0.16);
      }
    }, durationMs);
  }

  /**
   * Starts Horological Mainspring Charge Audio:
   * Continuous rising tension + resonant filter + LFO flutter + discrete mechanical ratchet clicks!
   */
  public startCharge(): void {
    this.lastChargeNotch = 0;
    this.maxChargePinged = false;
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;
    this.stopCharge();
    this.lastChargeNotch = 0;
    this.maxChargePinged = false;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    sub.type = 'triangle';
    osc.frequency.setValueAtTime(175, now);
    sub.frequency.setValueAtTime(87.5, now);

    // Tension vibrato LFO that speeds up and widens as charge nears 100%!
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(4.5, now);
    lfoGain.gain.setValueAtTime(1.5, now);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, now);
    filter.Q.setValueAtTime(2.5, now);

    gain.gain.setValueAtTime(0.008, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.06);

    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    sub.start(now);
    lfo.start(now);

    this.chargeOsc = osc;
    this.chargeSubOsc = sub;
    this.chargeLfoOsc = lfo;
    this.chargeLfoGain = lfoGain;
    this.chargeFilter = filter;
    this.chargeGain = gain;

    // Initial subtle ratchet engagement click on finger press
    this.playChargeRatchetClick(0.05);
  }

  public updateCharge(easedRatio: number): void {
    const clamped = Math.max(0, Math.min(1, easedRatio));

    // Discrete 12-step winding mainspring ratchet clicks ("咔-咔-咔-叮！")
    const notch = Math.floor(clamped * 12);
    if (notch > this.lastChargeNotch && notch <= 11) {
      this.lastChargeNotch = notch;
      this.playChargeRatchetClick(clamped);
      if (notch >= 8) {
        this.vibrate(8);
      }
    }

    // Peak Full-Charge Lock Ping at >= 98%
    if (clamped >= 0.98 && !this.maxChargePinged) {
      this.maxChargePinged = true;
      this.playMaxChargeLockPing();
      this.vibrate([14, 18, 16]);
    }

    if (
      !this.chargeOsc ||
      !this.chargeSubOsc ||
      !this.chargeGain ||
      !this.chargeFilter ||
      !this.chargeLfoOsc ||
      !this.chargeLfoGain ||
      !this.ctx ||
      !this.settings.soundEnabled
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    // Exponential tension curve in the top 30% of charge!
    const highTension = Math.pow(clamped, 1.65);
    const f = 175 + clamped * 440 + highTension * 310;
    this.chargeOsc.frequency.setTargetAtTime(f, now, 0.02);
    this.chargeSubOsc.frequency.setTargetAtTime(f * 0.5, now, 0.02);

    this.chargeFilter.frequency.setTargetAtTime(460 + highTension * 2350, now, 0.02);
    this.chargeFilter.Q.setTargetAtTime(2.5 + highTension * 6.2, now, 0.02);

    // Accelerating LFO flutter near max charge creates unmistakable urgency
    this.chargeLfoOsc.frequency.setTargetAtTime(4.5 + highTension * 17.5, now, 0.025);
    this.chargeLfoGain.gain.setTargetAtTime(1.5 + highTension * 18, now, 0.025);

    this.chargeGain.gain.setTargetAtTime(0.042 + clamped * 0.088, now, 0.02);
  }

  private playChargeRatchetClick(ratio: number): void {
    if (!this.settings.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const clickFreq = 680 + ratio * 1380;
    osc.frequency.setValueAtTime(clickFreq, now);
    osc.frequency.exponentialRampToValueAtTime(clickFreq * 0.55, now + 0.022);

    gain.gain.setValueAtTime(0.032 + ratio * 0.048, now);
    gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.025);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.028);
  }

  private playMaxChargeLockPing(): void {
    if (!this.settings.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    [1567.98, 2349.32].forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.018;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.095, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  public stopCharge(): void {
    if (this.ctx && (this.chargeOsc || this.chargeSubOsc || this.chargeLfoOsc)) {
      try {
        const now = this.ctx.currentTime;
        this.chargeGain?.gain.setTargetAtTime(0.0001, now, 0.016);
        this.chargeOsc?.stop(now + 0.04);
        this.chargeSubOsc?.stop(now + 0.04);
        this.chargeLfoOsc?.stop(now + 0.04);
      } catch {
        // Ignore
      }
    }
    this.chargeOsc = null;
    this.chargeSubOsc = null;
    this.chargeLfoOsc = null;
    this.chargeLfoGain = null;
    this.chargeFilter = null;
    this.chargeGain = null;
  }

  public playDash(power = 0.7): void {
    this.stopCharge();
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Crisp mainspring release snap + aerodynamic whoosh
    const osc = this.ctx.createOscillator();
    const snap = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const snapGain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 + power * 420, now);
    osc.frequency.exponentialRampToValueAtTime(105, now + 0.14);

    gain.gain.setValueAtTime(0.15 + power * 0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    snap.type = 'sine';
    snap.frequency.setValueAtTime(1320 + power * 600, now);
    snap.frequency.exponentialRampToValueAtTime(340, now + 0.035);
    snapGain.gain.setValueAtTime(0.08 * power, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    snap.connect(snapGain);
    snapGain.connect(this.ctx.destination);

    osc.start(now);
    snap.start(now);
    osc.stop(now + 0.16);
    snap.stop(now + 0.045);

    this.vibrate(Math.round(12 + power * 16));
  }

  public playLandingThud(power = 0.6): void {
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135 + power * 40, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.085);

    gain.gain.setValueAtTime(0.09 * power + 0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);

    if (power > 0.65) {
      this.vibrate(10);
    }
  }

  public playWarning(level = 1): void {
    if (!this.settings.soundEnabled || this.isSilenced) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const freq = 360 + level * 52;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.setValueAtTime(freq * 1.15, now + 0.055);

    gain.gain.setValueAtTime(0.048, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playNearMiss(tier: NearMissTier, combo: number): void {
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    this.duckMusicForNearMiss(tier === 'GODLIKE' ? 920 : tier === 'EXTREME' ? 700 : 500);

    const now = this.ctx.currentTime;
    const base =
      (tier === 'GODLIKE' ? 1180 : tier === 'EXTREME' ? 920 : 740) +
      Math.min(combo, 10) * 45;

    const harmonics =
      tier === 'GODLIKE'
        ? [base, base * 1.25, base * 1.5, base * 2.02]
        : tier === 'EXTREME'
        ? [base, base * 1.25, base * 1.5]
        : [base, base * 1.33];

    harmonics.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === harmonics.length - 1 ? 'triangle' : 'sine';
      const t = now + idx * 0.026;
      osc.frequency.setValueAtTime(freq, t);
      const vol = tier === 'GODLIKE' ? 0.165 : tier === 'EXTREME' ? 0.135 : 0.1;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + (tier === 'GODLIKE' ? 0.44 : 0.28));
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.46);
    });

    if (tier === 'GODLIKE') {
      this.vibrate([28, 22, 38, 22, 45]);
    } else if (tier === 'EXTREME') {
      this.vibrate([22, 25, 30]);
    } else {
      this.vibrate(18);
    }
  }

  /**
   * Dedicated "LAST SECOND" (<=0.25s) Escape Sound:
   * Sharp escapement gear-freeze latch + radiant golden D-major triad bell flourish!
   */
  public playLastSecondEscape(): void {
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    this.duckMusicForNearMiss(680);

    const now = this.ctx.currentTime;

    // 1. Crisp mechanical escapement lock click at t=0
    const latch = this.ctx.createOscillator();
    const latchGain = this.ctx.createGain();
    latch.type = 'square';
    latch.frequency.setValueAtTime(1920, now);
    latch.frequency.exponentialRampToValueAtTime(480, now + 0.032);
    latchGain.gain.setValueAtTime(0.09, now);
    latchGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.036);
    latch.connect(latchGain);
    latchGain.connect(this.ctx.destination);
    latch.start(now);
    latch.stop(now + 0.04);

    // 2. Radiant golden bell chord (D5 - F#5 - A5 - D6)
    const notes = [587.33, 739.99, 880.0, 1174.66];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 3 ? 'triangle' : 'sine';
      const t = now + 0.02 + idx * 0.028;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.38);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });

    this.vibrate([24, 20, 36]);
  }

  /**
   * Dedicated Revive Time-Rewind Sound:
   * Rapid reverse-winding clockwork gear cascade + luminous rising sanctuary chord!
   */
  public playReviveRewind(): void {
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 1. 8-step accelerating reverse gear-winding ticks
    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.036;
      const tick = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      tick.type = 'triangle';
      const f = 320 * Math.pow(1.19, i);
      tick.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.075, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.032);
      tick.connect(g);
      g.connect(this.ctx.destination);
      tick.start(t);
      tick.stop(t + 0.035);
    }

    // 2. Warm resurrected Time Spark shimmer chord at t=0.26s
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = idx === 3 ? 'triangle' : 'sine';
      const t = now + 0.25 + idx * 0.022;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.13, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.48);
    });

    this.vibrate([20, 28, 36]);
  }

  public playRoundClear(combo: number): void {
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const pitch = 440 + Math.min(combo, 12) * 35;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(pitch, now);
    osc1.frequency.setValueAtTime(pitch * 1.25, now + 0.075);
    osc2.frequency.setValueAtTime(pitch * 1.5, now + 0.075);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.075);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  }

  public playHorrorTwist(variant = 0): void {
    if (!this.settings.soundEnabled) return;
    const buf =
      this.horrorStingBufs.length > 0
        ? this.horrorStingBufs[variant % this.horrorStingBufs.length]
        : null;
    const vol = this.settings.reduceScare ? 0.22 : 0.58;
    const rate = 0.92 + ((variant * 7) % 5) * 0.04;
    this.playBuffer(buf, vol, rate);

    if (!this.settings.reduceScare) {
      this.vibrate([35, 25, 48]);
    }
  }

  public playFail(): void {
    this.stopCharge();
    this.stopDecisionHeartbeat();
    this.playBuffer(this.shatterDeathBuf, 0.82, 1.0);
    this.vibrate([65, 35, 95]);
  }

  public playCashOut(): void {
    this.stopCharge();
    this.stopDecisionHeartbeat();
    this.playBuffer(this.cashOutReliefBuf, 0.85, 1.0);
    this.vibrate([18, 35, 25]);
  }

  public playDeceptionCue(
    kind: 'FAKE_SAFETY' | 'INVERT_GLITCH' | 'SONAR_PING' | 'LOCK_ON'
  ): void {
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const volScale = this.settings.reduceScare ? 0.6 : 1.0;

    if (kind === 'SONAR_PING') {
      [0, 0.16].forEach((delay, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1140, now + delay);
        const peak = (idx === 0 ? 0.14 : 0.06) * volScale;
        gain.gain.setValueAtTime(peak, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0008, now + delay + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.24);
      });
      this.vibrate(16);
      return;
    }

    if (kind === 'INVERT_GLITCH') {
      const freqs = [720, 340, 860];
      freqs.forEach((f, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        const t = now + idx * 0.055;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.075 * volScale, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.055);
      });
      this.vibrate([12, 18, 12]);
      return;
    }

    if (kind === 'FAKE_SAFETY') {
      [0, 0.12].forEach((delay, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        const startF = idx === 0 ? 440 : 580;
        osc.frequency.setValueAtTime(startF, now + delay);
        osc.frequency.exponentialRampToValueAtTime(startF * 1.45, now + delay + 0.09);
        gain.gain.setValueAtTime(0.11 * volScale, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.11);
      });
      this.vibrate([18, 24, 18]);
      return;
    }

    [0, 0.085].forEach((delay, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx === 0 ? 820 : 1090, now + delay);
      gain.gain.setValueAtTime(0.09 * volScale, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.07);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.075);
    });
  }

  public playShardPickup(): void {
    if (!this.settings.soundEnabled) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [880, 1318.5, 1760];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx === 2 ? 'triangle' : 'sine';
      const t = now + idx * 0.032;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.13, t);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.24);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.26);
    });
    this.vibrate([14, 18, 22]);
  }

  public destroy(): void {
    this.stopCharge();
    this.stopAmbience();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
