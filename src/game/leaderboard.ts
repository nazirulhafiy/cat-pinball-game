import { CAT_IDS } from './cats';
import type { CatId } from './contracts';

export const LEADERBOARD_LIMIT = 10;

/** A completed game run that is safe to persist as JSON. */
export interface ScoreEntry {
  id: string;
  playerName: string;
  score: number;
  catId: CatId;
  achievedAt: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCatId(value: unknown): value is CatId {
  return typeof value === 'string' && (CAT_IDS as readonly string[]).includes(value);
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const name = value.trim().replace(/\s+/g, ' ').slice(0, 20);
  return name.length > 0 ? name : null;
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const id = value.trim();
  return id.length > 0 ? id : null;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

function normalizeEntry(value: unknown): ScoreEntry | null {
  if (!isRecord(value)) return null;

  const id = normalizeId(value.id);
  const playerName = normalizeName(value.playerName);
  const score = normalizeNonNegativeInteger(value.score);
  const achievedAt = normalizeNonNegativeInteger(value.achievedAt);

  if (!id || !playerName || score === null || achievedAt === null || !isCatId(value.catId)) {
    return null;
  }

  return { id, playerName, score, catId: value.catId, achievedAt };
}

/**
 * Converts JSON-derived data into the canonical all-time high-score list.
 * Invalid entries are discarded; valid entries are sorted and capped.
 */
export function normalizeLeaderboard(value: unknown): ScoreEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeEntry)
    .filter((entry): entry is ScoreEntry => entry !== null)
    .sort((left, right) => right.score - left.score || right.achievedAt - left.achievedAt)
    .slice(0, LEADERBOARD_LIMIT);
}

/** Adds a completed run to an existing persisted leaderboard without mutating it. */
export function addLeaderboardEntry(entries: unknown, entry: ScoreEntry): ScoreEntry[] {
  return normalizeLeaderboard([...(Array.isArray(entries) ? entries : []), entry]);
}
