export const DEFAULT_CONFIG = Object.freeze({
  gravity: 1.62,
  thrustAcceleration: 5.5,
  rotationSpeed: 72,
  fuelBurnRate: 8,
  safeSpeed: 3,
  safeHorizontalSpeed: 1.5,
  safeAngle: 15,
  padHalfWidth: 13,
});

export function createInitialState(overrides = {}) {
  return {
    x: -38,
    altitude: 92,
    vx: 4.2,
    vy: -2.2,
    angle: 0,
    fuel: 100,
    elapsed: 0,
    throttle: 0,
    phase: "ready",
    touchdownSpeed: null,
    ...overrides,
  };
}

export function magnitude(x, y) {
  return Math.hypot(x, y);
}

export function normalizeAngle(angle) {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

export function stepPhysics(state, controls, config = DEFAULT_CONFIG, dt = 1 / 60) {
  if (state.phase !== "flying") return { ...state };

  const boundedDt = Math.min(Math.max(dt, 0), 0.05);
  const rotation = Math.max(-1, Math.min(1, controls.rotation ?? 0));
  const requestedThrottle = Math.max(0, Math.min(1, controls.thrust ?? 0));
  const throttle = state.fuel > 0 ? requestedThrottle : 0;
  const angle = normalizeAngle(state.angle + rotation * config.rotationSpeed * boundedDt);
  const radians = angle * Math.PI / 180;
  const thrust = config.thrustAcceleration * throttle;
  const ax = Math.sin(radians) * thrust;
  const ay = Math.cos(radians) * thrust - config.gravity;
  const vx = state.vx + ax * boundedDt;
  const vy = state.vy + ay * boundedDt;

  return {
    ...state,
    x: state.x + vx * boundedDt,
    altitude: state.altitude + vy * boundedDt,
    vx,
    vy,
    angle,
    fuel: Math.max(0, state.fuel - config.fuelBurnRate * throttle * boundedDt),
    elapsed: state.elapsed + boundedDt,
    throttle,
  };
}

export function evaluateTouchdown(state, config = DEFAULT_CONFIG) {
  const touchdownSpeed = magnitude(state.vx, state.vy);
  const onPad = Math.abs(state.x) <= config.padHalfWidth;
  const upright = Math.abs(normalizeAngle(state.angle)) <= config.safeAngle;
  const slowEnough = touchdownSpeed <= config.safeSpeed;
  const horizontalSafe = Math.abs(state.vx) <= config.safeHorizontalSpeed;
  const landed = onPad && upright && slowEnough && horizontalSafe;

  return {
    phase: landed ? "landed" : "crashed",
    touchdownSpeed,
    onPad,
    upright,
    slowEnough,
    horizontalSafe,
  };
}

export function applyTouchdown(state, config = DEFAULT_CONFIG) {
  const result = evaluateTouchdown(state, config);
  return {
    ...state,
    altitude: 0,
    throttle: 0,
    phase: result.phase,
    touchdownSpeed: result.touchdownSpeed,
  };
}
