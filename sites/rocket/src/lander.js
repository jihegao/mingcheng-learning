import { applyTouchdown, createInitialState, magnitude, stepPhysics } from "./physics.js";

const COLORS = {
  cyan: "#58e6ff",
  gold: "#ffc85a",
  green: "#66f0b1",
  danger: "#ff6d82",
};

export class LanderGame {
  constructor({ canvas, config, initialState, onTelemetry = () => {}, onEnd = () => {} }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = { ...config };
    this.initialState = { ...initialState };
    this.state = createInitialState(this.initialState);
    this.controls = { rotation: 0, thrust: 0 };
    this.onTelemetry = onTelemetry;
    this.onEnd = onEnd;
    this.lastTime = null;
    this.animationFrame = null;
    this.stars = Array.from({ length: 72 }, (_, i) => ({
      x: ((i * 47) % 997) / 997,
      y: ((i * 83 + 19) % 743) / 743,
      r: 0.4 + ((i * 13) % 12) / 10,
      a: 0.22 + ((i * 17) % 50) / 100,
    }));
    this.bindKeyboard();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }

  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  start() {
    if (this.state.phase === "ready") this.state.phase = "flying";
    if (!this.animationFrame) {
      this.lastTime = performance.now();
      this.animationFrame = requestAnimationFrame((time) => this.loop(time));
    }
  }

  reset() {
    this.state = createInitialState(this.initialState);
    this.controls = { rotation: 0, thrust: 0 };
    this.lastTime = null;
    this.onTelemetry(this.telemetry());
    this.draw();
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
  }

  loop(time) {
    const dt = this.lastTime ? (time - this.lastTime) / 1000 : 1 / 60;
    this.lastTime = time;
    const previousPhase = this.state.phase;
    this.state = stepPhysics(this.state, this.controls, this.config, dt);

    if (this.state.phase === "flying" && this.state.altitude <= 0) {
      this.state = applyTouchdown(this.state, this.config);
    } else if (this.state.phase === "flying" && (Math.abs(this.state.x) > 112 || this.state.altitude > 145)) {
      this.state = {
        ...this.state,
        phase: "crashed",
        throttle: 0,
        touchdownSpeed: magnitude(this.state.vx, this.state.vy),
      };
    }

    this.onTelemetry(this.telemetry());
    this.draw();
    if (previousPhase === "flying" && this.state.phase !== "flying") this.onEnd(this.state);

    if (this.state.phase === "flying") {
      this.animationFrame = requestAnimationFrame((nextTime) => this.loop(nextTime));
    } else {
      this.animationFrame = null;
    }
  }

  telemetry() {
    return {
      ...this.state,
      speed: magnitude(this.state.vx, this.state.vy),
    };
  }

  bindKeyboard() {
    const setKey = (event, active) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault();
      if (["ArrowLeft", "KeyA"].includes(event.code)) this.controls.rotation = active ? -1 : (this.controls.rotation === -1 ? 0 : this.controls.rotation);
      if (["ArrowRight", "KeyD"].includes(event.code)) this.controls.rotation = active ? 1 : (this.controls.rotation === 1 ? 0 : this.controls.rotation);
      if (["ArrowUp", "KeyW", "Space"].includes(event.code)) this.controls.thrust = active ? 1 : 0;
    };
    window.addEventListener("keydown", (event) => setKey(event, true));
    window.addEventListener("keyup", (event) => setKey(event, false));
    window.addEventListener("blur", () => { this.controls = { rotation: 0, thrust: 0 }; });
  }

  bindTouchButton(element, control, value) {
    const activate = (event) => {
      event.preventDefault();
      element.setPointerCapture?.(event.pointerId);
      this.controls[control] = value;
    };
    const release = (event) => {
      event.preventDefault();
      if (this.controls[control] === value) this.controls[control] = 0;
    };
    element.addEventListener("pointerdown", activate);
    element.addEventListener("pointerup", release);
    element.addEventListener("pointercancel", release);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.draw();
  }

  worldToCanvas(x, altitude) {
    const groundY = this.height * 0.84;
    return {
      x: this.width * 0.5 + (x / 112) * this.width * 0.47,
      y: groundY - (altitude / 120) * this.height * 0.72,
    };
  }

  draw() {
    if (!this.width || !this.height) return;
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#061023");
    gradient.addColorStop(0.7, "#10233c");
    gradient.addColorStop(1, "#18243a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    for (const star of this.stars) {
      ctx.globalAlpha = star.a;
      ctx.fillStyle = "#dcecff";
      ctx.beginPath();
      ctx.arc(star.x * this.width, star.y * this.height * 0.77, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.drawGround(ctx);
    this.drawPad(ctx);
    this.drawRocket(ctx);
  }

  drawGround(ctx) {
    const groundY = this.height * 0.84;
    ctx.beginPath();
    ctx.moveTo(0, groundY - 4);
    for (let x = 0; x <= this.width; x += 36) {
      const y = groundY + Math.sin(x * 0.035) * 5 + Math.sin(x * 0.087) * 2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(this.width, this.height);
    ctx.lineTo(0, this.height);
    ctx.closePath();
    const ground = ctx.createLinearGradient(0, groundY, 0, this.height);
    ground.addColorStop(0, "#2b3850");
    ground.addColorStop(1, "#111a2a");
    ctx.fillStyle = ground;
    ctx.fill();
    ctx.strokeStyle = "rgba(160,190,220,.28)";
    ctx.stroke();
  }

  drawPad(ctx) {
    const left = this.worldToCanvas(-this.config.padHalfWidth, 0);
    const right = this.worldToCanvas(this.config.padHalfWidth, 0);
    const y = this.height * 0.84;
    ctx.fillStyle = "#172c3d";
    ctx.fillRect(left.x, y - 5, right.x - left.x, 9);
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(left.x, y - 5);
    ctx.lineTo(right.x, y - 5);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(88,230,255,.8)";
    ctx.font = "700 10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("LANDING ZONE", (left.x + right.x) / 2, y + 21);
  }

  drawRocket(ctx) {
    const point = this.worldToCanvas(this.state.x, Math.max(this.state.altitude, 0));
    ctx.save();
    ctx.translate(point.x, point.y - 16);
    ctx.rotate(this.state.angle * Math.PI / 180);

    if (this.state.throttle > 0 && this.state.fuel > 0 && this.state.phase === "flying") {
      const flame = 18 + Math.random() * 10;
      const flameGradient = ctx.createLinearGradient(0, 17, 0, 17 + flame);
      flameGradient.addColorStop(0, "#fff3ac");
      flameGradient.addColorStop(.35, COLORS.gold);
      flameGradient.addColorStop(1, "rgba(255,99,65,0)");
      ctx.fillStyle = flameGradient;
      ctx.beginPath();
      ctx.moveTo(-6, 16);
      ctx.quadraticCurveTo(0, 17 + flame, 6, 16);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = this.state.phase === "crashed" ? "#8d5260" : "#dfeaf2";
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(12, -10, 10, 10);
    ctx.lineTo(7, 18);
    ctx.lineTo(-7, 18);
    ctx.lineTo(-10, 10);
    ctx.quadraticCurveTo(-12, -10, 0, -22);
    ctx.fill();
    ctx.fillStyle = "#1c607e";
    ctx.beginPath();
    ctx.arc(0, -7, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.danger;
    ctx.beginPath();
    ctx.moveTo(-8, 8); ctx.lineTo(-16, 18); ctx.lineTo(-7, 16); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 8); ctx.lineTo(16, 18); ctx.lineTo(7, 16); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

export function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}
