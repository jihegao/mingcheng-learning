import { EARTH, EARTH_START_ALTITUDE, MOON_DISTANCE, createEarthStart, createMoonPractice, moonState, telemetry, pointHeading, advance, magnitude } from "./physics.js";

const phaseCopy = {
  1: { kicker: "STAGE 01 · OBSERVE", title: "月球不会停下来等你。", description: "先观察月球绕地球运动。记录它一天后的新位置，再猜想火箭经过几天飞行后，该朝哪里出发。", objective: "让模拟时间前进至少 1 天，指出月球的位置变化。" },
  2: { kicker: "STAGE 02 · PILOT", title: "亲手选择方向和点火时机。", description: "从高度 60,000 km 的高地球圆轨道出发。先指向顺行方向增加速度，滑行时观察移动的月球；必要时做小幅修正。", objective: "让飞船进入距月球中心 50,000 km 内，且不要撞击地球或月球。" },
  3: { kicker: "STAGE 03 · CAPTURE", title: "飞到月球旁边还不够。", description: "从近月练习点开始。当前速度过快，飞船会掠过月球。尝试指向相对月球的逆行方向，手动点火减速。", objective: "获得安全的绕月椭圆轨道：近月点高于 100 km、远月点低于 50,000 km。" },
};

const canvas = document.querySelector("#space-map");
const ctx = canvas.getContext("2d");
const ui = Object.fromEntries(["phase-kicker", "phase-title", "phase-description", "phase-objective", "mission-state", "time-value", "moon-distance", "moon-speed", "fuel-value", "orbit-value", "view-label", "view-button", "play-button", "reset-button", "warp-select"].map((id) => [id, document.getElementById(id)]));
const controls = { left: false, right: false, burn: false };
const completed = new Set();
const stars = Array.from({ length: 90 }, (_, i) => ({ x: (i * 3571 % 1091) / 1091 * canvas.width, y: (i * 4999 % 701) / 701 * canvas.height, r: i % 7 === 0 ? 1.5 : .75 }));
let phase = 1;
let state = createEarthStart();
let playing = false;
let view = "system";
let guidance = null;
let trail = [{ x: state.x, y: state.y, t: state.t }];
let lastTrailTime = 0;
let previousFrame = performance.now();

function reset() {
  state = phase === 3 ? createMoonPractice() : createEarthStart();
  playing = false;
  view = phase === 3 ? "moon" : "system";
  trail = [{ x: state.x, y: state.y, t: state.t }];
  lastTrailTime = state.t;
  controls.left = controls.right = controls.burn = false;
  guidance = null;
  updateUI();
  draw();
}

