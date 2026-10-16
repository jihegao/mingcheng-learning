import {
  TRAINING_EARTH,
  buildRocketDesign,
  createFlight,
  designStats,
  orbitalElements,
  predictedOrbit,
  separateStage,
  stepFlight,
} from "../../src/orbit-game.js";

const canvas = document.querySelector("#flight-canvas");
const context = canvas.getContext("2d");
const form = document.querySelector("#design-form");
const controls = { left: false, right: false, thrust: false };
let design;
let flight;
let running = false;
let paused = false;
let warp = 6;
let accumulator = 0;
let lastFrame = performance.now();

function readDesign() {
  return buildRocketDesign({
    payloadMass: Number(document.querySelector("#payload").value) * 1_000,
    boosterTanks: Number(document.querySelector("#booster-tanks").value),
    boosterEngine: document.querySelector("#booster-engine").value,
    upperTanks: Number(document.querySelector("#upper-tanks").value),
    upperEngine: document.querySelector("#upper-engine").value,
  });
}

function updateBlueprint() {
  design = readDesign();
  const stats = designStats(design);
  const selections = design.selections;
  document.querySelector("#payload-output").textContent = `${design.payloadMass / 1_000} t`;
  document.querySelector("#design-mass").textContent = `${(stats.launchMass / 1_000).toFixed(0)} t`;
  document.querySelector("#design-twr").textContent = stats.launchTwr.toFixed(2);
  document.querySelector("#design-dv1").textContent = `${(stats.stageDeltaV[0] / 1_000).toFixed(2)} km/s`;
  document.querySelector("#design-dv2").textContent = `${(stats.stageDeltaV[1] / 1_000).toFixed(2)} km/s`;
  document.querySelector(".booster-shape").style.setProperty("--tank-count", selections.boosterTanks);
  document.querySelector(".upper-shape").style.setProperty("--tank-count", selections.upperTanks);
  document.querySelector(".booster-shape i").textContent = "●".repeat(selections.boosterTanks);
  document.querySelector(".upper-shape i").textContent = "●".repeat(selections.upperTanks);
  document.querySelector("#design-twr").dataset.tone = stats.launchTwr < 1 ? "bad" : stats.launchTwr > 2.5 ? "warn" : "good";
}

function rollout() {
  design = readDesign();
  flight = createFlight(design);
  running = true;
  paused = false;
  controls.thrust = false;
  document.body.classList.add("flight-active");
  document.querySelector("#flight-status").textContent = "On launchpad · press W for engine";
  document.querySelector("#map-callout strong").textContent = "Ready for ignition";
  document.querySelector("#map-callout p").textContent = "Press W or ENGINE, then steer with A / D.";
  document.querySelector("#pause").textContent = "Pause";
  updateTelemetry();
}

function resetFlight() {
  rollout();
  document.querySelector("#map-callout").hidden = false;
}

function toggleEngine() {
  if (!running) rollout();
  if (["crashed", "escaped"].includes(flight.state.status)) return;
  controls.thrust = !controls.thrust;
  const button = document.querySelector("#engine-toggle");
  button.classList.toggle("active", controls.thrust);
  button.querySelector("span").textContent = controls.thrust ? "ENGINE ON" : "ENGINE OFF";
  document.querySelector("#map-callout").hidden = false;
}

function commandStage() {
  if (!running || flight.state.stageIndex > 0) return;
  separateStage(flight);
  controls.thrust = false;
  document.querySelector("#engine-toggle").classList.remove("active");
  document.querySelector("#engine-toggle span").textContent = "ENGINE OFF";
  document.querySelector("#flight-status").textContent = "Stage 2 active · restart engine";
  updateTelemetry();
}

function localPitch(state) {
  const radialAngle = Math.atan2(state.y, state.x);
  let difference = (state.heading - radialAngle) * 180 / Math.PI;
  while (difference > 180) difference -= 360;
  while (difference < -180) difference += 360;
  return difference;
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return "OPEN";
  return `${Math.round(value / 1_000)} km`;
}

