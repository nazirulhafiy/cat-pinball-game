import type { GameSnapshot } from './contracts';

export type GameEvent =
  | { type: 'bumper' }
  | { type: 'skill-shot' }
  | { type: 'target' }
  | { type: 'ramp' }
  | { type: 'vase' }
  | { type: 'vase-set' }
  | { type: 'box' }
  | { type: 'laser-target' }
  | { type: 'drain'; lastBall?: boolean }
  | { type: 'launch' }
  | { type: 'tick'; deltaMs: number }
  | { type: 'multiball-ended' };

const HUNT_GOAL = 4;
const LASER_DURATION_MS = 20_000;
const ZOOMIES_DURATION_MS = 25_000;

export class RulesEngine {
  private readonly initialHighScore: number;
  private state: GameSnapshot;
  private ballSaveRemaining = 0;
  private comboRemaining = 0;
  private modeRemaining = 0;
  private laserHits = 0;
  private zoomiesJackpots = 0;
  private zoomiesQueued = false;

  constructor({ highScore }: { highScore: number }) {
    this.initialHighScore = highScore;
    this.state = this.newGame();
  }

  snapshot(): GameSnapshot {
    return { ...this.state };
  }

  restart(): GameSnapshot {
    this.state = this.newGame();
    this.ballSaveRemaining = 0;
    this.comboRemaining = 0;
    this.modeRemaining = 0;
    this.laserHits = 0;
    this.zoomiesJackpots = 0;
    this.zoomiesQueued = false;
    return this.snapshot();
  }

  pause(): GameSnapshot {
    if (this.state.phase === 'playing') this.state.phase = 'paused';
    return this.snapshot();
  }

  resume(): GameSnapshot {
    if (this.state.phase === 'paused') this.state.phase = 'playing';
    return this.snapshot();
  }

  dispatch(event: GameEvent): GameSnapshot {
    if (event.type === 'tick') return this.tick(event.deltaMs);
    if (event.type === 'launch') return this.launch();
    if (event.type === 'drain') return this.drain(event.lastBall ?? true);
    if (event.type === 'multiball-ended') return this.endMultiball();
    if (this.state.phase !== 'playing') return this.snapshot();

    switch (event.type) {
      case 'bumper': this.scoreNormal(100); break;
      case 'skill-shot': this.scoreNormal(2500); break;
      case 'target':
        this.scoreNormal(500);
        if (this.state.mode === 'normal') this.advanceHunt();
        else if (this.state.mode === 'zoomies') this.zoomiesJackpot();
        break;
      case 'ramp':
        if (this.state.mode === 'zoomies') this.zoomiesJackpot();
        else this.scoreNormal(1000);
        break;
      case 'vase': this.scoreNormal(750); break;
      case 'vase-set': this.state.score += 5000; this.state.message = 'SHELF CLEARED!'; break;
      case 'box': this.scoreNormal(1000); this.addBoxLock(); break;
      case 'laser-target': this.hitLaserTarget(); break;
    }
    this.state.highScore = Math.max(this.state.highScore, this.state.score);
    return this.snapshot();
  }

  private newGame(): GameSnapshot {
    return {
      phase: 'ready', mode: 'normal', score: 0, highScore: this.initialHighScore,
      lives: 3, combo: 0, hunt: 0, huntGoal: HUNT_GOAL, modeSeconds: 0,
      objective: 'Launch the cat-comet', ballSaveActive: false, ballsInPlay: 0,
      boxLocks: 0, message: 'Ready to zoom',
    };
  }

  private launch(): GameSnapshot {
    if (this.state.phase === 'game-over' || this.state.phase === 'paused' || this.state.ballsInPlay > 0) return this.snapshot();
    this.state.phase = 'playing';
    this.state.ballsInPlay = 1;
    this.ballSaveRemaining = 6500;
    this.state.ballSaveActive = true;
    this.state.message = 'Ball save active';
    this.setObjective();
    return this.snapshot();
  }

  private tick(deltaMs: number): GameSnapshot {
    if (this.state.phase !== 'playing' || deltaMs <= 0) return this.snapshot();
    this.ballSaveRemaining = Math.max(0, this.ballSaveRemaining - deltaMs);
    this.state.ballSaveActive = this.ballSaveRemaining > 0;
    this.comboRemaining = Math.max(0, this.comboRemaining - deltaMs);
    if (this.comboRemaining === 0) this.state.combo = 0;
    if (this.modeRemaining > 0) {
      this.modeRemaining = Math.max(0, this.modeRemaining - deltaMs);
      this.state.modeSeconds = Math.ceil(this.modeRemaining / 1000);
      if (this.modeRemaining === 0) this.endMode();
    }
    return this.snapshot();
  }

