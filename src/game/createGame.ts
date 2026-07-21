import Phaser from 'phaser';
import type { GameController, GameOptions } from './contracts';
import { TABLE_HEIGHT, TABLE_WIDTH } from './contracts';
import { GameScene } from './GameScene';

export function createGame(options: GameOptions): GameController {
  const scene = new GameScene(options);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: options.parent,
    width: TABLE_WIDTH,
    height: TABLE_HEIGHT,
    backgroundColor: '#090b1a',
    transparent: false,
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: 1.05 },
        enableSleeping: false,
        positionIterations: 10,
        velocityIterations: 8,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    },
    scene,
  });

  return {
    pause: () => scene.setPaused(true),
    resume: () => scene.setPaused(false),
    restart: () => scene.restartGame(),
    setMuted: (muted) => scene.setMuted(muted),
    destroy: () => game.destroy(true),
  };
}
