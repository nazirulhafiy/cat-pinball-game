import Phaser from 'phaser';
import type { GameOptions, GameSnapshot, SpecialMode } from './contracts';
import { CAT_PROFILES, catPartAssetPaths, catPartTextureKeys } from './cats';
import { GameAudio, type SoundCue } from './audio';
import { RulesEngine, type GameEvent } from './rules';
import {
  BALL_RADIUS,
  FLIPPER_HALF,
  LEFT_ACTIVE_ANGLE,
  LEFT_PIVOT,
  LEFT_REST_ANGLE,
  RIGHT_ACTIVE_ANGLE,
  RIGHT_PIVOT,
  RIGHT_REST_ANGLE,
  flipperStrikeVelocity,
  isBallInFlipperStrikeZone,
  launchSpeedForCharge,
  launcherChargeFromHold,
  launcherSpringPose,
  type FlipperSide,
  type Point,
} from './tablePhysics';

type TableTarget = {
  key: string;
  x: number;
  y: number;
  body: Phaser.Physics.Matter.Image;
  halo: Phaser.GameObjects.Arc;
};

type Ball = Phaser.Physics.Matter.Image & { body: MatterJS.BodyType };

type VaseTarget = {
  x: number;
  y: number;
  sensor: MatterJS.BodyType;
  visual: Phaser.GameObjects.Image;
};

const LAUNCH_BALL_X = 875;
const TAIL_BASE_X = 930;
const TAIL_BASE_Y = 1540;
const LASER_ORIGIN: Point = { x: 138, y: 298 };

function labelMatterBody(gameObject: Phaser.Physics.Matter.Image, label: string): void {
  const body = gameObject.body as MatterJS.BodyType | null;
  if (body) body.label = label;
}

export class GameScene extends Phaser.Scene {
  private readonly options: GameOptions;
  private readonly cat;
  private readonly rules: RulesEngine;
  private readonly audio = new GameAudio();
  private balls: Ball[] = [];
  private ballSequence = 0;
  private leftFlipper!: Phaser.Physics.Matter.Image;
  private rightFlipper!: Phaser.Physics.Matter.Image;
  private leftDown = false;
  private rightDown = false;
  private keyboardLeftDown = false;
  private keyboardRightDown = false;
  private launched = false;
  private launchQueued: number | null = null;
  private launchCharging = false;
  private launchHeldMs = 0;
  private launchCharge = 0;
  private tailRebounding = false;
  private tailLauncher!: Phaser.GameObjects.Image;
  private launchMeter!: Phaser.GameObjects.Graphics;
  private launchLabel!: Phaser.GameObjects.Text;
  private laserTargets: TableTarget[] = [];
  private activeLaserIndex = 0;
  private laserMoveRemaining = 2400;
  private laserBeam!: Phaser.GameObjects.Graphics;
  private laserDot!: Phaser.GameObjects.Arc;
  private activeMode: SpecialMode = 'normal';
  private lastSnapshot!: GameSnapshot;
  private messageText!: Phaser.GameObjects.Text;
  private ballSaveLamp!: Phaser.GameObjects.Arc;
  private trailGraphics!: Phaser.GameObjects.Graphics;
  private trails = new Map<Ball, Phaser.Math.Vector2[]>();
  private mobileHandlers: Array<[string, EventListener]> = [];
  private multiballSpawned = false;
  private vases: VaseTarget[] = [];
  private knockedVases = new Set<number>();
  private boxTarget!: Phaser.Physics.Matter.Image;
  private boxLockText!: Phaser.GameObjects.Text;
  private boxLockHint!: Phaser.GameObjects.Text;
  private boxLockLamps: Phaser.GameObjects.Arc[] = [];

  constructor(options: GameOptions) {
    super({ key: 'game' });
    this.options = options;
    this.cat = CAT_PROFILES[options.cat];
    this.rules = new RulesEngine({ highScore: options.highScore });
    this.audio.setMuted(options.muted);
  }

  preload(): void {
    const partKeys = catPartTextureKeys(this.cat.id);
    const partPaths = catPartAssetPaths(this.cat.id);
    this.load.image('table-background', '/assets/table/background-v2.png');
    this.load.image(partKeys.leftPaw, partPaths.paw);
    this.load.image(partKeys.rightPaw, partPaths.paw);
    this.load.image(partKeys.tail, partPaths.tail);
    this.load.image('yarn', '/assets/table/objects/yarn-bumper-v1.png');
    this.load.image('laser-target', '/assets/table/objects/laser-target-v1.png');
    this.load.image('box', '/assets/table/objects/box-lock-v1.png');
    this.load.image('vase-zigzag', '/assets/table/objects/vase-zigzag-v1.png');
    this.load.image('vase-stripes', '/assets/table/objects/vase-stripes-v1.png');
    this.load.image('vase-scales', '/assets/table/objects/vase-scales-v1.png');
    this.load.image('guide-rail', '/assets/table/objects/guide-rail-v1.png');
    this.load.image('kitchen-ramp', '/assets/table/objects/kitchen-ramp-v1.png');
    this.load.image(`cat-ball-${this.cat.id}`, `/assets/cats/${this.cat.id}/ball-v1.png`);
  }