function updateTelemetry() {
  if (!flight) return;
  const { state } = flight;
  const radius = Math.hypot(state.x, state.y);
  const altitude = radius - TRAINING_EARTH.radius;
  const speed = Math.hypot(state.vx, state.vy);
  const tangentSpeed = Math.abs((-state.y / radius) * state.vx + (state.x / radius) * state.vy);
  const orbit = orbitalElements(state);
  const stage = design.stages[state.stageIndex];
  const fuel = state.fuelRemaining[state.stageIndex];
  const fuelPercent = Math.max(0, fuel / stage.fuelMass * 100);
  const pitch = localPitch(state);

  document.querySelector("#mission-time").textContent = `T+${state.time.toFixed(1).padStart(5, "0")}`;
  document.querySelector("#altitude").textContent = `${Math.max(0, altitude / 1_000).toFixed(1)} km`;
  document.querySelector("#speed").textContent = `${(speed / 1_000).toFixed(2)} km/s`;
  document.querySelector("#tangent-speed").textContent = `${(tangentSpeed / 1_000).toFixed(2)} km/s`;
  document.querySelector("#apogee").textContent = formatDistance(orbit.apogee);
  document.querySelector("#perigee").textContent = formatDistance(orbit.perigee);
  document.querySelector("#active-stage").textContent = `STAGE ${state.stageIndex + 1} FUEL`;
  document.querySelector("#fuel-percent").textContent = `${fuelPercent.toFixed(0)}%`;
  document.querySelector("#fuel-fill").style.width = `${fuelPercent}%`;
  document.querySelector("#flight-mass").textContent = `${(state.mass / 1_000).toFixed(1)} t`;
  document.querySelector("#max-q").textContent = `${(state.maxQ / 1_000).toFixed(0)} kPa`;
  document.querySelector("#pitch-value").textContent = `${pitch >= 0 ? "+" : ""}${pitch.toFixed(0)}°`;
  document.querySelector("#heading-needle").style.transform = `rotate(${pitch}deg)`;
  const inAtmosphere = altitude < TRAINING_EARTH.atmosphereHeight;
  const airState = document.querySelector("#atmosphere-state");
  airState.textContent = inAtmosphere ? "IN ATMOSPHERE" : "ABOVE ATMOSPHERE";
  airState.classList.toggle("clear", !inAtmosphere);

  const stable = orbit.bound && orbit.perigee >= TRAINING_EARTH.atmosphereHeight;
  const verdict = document.querySelector("#orbit-verdict");
  verdict.textContent = stable ? "Closed path: both sides stay above the atmosphere." : orbit.apogee > TRAINING_EARTH.atmosphereHeight ? "Space reached, but the path still intersects Earth." : "Build altitude and sideways speed.";
  verdict.dataset.tone = stable ? "good" : "bad";
  const firing = controls.thrust && fuel > 0;
  document.querySelector("#flight-status").textContent = {
    ready: "On launchpad · press W for engine",
    flying: fuel <= 0 && state.stageIndex === 0 ? "Stage 1 empty · press SPACE" : firing ? `Stage ${state.stageIndex + 1} engine firing` : `Stage ${state.stageIndex + 1} coasting`,
    orbit: "ORBIT CONFIRMED · closed path",
    crashed: "MISSION ENDED · impact",
    escaped: "MISSION ENDED · escaped view",
  }[state.status] || state.status;
  const radialSpeed = (state.x * state.vx + state.y * state.vy) / radius;
  const callout = document.querySelector("#map-callout");
  let director = ["Climb away from Earth", "Keep pitch near 0° for the first few kilometers."];
  if (fuel <= 0 && state.stageIndex === 0) director = ["Booster is empty", "Press SPACE to drop Stage 1, then restart the upper engine."];
  else if (stable) director = ["Closed path confirmed", "Turn the engine off and preserve the orbit."];
  else if (orbit.apogee > 105_000 && radialSpeed > 180) director = ["Apogee is high enough", "Cut the engine, point near +90°, and coast toward apogee."];
  else if (altitude > 90_000 && radialSpeed < 180) director = ["Circularization burn", "Point near +90° and fire until perigee rises above 70 km."];
  else if (altitude > 5_000) director = ["Begin the gravity turn", "Use D to turn gradually toward +60°. Build sideways speed."];
  if (state.status === "crashed") director = ["Impact", "Reset and make smaller steering changes."];
  callout.querySelector("strong").textContent = director[0];
  callout.querySelector("p").textContent = director[1];
  document.querySelector("#flight-log").innerHTML = state.events.slice(-6).map((event) => `<li><b>T+${event.time.toFixed(0)}</b>${event.label}</li>`).join("");
  document.querySelectorAll(".success-rules p").forEach((rule, index) => {
    const passed = index === 0 ? orbit.perigee >= TRAINING_EARTH.atmosphereHeight : index === 1 ? orbit.bound : !["crashed", "escaped"].includes(state.status);
    rule.classList.toggle("passed", passed);
  });
  if (["crashed", "escaped"].includes(state.status)) {
    controls.thrust = false;
    document.querySelector("#engine-toggle").classList.remove("active");
    document.querySelector("#engine-toggle span").textContent = "ENGINE OFF";
  }
}

