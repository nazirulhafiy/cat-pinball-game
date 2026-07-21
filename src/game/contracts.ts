export const TABLE_WIDTH = 1000;
export const TABLE_HEIGHT = 1600;

export type CatId = 'calico' | 'tuxedo' | 'orange' | 'tabby' | 'white';

export interface CatProfile {
  id: CatId;
  name: string;
  title: string;
  description: string;
  primary: number;
  secondary: number;
  accent: number;
  cssPrimary: string;
  cssSecondary: string;
  cssAccent: string;
}

export type GamePhase = 'ready' | 'playing' | 'paused' | 'game-over';
export type SpecialMode = 'normal' | 'laser-chase' | 'zoomies';

export interface GameSnapshot {
  phase: GamePhase;
  mode: SpecialMode;
  score: number;
  highScore: number;
  lives: number;
  combo: number;
  hunt: number;
  huntGoal: number;
  modeSeconds: number;
  objective: string;
  ballSaveActive: boolean;
  ballsInPlay: number;
  boxLocks: number;
  message: string;
}

export interface GameCallbacks {
  onSnapshot(snapshot: GameSnapshot): void;
  onGameOver(score: number): void;
  onFirstInteraction?(): void;
}

export interface GameController {
  pause(): void;
  resume(): void;
  restart(): void;
  setMuted(muted: boolean): void;
  destroy(): void;
}

export interface GameOptions {
  parent: HTMLElement;
  cat: CatId;
  highScore: number;
  muted: boolean;
  reducedMotion: boolean;
  callbacks: GameCallbacks;
}
