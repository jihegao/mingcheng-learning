// SI units throughout: metres, seconds, metres/second and metres/second².
// Classroom model: Earth is fixed; the Moon follows a prescribed circular orbit.
export const EARTH = Object.freeze({ radius: 6_371_000, mu: 3.986004418e14 });
export const MOON = Object.freeze({ radius: 1_737_400, mu: 4.9048695e12 });
export const MOON_DISTANCE = 384_400_000;
export const MOON_PERIOD = 27.321661 * 86_400;
export const EARTH_START_ALTITUDE = 60_000_000; // m above Earth's surface: visible high parking orbit
export const INITIAL_MOON_ANGLE = 1.7244;
export const ENGINE_ACCELERATION = 25; // m/s² while burning
export const EARTH_START_DV = 1_800; // m/s of available velocity change
export const MOON_START_DV = 1_800;

export function moonState(t) {
  const angle = INITIAL_MOON_ANGLE + (2 * Math.PI * t) / MOON_PERIOD;
  const speed = (2 * Math.PI * MOON_DISTANCE) / MOON_PERIOD;
  return {
    x: MOON_DISTANCE * Math.cos(angle),
    y: MOON_DISTANCE * Math.sin(angle),
    vx: -speed * Math.sin(angle),
    vy: speed * Math.cos(angle),
    angle,
  };
}

export function magnitude(x, y) { return Math.hypot(x, y); }

export function gravityAt(x, y, t) {
  const moon = moonState(t);
  const earthR = Math.max(magnitude(x, y), EARTH.radius);
  const moonDx = moon.x - x;
  const moonDy = moon.y - y;
  const moonR = Math.max(magnitude(moonDx, moonDy), MOON.radius);
  const earthFactor = -EARTH.mu / (earthR ** 3);
  const moonFactor = MOON.mu / (moonR ** 3);
  return { ax: earthFactor * x + moonFactor * moonDx, ay: earthFactor * y + moonFactor * moonDy };
}

export function createEarthStart() {
  const r = EARTH.radius + EARTH_START_ALTITUDE;
  return { t: 0, x: r, y: 0, vx: 0, vy: Math.sqrt(EARTH.mu / r), heading: Math.PI / 2,
    dv: EARTH_START_DV, status: "flying", closestMoon: Infinity, encounter: false, burned: false };
}

export function createMoonPractice() {
  const moon = moonState(0);
  const x = moon.x + 10_000_000;
  const y = moon.y;
  return { t: 0, x, y, vx: moon.vx, vy: moon.vy + 2_000, heading: -Math.PI / 2,
    dv: MOON_START_DV, status: "flying", closestMoon: 10_000_000, encounter: true, burned: false };
}

export function telemetry(state) {
  const moon = moonState(state.t);
  const dx = state.x - moon.x;
  const dy = state.y - moon.y;
  const rvx = state.vx - moon.vx;
  const rvy = state.vy - moon.vy;
  const moonDistance = magnitude(dx, dy);
  const moonRelativeSpeed = magnitude(rvx, rvy);
  const specificEnergy = moonRelativeSpeed ** 2 / 2 - MOON.mu / moonDistance;
  const angularMomentum = dx * rvy - dy * rvx;
  let periapsis = null;
  let apoapsis = null;
  if (specificEnergy < 0) {
    const a = -MOON.mu / (2 * specificEnergy);
    const e = Math.sqrt(Math.max(0, 1 + (2 * specificEnergy * angularMomentum ** 2) / MOON.mu ** 2));
    periapsis = a * (1 - e) - MOON.radius;
    apoapsis = a * (1 + e) - MOON.radius;
  }
  return {
    earthAltitude: magnitude(state.x, state.y) - EARTH.radius,
    moonDistance: moonDistance - MOON.radius,
    earthSpeed: magnitude(state.vx, state.vy),
    moonRelativeSpeed,
    lunarEnergy: specificEnergy,
    lunarPeriapsis: periapsis,
    lunarApoapsis: apoapsis,
    lunarCapture: periapsis !== null && periapsis > 100_000 && apoapsis < 50_000_000,
    moon,
  };
}

export function pointHeading(state, target) {
  const data = telemetry(state);
  const vx = state.vx - (target === "moon" ? data.moon.vx : 0);
  const vy = state.vy - (target === "moon" ? data.moon.vy : 0);
  return Math.atan2(vy, vx);
}

export function step(state, dt, burning = false) {
  if (state.status !== "flying" || dt <= 0) return { ...state };
  const burnTime = burning ? Math.min(dt, state.dv / ENGINE_ACCELERATION) : 0;
  const thrust = burnTime > 0 ? ENGINE_ACCELERATION * burnTime / dt : 0;
  const a0 = gravityAt(state.x, state.y, state.t);
  const ax0 = a0.ax + thrust * Math.cos(state.heading);
  const ay0 = a0.ay + thrust * Math.sin(state.heading);
  const x = state.x + state.vx * dt + 0.5 * ax0 * dt ** 2;
  const y = state.y + state.vy * dt + 0.5 * ay0 * dt ** 2;
  const t = state.t + dt;
  const a1 = gravityAt(x, y, t);
  const vx = state.vx + 0.5 * (ax0 + a1.ax + thrust * Math.cos(state.heading)) * dt;
  const vy = state.vy + 0.5 * (ay0 + a1.ay + thrust * Math.sin(state.heading)) * dt;
  const moon = moonState(t);
  const distanceToMoon = magnitude(x - moon.x, y - moon.y);
  let status = "flying";
  if (magnitude(x, y) <= EARTH.radius) status = "earth-impact";
  else if (distanceToMoon <= MOON.radius) status = "moon-impact";
  return {
    ...state, t, x, y, vx, vy, dv: Math.max(0, state.dv - burnTime * ENGINE_ACCELERATION), status,
    closestMoon: Math.min(state.closestMoon, distanceToMoon),
    encounter: state.encounter || distanceToMoon < 50_000_000,
    burned: state.burned || burnTime > 0,
  };
}

export function advance(state, seconds, burning = false) {
  let next = state;
  let remaining = seconds;
  while (remaining > 0 && next.status === "flying") {
    const nearEarth = magnitude(next.x, next.y) < 30_000_000;
    const moon = moonState(next.t);
    const nearMoon = magnitude(next.x - moon.x, next.y - moon.y) < 30_000_000;
    const dt = Math.min(remaining, burning ? 2 : nearEarth || nearMoon ? 20 : 120);
    next = step(next, dt, burning);
    remaining -= dt;
  }
  return next;
}
