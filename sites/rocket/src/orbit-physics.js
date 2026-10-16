export const EARTH = Object.freeze({
  radius: 6_371_000,
  mu: 3.986004418e14,
  seaLevelDensity: 1.225,
  scaleHeight: 8_500,
  g0: 9.80665,
});

export const ORBIT_DEFAULTS = Object.freeze({
  dt: 0.25,
  maxTime: 900,
  pitchStart: 18,
  pitchDuration: 150,
  pitchFinal: 88,
  dragCoefficient: 0.35,
  dragArea: 35,
  qLimit: 62_000,
});

export const FREE_PRESET = Object.freeze({
  mode: "free",
  thrustAcceleration: 22,
  burnTime: 390,
  pitchStart: 18,
  pitchDuration: 150,
  pitchFinal: 88,
  maxTime: 900,
  dt: 0.25,
});

export const CONSTRAINT_PRESET = Object.freeze({
  mode: "constraints",
  pitchStart: 14,
  pitchDuration: 155,
  pitchFinal: 88,
  maxTime: 900,
  dt: 0.25,
  payloadMass: 8_000,
  dragArea: 32,
  dragCoefficient: 0.32,
  qLimit: 62_000,
  stages: [
    { name: "Single stage", dryMass: 28_000, fuelMass: 360_000, thrust: 6_900_000, isp: 345 },
  ],
});

