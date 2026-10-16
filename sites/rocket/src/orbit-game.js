export const TRAINING_EARTH = Object.freeze({
  radius: 600_000,
  surfaceGravity: 9.80665,
  mu: 9.80665 * 600_000 ** 2,
  atmosphereHeight: 70_000,
  seaLevelDensity: 1.225,
  scaleHeight: 8_500,
});

export const ENGINES = Object.freeze({
  booster: {
    light: { name: "Swift-24", thrust: 2_400_000, isp: 280, mass: 3_500 },
    medium: { name: "Atlas-40", thrust: 4_000_000, isp: 290, mass: 5_500 },
    heavy: { name: "Titan-60", thrust: 6_000_000, isp: 300, mass: 8_000 },
  },
  upper: {
    light: { name: "Vac-06", thrust: 600_000, isp: 335, mass: 1_200 },
    medium: { name: "Vac-10", thrust: 1_000_000, isp: 345, mass: 1_800 },
    heavy: { name: "Vac-15", thrust: 1_500_000, isp: 350, mass: 2_600 },
  },
});

export const DEFAULT_DESIGN = Object.freeze({
  payloadMass: 6_000,
  boosterTanks: 2,
  boosterEngine: "medium",
  upperTanks: 1,
  upperEngine: "medium",
});

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function atmosphereDensity(altitude, world = TRAINING_EARTH) {
  if (altitude <= 0) return world.seaLevelDensity;
  if (altitude >= world.atmosphereHeight) return 0;
  return world.seaLevelDensity * Math.exp(-altitude / world.scaleHeight);
}

export function buildRocketDesign(input = DEFAULT_DESIGN) {
  const design = { ...DEFAULT_DESIGN, ...input };
  const boosterTanks = clamp(Math.round(Number(design.boosterTanks)), 1, 4);
  const upperTanks = clamp(Math.round(Number(design.upperTanks)), 1, 3);
  const payloadMass = clamp(Number(design.payloadMass), 2_000, 20_000);
  const boosterEngine = ENGINES.booster[design.boosterEngine] || ENGINES.booster.medium;
  const upperEngine = ENGINES.upper[design.upperEngine] || ENGINES.upper.medium;
  return {
    payloadMass,
    stages: [
      {
        name: "Booster",
        dryMass: 12_000 + boosterEngine.mass + boosterTanks * 3_000,
        fuelMass: boosterTanks * 45_000,
        dragArea: 34,
        ...boosterEngine,
      },
      {
        name: "Upper stage",
        dryMass: 2_200 + upperEngine.mass + upperTanks * 1_200,
        fuelMass: upperTanks * 20_000,
        dragArea: 12,
        ...upperEngine,
      },
    ],
    selections: {
      boosterTanks,
      boosterEngine: design.boosterEngine,
      upperTanks,
      upperEngine: design.upperEngine,
    },
  };
}

export function carriedMass(design, fuelRemaining, stageIndex = 0) {
  let mass = design.payloadMass;
  for (let index = stageIndex; index < design.stages.length; index += 1) {
    mass += design.stages[index].dryMass + fuelRemaining[index];
  }
  return mass;
}

export function stageDeltaV(design, stageIndex, world = TRAINING_EARTH) {
  const fuel = design.stages.map((stage) => stage.fuelMass);
  const fullMass = carriedMass(design, fuel, stageIndex);
  fuel[stageIndex] = 0;
  const emptyMass = carriedMass(design, fuel, stageIndex);
  return design.stages[stageIndex].isp * world.surfaceGravity * Math.log(fullMass / emptyMass);
}

export function designStats(design, world = TRAINING_EARTH) {
  const fuel = design.stages.map((stage) => stage.fuelMass);
  const launchMass = carriedMass(design, fuel, 0);
  return {
    launchMass,
    launchTwr: design.stages[0].thrust / (launchMass * world.surfaceGravity),
    stageDeltaV: design.stages.map((_, index) => stageDeltaV(design, index, world)),
  };
}

export function orbitalElements(state, world = TRAINING_EARTH) {
  const radius = Math.hypot(state.x, state.y);
  const speed2 = state.vx ** 2 + state.vy ** 2;
  const dot = state.x * state.vx + state.y * state.vy;
  const energy = speed2 / 2 - world.mu / radius;
  const angularMomentum = state.x * state.vy - state.y * state.vx;
  const ex = ((speed2 - world.mu / radius) * state.x - dot * state.vx) / world.mu;
  const ey = ((speed2 - world.mu / radius) * state.y - dot * state.vy) / world.mu;
  const eccentricity = Math.hypot(ex, ey);
  if (energy >= 0 || !Number.isFinite(energy)) {
    return { bound: false, perigee: Infinity, apogee: Infinity, eccentricity, ex, ey, energy };
  }
  const semiMajorAxis = -world.mu / (2 * energy);
  return {
    bound: true,
    energy,
    eccentricity,
    semiMajorAxis,
    parameter: angularMomentum ** 2 / world.mu,
    orientation: Math.atan2(ey, ex),
    perigee: semiMajorAxis * (1 - eccentricity) - world.radius,
    apogee: semiMajorAxis * (1 + eccentricity) - world.radius,
  };
}

