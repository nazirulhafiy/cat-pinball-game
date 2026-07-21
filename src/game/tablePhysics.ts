export type FlipperSide = 'left' | 'right';

export type Point = {
  x: number;
  y: number;
};

export type BallStallState = {
  anchor: Point;
  stationaryMs: number;
};

export type BallStallSample = {
  state: BallStallState;
  stuck: boolean;
};

export const BALL_RADIUS = 31;
export const FLIPPER_LENGTH = 190;
export const FLIPPER_HALF = FLIPPER_LENGTH / 2;
export const LEFT_PIVOT: Point = { x: 275, y: 1370 };
export const RIGHT_PIVOT: Point = { x: 725, y: 1370 };
export const LEFT_REST_ANGLE = 0.35;
export const RIGHT_REST_ANGLE = Math.PI - LEFT_REST_ANGLE;
export const LEFT_ACTIVE_ANGLE = -0.48;
export const RIGHT_ACTIVE_ANGLE = Math.PI - LEFT_ACTIVE_ANGLE;
export const LAUNCH_CHARGE_MS = 900;
export const MIN_LAUNCH_CHARGE = 0.28;
export const MIN_LAUNCH_SPEED = 27;
export const MAX_LAUNCH_SPEED = 46;
export const STUCK_BALL_TIMEOUT_MS = 2200;

const STUCK_BALL_MAX_TRAVEL = 16;

export type LauncherSpringPose = {
  offsetX: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

const STRIKE_REACH = BALL_RADIUS + 47;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function flipperTip(pivot: Point, angle: number): Point {
  return {
    x: pivot.x + Math.cos(angle) * FLIPPER_LENGTH,
    y: pivot.y + Math.sin(angle) * FLIPPER_LENGTH,
  };
}

export function centerDrainGap(): number {
  const leftTip = flipperTip(LEFT_PIVOT, LEFT_REST_ANGLE);
  const rightTip = flipperTip(RIGHT_PIVOT, RIGHT_REST_ANGLE);
  return rightTip.x - leftTip.x;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function isBallInFlipperStrikeZone(side: FlipperSide, ball: Point, currentAngle: number): boolean {
  const pivot = side === 'left' ? LEFT_PIVOT : RIGHT_PIVOT;
  const restAngle = side === 'left' ? LEFT_REST_ANGLE : RIGHT_REST_ANGLE;
  if (ball.y < pivot.y - 170 || ball.y > pivot.y + 105) return false;
  const currentDistance = distanceToSegment(ball, pivot, flipperTip(pivot, currentAngle));
  const restDistance = distanceToSegment(ball, pivot, flipperTip(pivot, restAngle));
  return Math.min(currentDistance, restDistance) <= STRIKE_REACH;
}

export function flipperStrikeVelocity(side: FlipperSide, ballX: number, currentVelocityX: number): Point {
  const tableBias = clamp((ballX - 500) / 220, -1, 1) * 5;
  const inwardKick = side === 'left' ? 2.5 : -2.5;
  return {
    x: clamp(currentVelocityX * 0.3 + tableBias + inwardKick, -11, 11),
    y: -29,
  };
}

export function launcherChargeFromHold(heldMs: number): number {
  return clamp(heldMs / LAUNCH_CHARGE_MS, 0, 1);
}

export function launcherSpringPose(charge: number, heldMs: number): LauncherSpringPose {
  const compression = clamp(charge, 0, 1);
  const tremor = Math.sin(heldMs / 42) * compression * (2 + compression * 4);
  const coilPulse = Math.sin(heldMs / 76) * compression * 0.025;
  return {
    offsetX: tremor,
    scaleX: 1 + compression * 0.14 - coilPulse,
    scaleY: 1 - compression * 0.38 + coilPulse,
    rotation: -compression * 0.08 + Math.sin(heldMs / 58) * compression * 0.09,
  };
}

export function launchSpeedForCharge(charge: number): number {
  const clamped = clamp(charge, 0, 1);
  if (clamped < MIN_LAUNCH_CHARGE) return 0;
  const usableCharge = (clamped - MIN_LAUNCH_CHARGE) / (1 - MIN_LAUNCH_CHARGE);
  const powerCurve = usableCharge * usableCharge;
  return MIN_LAUNCH_SPEED + (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED) * powerCurve;
}

export function sampleBallStall(
  previous: BallStallState | undefined,
  position: Point,
  deltaMs: number,
): BallStallSample {
  const moved = previous
    ? Math.hypot(position.x - previous.anchor.x, position.y - previous.anchor.y)
    : Number.POSITIVE_INFINITY;
  if (!previous || moved > STUCK_BALL_MAX_TRAVEL) {
    return { state: { anchor: { ...position }, stationaryMs: 0 }, stuck: false };
  }

  const stationaryMs = previous.stationaryMs + clamp(deltaMs, 0, 50);
  if (stationaryMs < STUCK_BALL_TIMEOUT_MS) {
    return { state: { anchor: previous.anchor, stationaryMs }, stuck: false };
  }

  return { state: { anchor: { ...position }, stationaryMs: 0 }, stuck: true };
}

export function stuckBallRecovery(position: Point): { position: Point; velocity: Point } {
  const direction = position.x >= 500 ? -1 : 1;
  const recoveredX = position.x > 835
    ? 785
    : clamp(position.x + direction * 28, 95, 905);
  return {
    position: { x: recoveredX, y: clamp(position.y - 18, 90, 1490) },
    velocity: { x: direction * 10, y: -15 },
  };
}