export const STAGING_PRESET = Object.freeze({
  mode: "staging",
  pitchStart: 70,
  pitchDuration: 160,
  pitchFinal: 92,
  maxTime: 1_100,
  dt: 0.25,
  payloadMass: 8_000,
  dragArea: 38,
  dragCoefficient: 0.32,
  qLimit: 62_000,
  stages: [
    { name: "Stage 1", dryMass: 28_000, fuelMass: 320_000, thrust: 7_600_000, isp: 315 },
    { name: "Stage 2", dryMass: 9_000, fuelMass: 125_000, thrust: 1_800_000, isp: 370 },
  ],
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(value) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}

export function pitchAtTime(time, config) {
  if (time <= config.pitchStart) return 0;
  const progress = (time - config.pitchStart) / Math.max(1, config.pitchDuration);
  return smoothstep(progress) * config.pitchFinal;
}

export function atmosphericDensity(altitude, earth = EARTH) {
  if (altitude <= 0) return earth.seaLevelDensity;
  if (altitude >= 120_000) return 0;
  return earth.seaLevelDensity * Math.exp(-altitude / earth.scaleHeight);
}

export function circularSpeed(radius, earth = EARTH) {
  return Math.sqrt(earth.mu / radius);
}

export function totalMass(config, fuelRemaining, stageIndex = 0) {
  if (config.mode === "free") return 1;
  let mass = config.payloadMass;
  for (let index = stageIndex; index < config.stages.length; index += 1) {
    mass += config.stages[index].dryMass + fuelRemaining[index];
  }
  return mass;
}

export function orbitalElements(state, earth = EARTH) {
  const radius = Math.hypot(state.x, state.y);
  const speed2 = state.vx ** 2 + state.vy ** 2;
  const energy = speed2 / 2 - earth.mu / radius;
  const angularMomentum = state.x * state.vy - state.y * state.vx;

  if (energy >= 0) {
    return { bound: false, perigee: Infinity, apogee: Infinity, eccentricity: 1, energy };
  }

  const semiMajorAxis = -earth.mu / (2 * energy);
  const eccentricity = Math.sqrt(Math.max(0, 1 + (2 * energy * angularMomentum ** 2) / earth.mu ** 2));
  return {
    bound: true,
    energy,
    eccentricity,
    semiMajorAxis,
    perigee: semiMajorAxis * (1 - eccentricity) - earth.radius,
    apogee: semiMajorAxis * (1 + eccentricity) - earth.radius,
  };
}

export function classifyMission(state, metrics, earth = EARTH) {
  if (metrics.failure === "max_q") return { status: "failed", reason: "max_q" };
  if (metrics.failure === "no_liftoff") return { status: "failed", reason: "no_liftoff" };
  if (metrics.failure === "impact") return { status: "failed", reason: "impact" };

  const orbit = orbitalElements(state, earth);
  if (!orbit.bound) return { status: "failed", reason: "escape", orbit };
  if (orbit.perigee >= 100_000 && orbit.apogee <= 2_000_000) return { status: "orbit", reason: "stable_orbit", orbit };
  if (metrics.maxAltitude >= 100_000) return { status: "failed", reason: "suborbital", orbit };
  return { status: "failed", reason: "insufficient_energy", orbit };
}

function normalizedConfig(input) {
  const config = { ...ORBIT_DEFAULTS, ...input };
  config.dt = clamp(Number(config.dt), 0.05, 1);
  config.maxTime = clamp(Number(config.maxTime), 60, 2_000);
  config.pitchStart = clamp(Number(config.pitchStart), 0, 300);
  config.pitchDuration = clamp(Number(config.pitchDuration), 1, 400);
  config.pitchFinal = clamp(Number(config.pitchFinal), 0, 100);
  if (config.mode !== "free") {
    config.payloadMass = Math.max(0, Number(config.payloadMass));
    config.dragArea = Math.max(0, Number(config.dragArea));
    config.dragCoefficient = Math.max(0, Number(config.dragCoefficient));
    config.qLimit = Math.max(1_000, Number(config.qLimit));
    config.stages = config.stages.map((stage, index) => ({
      name: stage.name || `Stage ${index + 1}`,
      dryMass: Math.max(1, Number(stage.dryMass)),
      fuelMass: Math.max(0, Number(stage.fuelMass)),
      thrust: Math.max(0, Number(stage.thrust)),
      isp: Math.max(1, Number(stage.isp)),
    }));
  }
  return config;
}

export function simulateMission(input, earth = EARTH) {
  const config = normalizedConfig(input);
  const fuelRemaining = config.mode === "free" ? [] : config.stages.map((stage) => stage.fuelMass);
  let stageIndex = 0;
  let state = { time: 0, x: 0, y: earth.radius + 1, vx: 0, vy: 0, mass: totalMass(config, fuelRemaining) };
  const initialMass = state.mass;
  const trajectory = [];
  const events = [{ time: 0, type: "liftoff", label: "Liftoff" }];
  const metrics = { maxAltitude: 0, maxSpeed: 0, maxQ: 0, maxAcceleration: 0, failure: null };
  let engineOn = true;
  let step = 0;

  if (config.mode !== "free") {
    const firstStage = config.stages[0];
    const launchTwr = firstStage.thrust / (state.mass * earth.g0);
    if (launchTwr <= 1) {
      metrics.failure = "no_liftoff";
      const result = classifyMission(state, metrics, earth);
      return {
        config,
        initialMass,
        state,
        trajectory: [{ ...state, altitude: 1, speed: 0, q: 0, pitch: 0, stageIndex: 0 }],
        events,
        metrics,
        result: { ...result, orbit: orbitalElements(state, earth) },
        fuelRemaining,
      };
    }
  }

  while (state.time < config.maxTime) {
    const radius = Math.hypot(state.x, state.y);
    const altitude = radius - earth.radius;
    const radialX = state.x / radius;
    const radialY = state.y / radius;
    const tangentX = radialY;
    const tangentY = -radialX;
    const pitch = pitchAtTime(state.time, config);
    const pitchRadians = pitch * Math.PI / 180;
    const thrustDirectionX = radialX * Math.cos(pitchRadians) + tangentX * Math.sin(pitchRadians);
    const thrustDirectionY = radialY * Math.cos(pitchRadians) + tangentY * Math.sin(pitchRadians);
    const speed = Math.hypot(state.vx, state.vy);
    const density = config.mode === "free" ? 0 : atmosphericDensity(altitude, earth);
    const q = 0.5 * density * speed ** 2;
    let thrustAcceleration = 0;

    if (config.mode === "free") {
      engineOn = state.time < config.burnTime;
      thrustAcceleration = engineOn ? Math.max(0, Number(config.thrustAcceleration)) : 0;
    } else {
      const stage = config.stages[stageIndex];
      engineOn = Boolean(stage && fuelRemaining[stageIndex] > 0);
      state.mass = totalMass(config, fuelRemaining, stageIndex);
      if (engineOn) {
        thrustAcceleration = stage.thrust / state.mass;
        const requestedFuel = (stage.thrust / (stage.isp * earth.g0)) * config.dt;
        fuelRemaining[stageIndex] = Math.max(0, fuelRemaining[stageIndex] - requestedFuel);
      }
    }

    const gravityFactor = -earth.mu / radius ** 3;
    let ax = gravityFactor * state.x + thrustDirectionX * thrustAcceleration;
    let ay = gravityFactor * state.y + thrustDirectionY * thrustAcceleration;

    if (speed > 0 && density > 0) {
      const dragForce = q * config.dragCoefficient * config.dragArea;
      const dragAcceleration = dragForce / state.mass;
      ax -= (state.vx / speed) * dragAcceleration;
      ay -= (state.vy / speed) * dragAcceleration;
    }

    const acceleration = Math.hypot(ax, ay);
    const vx = state.vx + ax * config.dt;
    const vy = state.vy + ay * config.dt;
    state = {
      time: state.time + config.dt,
      x: state.x + vx * config.dt,
      y: state.y + vy * config.dt,
      vx,
      vy,
      mass: config.mode === "free" ? 1 : totalMass(config, fuelRemaining, stageIndex),
    };

    const nextAltitude = Math.hypot(state.x, state.y) - earth.radius;
    const nextSpeed = Math.hypot(state.vx, state.vy);
    metrics.maxAltitude = Math.max(metrics.maxAltitude, nextAltitude);
    metrics.maxSpeed = Math.max(metrics.maxSpeed, nextSpeed);
    metrics.maxQ = Math.max(metrics.maxQ, q);
    metrics.maxAcceleration = Math.max(metrics.maxAcceleration, acceleration);

    if (step % Math.max(1, Math.round(2 / config.dt)) === 0) {
      trajectory.push({ ...state, altitude: nextAltitude, speed: nextSpeed, q, pitch, engineOn, stageIndex });
    }

    if (config.mode !== "free" && q > config.qLimit) {
      metrics.failure = "max_q";
      events.push({ time: state.time, type: "failure", label: "Max-Q limit exceeded" });
      break;
    }

    if (config.mode === "staging" && fuelRemaining[stageIndex] <= 0 && stageIndex < config.stages.length - 1) {
      events.push({ time: state.time, type: "stage", label: `${config.stages[stageIndex].name} separated` });
      stageIndex += 1;
      state.mass = totalMass(config, fuelRemaining, stageIndex);
    }

    if (nextAltitude <= 0 && state.time > 4) {
      metrics.failure = "impact";
      events.push({ time: state.time, type: "failure", label: "Returned to Earth" });
      break;
    }
    step += 1;
  }

  const result = classifyMission(state, metrics, earth);
  const orbit = result.orbit || orbitalElements(state, earth);
  return { config, initialMass, state, trajectory, events, metrics, result: { ...result, orbit }, fuelRemaining };
}

export function formatMissionReason(reason) {
  return {
    stable_orbit: "Stable orbit reached",
    max_q: "Structural limit exceeded at Max-Q",
    no_liftoff: "Thrust-to-weight ratio is too low for liftoff",
    impact: "The trajectory returned to Earth",
    escape: "Too much energy: the vehicle escaped Earth",
    suborbital: "Reached space, but the path intersects Earth",
    insufficient_energy: "Not enough altitude and sideways speed",
  }[reason] || "Mission ended";
}
