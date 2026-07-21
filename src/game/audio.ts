import type { CatId } from './contracts';

/** Small, asset-free sound effects for the pinball table. */
export type SoundCue =
  | 'flipper'
  | 'launch'
  | 'bumper'
  | 'target'
  | 'laser'
  | 'jackpot'
  | 'drain'
  | 'save'
  | 'multiball'
  | 'mouse'
  | 'vacuum'
  | 'select'
  | 'pause';

type AudioContextConstructor = new () => AudioContext;

export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;
  private muted = false;
  private destroyed = false;
  private variation = 0;
  private lastSelectionAt = Number.NEGATIVE_INFINITY;
  private readonly activeSources = new Set<AudioBufferSourceNode | OscillatorNode>();
  private readonly activeNodes = new Set<AudioNode>();

  async unlock(): Promise<void> {
    if (this.destroyed) return;

    if (!this.context) {
      const audioWindow = typeof window === 'undefined' ? null : window as Window & {
        webkitAudioContext?: AudioContextConstructor;
      };
      const Context = typeof AudioContext === 'undefined' ? audioWindow?.webkitAudioContext : AudioContext;
      if (!Context) return;

      try {
        const context = new Context();
        const master = context.createGain();
        this.context = context;
        this.master = master;
        this.master.gain.value = this.muted ? 0 : 0.18;
        this.master.connect(context.destination);
      } catch {
        this.context = null;
        this.master = null;
        return;
      }
    }

    try {
      const context = this.context;
      if (!context) return;
      await context.resume();
      this.unlocked = context.state === 'running';
    } catch {
      this.unlocked = false;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.18, this.context.currentTime, 0.015);
    }
  }

  cue(cue: SoundCue, cat?: CatId): void {
    const context = this.context;
    if (!this.unlocked || this.destroyed || !context || !this.master || context.state !== 'running') return;

    const v = (this.variation++ % 7) - 3;
    switch (cue) {
      case 'flipper': this.tone(155 + v * 4, 0.055, 'square', 0.36, 85); break;
      case 'launch': this.tone(180, 0.22, 'sawtooth', 0.28, 680); break;
      case 'bumper': this.tone(320 + v * 13, 0.1, 'sine', 0.42, 110 + v * 4); break;
      case 'target': this.tone(760 + v * 22, 0.075, 'triangle', 0.3, 430); break;
      case 'laser': this.tone(1050, 0.18, 'sawtooth', 0.22, 160); break;
      case 'jackpot': this.chord([523, 659, 784, 1047], 0.38, 'triangle', 0.2); break;
      case 'drain': this.tone(260, 0.45, 'sine', 0.3, 48); break;
      case 'save': this.chord([440, 660, 880], 0.25, 'sine', 0.22); break;
      case 'multiball': this.chord([330, 440, 660], 0.34, 'square', 0.16); break;
      case 'mouse': this.chord([880, 1047, 1319], 0.16, 'sine', 0.16); break;
      case 'vacuum': this.tone(92, 0.42, 'sawtooth', 0.18, 58); break;
      case 'select': {
        if (context.currentTime - this.lastSelectionAt < 0.11) break;
        this.lastSelectionAt = context.currentTime;
        const voices: Record<CatId, [number, number, OscillatorType]> = {
          calico: [520, 760, 'sine'],
          tuxedo: [350, 500, 'triangle'],
          orange: [640, 960, 'sine'],
          tabby: [430, 650, 'triangle'],
          white: [710, 980, 'sine'],
        };
        const [start, end, type] = voices[cat ?? 'calico'];
        this.tone(start + v * 4, 0.08, type, 0.16, end + v * 5);
        break;
      }
      case 'pause': this.tone(300, 0.12, 'triangle', 0.18, 190); break;
    }

    if (cue === 'flipper' || cue === 'bumper' || cue === 'target' || cue === 'drain') {
      this.noise(cue === 'drain' ? 0.12 : 0.035, cue === 'drain' ? 0.12 : 0.08);
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.unlocked = false;
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    for (const node of this.activeNodes) node.disconnect();
    this.activeSources.clear();
    this.activeNodes.clear();
    this.master?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.master = null;
    this.context = null;
  }

  private tone(startFrequency: number, duration: number, type: OscillatorType, volume: number, endFrequency: number): void {
    const context = this.context;
    if (!context || !this.master) return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), context.currentTime + duration);
    this.envelope(oscillator, duration, volume);
  }

  private chord(frequencies: number[], duration: number, type: OscillatorType, volume: number): void {
    frequencies.forEach((frequency, index) => this.tone(frequency, duration, type, volume / frequencies.length, frequency * (index % 2 ? 1.5 : 2)));
  }

  private noise(duration: number, volume: number): void {
    const context = this.context;
    if (!context || !this.master) return;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    this.envelope(source, duration, volume);
  }

  private envelope(source: OscillatorNode | AudioBufferSourceNode, duration: number, volume: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(gain);
    gain.connect(master);
    this.activeSources.add(source);
    this.activeNodes.add(gain);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.activeSources.delete(source);
      this.activeNodes.delete(gain);
    };
    source.start(now);
    source.stop(now + duration + 0.02);
  }
}
