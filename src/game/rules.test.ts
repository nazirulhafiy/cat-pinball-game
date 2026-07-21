import { describe, expect, it } from 'vitest';
import { RulesEngine } from './rules';

const playing = () => {
  const engine = new RulesEngine({ highScore: 10 });
  engine.dispatch({ type: 'launch' });
  return engine;
};

const completeLaser = (engine: RulesEngine) => {
  engine.dispatch({ type: 'target' });
  for (let i = 0; i < 3; i++) engine.dispatch({ type: 'laser-target' });
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

  it('starts Laser Chase on the first red dot and completes it after four total hits', () => {
    const engine = playing();
    expect(engine.dispatch({ type: 'target' })).toMatchObject({ mode: 'laser-chase', message: 'LASER CHASE! Red dot 1/4' });
    for (let i = 0; i < 3; i++) engine.dispatch({ type: 'laser-target' });
    expect(engine.snapshot().mode).toBe('normal');
    expect(engine.snapshot()).toMatchObject({ laserComplete: true, zoomiesComplete: false, bossReady: false });
    expect(engine.snapshot().score).toBe(19_500);
  });

  it('starts Mouse Hunt from the mouse-hole skill shot and awards one box lock', () => {
    const engine = playing();
    expect(engine.dispatch({ type: 'skill-shot' })).toMatchObject({ mode: 'mouse-hunt', mouseHits: 0 });
    expect(engine.dispatch({ type: 'mouse-hit' })).toMatchObject({ mode: 'mouse-hunt', mouseHits: 1 });
    engine.dispatch({ type: 'mouse-hit' });
    expect(engine.dispatch({ type: 'mouse-hit' })).toMatchObject({ mode: 'normal', mouseHits: 3, boxLocks: 1 });
    expect(engine.dispatch({ type: 'skill-shot' }).mode).toBe('normal');
  });

  it('does not let the mouse-hole skill shot replace another active mode', () => {
    const engine = playing();
    engine.dispatch({ type: 'target' });
    expect(engine.dispatch({ type: 'skill-shot' }).mode).toBe('laser-chase');
  });

  it('queues Zoomies while Laser Chase is active', () => {
    const engine = playing();
    engine.dispatch({ type: 'target' });
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
    expect(engine.snapshot()).toMatchObject({ phase: 'ready', score: 0, lives: 3, mode: 'normal' });
  });

  it('unlocks Roomba Rumble after completing Laser Chase and Zoomies', () => {
    const engine = playing();
    completeLaser(engine);
    engine.dispatch({ type: 'box' });
    engine.dispatch({ type: 'box' });
    expect(engine.snapshot().mode).toBe('zoomies');

    engine.dispatch({ type: 'tick', deltaMs: 25_000 });
    expect(engine.snapshot()).toMatchObject({
      mode: 'normal', laserComplete: true, zoomiesComplete: true,
      bossReady: true, ballsInPlay: 3,
    });
    engine.dispatch({ type: 'drain', lastBall: false });
    expect(engine.dispatch({ type: 'drain', lastBall: false })).toMatchObject({
      mode: 'roomba-rumble', ballsInPlay: 1,
    });
    for (let i = 0; i < 5; i++) engine.dispatch({ type: 'roomba-hit' });
    expect(engine.dispatch({ type: 'roomba-hit' })).toMatchObject({ mode: 'normal', roombaHits: 6, bossReady: false });
  });

  it('prioritises an unlocked Roomba Rumble over a second queued Zoomies', () => {
    const engine = playing();
    for (let i = 0; i < 3; i++) engine.dispatch({ type: 'box' });
    engine.dispatch({ type: 'tick', deltaMs: 25_000 });
    engine.dispatch({ type: 'drain', lastBall: false });
    engine.dispatch({ type: 'drain', lastBall: false });
    engine.dispatch({ type: 'box' });
    engine.dispatch({ type: 'box' });
    completeLaser(engine);
    expect(engine.snapshot()).toMatchObject({ mode: 'roomba-rumble', ballsInPlay: 1, boxLocks: 0 });
  });

  it('keeps an escaped Roomba Rumble unlocked for a later life', () => {
    const engine = playing();
    completeLaser(engine);
    engine.dispatch({ type: 'box' });
    engine.dispatch({ type: 'box' });
    engine.dispatch({ type: 'tick', deltaMs: 25_000 });
    engine.dispatch({ type: 'drain', lastBall: false });
    engine.dispatch({ type: 'drain', lastBall: false });
    expect(engine.dispatch({ type: 'tick', deltaMs: 30_000 })).toMatchObject({ mode: 'normal', bossReady: true });
  });

  it('cancels timed enemy modes cleanly and clears their progress on restart', () => {
    const engine = playing();
    engine.dispatch({ type: 'skill-shot' });
    engine.dispatch({ type: 'mouse-hit' });
    expect(engine.dispatch({ type: 'tick', deltaMs: 18_000 })).toMatchObject({ mode: 'normal', mouseHits: 0 });
    engine.restart();
    expect(engine.snapshot()).toMatchObject({
      mode: 'normal', mouseHits: 0, roombaHits: 0,
      laserComplete: false, zoomiesComplete: false, bossReady: false,
    });
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
