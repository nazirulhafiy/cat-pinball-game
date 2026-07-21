import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  LEFT_ACTIVE_ANGLE,
  LEFT_PIVOT,
  RIGHT_ACTIVE_ANGLE,
  RIGHT_PIVOT,
  centerDrainGap,
  flipperStrikeVelocity,
  flipperTip,
  isBallInFlipperStrikeZone,
  launchSpeedForCharge,
  launcherChargeFromHold,
  launcherSpringPose,
} from './tablePhysics';

describe('pinball table physics', () => {
  it('leaves a genuine center drain wider than the ball', () => {
    expect(centerDrainGap()).toBeGreaterThan(BALL_RADIUS * 2 + 20);
  });

  it('recognises balls resting above either paw', () => {
    const leftTip = flipperTip(LEFT_PIVOT, LEFT_ACTIVE_ANGLE);
    const rightTip = flipperTip(RIGHT_PIVOT, RIGHT_ACTIVE_ANGLE);
    expect(isBallInFlipperStrikeZone('left', { x: leftTip.x - 20, y: leftTip.y - 28 }, LEFT_ACTIVE_ANGLE)).toBe(true);
    expect(isBallInFlipperStrikeZone('right', { x: rightTip.x + 20, y: rightTip.y - 28 }, RIGHT_ACTIVE_ANGLE)).toBe(true);
    expect(isBallInFlipperStrikeZone('left', { x: 500, y: 1000 }, LEFT_ACTIVE_ANGLE)).toBe(false);
  });

  it('sends a controlled paw strike strongly upward and toward the table', () => {
    const left = flipperStrikeVelocity('left', 455, 0);
    const right = flipperStrikeVelocity('right', 545, 0);
    expect(left.y).toBe(-29);
    expect(right.y).toBe(-29);
    expect(left.x).toBeGreaterThan(0);
    expect(right.x).toBeLessThan(0);
  });

  it('charges the tail launcher predictably and caps its speed', () => {
    expect(launcherChargeFromHold(0)).toBe(0);
    expect(launcherChargeFromHold(450)).toBe(0.5);
    expect(launcherChargeFromHold(1800)).toBe(1);
    expect(launchSpeedForCharge(0)).toBe(36);
    expect(launchSpeedForCharge(0.5)).toBe(40);
    expect(launchSpeedForCharge(2)).toBe(44);
  });

  it('compresses and trembles the tail like a wound spring', () => {
    expect(launcherSpringPose(0, 0)).toEqual({ offsetX: 0, scaleX: 1, scaleY: 1, rotation: 0 });
    const wound = launcherSpringPose(1, 900);
    const trembling = launcherSpringPose(1, 960);
    expect(wound.scaleY).toBeLessThan(0.7);
    expect(wound.scaleX).toBeGreaterThan(1.1);
    expect(trembling.offsetX).not.toBeCloseTo(wound.offsetX);
    expect(trembling.rotation).not.toBeCloseTo(wound.rotation);
  });
});
