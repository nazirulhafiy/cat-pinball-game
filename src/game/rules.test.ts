import { describe, expect, it } from 'vitest';
import { RulesEngine } from './rules';

const playing = () => {
  const engine = new RulesEngine({ highScore: 10 });
  engine.dispatch({ type: 'launch' });
  return engine;
};

describe('RulesEngine', () => {
  it('uses one shared scoring and timing model', () => {
    const bumper = playing(); bumper.dispatch({ type: 'bumper' });
    expect(bumper.snapshot().score).toBe(100);
    const skillShot = playing(); skillShot.dispatch({ type: 'skill-shot' });
    expect(skillShot.snapshot().score).toBe(2500);
    const ballSave = playing(); ballSave.dispatch({ type: 'tick', deltaMs: 7000 });
    expect(ballSave.snapshot().ballSaveActive).toBe(false);
    const combo = playing(); combo.dispatch({ type: 'target' }); combo.dispatch({ type: 'tick', deltaMs: 2400 }); combo.dispatch({ type: 'target' });
    expect(combo.snapshot().combo).toBe(1);
  });

  it('starts and completes Laser Chase after four lit targets', () => {
    const engine = playing();
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'target' });
    expect(engine.snapshot().mode).toBe('laser-chase');
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'laser-target' });
    expect(engine.snapshot().mode).toBe('normal');
    expect(engine.snapshot().score).toBe(25_000);
  });

  it('queues Zoomies while Laser Chase is active', () => {
    const engine = playing();
    for (let i = 0; i < 4; i++) engine.dispatch({ type: 'target' });
    for (let i = 0; i < 3; i++) engine.dispatch({ type: 'box' });
    expect(engine.snapshot().mode).toBe('laser-chase');
    engine.dispatch({ type: 'tick', deltaMs: 20_000 });
    expect(engine.snapshot().mode).toBe('zoomies');
    expect(engine.snapshot().ballsInPlay).toBe(3);
  });

  it('saves launch drains and only loses a multiball life on the last ball', () => {
    const engine = playing();
    engine.dispatch({ type: 'drain' });
    expect(engine.snapshot().lives).toBe(3);
    for (let i = 0; i < 3; i++) engine.dispatch({ type: 'box' });
    engine.dispatch({ type: 'drain', lastBall: false });
    expect(engine.snapshot().lives).toBe(3);
    expect(engine.snapshot().ballsInPlay).toBe(2);
    engine.dispatch({ type: 'drain', lastBall: true });
    expect(engine.snapshot().lives).toBe(2);
  });

  it('resets the game cleanly', () => {
    const engine = playing(); engine.dispatch({ type: 'target' }); engine.restart();
    expect(engine.snapshot()).toMatchObject({ phase: 'ready', score: 0, lives: 3, hunt: 0, mode: 'normal' });
  });

  it('awards a bonus when all vase targets are cleared', () => {
    const engine = playing();
    engine.dispatch({ type: 'vase' });
    engine.dispatch({ type: 'vase' });
    engine.dispatch({ type: 'vase' });
    const result = engine.dispatch({ type: 'vase-set' });
    expect(result.score).toBe(9_500);
    expect(result.message).toBe('SHELF CLEARED!');
  });

  it('communicates box-lock progress before opening Zoomies multiball', () => {
    const engine = playing();
    expect(engine.dispatch({ type: 'box' })).toMatchObject({ boxLocks: 1, message: 'Box lock 1/3' });
    expect(engine.dispatch({ type: 'box' })).toMatchObject({ boxLocks: 2, message: 'Box lock 2/3' });
    expect(engine.dispatch({ type: 'box' })).toMatchObject({ boxLocks: 0, mode: 'zoomies', ballsInPlay: 3 });
  });
});
