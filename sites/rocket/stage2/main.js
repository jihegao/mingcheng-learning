import { DEFAULT_CONFIG, createInitialState } from "../src/physics.js";
import { formatNumber, LanderGame } from "../src/lander.js";

const $ = (selector) => document.querySelector(selector);
const message = $("#message");
const startButton = $("#start");

const signed = (value) => `${value < 0 ? "−" : "+"}${formatNumber(Math.abs(value), 2)}`;
const currentConfig = () => ({
  ...DEFAULT_CONFIG,
  gravity: Number($("#gravity").value),
  thrustAcceleration: Number($("#thrust-acceleration").value),
});

const game = new LanderGame({
  canvas: $("#game"),
  config: currentConfig(),
  initialState: createInitialState(),
  onTelemetry(data) {
    $("#altitude").textContent = `${formatNumber(Math.max(0, data.altitude))} m`;
    $("#speed").textContent = `${formatNumber(data.speed, 2)} m/s`;
    $("#fuel").textContent = `${formatNumber(data.fuel, 0)}%`;
    $("#vx").textContent = `${signed(data.vx)} m/s`;
    $("#vy").textContent = `${signed(data.vy)} m/s`;
    $("#angle").textContent = `${signed(data.angle)}°`;
    $("#throttle").textContent = `${formatNumber(data.throttle * 100, 0)}%`;
    if (data.touchdownSpeed !== null) {
      $("#touchdown-speed").textContent = `${formatNumber(data.touchdownSpeed, 2)} m/s`;
    }
  },
  onEnd(state) {
    message.hidden = false;
    const landed = state.phase === "landed";
    $("#message-title").textContent = landed ? "实验完成：安全着陆" : "实验完成：未安全着陆";
    $("#message-body").textContent = `重力 ${formatNumber(game.config.gravity, 2)} m/s²，最大推力 ${formatNumber(game.config.thrustAcceleration, 1)} m/s²，接地/结束速度 ${formatNumber(state.touchdownSpeed, 2)} m/s。`;
    startButton.textContent = "同参数再试一次";
  },
});

game.bindTouchButton($("#left"), "rotation", -1);
game.bindTouchButton($("#right"), "rotation", 1);
game.bindTouchButton($("#thrust"), "thrust", 1);

function syncInputs(source, target) {
  source.addEventListener("input", () => { target.value = source.value; });
}
syncInputs($("#gravity-range"), $("#gravity"));
syncInputs($("#gravity"), $("#gravity-range"));
syncInputs($("#thrust-range"), $("#thrust-acceleration"));
syncInputs($("#thrust-acceleration"), $("#thrust-range"));

function resetWithInputs({ start = false } = {}) {
  game.setConfig(currentConfig());
  game.reset();
  $("#touchdown-speed").textContent = "等待接地";
  if (start) {
    message.hidden = true;
    game.start();
  }
}

$("#parameters").addEventListener("submit", (event) => {
  event.preventDefault();
  resetWithInputs();
  message.hidden = false;
  $("#message-title").textContent = "参数已应用";
  $("#message-body").textContent = `重力 ${formatNumber(game.config.gravity, 2)} m/s²，最大推力 ${formatNumber(game.config.thrustAcceleration, 1)} m/s²。准备好后开始实验。`;
  startButton.textContent = "开始实验";
});

startButton.addEventListener("click", () => resetWithInputs({ start: true }));
