import { DEFAULT_CONFIG, createInitialState } from "../src/physics.js";
import { formatNumber, LanderGame } from "../src/lander.js";

const $ = (selector) => document.querySelector(selector);
const message = $("#message");
const startButton = $("#start");
const statusCard = $("#status-card");

const game = new LanderGame({
  canvas: $("#game"),
  config: DEFAULT_CONFIG,
  initialState: createInitialState(),
  onTelemetry(data) {
    $("#altitude").textContent = `${formatNumber(Math.max(0, data.altitude))} m`;
    $("#speed").textContent = `${formatNumber(data.speed)} m/s`;
    $("#fuel").textContent = `${formatNumber(data.fuel, 0)}%`;
    if (data.phase === "flying") {
      $("#status").textContent = data.speed <= DEFAULT_CONFIG.safeSpeed ? "速度合适，继续对准" : "速度偏快，注意减速";
      statusCard.dataset.tone = data.speed <= DEFAULT_CONFIG.safeSpeed ? "good" : "";
    }
  },
  onEnd(state) {
    message.hidden = false;
    const landed = state.phase === "landed";
    $("#message-title").textContent = landed ? "着陆成功" : "任务未完成";
    $("#message-body").textContent = landed
      ? `接地速度 ${formatNumber(state.touchdownSpeed, 2)} m/s。你同时控制住了位置、速度与姿态。`
      : `本次结束速度 ${formatNumber(state.touchdownSpeed, 2)} m/s。观察失败位置和姿态，再调整点火时机。`;
    startButton.textContent = "再试一次";
    $("#status").textContent = landed ? "安全着陆" : "坠毁 / 飞出区域";
    statusCard.dataset.tone = landed ? "good" : "bad";
  },
});

game.bindTouchButton($("#left"), "rotation", -1);
game.bindTouchButton($("#right"), "rotation", 1);
game.bindTouchButton($("#thrust"), "thrust", 1);

startButton.addEventListener("click", () => {
  game.reset();
  message.hidden = true;
  statusCard.dataset.tone = "";
  $("#status").textContent = "飞行中";
  game.start();
});