function choosePhase(next) {
  phase = next;
  document.querySelectorAll("[data-phase]").forEach((tab) => {
    const active = Number(tab.dataset.phase) === phase;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  const copy = phaseCopy[phase];
  ui["phase-kicker"].textContent = copy.kicker;
  ui["phase-title"].textContent = copy.title;
  ui["phase-description"].textContent = copy.description;
  ui["phase-objective"].textContent = copy.objective;
  reset();
}

function distanceLabel(metres) {
  const km = Math.max(0, metres / 1000);
  return km >= 100_000 ? `${Math.round(km / 1000).toLocaleString()} 千 km` : `${Math.round(km).toLocaleString()} km`;
}

function updateUI() {
  const d = telemetry(state);
  const days = Math.floor(state.t / 86_400);
  const hours = Math.floor((state.t % 86_400) / 3600);
  ui["time-value"].textContent = `${days} 天 ${hours} 小时`;
  ui["moon-distance"].textContent = distanceLabel(d.moonDistance);
  ui["moon-speed"].textContent = `${(d.moonRelativeSpeed / 1000).toFixed(2)} km/s`;
  ui["fuel-value"].textContent = `${Math.round(state.dv).toLocaleString()} m/s`;
  ui["orbit-value"].textContent = d.moonDistance > 100_000_000 || d.lunarPeriapsis === null
    ? "尚未形成绕月轨道"
    : `${distanceLabel(d.lunarPeriapsis)} / ${distanceLabel(d.lunarApoapsis)}`;
  ui["view-label"].textContent = view === "system" ? "地月全览 · 地球居中" : "近月相对视图 · 月球居中";
  ui["view-button"].textContent = view === "system" ? "切换近月视图" : "返回地月全览";
  ui["play-button"].textContent = playing ? "Ⅱ 暂停" : "▶ 开始";
  document.querySelector("#prograde-button").setAttribute("aria-pressed", String(guidance === "prograde"));
  document.querySelector("#retrograde-button").setAttribute("aria-pressed", String(guidance === "retrograde"));

  let message = playing ? "飞行中 · 观察轨迹和数据" : "已暂停 · 可以调整方向";
  let tone = "";
  if (phase === 1 && state.t >= 86_400) { completed.add(1); message = "阶段目标达成：月球已经移动了一段距离"; tone = "success"; }
  if (phase === 2 && state.encounter && state.status === "flying") { completed.add(2); message = "阶段目标达成：进入月球附近空间"; tone = "success"; }
  if (phase === 3 && state.burned && d.lunarCapture && state.status === "flying") { completed.add(3); message = "阶段目标达成：当前形成安全的绕月轨道"; tone = "success"; }
  if (state.status === "earth-impact") { message = "撞击地球：重置后调整点火方向与时机"; tone = "fail"; playing = false; }
  if (state.status === "moon-impact") { message = "撞击月球：近月点太低，试着更早减速"; tone = "fail"; playing = false; }
  ui["mission-state"].textContent = message;
  ui["mission-state"].className = `lab-state ${tone}`;
  document.querySelectorAll("[data-phase]").forEach((tab) => {
    const n = Number(tab.dataset.phase);
    tab.querySelector("span").textContent = completed.has(n) ? "✓" : String(n).padStart(2, "0");
  });
}

function projection(point) {
  if (view === "system") {
    const scale = Math.min(canvas.width, canvas.height) * .37 / MOON_DISTANCE;
    return { x: canvas.width / 2 + point.x * scale, y: canvas.height / 2 - point.y * scale };
  }
  const moon = moonState(point.t);
  const scale = Math.min(canvas.width, canvas.height) * .36 / 40_000_000;
  return { x: canvas.width / 2 + (point.x - moon.x) * scale, y: canvas.height / 2 - (point.y - moon.y) * scale };
}

function circle(x, y, r, fill, stroke = null) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}

function callout(text, labelX, labelY, targetX, targetY, color) {
  ctx.save();
  ctx.font = "16px system-ui";
  ctx.fillStyle = color;
  ctx.fillText(text, labelX, labelY);
  const endX = labelX > targetX ? labelX - 9 : labelX + ctx.measureText(text).width + 9;
  const angle = Math.atan2(targetY - labelY + 5, targetX - endX);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(endX, labelY - 5); ctx.lineTo(targetX, targetY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(targetX, targetY);
  ctx.lineTo(targetX - 7 * Math.cos(angle - .4), targetY - 7 * Math.sin(angle - .4));
  ctx.lineTo(targetX - 7 * Math.cos(angle + .4), targetY - 7 * Math.sin(angle + .4));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function draw() {
  const w = canvas.width; const h = canvas.height;
  ctx.fillStyle = "#061124"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#8ca8c5";
  for (const star of stars) circle(star.x, star.y, star.r, "#8ca8c5");
  const moon = moonState(state.t);
  if (view === "system") {
    const scale = Math.min(w, h) * .37 / MOON_DISTANCE;
    ctx.save(); ctx.setLineDash([7, 9]); circle(w / 2, h / 2, MOON_DISTANCE * scale, null, "#2e506d"); ctx.restore();
    const earthRadius = Math.max(4, EARTH.radius * scale);
    const parkingRadius = (EARTH.radius + EARTH_START_ALTITUDE) * scale;
    ctx.save(); ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
    circle(w / 2, h / 2, parkingRadius, null, "#60bbd5aa"); ctx.restore();
    circle(w / 2, h / 2, earthRadius, "#215c86", "#76d7ee");
    callout("地球", w / 2 - 105, h / 2 + 42, w / 2 - earthRadius - 3, h / 2 + 3, "#bfeefa");
    callout("初始高轨道 · 高度 60,000 km", w / 2 + 75, h / 2 - 70, w / 2 + parkingRadius * .7, h / 2 - parkingRadius * .7, "#7bd7e9");
    const moonPt = projection({ ...moon, t: state.t });
    circle(moonPt.x, moonPt.y, 11, "#d6dee7", "#ffffff");
    ctx.fillStyle = "#e5eef6"; ctx.font = "bold 17px system-ui"; ctx.fillText("月球", moonPt.x + 17, moonPt.y + 5);
    ctx.fillStyle = "#718daa"; ctx.font = "14px system-ui"; ctx.fillText("平均距离约 384,400 km", 25, h - 28);
  } else {
    circle(w / 2, h / 2, 30, "#b7c3d0", "#f3f8ff");
    circle(w / 2 - 10, h / 2 - 8, 5, "#a5b2c2");
    circle(w / 2 + 8, h / 2 + 10, 6, "#a5b2c2");
    ctx.fillStyle = "#e5eef6"; ctx.font = "bold 17px system-ui"; ctx.fillText("月球", w / 2 - 18, h / 2 + 60);
    ctx.fillStyle = "#718daa"; ctx.font = "14px system-ui"; ctx.fillText("相对视图：轨迹按每个时刻的月球位置平移", 25, h - 28);
  }
  if (trail.length > 1) {
    ctx.beginPath();
    trail.forEach((point, i) => { const p = projection(point); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.strokeStyle = "#f6bd65"; ctx.lineWidth = 2.5; ctx.stroke();
  }
  const ship = projection(state);
  ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(-state.heading);
  ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -7); ctx.lineTo(-5, 0); ctx.lineTo(-8, 7); ctx.closePath(); ctx.fill();
  if (playing && controls.burn && state.dv > 0) { ctx.fillStyle = "#ffb95f"; ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-21, 0); ctx.lineTo(-7, 4); ctx.fill(); }
  ctx.restore(); circle(ship.x, ship.y, 19, null, "#ffffff55");
  ctx.fillStyle = "#d8e9fa"; ctx.font = "15px system-ui"; ctx.fillText("飞船", ship.x + 16, ship.y - 15);
  ctx.fillStyle = "#6f8ca8"; ctx.font = "12px system-ui"; ctx.fillText("二维教学模型 · 天体图形已放大", w - 240, h - 28);
}

function frame(now) {
  const realDt = Math.min(.05, Math.max(0, (now - previousFrame) / 1000));
  previousFrame = now;
  if (playing && state.status === "flying") {
    if (controls.left || controls.right) guidance = null;
    if (guidance) state.heading = pointHeading(state, phase === 3 ? "moon" : "earth") + (guidance === "retrograde" ? Math.PI : 0);
    state.heading += ((controls.left ? 1 : 0) - (controls.right ? 1 : 0)) * realDt * 2.2;
    const burning = controls.burn && state.dv > 0 && phase !== 1;
    const simulationSeconds = realDt * (burning ? 8 : Number(ui["warp-select"].value) * 3600);
    state = advance(state, simulationSeconds, burning);
    const data = telemetry(state);
    const sampleInterval = data.moonDistance < 30_000_000 ? 10 : magnitude(state.x, state.y) < 30_000_000 ? 90 : 1200;
    if (state.t - lastTrailTime >= sampleInterval) {
      trail.push({ x: state.x, y: state.y, t: state.t });
      if (trail.length > 1800) trail.shift();
      lastTrailTime = state.t;
    }
  }
  updateUI(); draw(); requestAnimationFrame(frame);
}

document.querySelectorAll("[data-phase]").forEach((tab) => tab.addEventListener("click", () => choosePhase(Number(tab.dataset.phase))));
ui["play-button"].addEventListener("click", () => { if (state.status === "flying") playing = !playing; updateUI(); });
ui["reset-button"].addEventListener("click", reset);
ui["view-button"].addEventListener("click", () => { view = view === "system" ? "moon" : "system"; updateUI(); draw(); });
document.querySelector("#prograde-button").addEventListener("click", () => { guidance = guidance === "prograde" ? null : "prograde"; if (guidance) state.heading = pointHeading(state, phase === 3 ? "moon" : "earth"); updateUI(); draw(); });
document.querySelector("#retrograde-button").addEventListener("click", () => { guidance = guidance === "retrograde" ? null : "retrograde"; if (guidance) state.heading = pointHeading(state, phase === 3 ? "moon" : "earth") + Math.PI; updateUI(); draw(); });
document.querySelectorAll("[data-hold]").forEach((button) => {
  const name = button.dataset.hold;
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); controls[name] = true; button.classList.add("pressed"); });
  const release = () => { controls[name] = false; button.classList.remove("pressed"); };
  button.addEventListener("pointerup", release); button.addEventListener("pointercancel", release); button.addEventListener("lostpointercapture", release);
});
window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  if (event.code === "ArrowLeft") { controls.left = true; guidance = null; }
  if (event.code === "ArrowRight") { controls.right = true; guidance = null; }
  if (event.code === "Space") controls.burn = true;
  if (event.repeat) return;
  if (event.code === "KeyP" && state.status === "flying") playing = !playing;
  if (event.code === "KeyR") reset();
  if (event.code === "KeyV") view = view === "system" ? "moon" : "system";
  if (event.code === "Digit1" || event.code === "Digit2" || event.code === "Digit3") choosePhase(Number(event.code.at(-1)));
});
window.addEventListener("keyup", (event) => { if (event.code === "ArrowLeft") controls.left = false; if (event.code === "ArrowRight") controls.right = false; if (event.code === "Space") controls.burn = false; });
window.addEventListener("blur", () => { controls.left = controls.right = controls.burn = false; playing = false; });
document.addEventListener("visibilitychange", () => { if (document.hidden) playing = false; });
reset(); requestAnimationFrame(frame);