  create(): void {
    this.balls = [];
    this.ballSequence = 0;
    this.trails.clear();
    this.leftDown = false;
    this.rightDown = false;
    this.keyboardLeftDown = false;
    this.keyboardRightDown = false;
    this.launched = false;
    this.activeMode = 'normal';
    this.multiballSpawned = false;
    this.launchQueued = null;
    this.launchCharging = false;
    this.launchHeldMs = 0;
    this.launchCharge = 0;
    this.tailRebounding = false;
    this.laserTargets = [];
    this.activeLaserIndex = 0;
    this.laserMoveRemaining = 2400;
    this.vases = [];
    this.knockedVases.clear();
    this.boxLockLamps = [];
    this.createTextures();
    this.drawTable();
    this.createWallsAndGuides();
    this.createTargets();
    this.createFlippers();
    this.createInput();
    this.createCollisionHandling();
    this.trailGraphics = this.add.graphics().setDepth(5);
    this.spawnBall(true);
    this.emitSnapshot(this.rules.snapshot());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [name, handler] of this.mobileHandlers) window.removeEventListener(name, handler);
      this.mobileHandlers = [];
      this.audio.destroy();
    });
  }

  update(_time: number, delta: number): void {
    this.updateFlippers();
    this.updateTrails();
    this.updateLauncher(delta);
    this.updateLaser(delta);

    if (this.launchQueued !== null) {
      const charge = this.launchQueued;
      this.launchQueued = null;
      this.launchBall(charge);
    }

    const snapshot = this.dispatch({ type: 'tick', deltaMs: Math.min(delta, 50) });

    for (const ball of [...this.balls]) {
      if (ball.y > 1585 || ball.x < -60 || ball.x > 1060) {
        this.handleDrain(ball);
        continue;
      }
      const inLaunchLane = ball.x > 835;
      const maxSpeed = inLaunchLane ? 46 : snapshot.mode === 'zoomies' ? 34 : 31;
      const speed = Math.hypot(ball.body.velocity.x, ball.body.velocity.y);
      if (speed > maxSpeed) {
        const factor = maxSpeed / speed;
        ball.setVelocity(ball.body.velocity.x * factor, ball.body.velocity.y * factor);
      }
    }
  }

  setPaused(paused: boolean): void {
    if (!this.scene.isActive() && !paused) {
      this.scene.resume();
      this.matter.world.resume();
      this.emitSnapshot(this.rules.resume());
      return;
    }
    if (paused && this.scene.isActive()) {
      this.cancelLaunchCharge();
      this.emitSnapshot(this.rules.pause());
      this.audio.cue('pause');
      this.matter.world.pause();
      this.scene.pause();
    }
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  restartGame(): void {
    this.rules.restart();
    this.scene.restart();
  }

  private createTextures(): void {
    const make = (key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
      if (this.textures.exists(key)) return;
      const g = this.make.graphics({ x: 0, y: 0 });
      draw(g);
      g.generateTexture(key, width, height);
      g.destroy();
    };

    make(`cat-ball-${this.cat.id}`, 80, 80, (g) => {
      g.fillStyle(this.cat.accent, 0.28).fillCircle(40, 40, 39);
      g.fillStyle(this.cat.primary).fillCircle(40, 42, 31);
      g.fillStyle(this.cat.secondary).fillCircle(48, 44, 19);
      g.fillStyle(this.cat.primary).fillTriangle(29, 22, 34, 8, 42, 23);
      g.fillStyle(this.cat.secondary).fillCircle(48, 35, 12);
      g.fillStyle(0x171522).fillCircle(52, 34, 2.6);
      g.lineStyle(6, this.cat.accent, 1).beginPath().arc(39, 43, 28, -0.05, 4.7).strokePath();
      g.lineStyle(2, 0xffffff, 0.8).strokeCircle(40, 40, 36);
    });

    make('yarn', 110, 110, (g) => {
      g.fillStyle(0xdb7fd7).fillCircle(55, 55, 48);
      g.lineStyle(5, 0xffc8f2, 0.85);
      g.beginPath().moveTo(18, 46).lineTo(85, 28).lineTo(31, 83).lineTo(89, 70).strokePath();
      g.lineStyle(4, 0x692f7a, 0.7).strokeCircle(55, 55, 48);
    });
    make('laser-target', 84, 84, (g) => {
      g.fillStyle(0x251c36).fillCircle(42, 42, 36);
      g.lineStyle(5, 0xd55a78).strokeCircle(42, 42, 31);
      g.fillStyle(0xff355e).fillCircle(42, 42, 9);
    });
    ['vase-zigzag', 'vase-stripes', 'vase-scales'].forEach((key) => {
      make(key, 70, 100, (g) => {
        g.fillStyle(0x65d2d8).fillRoundedRect(15, 22, 40, 66, 16);
        g.fillStyle(0x8be5e7).fillRect(10, 15, 50, 18);
        g.lineStyle(4, 0xd2ffff, 0.7).strokeRoundedRect(15, 22, 40, 66, 16);
      });
    });
    make('box', 150, 110, (g) => {
      g.fillStyle(0xc98b52).fillRoundedRect(8, 22, 134, 80, 8);
      g.fillStyle(0xf2c17c).fillTriangle(8, 24, 60, 7, 72, 27);
      g.fillTriangle(142, 24, 90, 7, 78, 27);
      g.lineStyle(4, 0x6e452d).strokeRoundedRect(8, 22, 134, 80, 8);
    });
    make('guide-rail', 280, 48, (g) => {
      g.fillStyle(0x9a589e).fillRoundedRect(5, 8, 270, 35, 18);
      g.fillStyle(0x6179ad).fillRoundedRect(5, 4, 270, 31, 16);
      g.lineStyle(4, 0x171522).strokeRoundedRect(5, 4, 270, 39, 18);
    });
    make('kitchen-ramp', 270, 105, (g) => {
      g.fillStyle(0x586f9f).fillRoundedRect(5, 7, 260, 25, 12);
      g.fillStyle(0xa86735).fillRoundedRect(5, 38, 260, 30, 8);
      g.fillStyle(0x586f9f).fillRoundedRect(5, 74, 260, 25, 12);
      g.lineStyle(4, 0x171522).strokeRoundedRect(5, 7, 260, 92, 12);
    });
  }

  private drawTable(): void {
    this.add.rectangle(500, 800, 1000, 1600, 0x090b1a).setDepth(-11);
    this.add.image(500, 800, 'table-background').setDisplaySize(1000, 1600).setDepth(-10);

    this.messageText = this.add.text(500, 286, '', {
      fontFamily: 'ui-monospace, monospace', fontSize: '21px', fontStyle: '700', color: '#ffe29b',
      backgroundColor: '#090b1ae6', padding: { x: 13, y: 7 },
    }).setOrigin(0.5).setDepth(20);
    this.ballSaveLamp = this.add.circle(500, 1435, 14, 0x62f6a9, 0.2).setStrokeStyle(3, 0x62f6a9, 0.8);
    this.add.text(500, 1466, 'LAND ON YOUR FEET', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', fontStyle: '700', color: '#79d9a2',
    }).setOrigin(0.5);
  }

  private createWallsAndGuides(): void {
    const wall = (x: number, y: number, width: number, height: number, angle = 0, color = 0x3d4677, visible = true) => {
      if (visible) this.add.rectangle(x, y, width, height, color, 0.96).setRotation(angle).setDepth(1);
      const body = this.matter.add.rectangle(x, y, width, height, { isStatic: true, angle, restitution: 0.72, friction: 0 });
      body.label = 'wall';
    };
    const rail = (x: number, y: number, width: number, height: number, angle: number) => {
      this.add.image(x, y, 'guide-rail').setDisplaySize(width, height).setRotation(angle).setDepth(1);
    };
    // The illustrated cabinet supplies the outer boundary visuals; Matter bodies remain authoritative.
    wall(64, 800, 28, 1410, 0, 0x3d4677, false);
    wall(826, 790, 24, 1190, 0, 0x3d4677, false);
    rail(826, 790, 1210, 42, Math.PI / 2);
    wall(952, 800, 24, 1410, 0, 0x3d4677, false);
    wall(500, 48, 890, 28, 0, 0x3d4677, false);
    // Catch the rising ball above the lane divider, then guide it left into play.
    wall(856, 145, 190, 22, -0.5, 0x3d4677, false);
    rail(856, 145, 210, 42, -0.5);

    wall(197, 1260, 260, 26, 0.58, 0x596294, false);
    rail(197, 1260, 280, 46, 0.58);
    // Keep lower guides completely inside the playfield so the launch lane stays clear.
    wall(715, 1260, 190, 26, -0.58, 0x596294, false);
    rail(715, 1260, 210, 46, -0.58);
    wall(215, 1335, 160, 22, 0.14, 0x8a6190, false);
    rail(215, 1335, 180, 42, 0.14);
    wall(745, 1335, 120, 22, -0.14, 0x8a6190, false);
    rail(745, 1335, 140, 42, -0.14);

    wall(710, 850, 230, 20, -0.96, 0x42557d, false);
    wall(748, 825, 230, 12, -0.96, 0x6e8ca8, false);
    this.add.image(729, 838, 'kitchen-ramp').setDisplaySize(270, 105).setRotation(-0.96).setDepth(1);
    this.tailLauncher = this.add.image(TAIL_BASE_X, TAIL_BASE_Y, catPartTextureKeys(this.cat.id).tail)
      .setOrigin(0.5, 1).setDepth(2);
    this.launchMeter = this.add.graphics().setDepth(6);
    this.launchLabel = this.add.text(895, 1528, 'HOLD SPACE', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', fontStyle: '800', color: '#ffd68a',
    }).setOrigin(0.5).setDepth(6);
    this.updateLauncherVisual();
    this.add.text(727, 724, 'KITCHEN RAMP', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '700', color: '#a9c7df',
    }).setRotation(-0.96).setOrigin(0.5);

    const drain = this.matter.add.rectangle(500, 1545, 650, 40, { isStatic: true, isSensor: true });
    drain.label = 'drain';
  }

  private createTargets(): void {
    const bumpers = [
      { x: 310, y: 425 }, { x: 500, y: 360 }, { x: 690, y: 445 },
    ];
    for (const { x, y } of bumpers) {
      const bumper = this.matter.add.image(x, y, 'yarn', undefined, { isStatic: true, restitution: 1.35, friction: 0 });
      bumper.setCircle(50);
      bumper.setStatic(true);
      bumper.setFriction(0);
      bumper.setBounce(1.35);
      bumper.setDepth(3);
      labelMatterBody(bumper, 'bumper');
      this.add.circle(x, y, 57, 0x68446f, 0.9).setStrokeStyle(5, 0xd98ccf, 0.82).setDepth(2);
      this.add.circle(x, y, 64).setStrokeStyle(4, 0xf7a8ec, 0.28).setDepth(1);
    }

    const positions = [
      { x: 265, y: 650 }, { x: 500, y: 595 }, { x: 735, y: 650 }, { x: 500, y: 925 },
    ];
    this.laserTargets = positions.map(({ x, y }, index) => {
      const body = this.matter.add.image(x, y, 'laser-target', undefined, { isStatic: true, isSensor: true });
      body.setCircle(38);
      body.setStatic(true);
      body.setSensor(true);
      body.setDepth(3);
      labelMatterBody(body, `laser-${index}`);
      const halo = this.add.circle(x, y, 52, 0xff244f, 0).setStrokeStyle(5, 0xff4668, 0).setDepth(4);
      return { key: `laser-${index}`, x, y, body, halo };
    });
    this.laserBeam = this.add.graphics().setDepth(4);
    this.createLaserEmitter();
    this.laserDot = this.add.circle(positions[0].x, positions[0].y, 10, 0xff234f, 1)
      .setStrokeStyle(4, 0xffb0bd, 0.9).setDepth(7);
    this.showActiveLaserTarget();

    this.boxTarget = this.matter.add.image(210, 850, 'box', undefined, { isStatic: true, isSensor: true });
    this.boxTarget.setRectangle(130, 76);
    this.boxTarget.setStatic(true);
    this.boxTarget.setSensor(true);
    this.boxTarget.setDepth(3);
    labelMatterBody(this.boxTarget, 'box');
    this.boxLockText = this.add.text(210, 918, 'BOX LOCK 0/3', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', fontStyle: '800', color: '#f1bd78',
    }).setOrigin(0.5);
    this.boxLockHint = this.add.text(210, 944, '3 LOCKS = ZOOMIES', {
      fontFamily: 'system-ui, sans-serif', fontSize: '11px', fontStyle: '700', color: '#e7cc9f',
    }).setOrigin(0.5);
    this.boxLockLamps = [180, 210, 240].map((x) => this.add.circle(x, 968, 7, 0x342c39, 1)
      .setStrokeStyle(2, 0xf1bd78, 0.7).setDepth(4));

    const vaseKeys = ['vase-zigzag', 'vase-stripes', 'vase-scales'];
    this.vases = [410, 500, 590].map((x, index) => {
      const sensor = this.matter.add.rectangle(x, 790, 52, 78, { isStatic: true, isSensor: true });
      sensor.label = `vase-${index}`;
      const visual = this.add.image(x, 790, vaseKeys[index]).setDepth(3);
      return { x, y: 790, sensor, visual };
    });
    this.add.text(500, 856, 'KNOCK IT OFF', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: '700', color: '#8de6e5',
    }).setOrigin(0.5);

    const rampSensor = this.matter.add.rectangle(770, 710, 110, 24, { isStatic: true, isSensor: true, angle: -0.96 });
    rampSensor.label = 'ramp';
    const skill = this.matter.add.rectangle(895, 215, 86, 72, { isStatic: true, isSensor: true });
    skill.label = 'skill-shot';
    this.add.text(890, 180, 'MOUSE\nHOLE', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: '800', color: '#f7dc99', align: 'center',
    }).setOrigin(0.5);
  }

  private createFlippers(): void {
    const partKeys = catPartTextureKeys(this.cat.id);
    this.leftFlipper = this.matter.add.image(0, 0, partKeys.leftPaw, undefined, { isStatic: true, friction: 0, restitution: 0.7 });
    this.leftFlipper.setDisplaySize(200, 75).setRectangle(190, 50).setDepth(8);
    this.leftFlipper.setStatic(true);
    this.leftFlipper.setFriction(0);
    this.leftFlipper.setBounce(0.7);
    labelMatterBody(this.leftFlipper, 'flipper-left');
    this.rightFlipper = this.matter.add.image(0, 0, partKeys.rightPaw, undefined, { isStatic: true, friction: 0, restitution: 0.7 });
    this.rightFlipper.setDisplaySize(200, 75).setRectangle(190, 50).setDepth(8);
    this.rightFlipper.setStatic(true);
    this.rightFlipper.setFriction(0);
    this.rightFlipper.setBounce(0.7);
    labelMatterBody(this.rightFlipper, 'flipper-right');
    this.placeFlipper(this.leftFlipper, LEFT_PIVOT, LEFT_REST_ANGLE);
    this.placeFlipper(this.rightFlipper, RIGHT_PIVOT, RIGHT_REST_ANGLE);
  }

  private createLaserEmitter(): void {
    const emitter = this.add.container(LASER_ORIGIN.x, LASER_ORIGIN.y).setDepth(6).setScale(1.22);
    const cable = this.add.graphics();
    cable.lineStyle(5, 0x171522, 0.95).lineBetween(-67, -35, -51, -15);
    const mount = this.add.circle(-58, -18, 19, 0x332b4d, 1).setStrokeStyle(4, 0x171522, 1);
    const pointer = this.add.rectangle(-29, -8, 67, 27, 0x7a4d88, 1)
      .setStrokeStyle(4, 0x171522, 1).setRotation(0.22);
    const switchButton = this.add.rectangle(-39, -22, 17, 7, 0xffcf70, 1).setRotation(0.22);
    const lens = this.add.circle(0, 0, 12, 0xff3159, 1).setStrokeStyle(4, 0x171522, 1);
    const highlight = this.add.circle(3, -3, 3.5, 0xffdbe2, 1);
    const label = this.add.text(-35, 21, 'LASER', {
      fontFamily: 'system-ui, sans-serif', fontSize: '12px', fontStyle: '800', color: '#ff9ab0',
    }).setOrigin(0.5, 0);
    emitter.add([cable, mount, pointer, switchButton, lens, highlight, label]);
  }

  private createInput(): void {
    const bind = (name: string, callback: (down: boolean) => void) => {
      const handler: EventListener = (event) => {
        const custom = event as CustomEvent<{ down?: boolean }>;
        callback(custom.detail?.down ?? true);
        void this.audio.unlock();
      };
      window.addEventListener(name, handler);
      this.mobileHandlers.push([name, handler]);
    };
    bind('nine-lives:left', (down) => { this.leftDown = down; });
    bind('nine-lives:right', (down) => { this.rightDown = down; });
    bind('nine-lives:launch', (down) => {
      if (down) this.beginLaunchCharge();
      else this.releaseLaunchCharge();
    });

    const keyHandler = (down: boolean): EventListener => (event) => {
      const keyboardEvent = event as KeyboardEvent;
      const key = keyboardEvent.key.toLowerCase();
      if (key === 'a' || key === 'arrowleft') this.keyboardLeftDown = down;
      if (key === 'd' || key === 'arrowright') this.keyboardRightDown = down;
      const isLaunchKey = keyboardEvent.code === 'Space' || key === ' ' || key === 'spacebar';
      if (down && isLaunchKey && !keyboardEvent.repeat) {
        this.beginLaunchCharge();
        void this.audio.unlock();
      }
      if (!down && isLaunchKey) this.releaseLaunchCharge();
      if (key === 'a' || key === 'd' || key.startsWith('arrow') || isLaunchKey) keyboardEvent.preventDefault();
    };
    const keyDownHandler = keyHandler(true);
    const keyUpHandler = keyHandler(false);
    window.addEventListener('keydown', keyDownHandler);
    window.addEventListener('keyup', keyUpHandler);
    const blurHandler: EventListener = () => {
      this.leftDown = false;
      this.rightDown = false;
      this.keyboardLeftDown = false;
      this.keyboardRightDown = false;
      this.cancelLaunchCharge();
    };
    window.addEventListener('blur', blurHandler);
    this.mobileHandlers.push(['keydown', keyDownHandler], ['keyup', keyUpHandler], ['blur', blurHandler]);
  }

  private launcherBall(): Ball | undefined {
    return this.balls.find((candidate) => candidate.body?.isStatic && candidate.x > 835 && candidate.y > 1100);
  }

  private beginLaunchCharge(): void {
    if (this.launchCharging || this.lastSnapshot?.phase === 'paused' || this.lastSnapshot?.phase === 'game-over') return;
    if (!this.launcherBall()) return;
    this.tweens.killTweensOf(this.tailLauncher);
    this.tailRebounding = false;
    this.launchCharging = true;
    this.launchHeldMs = 0;
    this.launchCharge = 0;
    this.updateLauncherVisual();
  }

  private releaseLaunchCharge(): void {
    if (!this.launchCharging) return;
    const charge = Math.max(0.04, this.launchCharge);
    this.launchCharging = false;
    this.launchHeldMs = 0;
    this.launchCharge = 0;
    this.tailRebounding = true;
    this.updateLauncherVisual();
    this.playTailRelease(charge);
    this.launchQueued = charge;
  }

  private cancelLaunchCharge(): void {
    this.tweens.killTweensOf(this.tailLauncher);
    this.launchCharging = false;
    this.launchHeldMs = 0;
    this.launchCharge = 0;
    this.tailRebounding = false;
    this.updateLauncherVisual();
  }

  private updateLauncher(delta: number): void {
    if (!this.launchCharging) return;
    if (!this.launcherBall()) {
      this.cancelLaunchCharge();
      return;
    }
    this.launchHeldMs += Math.min(delta, 50);
    this.launchCharge = launcherChargeFromHold(this.launchHeldMs);
    this.updateLauncherVisual();
  }

  private updateLauncherVisual(): void {
    if (!this.tailLauncher || !this.launchMeter || !this.launchLabel) return;
    const charge = this.launchCharge;
    if (this.launchCharging) {
      const pose = launcherSpringPose(charge, this.launchHeldMs);
      this.tailLauncher
        .setPosition(TAIL_BASE_X + pose.offsetX, TAIL_BASE_Y)
        .setScale(pose.scaleX, pose.scaleY)
        .setRotation(pose.rotation);
    } else if (!this.tailRebounding) {
      this.tailLauncher.setPosition(TAIL_BASE_X, TAIL_BASE_Y).setScale(1).setRotation(0);
    }
    this.tailLauncher.clearTint();
    this.launchMeter.clear();
    this.launchMeter.fillStyle(0x15162d, 0.95).fillRoundedRect(840, 1235, 16, 220, 8);
    this.launchMeter.lineStyle(3, 0xffcf70, 0.8).strokeRoundedRect(840, 1235, 16, 220, 8);
    if (charge > 0) {
      const height = 212 * charge;
      this.launchMeter.fillStyle(charge >= 1 ? 0x62f6a9 : 0xff9d47, 1)
        .fillRoundedRect(844, 1451 - height, 8, height, 4);
    }
    const percent = Math.round(charge * 100);
    this.launchLabel.setText(this.launchCharging ? (charge >= 1 ? 'FULL! RELEASE' : `WINDING ${percent}%`) : 'HOLD SPACE');
  }

  private playTailRelease(charge: number): void {
    if (this.options.reducedMotion) {
      this.tailRebounding = false;
      this.updateLauncherVisual();
      return;
    }
    const force = Math.max(0.3, Math.min(charge, 1));
    this.tweens.killTweensOf(this.tailLauncher);
    this.tweens.add({
      targets: this.tailLauncher,
      x: TAIL_BASE_X,
      y: TAIL_BASE_Y,
      scaleX: 1 - force * 0.08,
      scaleY: 1 + force * 0.22,
      rotation: force * 0.08,
      duration: 85,
      ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: this.tailLauncher,
          x: TAIL_BASE_X,
          y: TAIL_BASE_Y,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          duration: 190,
          ease: 'Bounce.Out',
          onComplete: () => {
            this.tailRebounding = false;
            this.updateLauncherVisual();
          },
        });
      },
    });
  }

  private updateFlippers(): void {
    const left = this.keyboardLeftDown || this.leftDown;
    const right = this.keyboardRightDown || this.rightDown;
    const leftWasDown = Boolean(this.leftFlipper.getData('wasDown'));
    const rightWasDown = Boolean(this.rightFlipper.getData('wasDown'));
    const leftTarget = left ? LEFT_ACTIVE_ANGLE : LEFT_REST_ANGLE;
    const rightTarget = right ? RIGHT_ACTIVE_ANGLE : RIGHT_REST_ANGLE;
    this.placeFlipper(this.leftFlipper, LEFT_PIVOT, Phaser.Math.Angle.RotateTo(this.leftFlipper.rotation, leftTarget, 0.18));
    this.placeFlipper(this.rightFlipper, RIGHT_PIVOT, Phaser.Math.Angle.RotateTo(this.rightFlipper.rotation, rightTarget, 0.18));
    if (left && !leftWasDown) {
      this.audio.cue('flipper');
      this.strikeBallsWithFlipper('left');
    }
    if (right && !rightWasDown) {
      this.audio.cue('flipper');
      this.strikeBallsWithFlipper('right');
    }
    this.leftFlipper.setData('wasDown', left);
    this.rightFlipper.setData('wasDown', right);
  }

  private placeFlipper(flipper: Phaser.Physics.Matter.Image, pivot: Point, angle: number): void {
    flipper.setPosition(pivot.x + Math.cos(angle) * FLIPPER_HALF, pivot.y + Math.sin(angle) * FLIPPER_HALF);
    flipper.setRotation(angle);
  }

  private strikeBallsWithFlipper(side: FlipperSide): void {
    const flipper = side === 'left' ? this.leftFlipper : this.rightFlipper;
    for (const ball of this.balls) {
      if (ball.body.isStatic || ball.x > 835) continue;
      if (isBallInFlipperStrikeZone(side, ball, flipper.rotation)) this.strikeBallWithFlipper(ball, side);
    }
  }

  private strikeBallWithFlipper(ball: Ball, side: FlipperSide): void {
    const velocity = flipperStrikeVelocity(side, ball.x, ball.body.velocity.x);
    ball.setVelocity(velocity.x, velocity.y);
    ball.setAngularVelocity(side === 'left' ? 0.16 : -0.16);
  }

  private createCollisionHandling(): void {
    this.matter.world.on('collisionstart', (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      for (const pair of event.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        const ballBody = a.label.startsWith('ball-') ? a : b.label.startsWith('ball-') ? b : undefined;
        const other = ballBody === a ? b : a;
        if (!ballBody) continue;
        const ball = ballBody.gameObject as Ball | undefined;
        if (!ball) continue;
        this.handleTargetCollision(ball, other.label);
      }
    });
  }

  private handleTargetCollision(ball: Ball, label: string): void {
    if (label === 'drain') {
      this.handleDrain(ball);
      return;
    }
    if (label === 'flipper-left' || label === 'flipper-right') {
      const side: FlipperSide = label === 'flipper-left' ? 'left' : 'right';
      const pressed = side === 'left'
        ? this.keyboardLeftDown || this.leftDown
        : this.keyboardRightDown || this.rightDown;
      if (pressed) this.strikeBallWithFlipper(ball, side);
      return;
    }
    const cueAndDispatch = (cue: SoundCue, event: GameEvent) => {
      this.audio.cue(cue);
      return this.dispatch(event);
    };
    if (label === 'bumper') {
      cueAndDispatch('bumper', { type: 'bumper' });
      if (!this.options.reducedMotion) this.cameras.main.shake(42, 0.0025);
      return;
    }
    if (label === 'skill-shot' && this.launched) {
      cueAndDispatch('target', { type: 'skill-shot' });
      // Curve the plunger lane cleanly into the upper playfield.
      ball.setPosition(760, 245);
      ball.setVelocity(-11, 5);
      return;
    }
    if (label === 'ramp') {
      cueAndDispatch(this.activeMode === 'zoomies' ? 'jackpot' : 'target', { type: 'ramp' });
      return;
    }
    if (label === 'box') {
      const snapshot = cueAndDispatch('target', { type: 'box' });
      this.tweens.killTweensOf(this.boxTarget);
      this.tweens.add({ targets: this.boxTarget, scaleX: 0.9, scaleY: 0.9, yoyo: true, duration: 140, ease: 'Sine.InOut' });
      this.messageText.setText(snapshot.mode === 'zoomies' ? 'BOX OPEN — ZOOMIES!' : `BOX LOCK ${snapshot.boxLocks}/3`);
      ball.setVelocity(8, -12);
      return;
    }
    if (label.startsWith('vase-')) {
      const index = Number(label.slice(5));
      if (!this.knockVase(index)) return;
      cueAndDispatch('target', { type: 'vase' });
      if (this.knockedVases.size === this.vases.length) {
        this.dispatch({ type: 'vase-set' });
        this.time.delayedCall(950, () => this.resetVases());
      }
      return;
    }
    if (label.startsWith('laser-')) {
      const index = Number(label.slice(6));
      if (index !== this.activeLaserIndex) return;
      cueAndDispatch('laser', { type: this.activeMode === 'laser-chase' ? 'laser-target' : 'target' });
      this.advanceLaserTarget();
    }
  }

  private knockVase(index: number): boolean {
    const vase = this.vases[index];
    if (!vase || this.knockedVases.has(index)) return false;
    this.knockedVases.add(index);
    this.tweens.killTweensOf(vase.visual);
    if (this.options.reducedMotion) vase.visual.setAlpha(0);
    else this.tweens.add({
      targets: vase.visual,
      x: vase.x + (index - 1) * 55,
      y: vase.y + 150,
      rotation: (index - 1 || 1) * 1.25,
      alpha: 0,
      duration: 430,
      ease: 'Cubic.In',
    });
    return true;
  }

  private resetVases(): void {
    this.vases.forEach((vase) => {
      this.tweens.killTweensOf(vase.visual);
      vase.visual.setPosition(vase.x, vase.y).setRotation(0).setAlpha(1);
    });
    this.knockedVases.clear();
  }

  private launchBall(charge: number): void {
    const ball = this.launcherBall();
    if (!ball) return;
    const speed = launchSpeedForCharge(charge);
    void this.audio.unlock();
    this.options.callbacks.onFirstInteraction?.();
    ball.setStatic(false);
    this.dispatch({ type: 'launch' });
    ball.setVelocity(0, -speed);
    this.launched = true;
    this.audio.cue('launch');
    this.launchLabel.setText(`POWER ${Math.round(charge * 100)}%`);
    this.messageText.setText(charge >= 0.95 ? 'MAXIMUM ZOOM!' : 'GO, KITTY, GO!');
    this.time.delayedCall(700, () => {
      if (this.launchLabel.text.startsWith('POWER')) this.launchLabel.setText('HOLD SPACE');
    });
    this.time.delayedCall(900, () => this.messageText.setText(''));
  }

  private spawnBall(inLauncher = false, velocity?: Phaser.Math.Vector2): Ball {
    const x = inLauncher ? LAUNCH_BALL_X : 505 + Phaser.Math.Between(-55, 55);
    const y = inLauncher ? 1375 : 250;
    const ball = this.matter.add.image(x, y, `cat-ball-${this.cat.id}`, undefined, {
      restitution: 0.72, friction: 0.002, frictionAir: 0.006, density: 0.006,
    }) as Ball;
    ball.setDisplaySize(80, 80);
    ball.setCircle(BALL_RADIUS);
    ball.setBounce(0.72);
    ball.setFriction(0.002);
    ball.setFrictionAir(0.006);
    ball.setDensity(0.006);
    ball.setDepth(10);
    ball.setStatic(inLauncher);
    ball.setAngularVelocity(0.08);
    ball.body.label = `ball-${++this.ballSequence}`;
    if (velocity) ball.setVelocity(velocity.x, velocity.y);
    this.balls.push(ball);
    this.trails.set(ball, []);
    return ball;
  }

  private handleDrain(ball: Ball): void {
    if (!this.balls.includes(ball)) return;
    const wasLast = this.balls.length === 1;
    this.balls = this.balls.filter((candidate) => candidate !== ball);
    this.trails.delete(ball);
    ball.destroy();
    const snapshot = this.dispatch({ type: 'drain', lastBall: wasLast });

    if (!wasLast) return;
    this.cancelLaunchCharge();
    this.launched = false;
    this.multiballSpawned = false;
    if (snapshot.phase === 'game-over') {
      this.audio.cue('drain');
      this.options.callbacks.onGameOver(snapshot.score);
      return;
    }
    if (snapshot.message === 'LANDED ON YOUR FEET') this.audio.cue('save');
    else this.audio.cue('drain');
    this.time.delayedCall(750, () => {
      this.spawnBall(true);
      if (snapshot.message === 'LANDED ON YOUR FEET') {
        this.time.delayedCall(250, () => { this.launchQueued = 0.75; });
      }
    });
  }

  private handleModeChange(previous: SpecialMode, next: SpecialMode): void {
    this.activeMode = next;
    if (next === 'laser-chase') {
      this.audio.cue('laser');
      this.messageText.setText('LASER CHASE!');
      this.advanceLaserTarget();
    } else if (next === 'zoomies' && !this.multiballSpawned) {
      this.multiballSpawned = true;
      this.audio.cue('multiball');
      this.messageText.setText('ZOOMIES MULTIBALL!');
      this.spawnBall(false, new Phaser.Math.Vector2(-8, 4));
      this.spawnBall(false, new Phaser.Math.Vector2(8, 4));
    } else if (previous !== 'normal') {
      this.messageText.setText('BACK TO THE HUNT');
      this.time.delayedCall(1100, () => this.messageText.setText(''));
    }
    this.showActiveLaserTarget();
  }

  private advanceLaserTarget(): void {
    this.activeLaserIndex = (this.activeLaserIndex + 1) % this.laserTargets.length;
    this.laserMoveRemaining = this.activeMode === 'laser-chase' ? 1200 : 2400;
    this.showActiveLaserTarget();
  }

  private showActiveLaserTarget(): void {
    this.laserTargets.forEach((target, index) => {
      const active = index === this.activeLaserIndex;
      target.body.setAlpha(active ? 1 : 0.22).setScale(active ? 1 : 0.82);
      target.halo.setAlpha(active ? 1 : 0);
      if (active && !this.options.reducedMotion) {
        this.tweens.killTweensOf(target.halo);
        this.tweens.add({ targets: target.halo, scale: 1.28, alpha: 0.25, yoyo: true, repeat: -1, duration: 520 });
      } else {
        this.tweens.killTweensOf(target.halo);
        target.halo.setScale(1).setAlpha(active ? 0.8 : 0);
      }
    });
    const activeTarget = this.laserTargets[this.activeLaserIndex];
    if (!activeTarget || !this.laserDot) return;
    this.tweens.killTweensOf(this.laserDot);
    if (this.options.reducedMotion) this.laserDot.setPosition(activeTarget.x, activeTarget.y);
    else this.tweens.add({
      targets: this.laserDot,
      x: activeTarget.x,
      y: activeTarget.y,
      duration: this.activeMode === 'laser-chase' ? 180 : 300,
      ease: 'Sine.Out',
    });
  }

  private updateLaser(delta: number): void {
    if (!this.laserBeam || !this.laserDot) return;
    this.laserBeam.clear();
    this.laserBeam.lineStyle(this.activeMode === 'laser-chase' ? 8 : 6, 0xff3159, this.launched ? 0.72 : 0.42);
    this.laserBeam.lineBetween(LASER_ORIGIN.x, LASER_ORIGIN.y, this.laserDot.x, this.laserDot.y);
    this.laserBeam.lineStyle(2, 0xffd3db, this.launched ? 1 : 0.55);
    this.laserBeam.lineBetween(LASER_ORIGIN.x, LASER_ORIGIN.y, this.laserDot.x, this.laserDot.y);
    if (!this.launched || this.lastSnapshot?.ballsInPlay === 0) return;
    this.laserMoveRemaining -= Math.min(delta, 50);
    if (this.laserMoveRemaining <= 0) this.advanceLaserTarget();
  }

  private updateTrails(): void {
    this.trailGraphics.clear();
    for (const ball of this.balls) {
      const points = this.trails.get(ball) ?? [];
      points.push(new Phaser.Math.Vector2(ball.x, ball.y));
      const max = this.activeMode === 'zoomies' ? 16 : 9;
      while (points.length > max) points.shift();
      this.trails.set(ball, points);
      for (let i = 1; i < points.length; i += 1) {
        const alpha = (i / points.length) * (this.activeMode === 'zoomies' ? 0.42 : 0.2);
        this.trailGraphics.lineStyle(this.activeMode === 'laser-chase' ? 9 : 6, this.cat.accent, alpha);
        this.trailGraphics.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
      }
    }
  }

  private renderBoxLocks(snapshot: GameSnapshot): void {
    if (!this.boxLockText || !this.boxLockHint) return;
    const open = snapshot.mode === 'zoomies';
    const count = open ? 3 : snapshot.boxLocks;
    this.boxLockText.setText(open ? 'BOX OPEN!' : `BOX LOCK ${count}/3`);
    this.boxLockHint.setText(open ? 'ZOOMIES MULTIBALL' : count >= 3 ? 'READY AFTER LASER' : '3 LOCKS = ZOOMIES');
    this.boxLockLamps.forEach((lamp, index) => {
      const lit = index < count;
      lamp.setFillStyle(lit ? 0x62f6a9 : 0x342c39, 1)
        .setStrokeStyle(2, lit ? 0xd6ffe7 : 0xf1bd78, lit ? 1 : 0.7);
    });
  }

  private dispatch(event: GameEvent): GameSnapshot {
    const previousMode = this.activeMode;
    const snapshot = this.rules.dispatch(event);
    this.emitSnapshot(snapshot);
    if (snapshot.mode !== previousMode) this.handleModeChange(previousMode, snapshot.mode);
    return snapshot;
  }

  private emitSnapshot(snapshot: GameSnapshot): void {
    const messageChanged = snapshot.message !== this.lastSnapshot?.message;
    this.lastSnapshot = snapshot;
    this.ballSaveLamp?.setFillStyle(0x62f6a9, snapshot.ballSaveActive ? 0.95 : 0.12);
    this.renderBoxLocks(snapshot);
    if (snapshot.message && messageChanged) {
      this.messageText?.setText(snapshot.message);
      this.time?.delayedCall(900, () => {
        if (this.messageText?.text === snapshot.message) this.messageText.setText('');
      });
    }
    this.options.callbacks.onSnapshot(snapshot);
  }
}