function fitCanvas() {
  const scale = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (canvas.width !== Math.round(rect.width * scale) || canvas.height !== Math.round(rect.height * scale)) {
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
  }
  context.setTransform(scale, 0, 0, scale, 0, 0);
  return { width: rect.width, height: rect.height };
}

function drawPolyline(points, center, scale, color, dashed = false) {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = dashed ? 1.4 : 2.2;
  context.setLineDash(dashed ? [6, 7] : []);
  context.beginPath();
  points.forEach((point, index) => {
    const x = center.x + point.x * scale;
    const y = center.y + point.y * scale;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
  context.restore();
}

function drawEarth(center, earthRadius) {
  const atmosphereRadius = earthRadius * (1 + TRAINING_EARTH.atmosphereHeight / TRAINING_EARTH.radius);
  context.fillStyle = "rgba(70,202,255,.07)";
  context.strokeStyle = "rgba(88,230,255,.28)";
  context.setLineDash([4, 7]);
  context.beginPath(); context.arc(center.x, center.y, atmosphereRadius, 0, Math.PI * 2); context.fill(); context.stroke(); context.setLineDash([]);
  const ocean = context.createRadialGradient(center.x - earthRadius * .3, center.y - earthRadius * .35, earthRadius * .15, center.x, center.y, earthRadius);
  ocean.addColorStop(0, "#2a79a3"); ocean.addColorStop(.55, "#124c75"); ocean.addColorStop(1, "#082a4b");
  context.fillStyle = ocean; context.strokeStyle = "rgba(126,225,255,.65)"; context.lineWidth = 1.3;
  context.beginPath(); context.arc(center.x, center.y, earthRadius, 0, Math.PI * 2); context.fill(); context.stroke();
  context.save(); context.beginPath(); context.arc(center.x, center.y, earthRadius - 1, 0, Math.PI * 2); context.clip();
  context.fillStyle = "rgba(95,164,119,.72)";
  context.beginPath(); context.ellipse(center.x - earthRadius * .33, center.y - earthRadius * .18, earthRadius * .24, earthRadius * .13, -.5, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.ellipse(center.x + earthRadius * .29, center.y + earthRadius * .08, earthRadius * .3, earthRadius * .17, .55, 0, Math.PI * 2); context.fill();
  context.fillStyle = "rgba(220,241,249,.72)"; context.beginPath(); context.ellipse(center.x, center.y - earthRadius * .91, earthRadius * .34, earthRadius * .09, 0, 0, Math.PI * 2); context.fill(); context.restore();
  context.fillStyle = "rgba(220,240,255,.55)"; context.font = "700 10px ui-monospace"; context.textAlign = "center"; context.fillText("SCALED EARTH · R = 600 km", center.x, center.y + 4);
}

function drawRocket(state, center, scale) {
  const x = center.x + state.x * scale;
  const y = center.y + state.y * scale;
  context.save(); context.translate(x, y); context.rotate(state.heading + Math.PI / 2);
  context.fillStyle = "#eef7ff"; context.strokeStyle = "#05101c"; context.lineWidth = 1;
  context.beginPath(); context.moveTo(0, -9); context.lineTo(5, 7); context.lineTo(0, 5); context.lineTo(-5, 7); context.closePath(); context.fill(); context.stroke();
  if (controls.thrust && state.fuelRemaining[state.stageIndex] > 0) { context.fillStyle = "#ffc85a"; context.beginPath(); context.moveTo(-3,7); context.lineTo(0,17 + Math.random() * 4); context.lineTo(3,7); context.fill(); }
  context.restore();
}

function draw() {
  const { width, height } = fitCanvas();
  context.clearRect(0, 0, width, height);
  const center = { x: width / 2, y: height / 2 };
  const earthRadius = Math.min(width, height) * .27;
  const scale = earthRadius / TRAINING_EARTH.radius;
  context.fillStyle = "rgba(255,255,255,.32)";
  for (let index = 0; index < 55; index += 1) {
    const x = (index * 83) % width; const y = (index * 47) % height; context.fillRect(x, y, index % 5 === 0 ? 1.5 : 1, index % 5 === 0 ? 1.5 : 1);
  }
  if (flight) {
    const prediction = predictedOrbit(flight.state);
    const orbit = orbitalElements(flight.state);
    drawPolyline(prediction, center, scale, orbit.perigee >= TRAINING_EARTH.atmosphereHeight ? "rgba(102,240,177,.8)" : "rgba(255,109,130,.66)", true);
    drawPolyline(flight.state.trajectory, center, scale, "#58e6ff");
  }
  drawEarth(center, earthRadius);
  if (flight) drawRocket(flight.state, center, scale);
  else drawRocket({ x: 0, y: -TRAINING_EARTH.radius, heading: -Math.PI / 2, fuelRemaining: [1], stageIndex: 0 }, center, scale);
}

function frame(now) {
  const elapsed = Math.min(.1, (now - lastFrame) / 1_000);
  lastFrame = now;
  if (running && !paused && flight && !["crashed", "escaped"].includes(flight.state.status)) {
    accumulator += elapsed * warp;
    while (accumulator >= .05) { stepFlight(flight, controls, .05); accumulator -= .05; }
    updateTelemetry();
  }
  draw();
  requestAnimationFrame(frame);
}

function bindHold(button, key) {
  const start = (event) => { event.preventDefault(); controls[key] = true; };
  const stop = (event) => { event.preventDefault(); controls[key] = false; };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("pointerleave", stop);
}

form.addEventListener("input", () => {
  if (!running || flight?.state.status === "ready") {
    updateBlueprint();
    if (running) { flight = createFlight(design); updateTelemetry(); }
  }
});
document.querySelector("#rollout").addEventListener("click", rollout);
document.querySelector("#engine-toggle").addEventListener("click", toggleEngine);
document.querySelector("#stage-command").addEventListener("click", commandStage);
document.querySelector("#reset-flight").addEventListener("click", resetFlight);
document.querySelector("#pause").addEventListener("click", () => { paused = !paused; document.querySelector("#pause").textContent = paused ? "Resume" : "Pause"; });
document.querySelectorAll("[data-warp]").forEach((button) => button.addEventListener("click", () => { warp = Number(button.dataset.warp); document.querySelectorAll("[data-warp]").forEach((item) => item.classList.toggle("selected", item === button)); }));
bindHold(document.querySelector("#turn-left"), "left");
bindHold(document.querySelector("#turn-right"), "right");
document.querySelector("#turn-left").addEventListener("click", () => { if (flight) flight.state.heading -= 4 * Math.PI / 180; });
document.querySelector("#turn-right").addEventListener("click", () => { if (flight) flight.state.heading += 4 * Math.PI / 180; });
window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW"].includes(event.code)) event.preventDefault();
  if (["ArrowLeft", "KeyA"].includes(event.code)) controls.left = true;
  if (["ArrowRight", "KeyD"].includes(event.code)) controls.right = true;
  if (["ArrowUp", "KeyW"].includes(event.code) && !event.repeat) toggleEngine();
  if (event.code === "Space" && !event.repeat) commandStage();
});
window.addEventListener("keyup", (event) => {
  if (["ArrowLeft", "KeyA"].includes(event.code)) controls.left = false;
  if (["ArrowRight", "KeyD"].includes(event.code)) controls.right = false;
});

updateBlueprint();
requestAnimationFrame(frame);