export function predictedOrbit(state, world = TRAINING_EARTH, samples = 180) {
  const orbit = orbitalElements(state, world);
  if (!orbit.bound || orbit.eccentricity >= 1 || orbit.parameter <= 0) return [];
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    const anomaly = (index / samples) * Math.PI * 2;
    const radius = orbit.parameter / (1 + orbit.eccentricity * Math.cos(anomaly));
    if (!Number.isFinite(radius) || radius > world.radius * 4) continue;
    const angle = orbit.orientation + anomaly;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

export function createFlight(input = DEFAULT_DESIGN, world = TRAINING_EARTH) {
  const design = input.stages ? input : buildRocketDesign(input);
  const fuelRemaining = design.stages.map((stage) => stage.fuelMass);
  const state = {
    time: 0,
    x: 0,
    y: -world.radius - 2,
    vx: 0,
    vy: 0,
    heading: -Math.PI / 2,
    stageIndex: 0,
    fuelRemaining,
    mass: carriedMass(design, fuelRemaining, 0),
    status: "ready",
    maxAltitude: 0,
    maxSpeed: 0,
    maxQ: 0,
    trajectory: [],
    events: [{ time: 0, type: "ready", label: "Vehicle on launch pad" }],
    lastSampleTime: -1,
  };
  return { design, state };
}

export function separateStage(flight) {
  const { design, state } = flight;
  if (state.status === "crashed" || state.stageIndex >= design.stages.length - 1) return flight;
  const oldStage = design.stages[state.stageIndex];
  state.events.push({ time: state.time, type: "stage", label: `${oldStage.name} separated` });
  state.stageIndex += 1;
  state.mass = carriedMass(design, state.fuelRemaining, state.stageIndex);
  return flight;
}

export function stepFlight(flight, controls, dt, world = TRAINING_EARTH) {
  const { design, state } = flight;
  if (["crashed", "escaped"].includes(state.status)) return flight;
  const safeDt = clamp(Number(dt), 0.005, 0.15);
  const stage = design.stages[state.stageIndex];
  const turn = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
  state.heading += turn * (10 * Math.PI / 180) * safeDt;
  if (state.status === "ready" && !controls.thrust) return flight;

  const radius = Math.hypot(state.x, state.y);
  const altitude = radius - world.radius;
  const speed = Math.hypot(state.vx, state.vy);
  const density = atmosphereDensity(altitude, world);
  const q = 0.5 * density * speed ** 2;
  const canBurn = controls.thrust && state.fuelRemaining[state.stageIndex] > 0;
  let thrustAcceleration = 0;
  if (canBurn) {
    if (state.status === "ready") {
      state.status = "flying";
      state.events.push({ time: state.time, type: "launch", label: "Liftoff" });
    }
    state.mass = carriedMass(design, state.fuelRemaining, state.stageIndex);
    thrustAcceleration = stage.thrust / state.mass;
    const burn = Math.min(state.fuelRemaining[state.stageIndex], stage.thrust / (stage.isp * world.surfaceGravity) * safeDt);
    state.fuelRemaining[state.stageIndex] -= burn;
  }

  const gravityFactor = -world.mu / radius ** 3;
  let ax = gravityFactor * state.x + Math.cos(state.heading) * thrustAcceleration;
  let ay = gravityFactor * state.y + Math.sin(state.heading) * thrustAcceleration;
  if (speed > 0 && density > 0) {
    const dragAcceleration = q * 0.32 * stage.dragArea / Math.max(1, state.mass);
    ax -= state.vx / speed * dragAcceleration;
    ay -= state.vy / speed * dragAcceleration;
  }
  state.vx += ax * safeDt;
  state.vy += ay * safeDt;
  state.x += state.vx * safeDt;
  state.y += state.vy * safeDt;
  state.time += safeDt;
  state.mass = carriedMass(design, state.fuelRemaining, state.stageIndex);

  const nextAltitude = Math.hypot(state.x, state.y) - world.radius;
  const nextSpeed = Math.hypot(state.vx, state.vy);
  state.maxAltitude = Math.max(state.maxAltitude, nextAltitude);
  state.maxSpeed = Math.max(state.maxSpeed, nextSpeed);
  state.maxQ = Math.max(state.maxQ, q);
  if (state.time - state.lastSampleTime >= 0.35) {
    state.trajectory.push({ x: state.x, y: state.y, time: state.time, stageIndex: state.stageIndex });
    if (state.trajectory.length > 3_000) state.trajectory.shift();
    state.lastSampleTime = state.time;
  }

  if (nextAltitude <= 0 && state.time > 2 && state.status !== "ready") {
    state.status = "crashed";
    state.events.push({ time: state.time, type: "failure", label: "Vehicle impacted Earth" });
  } else if (nextAltitude > world.radius * 2) {
    state.status = "escaped";
    state.events.push({ time: state.time, type: "failure", label: "Vehicle left the training view" });
  } else {
    const orbit = orbitalElements(state, world);
    if (orbit.bound && orbit.perigee >= world.atmosphereHeight && orbit.apogee <= world.radius * 1.5) {
      if (state.status !== "orbit") state.events.push({ time: state.time, type: "orbit", label: "Closed orbit confirmed" });
      state.status = "orbit";
    } else if (state.status === "orbit") {
      state.status = "flying";
    }
  }
  return flight;
}
