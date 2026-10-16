const ALLOWED_ORIGINS = new Set(["https://mc.gaojihe.cn", "https://rocket.gaojihe.cn"]);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 128 * 1024;
const MAX_UPLOADS_PER_HOUR = 5;
const HOUR_SECONDS = 60 * 60;
const MAX_RECORD_PAGES = 8;
const MAX_RECORDS = 250;
const SAFE_EXTENSIONS = new Set(["pdf", "zip", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "md", "py", "js", "html", "css", "png", "jpg", "jpeg", "gif", "webp", "mp4"]);

function corsHeaders(origin) {
  return ALLOWED_ORIGINS.has(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : { vary: "Origin" };
}

function json(body, status, origin) { return Response.json(body, { status, headers: corsHeaders(origin) }); }

function asTrimmedText(value, maxLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 && cleaned.length <= maxLength ? cleaned : null;
}

function extensionFor(filename) {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : null;
}

function safeFilename(filename) {
  const basename = filename.split(/[\\/]/).pop() ?? "work";
  const normalized = basename.normalize("NFKC").replace(/[\u0000-\u001f<>:"|?*]/g, "_").replace(/\s+/g, " ").trim();
  return normalized.slice(0, 120) || "work";
}

async function digest(input) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isRateLimited(request, env) {
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return true;
  const key = `ip:${await digest(ip)}`;
  const count = Number.parseInt((await env.RATE_LIMITS.get(key)) ?? "0", 10);
  if (!Number.isSafeInteger(count) || count >= MAX_UPLOADS_PER_HOUR) return true;
  await env.RATE_LIMITS.put(key, String(count + 1), { expirationTtl: HOUR_SECONDS });
  return false;
}

async function listSubmissionRecords(env, origin) {
  const objects = [];
  let cursor;
  for (let page = 0; page < MAX_RECORD_PAGES; page += 1) {
    const listed = await env.ASSIGNMENTS.list({ prefix: "submissions/", limit: 250, cursor, include: ["customMetadata"] });
    objects.push(...listed.objects);
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  const submissions = objects.map((object) => ({
    date: object.customMetadata?.submittedAt ?? object.uploaded.toISOString(),
    className: object.customMetadata?.className,
    studentName: object.customMetadata?.studentName,
    filename: object.customMetadata?.originalFilename,
  })).filter((record) => record.className && record.studentName && record.filename)
    .sort((left, right) => String(right.date).localeCompare(String(left.date))).slice(0, MAX_RECORDS);
  return Response.json({ submissions }, { headers: corsHeaders(origin) });
}

async function uploadAssignment(request, env, origin) {
  if (!ALLOWED_ORIGINS.has(origin)) return json({ error: "Uploads must come from an approved teaching site." }, 403, origin);
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > MAX_REQUEST_BYTES) return json({ error: "文件大小无效或超过 25 MiB 限制。" }, 413, origin);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) return json({ error: "请使用表单提交作品文件。" }, 415, origin);
  if (await isRateLimited(request, env)) return json({ error: "提交过于频繁，请一小时后再试。" }, 429, origin);
  const form = await request.formData();
  const className = asTrimmedText(form.get("className"), 60);
  const studentName = asTrimmedText(form.get("studentName"), 60);
  const work = form.get("work");
  if (!className || !studentName || !(work instanceof File) || work.size === 0 || work.size > MAX_UPLOAD_BYTES) return json({ error: "请填写班级、姓名，并选择不超过 25 MiB 的作品文件。" }, 400, origin);
  const extension = extensionFor(work.name);
  if (!extension || !SAFE_EXTENSIONS.has(extension)) return json({ error: "该文件类型暂不支持，请提交 PDF、Office 文档、图片、压缩包、代码文件或 MP4。" }, 415, origin);
  const submissionId = crypto.randomUUID();
  const filename = safeFilename(work.name);
  const submittedAt = new Date().toISOString();
  const key = `submissions/${submittedAt.slice(0, 10)}/${submissionId}/${filename}`;
  await env.ASSIGNMENTS.put(key, work.stream(), { httpMetadata: { contentType: work.type || "application/octet-stream" }, customMetadata: { className, studentName, originalFilename: filename, submittedAt, submissionId } });
  console.log(JSON.stringify({ event: "assignment_uploaded", submissionId, bytes: work.size, extension }));
  return json({ ok: true, submissionId }, 201, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (!url.pathname.startsWith("/api/assignments")) return new Response("Not found", { status: 404 });
    if (request.method === "OPTIONS") {
      if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403, headers: corsHeaders(origin) });
      return new Response(null, { status: 204, headers: { ...corsHeaders(origin), "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } });
    }
    try {
      if (request.method === "GET" && url.pathname === "/api/assignments/records") return await listSubmissionRecords(env, origin);
      if (request.method === "POST" && url.pathname === "/api/assignments") return await uploadAssignment(request, env, origin);
      return json({ error: "Not found." }, 404, origin);
    } catch (error) {
      console.error(JSON.stringify({ event: "assignment_request_failed", message: error instanceof Error ? error.message : "unknown", method: request.method, path: url.pathname }));
      return json({ error: "请求暂时未完成，请稍后重试。" }, 500, origin);
    }
  },
};