  private scoreNormal(base: number): void {
    this.state.combo = this.comboRemaining > 0 ? Math.min(4, this.state.combo + 1) : 1;
    this.comboRemaining = 2200;
    const message = ['NICE', 'PURRFECT', 'CLAW-SOME', 'ABSOLUTE CHAOS'][this.state.combo - 1];
    this.state.message = message;
    this.state.score += base * this.state.combo;
  }

  private advanceHunt(): void {
    this.state.hunt = Math.min(HUNT_GOAL, this.state.hunt + 1);
    if (this.state.hunt === HUNT_GOAL) this.startLaser();
    else this.setObjective();
  }

  private startLaser(): void {
    this.state.mode = 'laser-chase';
    this.modeRemaining = LASER_DURATION_MS;
    this.state.modeSeconds = 20;
    this.laserHits = 0;
    this.state.message = 'Laser Chase! Hit the red dot';
    this.setObjective();
  }

  private hitLaserTarget(): void {
    if (this.state.mode !== 'laser-chase') return;
    this.laserHits += 1;
    this.state.score += this.laserHits * 1000;
    this.state.message = `Red dot ${this.laserHits}/4`;
    if (this.laserHits === 4) {
      this.state.score += 10_000;
      this.addBoxLock();
      this.state.mode = 'normal';
      this.modeRemaining = 0;
      this.state.modeSeconds = 0;
      this.state.hunt = 0;
      this.state.message = 'Laser Chase complete! +10,000';
      if (this.zoomiesQueued || this.state.boxLocks >= 3) this.startZoomies();
      else this.setObjective();
    }
  }

  private addBoxLock(): void {
    this.state.boxLocks = Math.min(3, this.state.boxLocks + 1);
    this.state.message = `Box lock ${this.state.boxLocks}/3`;
    if (this.state.boxLocks >= 3) {
      if (this.state.mode === 'laser-chase') this.zoomiesQueued = true;
      else this.startZoomies();
    }
  }

  private startZoomies(): void {
    this.state.mode = 'zoomies';
    this.modeRemaining = ZOOMIES_DURATION_MS;
    this.state.modeSeconds = 25;
    this.state.ballsInPlay = Math.max(3, this.state.ballsInPlay);
    this.state.boxLocks = 0;
    this.zoomiesQueued = false;
    this.zoomiesJackpots = 0;
    this.state.message = 'ZOOMIES MULTIBALL!';
    this.setObjective();
  }

  private zoomiesJackpot(): void {
    this.zoomiesJackpots += 1;
    this.state.score += 5000 + 1000 * (this.zoomiesJackpots - 1);
    this.state.message = `Zoomies jackpot x${this.zoomiesJackpots}`;
  }

  private drain(lastBall: boolean): GameSnapshot {
    if (this.state.phase !== 'playing') return this.snapshot();
    if (this.state.ballSaveActive && this.state.mode !== 'zoomies') {
      this.ballSaveRemaining = 0;
      this.state.ballSaveActive = false;
      this.state.message = 'LANDED ON YOUR FEET';
      return this.snapshot();
    }
    if (!lastBall && this.state.ballsInPlay > 1) {
      this.state.ballsInPlay -= 1;
      this.state.message = 'Keep zooming!';
      return this.snapshot();
    }
    this.state.ballsInPlay = 0;
    this.state.lives -= 1;
    this.state.mode = 'normal';
    this.modeRemaining = 0;
    this.state.modeSeconds = 0;
    this.state.combo = 0;
    this.comboRemaining = 0;
    if (this.state.lives === 0) {
      this.state.phase = 'game-over';
      this.state.message = 'Game over';
    } else {
      this.state.phase = 'ready';
      this.state.message = 'Launch the next life';
      this.setObjective();
    }
    this.state.highScore = Math.max(this.state.highScore, this.state.score);
    return this.snapshot();
  }

  private endMultiball(): GameSnapshot {
    if (this.state.mode === 'zoomies') this.endMode();
    return this.snapshot();
  }

  private endMode(): void {
    const ended = this.state.mode;
    this.state.mode = 'normal';
    this.state.modeSeconds = 0;
    this.modeRemaining = 0;
    if (ended === 'laser-chase') {
      this.state.hunt = 0;
      this.state.message = 'Laser escaped';
      if (this.zoomiesQueued || this.state.boxLocks >= 3) this.startZoomies();
      else this.setObjective();
    } else if (ended === 'zoomies') {
      this.state.message = 'Zoomies ended';
      this.setObjective();
    }
  }

  private setObjective(): void {
    if (this.state.mode === 'laser-chase') this.state.objective = `Catch the red dot (${this.laserHits}/4)`;
    else if (this.state.mode === 'zoomies') this.state.objective = 'Hit ramps and targets for Zoomies jackpots';
    else this.state.objective = `Light targets for Hunt Meter (${this.state.hunt}/${HUNT_GOAL})`;
  }
}
