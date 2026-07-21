import type { CatId } from './contracts';
import { eventsForMusicStep, midiToFrequency, SECONDS_PER_STEP, TOTAL_STEPS } from './music';
import type { MusicEvent } from './music';

const MUSIC_BUS_GAIN = 0.5;
const MUSIC_LOOKAHEAD_SECONDS = 0.14;
const MUSIC_SCHEDULER_INTERVAL_MS = 25;

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
  private musicBus: GainNode | null = null;
  private unlocked = false;
  private muted = false;
  private destroyed = false;
  private variation = 0;
  private lastSelectionAt = Number.NEGATIVE_INFINITY;
  private musicRequested = false;
  private musicPaused = false;
  private musicStep = 0;
  private nextMusicAt = 0;
  private musicScheduler: number | null = null;
  private musicNoiseBuffer: AudioBuffer | null = null;
  private readonly activeSources = new Set<AudioBufferSourceNode | OscillatorNode>();
  private readonly activeNodes = new Set<AudioNode>();
  private readonly musicSources = new Set<AudioBufferSourceNode | OscillatorNode>();
  private readonly musicNodes = new Set<AudioNode>();

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
        const musicBus = context.createGain();
        this.context = context;
        this.master = master;
        this.musicBus = musicBus;
        this.master.gain.value = this.muted ? 0 : 0.18;
        this.musicBus.gain.value = 0.0001;
        this.musicBus.connect(master);
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
      if (this.unlocked) this.ensureMusicScheduler();
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

  startMusic(restart = false): void {
    if (this.destroyed) return;
    if (restart || !this.musicRequested) this.musicStep = 0;
    this.musicRequested = true;
    this.musicPaused = false;
    this.ensureMusicScheduler();
  }

  pauseMusic(): void {
    if (!this.musicRequested || this.musicPaused) return;
    this.musicPaused = true;
    this.stopMusicScheduler();
    this.fadeMusicBus(0.0001);
  }

  resumeMusic(): void {
    if (!this.musicRequested || this.destroyed) return;
    this.musicPaused = false;
    this.ensureMusicScheduler();
  }

  stopMusic(): void {
    this.musicRequested = false;
    this.musicPaused = false;
    this.musicStep = 0;
    this.stopMusicScheduler();
    this.fadeMusicBus(0.0001);
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
    this.stopMusicScheduler();
    for (const source of this.activeSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    for (const source of this.musicSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    for (const node of this.activeNodes) node.disconnect();
    for (const node of this.musicNodes) node.disconnect();
    this.activeSources.clear();
    this.activeNodes.clear();
    this.musicSources.clear();
    this.musicNodes.clear();
    this.musicBus?.disconnect();
    this.master?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.musicBus = null;
    this.musicNoiseBuffer = null;
    this.master = null;
    this.context = null;
  }

  private ensureMusicScheduler(): void {
    const context = this.context;
    if (
      this.musicScheduler !== null
      || !this.musicRequested
      || this.musicPaused
      || !this.unlocked
      || !context
      || !this.musicBus
      || context.state !== 'running'
      || typeof window === 'undefined'
    ) return;

    this.nextMusicAt = context.currentTime + 0.05;
    this.fadeMusicBus(MUSIC_BUS_GAIN);
    this.scheduleMusic();
    this.musicScheduler = window.setInterval(() => this.scheduleMusic(), MUSIC_SCHEDULER_INTERVAL_MS);
  }

  private stopMusicScheduler(): void {
    if (this.musicScheduler !== null && typeof window !== 'undefined') {
      window.clearInterval(this.musicScheduler);
    }
    this.musicScheduler = null;
    this.nextMusicAt = 0;
  }

  private fadeMusicBus(target: number): void {
    const context = this.context;
    const musicBus = this.musicBus;
    if (!context || !musicBus) return;
    const now = context.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), now);
    musicBus.gain.setTargetAtTime(Math.max(0.0001, target), now, 0.025);
  }

  private scheduleMusic(): void {
    const context = this.context;
    if (!context || !this.musicRequested || this.musicPaused || context.state !== 'running') return;
    if (this.nextMusicAt < context.currentTime - 0.25) this.nextMusicAt = context.currentTime + 0.05;

    while (this.nextMusicAt < context.currentTime + MUSIC_LOOKAHEAD_SECONDS) {
      const swingOffset = this.musicStep % 4 === 2 ? 0.012 : 0;
      for (const event of eventsForMusicStep(this.musicStep)) {
        this.scheduleMusicEvent(event, this.nextMusicAt + swingOffset);
      }
      this.musicStep = (this.musicStep + 1) % TOTAL_STEPS;
      this.nextMusicAt += SECONDS_PER_STEP;
    }
  }

  private scheduleMusicEvent(event: MusicEvent, when: number): void {
    const duration = Math.max(0.035, event.durationSteps * SECONDS_PER_STEP * 0.82);
    switch (event.voice) {
      case 'bass':
        event.notes.forEach((note) => {
          this.musicTone(midiToFrequency(note), duration, 'triangle', event.gain * 0.7, when, undefined, 520);
          this.musicTone(midiToFrequency(note - 12), duration, 'sine', event.gain * 0.28, when, undefined, 340);
        });
        break;
      case 'chord':
        event.notes.forEach((note, index) => {
          this.musicTone(midiToFrequency(note), duration, index % 2 ? 'sine' : 'triangle', event.gain / event.notes.length, when, undefined, 2100);
        });
        break;
      case 'lead':
        event.notes.forEach((note) => {
          const startNote = note - (event.glideSemitones ?? 0);
          const glideSeconds = event.glideSemitones ? 0.035 : undefined;
          this.musicTone(midiToFrequency(startNote), duration, 'triangle', event.gain * 0.72, when, midiToFrequency(note), 2500, glideSeconds);
          this.musicTone(midiToFrequency(note), duration, 'sine', event.gain * 0.2, when, undefined, 1900);
        });
        break;
      case 'kick':
        this.musicTone(132, 0.13, 'sine', event.gain * 0.72, when, 48, 260, 0.1);
        break;
      case 'clap':
        this.musicNoise(0.085, event.gain * 0.38, when, 'bandpass', 1750, 0.85);
        break;
      case 'hat':
        this.musicNoise(0.035, event.gain * 0.58, when, 'highpass', 5400, 0.55);
        break;
      case 'paw':
        this.musicTone(1180, 0.055, 'triangle', event.gain * 0.55, when, 760, 2600, 0.045);
        break;
    }
  }

  private musicTone(
    startFrequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    when: number,
    endFrequency = startFrequency,
    filterFrequency?: number,
    glideSeconds = duration * 0.75,
  ): void {
    const context = this.context;
    const musicBus = this.musicBus;
    if (!context || !musicBus) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = filterFrequency ? context.createBiquadFilter() : null;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), when);
    if (endFrequency !== startFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), when + Math.min(duration * 0.8, glideSeconds));
    }
    this.musicEnvelope(gain.gain, when, duration, volume);
    oscillator.connect(filter ?? gain);
    if (filter && filterFrequency) {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFrequency, when);
      filter.connect(gain);
      this.musicNodes.add(filter);
    }
    gain.connect(musicBus);
    this.musicSources.add(oscillator);
    this.musicNodes.add(gain);
    oscillator.onended = () => this.releaseMusicSource(oscillator, gain, filter);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.025);
  }

  private musicNoise(
    duration: number,
    volume: number,
    when: number,
    filterType: BiquadFilterType,
    filterFrequency: number,
    filterQ: number,
  ): void {
    const context = this.context;
    const musicBus = this.musicBus;
    if (!context || !musicBus) return;
    if (!this.musicNoiseBuffer) {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.2), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      this.musicNoiseBuffer = buffer;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.musicNoiseBuffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, when);
    filter.Q.setValueAtTime(filterQ, when);
    this.musicEnvelope(gain.gain, when, duration, volume);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(musicBus);
    this.musicSources.add(source);
    this.musicNodes.add(filter);
    this.musicNodes.add(gain);
    source.onended = () => this.releaseMusicSource(source, gain, filter);
    source.start(when, 0, duration);
    source.stop(when + duration + 0.025);
  }

  private musicEnvelope(gain: AudioParam, when: number, duration: number, volume: number): void {
    const attackEnds = when + Math.min(0.008, duration * 0.22);
    const releaseStarts = when + Math.max(0.012, duration - Math.min(0.045, duration * 0.35));
    gain.setValueAtTime(0.0001, when);
    gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), attackEnds);
    gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.64), releaseStarts);
    gain.exponentialRampToValueAtTime(0.0001, when + duration);
  }

  private releaseMusicSource(
    source: AudioBufferSourceNode | OscillatorNode,
    gain: GainNode,
    filter: BiquadFilterNode | null,
  ): void {
    source.disconnect();
    gain.disconnect();
    filter?.disconnect();
    this.musicSources.delete(source);
    this.musicNodes.delete(gain);
    if (filter) this.musicNodes.delete(filter);
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
