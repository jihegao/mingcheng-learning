const submissionDialog = document.querySelector("#submission-dialog");
const submissionForm = document.querySelector("#submission-form");
const submissionStatus = document.querySelector("#submission-status");
const submissionSend = document.querySelector("#submission-send");

function closeSubmission() {
  if (submissionDialog.open) submissionDialog.close();
}

document.querySelector("[data-open-submission]").addEventListener("click", () => {
  submissionStatus.textContent = "";
  submissionStatus.className = "submission-status";
  submissionDialog.showModal();
  submissionForm.elements.namedItem("className").focus();
});
document.querySelectorAll("[data-close-submission]").forEach((button) => button.addEventListener("click", closeSubmission));
submissionDialog.addEventListener("click", (event) => {
  if (event.target === submissionDialog) closeSubmission();
});

submissionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = submissionForm.elements.namedItem("work").files[0];
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) {
    submissionStatus.textContent = "文件超过 25 MiB 限制，请压缩或拆分后再提交。";
    submissionStatus.className = "submission-status error";
    return;
  }
  submissionSend.disabled = true;
  submissionStatus.textContent = "正在安全上传作品，请勿关闭此窗口…";
  submissionStatus.className = "submission-status";
  try {
    const response = await fetch("https://share.gaojihe.cn/api/assignments", {
      method: "POST",
      body: new FormData(submissionForm),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "上传暂时未完成，请稍后重试。");
    submissionStatus.textContent = "已成功提交。你可以关闭窗口，教师会通过班级信息找到作品。";
    submissionStatus.className = "submission-status success";
    submissionForm.reset();
  } catch (error) {
    submissionStatus.textContent = error instanceof Error ? error.message : "上传暂时未完成，请稍后重试。";
    submissionStatus.className = "submission-status error";
  } finally {
    submissionSend.disabled = false;
  }
});
