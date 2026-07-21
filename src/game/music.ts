/** A small, scheduler-agnostic pattern for the game's Web Audio BGM loop. */
export const BPM = 132;
export const STEPS_PER_BEAT = 4;
export const STEPS_PER_BAR = STEPS_PER_BEAT * 4;
export const TOTAL_STEPS = STEPS_PER_BAR * 16;
export const SECONDS_PER_STEP = 60 / BPM / STEPS_PER_BEAT;

export type MusicVoice = 'bass' | 'chord' | 'lead' | 'kick' | 'clap' | 'hat' | 'paw';

export interface MusicEvent {
  voice: MusicVoice;
  /** MIDI notes to synthesize. Percussion voices deliberately use an empty array. */
  notes: number[];
  durationSteps: number;
  gain: number;
  /** Optional short pitch bend for a synth that supports it. */
  glideSemitones?: number;
}

interface Harmony {
  chord: number[];
  bass: number;
  leadRoot: number;
}

const F6: Harmony = { chord: [53, 57, 60, 62], bass: 41, leadRoot: 65 };
const C_OVER_E: Harmony = { chord: [52, 55, 60], bass: 40, leadRoot: 60 };
const DM7: Harmony = { chord: [50, 53, 57, 60], bass: 38, leadRoot: 62 };
const BB_ADD9: Harmony = { chord: [46, 50, 53, 60], bass: 34, leadRoot: 70 };
const F_OVER_A: Harmony = { chord: [45, 48, 53, 62], bass: 33, leadRoot: 65 };
const GM7: Harmony = { chord: [43, 46, 50, 53], bass: 31, leadRoot: 67 };
const C7: Harmony = { chord: [48, 52, 55, 58], bass: 36, leadRoot: 60 };

const HARMONY_BY_BAR: readonly Harmony[] = [
  F6, C_OVER_E, DM7, BB_ADD9, F_OVER_A, GM7, C7, C7,
  F6, { chord: [45, 48, 52, 55], bass: 33, leadRoot: 69 }, DM7, BB_ADD9,
  GM7, { chord: [45, 48, 52, 55], bass: 33, leadRoot: 69 }, BB_ADD9, C7,
];

const BASS_STEPS = [0, 6, 8, 14] as const;
const LEAD_STEPS = [2, 4, 6, 10, 12, 14] as const;
const LEAD_INTERVALS = [7, 0, 4, 2, 0, 7] as const;

export const midiToFrequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const normalizedStep = (step: number): number => {
  if (!Number.isFinite(step) || !Number.isInteger(step)) {
    throw new RangeError('music step must be a finite integer');
  }
  return ((step % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
};

const harmonyFor = (bar: number, stepInBar: number): Harmony =>
  bar === 14 && stepInBar >= 8 ? C7 : HARMONY_BY_BAR[bar];

/**
 * Returns only the notes that begin on this sixteenth-note step. The caller owns
 * timing and can freely ask for negative or arbitrarily large loop positions.
 */
export const eventsForMusicStep = (step: number): MusicEvent[] => {
  const loopStep = normalizedStep(step);
  const bar = Math.floor(loopStep / STEPS_PER_BAR);
  const stepInBar = loopStep % STEPS_PER_BAR;
  const harmony = harmonyFor(bar, stepInBar);
  const events: MusicEvent[] = [];

  const bassIndex = BASS_STEPS.indexOf(stepInBar as (typeof BASS_STEPS)[number]);
  if (bassIndex !== -1) {
    const note = bassIndex === 2 ? harmony.bass + 12 : harmony.bass + (bassIndex === 1 || bassIndex === 3 ? 7 : 0);
    events.push({ voice: 'bass', notes: [note], durationSteps: 2, gain: 0.16 });
  }

  if ((stepInBar === 2 || stepInBar === 6 || stepInBar === 10) && !(stepInBar === 10 && bar % 2 === 1)) {
    events.push({ voice: 'chord', notes: [...harmony.chord], durationSteps: 3, gain: 0.1 });
  }

  if (bar === 15) {
    const turnaroundNotes: Record<number, number> = { 2: 67, 8: 70, 12: 72 };
    const note = turnaroundNotes[stepInBar];
    if (note !== undefined) events.push({ voice: 'lead', notes: [note], durationSteps: 2, gain: 0.1 });
  } else if (bar !== 3 && bar !== 7 && bar !== 11) {
    const leadIndex = LEAD_STEPS.indexOf(stepInBar as (typeof LEAD_STEPS)[number]);
    if (leadIndex !== -1) {
      events.push({
        voice: 'lead',
        notes: [harmony.leadRoot + LEAD_INTERVALS[leadIndex]],
        durationSteps: 2,
        gain: 0.09,
        ...(leadIndex === 0 && bar % 4 === 0 ? { glideSemitones: 1 } : {}),
      });
    }
  }

  if (stepInBar === 0 || (stepInBar === 8 && bar % 4 !== 3)) {
    events.push({ voice: 'kick', notes: [], durationSteps: 1, gain: 0.18 });
  }
  if ((stepInBar === 4 || stepInBar === 12) && !(bar === 15 && stepInBar === 12)) {
    events.push({ voice: 'clap', notes: [], durationSteps: 1, gain: 0.11 });
  }
  if (stepInBar % 2 === 0 && !(bar === 15 && stepInBar === 14)) {
    events.push({ voice: 'hat', notes: [], durationSteps: 1, gain: 0.045 });
  }
  if (stepInBar === 14 && [1, 5, 9, 13].includes(bar)) {
    events.push({ voice: 'paw', notes: [], durationSteps: 1, gain: 0.08 });
  }

  return events;
};
