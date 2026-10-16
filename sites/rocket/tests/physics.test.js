import test from "node:test";
import assert from "node:assert/strict";
import { EARTH, EARTH_START_ALTITUDE, MOON, MOON_DISTANCE, MOON_PERIOD, ENGINE_ACCELERATION, createEarthStart, createMoonPractice, moonState, gravityAt, magnitude, pointHeading, step, advance, telemetry } from "../moon/physics.js";

test("Moon follows a 27.3-day circular path at fixed distance", () => {
  for (const t of [0, 86_400, MOON_PERIOD / 2]) {
    const moon = moonState(t);
    assert.ok(Math.abs(magnitude(moon.x, moon.y) - MOON_DISTANCE) < 0.01);
  }
  assert.ok(Math.abs(moonState(MOON_PERIOD).x - moonState(0).x) < 0.01);
});

test("Earth and Moon both contribute to spacecraft gravity", () => {
  const atEarth = gravityAt(EARTH.radius + 300_000, 0, 0);
  assert.ok(atEarth.ax < -8 && atEarth.ax > -10);
  const moon = moonState(0);
  const nearMoon = gravityAt(moon.x + MOON.radius + 1_000_000, moon.y, 0);
  assert.ok(Number.isFinite(nearMoon.ax));
  assert.ok(Number.isFinite(nearMoon.ay));
});

test("coasting preserves fuel; burning spends a bounded delta-v budget", () => {
  const start = createEarthStart();
  const coast = advance(start, 100);
  assert.equal(coast.dv, start.dv);
  const burn = advance(start, 2, true);
  assert.ok(Math.abs(burn.dv - (start.dv - 2 * ENGINE_ACCELERATION)) < 1e-7);
  assert.equal(burn.burned, true);
  assert.equal(start.burned, false);
  const exhausted = advance({ ...start, dv: 10 }, 2, true);
  assert.equal(exhausted.dv, 0);
});

test("a guided translunar burn can create a close Moon encounter", () => {
  let craft = createEarthStart();
  assert.equal(telemetry(craft).earthAltitude, EARTH_START_ALTITUDE);
  for (let i = 0; i < 15; i++) {
    craft = step({ ...craft, heading: pointHeading(craft, "earth") }, 2, true);
  }
  craft = advance(craft, 7 * 86_400);
  assert.equal(craft.status, "flying");
  assert.equal(craft.encounter, true);
  assert.ok(craft.closestMoon < 50_000_000);
});

test("near-Moon retrograde burn can make a safe bound orbit", () => {
  let craft = createMoonPractice();
  assert.equal(telemetry(craft).lunarCapture, false);
  for (let i = 0; i < 26; i++) craft = step({ ...craft, heading: pointHeading(craft, "moon") + Math.PI }, 2, true);
  const result = telemetry(craft);
  assert.equal(craft.status, "flying");
  assert.equal(result.lunarCapture, true);
  assert.ok(result.lunarPeriapsis > 100_000);
  assert.ok(result.lunarApoapsis < 50_000_000);
});

test("collisions stop the flight", () => {
  const earthStart = createEarthStart();
  assert.equal(step({ ...earthStart, x: EARTH.radius + 1, y: 0, vx: -1000, vy: 0 }, 1).status, "earth-impact");
  const moon = moonState(0);
  const moonStart = createMoonPractice();
  assert.equal(step({ ...moonStart, x: moon.x + MOON.radius + 1, y: moon.y, vx: moon.vx - 1000, vy: moon.vy }, 1).status, "moon-impact");
});
