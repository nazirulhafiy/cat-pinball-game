import { describe, expect, it } from 'vitest';
import { addLeaderboardEntry, LEADERBOARD_LIMIT, normalizeLeaderboard } from './leaderboard';

const validEntry = {
  id: 'run-1',
  playerName: '  Mia   Meow  ',
  score: 123.9,
  catId: 'calico',
  achievedAt: 1_700_000_000_000.8,
};

describe('normalizeLeaderboard', () => {
  it('discards malformed persisted entries and normalizes safe values', () => {
    expect(
      normalizeLeaderboard([
        validEntry,
        null,
        { ...validEntry, id: '' },
        { ...validEntry, id: 'bad-cat', catId: 'lion' },
        { ...validEntry, id: 'bad-score', score: Infinity },
        { ...validEntry, id: 'bad-name', playerName: '   ' },
      ]),
    ).toEqual([
      {
        id: 'run-1',
        playerName: 'Mia Meow',
        score: 123,
        catId: 'calico',
        achievedAt: 1_700_000_000_000,
      },
    ]);
    expect(normalizeLeaderboard({ entries: [validEntry] })).toEqual([]);
  });

  it('sorts by score, then by newest achieved timestamp', () => {
    const entries = normalizeLeaderboard([
      { ...validEntry, id: 'old-high', score: 800, achievedAt: 100 },
      { ...validEntry, id: 'new-high', score: 800, achievedAt: 200 },
      { ...validEntry, id: 'top', score: 900, achievedAt: 1 },
    ]);

    expect(entries.map(({ id }) => id)).toEqual(['top', 'new-high', 'old-high']);
  });

  it('keeps only the top ten entries', () => {
    const entries = normalizeLeaderboard(
      Array.from({ length: LEADERBOARD_LIMIT + 2 }, (_, score) => ({
        ...validEntry,
        id: `run-${score}`,
        score,
      })),
    );

    expect(entries).toHaveLength(LEADERBOARD_LIMIT);
    expect(entries.at(0)?.score).toBe(11);
    expect(entries.at(-1)?.score).toBe(2);
  });
});

describe('addLeaderboardEntry', () => {
  it('inserts a supplied completed run and returns the normalized top ten', () => {
    const existing = [{ ...validEntry, id: 'existing', score: 100, achievedAt: 50 }];
    const result = addLeaderboardEntry(existing, {
      id: 'new-run',
      playerName: '  Nori\nCat  ',
      score: 200,
      catId: 'tuxedo',
      achievedAt: 75,
    });

    expect(result.map(({ id }) => id)).toEqual(['new-run', 'existing']);
    expect(result[0]).toMatchObject({ playerName: 'Nori Cat', catId: 'tuxedo' });
    expect(existing).toHaveLength(1);
  });
});
