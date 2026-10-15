/**
 * Original procedural audio: every sound effect and the ambient music are synthesised with
 * the Web Audio API at runtime, so there are no audio files to license or download.
 */
import { NPCS } from '../content';

type Vec3 = [number, number, number];

export interface PlayOpts {
  volume?: number;
  pitch?: number;
  pos?: Vec3;
}

const CAPTIONS: Record<string, string> = {
  break: 'Block breaks',
  pickup: 'Item picked up',
  craft: 'Crafting success',
  gate: 'Gate rumbles open',
  water: 'Water rushes',
  machine: 'Machine whirs',
  bubbles: 'Bubbles gurgle',
  melt: 'Ice sizzles and melts',
  build: 'Stone block placed',
  zoneComplete: 'Fanfare plays',
  celebrate: 'Celebration!',
  secret: 'Mysterious chime',
  chest: 'Chest opens',
  lava: 'Lava sizzles',
  correct: 'Correct!',
  wrong: 'Try again',
  achievement: 'Achievement chime',
  level: 'Level up!',
  reactor: 'Reactor powers up',
};

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private nextPadTime = 0;
  private padIndex = 0;
  listener: { pos: Vec3; yaw: number } = { pos: [0, 0, 0], yaw: 0 };
  onCaption: ((text: string) => void) | null = null;
  private volumes = { master: 0.8, music: 0.45, sfx: 0.8, muted: false };
  private loops = new Map<string, { gain: GainNode; stop: () => void }>();

  /** Must be called from a user gesture (click / key press). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    // generated impulse response reverb
    const len = Math.floor(ctx.sampleRate * 2.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuffer = nb;
    this.applyVolumes();
  }

  setVolumes(master: number, music: number, sfx: number, muted: boolean) {
    this.volumes = { master, music, sfx, muted };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.5, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  // ---------------------------------------------------------------- building blocks
  private out(opts: PlayOpts): AudioNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    let vol = opts.volume ?? 1;
    if (opts.pos) {
      const [lx, ly, lz] = this.listener.pos;
      const dx = opts.pos[0] - lx, dy = opts.pos[1] - ly, dz = opts.pos[2] - lz;
      const d = Math.hypot(dx, dy, dz);
      vol *= Math.max(0, 1 - d / 26) ** 1.3;
      if (vol <= 0.001) vol = 0;
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        // listener right vector for yaw (yaw 0 faces +Z, right is -X)
        const rx = -Math.cos(this.listener.yaw), rz = Math.sin(this.listener.yaw);
        pan.pan.value = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
        g.connect(pan);
        pan.connect(this.sfxBus);
      } else g.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    g.gain.value = vol;
    return g;
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, start: number, dur: number, vol: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private noise(dest: AudioNode, start: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, q = 1, freqEnd?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, start);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.05);
  }

  // ---------------------------------------------------------------- public api
  play(name: string, opts: PlayOpts = {}) {
    if (!this.ctx || this.volumes.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const p = opts.pitch ?? 1;
    const dest = this.out(opts);
    const r = () => 0.9 + Math.random() * 0.2;
    if (CAPTIONS[name] && this.onCaption) this.onCaption(CAPTIONS[name]);

    if (name.startsWith('talk:')) {
      const npc = NPCS[name.slice(5)];
      const vp = (npc?.voicePitch ?? 1) * p;
      // Three short nasal syllables with a rising/falling contour.
      const contour = [1, 1.25, 0.9, 1.1];
      for (let i = 0; i < 3; i++) {
        const st = t + i * 0.13;
        const f = 170 * vp * contour[(i + Math.floor(Math.random() * 2)) % 4];
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, st);
        o.frequency.linearRampToValueAtTime(f * (i === 2 ? 0.8 : 1.15), st + 0.11);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 900 * vp;
        bp.Q.value = 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(0.35, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
        o.connect(bp);
        bp.connect(g);
        g.connect(dest);
        o.start(st);
        o.stop(st + 0.15);
      }
      return;
    }

    switch (name) {
      case 'step':
        this.noise(dest, t, 0.09, 0.22 * (opts.volume ?? 1), 'lowpass', 520 * r() * p, 0.8);
        this.tone(dest, 'sine', 95 * r(), 60, t, 0.07, 0.12);
        break;
      case 'step:snow':
        this.noise(dest, t, 0.12, 0.18, 'highpass', 1800 * r(), 0.5);
        break;
      case 'land':
        this.noise(dest, t, 0.12, 0.25, 'lowpass', 400, 0.8);
        break;
      case 'mine':
        this.noise(dest, t, 0.05, 0.25, 'bandpass', 2400 * r() * p, 2);
        this.tone(dest, 'square', 900 * r(), 500, t, 0.03, 0.04);
        break;
      case 'break':
        this.noise(dest, t, 0.22, 0.45, 'lowpass', 1600 * p, 0.7, 300);
        this.tone(dest, 'triangle', 180, 70, t, 0.18, 0.25);
        for (let i = 0; i < 3; i++) this.noise(dest, t + 0.03 + i * 0.04, 0.04, 0.15, 'bandpass', 3000 * r(), 3);
        break;
      case 'pickup':
        this.tone(dest, 'sine', 620 * p * r(), 1250 * p, t, 0.09, 0.3);
        this.tone(dest, 'sine', 1240 * p, 1860 * p, t + 0.05, 0.08, 0.15);
        break;
      case 'click':
        this.tone(dest, 'square', 1400, 1100, t, 0.025, 0.06);
        break;
      case 'open':
        this.tone(dest, 'triangle', 220, 130, t, 0.18, 0.3);
        this.noise(dest, t, 0.12, 0.15, 'lowpass', 800, 1);
        break;
      case 'trash':
        this.noise(dest, t, 0.2, 0.25, 'highpass', 900, 0.7, 3000);
        break;
      case 'craft': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => this.tone(dest, 'triangle', f * p, f * p, t + i * 0.07, 0.35, 0.22));
        for (let i = 0; i < 6; i++) this.tone(dest, 'sine', 2000 + Math.random() * 2000, 3000, t + 0.25 + i * 0.04, 0.08, 0.05);
        this.tone(this.reverbSend, 'triangle', 1046.5, 1046.5, t + 0.21, 0.6, 0.1);
        break;
      }
      case 'craftFail':
        this.tone(dest, 'square', 180, 150, t, 0.12, 0.08);
        this.tone(dest, 'square', 150, 120, t + 0.12, 0.15, 0.08);
        break;
      case 'correct':
        this.tone(dest, 'triangle', 659.25, 659.25, t, 0.18, 0.25);
        this.tone(dest, 'triangle', 987.77, 987.77, t + 0.1, 0.3, 0.25);
        break;
      case 'wrong':
        this.tone(dest, 'sine', 330, 300, t, 0.18, 0.2);
        this.tone(dest, 'sine', 262, 240, t + 0.15, 0.25, 0.2);
        break;
      case 'objective':
        this.tone(dest, 'sine', 880, 880, t, 0.25, 0.12);
        this.tone(dest, 'sine', 1318.5, 1318.5, t + 0.08, 0.35, 0.1);
        break;
      case 'level':
      case 'achievement': {
        const seq = name === 'level' ? [523.25, 783.99, 1046.5] : [783.99, 987.77, 1174.66, 1567.98];
        seq.forEach((f, i) => {
          this.tone(dest, 'sine', f, f, t + i * 0.09, 0.4, 0.2);
          this.tone(this.reverbSend, 'sine', f, f, t + i * 0.09, 0.4, 0.08);
        });
        break;
      }
      case 'zoneComplete':
      case 'celebrate': {
        const seq = [392, 523.25, 659.25, 783.99, 1046.5];
        seq.forEach((f, i) => {
          this.tone(dest, 'square', f, f, t + i * 0.12, 0.25, 0.08);
          this.tone(dest, 'triangle', f, f, t + i * 0.12, 0.45, 0.18);
        });
        const chordT = t + seq.length * 0.12;
        for (const f of [523.25, 659.25, 783.99, 1046.5]) {
          this.tone(dest, 'triangle', f, f, chordT, name === 'celebrate' ? 2.2 : 1.2, 0.12, 0.02);
          this.tone(this.reverbSend, 'triangle', f, f, chordT, 1.5, 0.08, 0.02);
        }
        break;
      }
      case 'gate':
        this.noise(dest, t, 2.6, 0.5, 'lowpass', 160, 1.2);
        this.tone(dest, 'sawtooth', 48, 42, t, 2.6, 0.12, 0.3);
        for (let i = 0; i < 6; i++) this.tone(dest, 'square', 300 + Math.random() * 200, 200, t + i * 0.4, 0.06, 0.05);
        break;
      case 'water':
        this.noise(dest, t, 2.5, 0.35, 'bandpass', 500, 0.8, 1400);
        this.noise(dest, t + 0.3, 2.2, 0.2, 'lowpass', 300, 1);
        break;
      case 'machine':
        this.tone(dest, 'sawtooth', 55, 70, t, 1.6, 0.12, 0.2);
        this.tone(dest, 'square', 110, 140, t, 1.6, 0.04, 0.2);
        for (let i = 0; i < 5; i++) this.noise(dest, t + i * 0.25, 0.05, 0.15, 'bandpass', 2500, 4);
        break;
      case 'bubbles':
        for (let i = 0; i < 10; i++) {
          const st = t + i * 0.09 + Math.random() * 0.05;
          const f = 300 + Math.random() * 500;
          this.tone(dest, 'sine', f, f * 2.2, st, 0.07, 0.12);
        }
        break;
      case 'melt':
        this.noise(dest, t, 2.0, 0.25, 'highpass', 3000, 0.6);
        for (let i = 0; i < 12; i++) this.noise(dest, t + Math.random() * 1.8, 0.03, 0.2, 'bandpass', 4000 + Math.random() * 3000, 5);
        break;
      case 'build':
        this.noise(dest, t, 0.12, 0.35, 'lowpass', 900 * r(), 1);
        this.tone(dest, 'triangle', 160 * r(), 110, t, 0.1, 0.2);
        break;
      case 'secret': {
        const seq = [440, 523.25, 622.25, 739.99];
        seq.forEach((f, i) => this.tone(this.reverbSend, 'sine', f, f, t + i * 0.18, 0.9, 0.2));
        seq.forEach((f, i) => this.tone(dest, 'sine', f, f, t + i * 0.18, 0.6, 0.12));
        break;
      }
      case 'chest':
        this.tone(dest, 'sawtooth', 140, 260, t, 0.35, 0.07);
        this.noise(dest, t + 0.3, 0.1, 0.3, 'lowpass', 600);
        break;
      case 'lava':
        this.noise(dest, t, 0.8, 0.4, 'highpass', 1500, 0.5);
        this.tone(dest, 'sine', 120, 50, t, 0.4, 0.3);
        break;
      case 'reactor':
        this.tone(dest, 'sawtooth', 40, 220, t, 3.5, 0.15, 0.5);
        this.tone(dest, 'sine', 80, 440, t, 3.5, 0.2, 0.5);
        this.noise(dest, t, 3.5, 0.2, 'bandpass', 200, 1, 2400);
        break;
      case 'socket':
        this.tone(dest, 'square', 220, 880, t, 0.4, 0.1);
        this.tone(dest, 'sine', 440, 1760, t, 0.5, 0.2);
        break;
      default:
        break;
    }
  }

  /** Continuous loop (e.g. flowing water near the player). Volume can be updated every frame. */
  setLoop(name: 'water' | 'hum' | 'lava', volume: number) {
    if (!this.ctx) return;
    let l = this.loops.get(name);
    if (!l && volume > 0.001) {
      const ctx = this.ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.sfxBus);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      if (name === 'water') { f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.6; }
      else if (name === 'lava') { f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 2; }
      else { f.type = 'lowpass'; f.frequency.value = 120; f.Q.value = 6; }
      src.connect(f);
      f.connect(gain);
      src.start();
      l = { gain, stop: () => src.stop() };
      this.loops.set(name, l);
    }
    if (l) l.gain.gain.setTargetAtTime(Math.max(0, volume), this.ctx.currentTime, 0.2);
  }

  // ---------------------------------------------------------------- music
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextNoteTime = this.ctx.currentTime + 1;
    this.nextPadTime = this.ctx.currentTime + 0.5;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 250);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx) return;
    const horizon = ctx.currentTime + 1.5;
    // Chord progression in D dorian: Dm9, G6/B, Fmaj7, Am7, Cadd9...
    const chords = [
      [146.83, 220, 261.63, 329.63],
      [123.47, 196, 246.94, 329.63],
      [174.61, 220, 261.63, 329.63],
      [110, 196, 261.63, 329.63],
      [130.81, 196, 293.66, 329.63],
    ];
    const scale = [293.66, 329.63, 349.23, 392, 440, 523.25, 587.33, 659.25, 783.99];
    while (this.nextPadTime < horizon) {
      const chord = chords[this.padIndex % chords.length];
      this.padIndex++;
      const st = this.nextPadTime;
      for (const f of chord) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 8;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, st);
        g.gain.linearRampToValueAtTime(0.05, st + 2.5);
        g.gain.linearRampToValueAtTime(0.04, st + 6);
        g.gain.linearRampToValueAtTime(0.0001, st + 9.5);
        o.connect(lp);
        lp.connect(g);
        g.connect(this.musicBus);
        const send = ctx.createGain();
        send.gain.value = 0.6;
        g.connect(send);
        send.connect(this.reverbSend);
        o.start(st);
        o.stop(st + 10);
      }
      this.nextPadTime += 8;
    }
    while (this.nextNoteTime < horizon) {
      const st = this.nextNoteTime;
      if (Math.random() < 0.75) {
        const f = scale[Math.floor(Math.random() * scale.length)];
        const notes = Math.random() < 0.3 ? [f, f * 1.5] : [f];
        notes.forEach((nf, i) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = nf;
          const o2 = ctx.createOscillator();
          o2.type = 'sine';
          o2.frequency.value = nf * 2;
          const g = ctx.createGain();
          const s2 = st + i * 0.35;
          g.gain.setValueAtTime(0.0001, s2);
          g.gain.exponentialRampToValueAtTime(0.09, s2 + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, s2 + 3);
          const g2 = ctx.createGain();
          g2.gain.value = 0.25;
          o.connect(g);
          o2.connect(g2);
          g2.connect(g);
          g.connect(this.musicBus);
          const send = ctx.createGain();
          send.gain.value = 0.8;
          g.connect(send);
          send.connect(this.reverbSend);
          o.start(s2);
          o2.start(s2);
          o.stop(s2 + 3.1);
          o2.stop(s2 + 3.1);
        });
      }
      this.nextNoteTime += [1.2, 1.6, 2.4, 3.2][Math.floor(Math.random() * 4)];
    }
  }
}

export const audio = new AudioEngine();
