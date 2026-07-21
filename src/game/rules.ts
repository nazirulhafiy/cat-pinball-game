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
  | { type: 'mouse-hit' }
  | { type: 'roomba-hit' }
  | { type: 'drain'; lastBall?: boolean }
  | { type: 'launch' }
  | { type: 'tick'; deltaMs: number };

const MOUSE_GOAL = 3;
const MOUSE_DURATION_MS = 18_000;
const LASER_DURATION_MS = 20_000;
const ZOOMIES_DURATION_MS = 25_000;
const ROOMBA_GOAL = 6;
const ROOMBA_DURATION_MS = 30_000;

export class RulesEngine {
  private readonly initialHighScore: number;
  private state: GameSnapshot;
  private ballSaveRemaining = 0;
  private comboRemaining = 0;
  private modeRemaining = 0;
  private laserHits = 0;
  private mouseCompleted = false;
  private roombaDefeated = false;
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
    this.mouseCompleted = false;
    this.roombaDefeated = false;
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
    if (this.state.phase !== 'playing') return this.snapshot();

    switch (event.type) {
      case 'bumper': this.scoreNormal(100); break;
      case 'skill-shot':
        this.scoreNormal(2500);
        if (this.state.mode === 'normal' && !this.mouseCompleted) this.startMouseHunt();
        break;
      case 'target':
        this.scoreNormal(500);
        if (this.state.mode === 'normal') this.startLaser(1);
        else if (this.state.mode === 'zoomies') this.zoomiesJackpot();
        break;
      case 'ramp':
        if (this.state.mode === 'zoomies') this.zoomiesJackpot();
        else this.scoreNormal(1000);
        break;
      case 'vase': this.scoreNormal(750); break;
      case 'vase-set': this.state.score += 5000; this.state.message = 'SHELF CLEARED!'; break;
      case 'box':
        if (this.state.mode === 'zoomies') this.zoomiesJackpot();
        else {
          this.scoreNormal(1000);
          if (this.state.mode !== 'roomba-rumble') this.addBoxLock();
        }
        break;
      case 'laser-target': this.hitLaserTarget(); break;
      case 'mouse-hit': this.hitMouse(); break;
      case 'roomba-hit': this.hitRoomba(); break;
    }
    this.state.highScore = Math.max(this.state.highScore, this.state.score);
    return this.snapshot();
  }

  private newGame(): GameSnapshot {
    return {
      phase: 'ready', mode: 'normal', score: 0, highScore: this.initialHighScore,
      lives: 3, combo: 0, modeSeconds: 0,
      mouseHits: 0, mouseGoal: MOUSE_GOAL, roombaHits: 0, roombaGoal: ROOMBA_GOAL,
      laserComplete: false, zoomiesComplete: false, bossReady: false,
      ballSaveActive: false, ballsInPlay: 0,
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
    this.tryStartRoomba();
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

  private startLaser(initialHits = 0): void {
    this.state.mode = 'laser-chase';
    this.modeRemaining = LASER_DURATION_MS;
    this.state.modeSeconds = 20;
    this.laserHits = initialHits;
    this.state.message = initialHits > 0 ? `LASER CHASE! Red dot ${initialHits}/4` : 'LASER CHASE! Hit the red dot';
  }

  private startMouseHunt(): void {
    this.state.mode = 'mouse-hunt';
    this.modeRemaining = MOUSE_DURATION_MS;
    this.state.modeSeconds = 18;
    this.state.mouseHits = 0;
    this.state.message = 'MOUSE HUNT! Catch the scurrying mouse';
  }

  private hitMouse(): void {
    if (this.state.mode !== 'mouse-hunt') return;
    this.state.mouseHits = Math.min(MOUSE_GOAL, this.state.mouseHits + 1);
    this.state.score += this.state.mouseHits * 2000;
    this.state.message = `Mouse caught ${this.state.mouseHits}/${MOUSE_GOAL}`;
    if (this.state.mouseHits !== MOUSE_GOAL) return;

    this.mouseCompleted = true;
    this.state.score += 7500;
    this.addBoxLock();
    this.state.mode = 'normal';
    this.modeRemaining = 0;
    this.state.modeSeconds = 0;
    this.state.message = 'MOUSE HUNT complete! +7,500';
    this.continueAfterMode();
  }

  private hitLaserTarget(): void {
    if (this.state.mode !== 'laser-chase') return;
    this.laserHits += 1;
    this.state.score += this.laserHits * 1000;
    this.state.message = `Red dot ${this.laserHits}/4`;
    if (this.laserHits === 4) {
      this.state.score += 10_000;
      this.state.laserComplete = true;
      this.addBoxLock();
      this.state.mode = 'normal';
      this.modeRemaining = 0;
      this.state.modeSeconds = 0;
      this.state.message = 'Laser Chase complete! +10,000';
      this.continueAfterMode();
    }
  }

  private addBoxLock(): void {
    this.state.boxLocks = Math.min(3, this.state.boxLocks + 1);
    this.state.message = `Box lock ${this.state.boxLocks}/3`;
    if (this.state.boxLocks >= 3) {
      if (this.state.mode !== 'normal') this.zoomiesQueued = true;
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
  }

  private zoomiesJackpot(): void {
    this.zoomiesJackpots += 1;
    this.state.score += 5000 + 1000 * (this.zoomiesJackpots - 1);
    this.state.message = `Zoomies jackpot x${this.zoomiesJackpots}`;
  }

  private tryStartRoomba(): boolean {
    const ready = this.state.laserComplete && this.state.zoomiesComplete && !this.roombaDefeated;
    this.state.bossReady = ready;
    if (ready) this.zoomiesQueued = false;
    if (!ready || this.state.mode !== 'normal' || this.state.ballsInPlay < 1) return false;
    this.state.bossReady = false;
    this.state.mode = 'roomba-rumble';
    this.modeRemaining = ROOMBA_DURATION_MS;
    this.state.modeSeconds = 30;
    this.state.roombaHits = 0;
    this.state.boxLocks = 0;
    this.state.message = 'ROOMBA RUMBLE! Chase the robot vacuum';
    return true;
  }

  private hitRoomba(): void {
    if (this.state.mode !== 'roomba-rumble') return;
    this.state.roombaHits = Math.min(ROOMBA_GOAL, this.state.roombaHits + 1);
    this.state.score += 3500;
    this.state.message = `Vacuum hit ${this.state.roombaHits}/${ROOMBA_GOAL}`;
    if (this.state.roombaHits !== ROOMBA_GOAL) return;

    this.state.score += 25_000;
    this.roombaDefeated = true;
    this.state.mode = 'normal';
    this.modeRemaining = 0;
    this.state.modeSeconds = 0;
    this.state.message = 'ROOMBA RUMBLE won! +25,000';
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
      if (this.state.ballsInPlay === 1 && this.state.mode === 'normal') this.tryStartRoomba();
      return this.snapshot();
    }
    const endedMode = this.state.mode;
    this.state.ballsInPlay = 0;
    this.state.lives -= 1;
    this.state.mode = 'normal';
    this.modeRemaining = 0;
    this.state.modeSeconds = 0;
    this.state.combo = 0;
    this.comboRemaining = 0;
    this.zoomiesQueued = false;
    if (endedMode === 'roomba-rumble' && !this.roombaDefeated) this.state.bossReady = true;
    if (this.state.lives === 0) {
      this.state.phase = 'game-over';
      this.state.message = 'Game over';
    } else {
      this.state.phase = 'ready';
      this.state.message = 'Launch the next life';
    }
    this.state.highScore = Math.max(this.state.highScore, this.state.score);
    return this.snapshot();
  }

  private endMode(): void {
    const ended = this.state.mode;
    this.state.mode = 'normal';
    this.state.modeSeconds = 0;
    this.modeRemaining = 0;
    if (ended === 'laser-chase') {
      this.state.message = 'Laser escaped';
      this.continueAfterMode();
    } else if (ended === 'mouse-hunt') {
      this.state.mouseHits = 0;
      this.state.message = 'Mouse escaped into the wall';
      this.continueAfterMode();
    } else if (ended === 'zoomies') {
      this.state.zoomiesComplete = true;
      this.state.message = 'Zoomies ended';
      this.tryStartRoomba();
    } else if (ended === 'roomba-rumble') {
      this.state.bossReady = !this.roombaDefeated && this.state.laserComplete && this.state.zoomiesComplete;
      this.state.message = 'The robot vacuum escaped';
    }
  }

  private continueAfterMode(): void {
    if (this.state.laserComplete && this.state.zoomiesComplete && !this.roombaDefeated) {
      this.tryStartRoomba();
    } else if (this.zoomiesQueued || this.state.boxLocks >= 3) this.startZoomies();
  }
}
