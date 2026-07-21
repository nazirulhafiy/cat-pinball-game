import { describe, expect, it } from 'vitest';
import {
  BPM, SECONDS_PER_STEP, STEPS_PER_BAR, STEPS_PER_BEAT, TOTAL_STEPS,
  eventsForMusicStep, midiToFrequency,
} from './music';

const voicesAt = (step: number) => eventsForMusicStep(step).map((event) => event.voice);

describe('music pattern', () => {
  it('defines a 132 BPM, sixteen-bar sixteenth-note loop and converts MIDI frequency', () => {
    expect({ BPM, STEPS_PER_BEAT, STEPS_PER_BAR, TOTAL_STEPS }).toEqual({
      BPM: 132, STEPS_PER_BEAT: 4, STEPS_PER_BAR: 16, TOTAL_STEPS: 256,
    });
    expect(SECONDS_PER_STEP).toBeCloseTo(60 / 132 / 4);
    expect(midiToFrequency(69)).toBe(440);
    expect(midiToFrequency(60)).toBeCloseTo(261.625565, 5);
  });

  it('normalizes arbitrary whole-number positions into the loop', () => {
    expect(eventsForMusicStep(-1)).toEqual(eventsForMusicStep(TOTAL_STEPS - 1));
    expect(eventsForMusicStep(TOTAL_STEPS + 22)).toEqual(eventsForMusicStep(22));
    expect(eventsForMusicStep(-TOTAL_STEPS * 3 + 22)).toEqual(eventsForMusicStep(22));
  });

  it('emits only finite, schedulable values and recognized voices', () => {
    const allowed = new Set(['bass', 'chord', 'lead', 'kick', 'clap', 'hat', 'paw']);
    for (let step = 0; step < TOTAL_STEPS; step++) {
      for (const event of eventsForMusicStep(step)) {
        expect(allowed.has(event.voice)).toBe(true);
        expect(Number.isInteger(event.durationSteps) && event.durationSteps > 0).toBe(true);
        expect(Number.isFinite(event.gain) && event.gain > 0 && event.gain <= 1).toBe(true);
        expect(event.notes.every((note) => Number.isFinite(note) && note >= 0 && note <= 127)).toBe(true);
      }
    }
  });

  it('uses the representative harmony, rests, paw clicks, and final turnaround space', () => {
    expect(eventsForMusicStep(2).find((event) => event.voice === 'chord')?.notes).toEqual([53, 57, 60, 62]);
    expect(eventsForMusicStep(16 + 2).find((event) => event.voice === 'chord')?.notes).toEqual([52, 55, 60]);
    expect(eventsForMusicStep(2).find((event) => event.voice === 'lead')?.glideSemitones).toBe(1);
    expect(eventsForMusicStep(16 + 2).find((event) => event.voice === 'lead')?.glideSemitones).toBeUndefined();
    expect(voicesAt(3 * 16 + 2)).not.toContain('lead');
    expect(voicesAt(7 * 16 + 14)).not.toContain('lead');
    expect(voicesAt(1 * 16 + 14)).toContain('paw');
    expect(voicesAt(2 * 16 + 14)).not.toContain('paw');
    expect(eventsForMusicStep(15 * 16 + 2).find((event) => event.voice === 'lead')?.notes).toEqual([67]);
    expect(eventsForMusicStep(15 * 16 + 8).find((event) => event.voice === 'lead')?.notes).toEqual([70]);
    expect(voicesAt(15 * 16 + 12)).not.toContain('clap');
    expect(voicesAt(15 * 16 + 14)).not.toContain('hat');
  });
});
