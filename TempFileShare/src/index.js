/**
 * 临时文件中转站 — Cloudflare Worker + R2
 * 访客免登录，打开即用；文件到期由 Cron 定时任务自动清理。
 *
 * 绑定：R2_BUCKET            -> R2 存储桶
 * 变量：TURNSTILE_SITEKEY    -> 人机验证公钥（留空则关闭人机验证）
 * 密钥：TURNSTILE_SECRET     -> 人机验证私钥，同时用作上传凭证的签名密钥
 * 变量：MAX_MB               -> 单文件上限（MB），默认 100
 * 变量：DEFAULT_EXPIRE_HOURS -> 默认保存小时数，默认 720
 *
 * 注意：下方 PAGE 模板里内嵌了前端脚本，前端代码一律用字符串拼接，
 *      不写反引号与 ${}，避免与外层模板字符串冲突。
 */

const enc = new TextEncoder();

/* ============================== 路由 ============================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && (path === "/" || path === "/index.html")) {
      return new Response(renderPage(env), {
        headers: {
          "content-type": "text/html;charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (request.method === "POST" && path === "/pass") return issuePass(request, env);
    if (request.method === "POST" && path === "/upload") return handleUpload(request, env);
    if (request.method === "POST" && path === "/api/status") return handleStatus(request, env);
    if (request.method === "POST" && path === "/api/delete") return handleDelete(request, env);
    if (request.method === "GET" && path === "/api/list") return handleList(request, env);

    if (request.method === "GET" && path.startsWith("/f/")) {
      return handleDownload(request, env, decodeURIComponent(path.slice(3)));
    }

    return new Response("404 Not Found", { status: 404 });
  },

  // 每小时触发一次，清理过期文件
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cleanupExpired(env));
  },
};

/* ============================== 基础工具 ============================== */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json;charset=utf-8",
      "cache-control": "no-store",
    },
  });

const maxBytesOf = (env) => Math.max(1, Number(env.MAX_MB) || 100) * 1024 * 1024;

const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "0.0.0.0";

/** 单实例内存限速，尽力而为 */
const hits = new Map();
function rateLimited(kind, ip, limit, windowMs) {
  const now = Date.now();
  const mapKey = kind + "|" + ip;
  const recent = (hits.get(mapKey) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return true;
  recent.push(now);
  hits.set(mapKey, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

/** 去掉文件名里不安全的字符，并保留扩展名 */
function safeName(raw) {
  const name = String(raw || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return "file";
  if (name.length <= 100) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : "";
  return name.slice(0, 100 - ext.length) + ext;
}

/** 中文文件名也能正常下载 */
function contentDisposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(name);
}

const b64url = (buf) =>
  btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const signKey = (env) => env.TURNSTILE_SECRET || "temp-file-share-no-secret";

async function sign(env, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(signKey(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
}

async function ipTag(env, ip) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(ip + "|" + signKey(env)));
  return b64url(digest).slice(0, 12);
}

/** key 形如 <过期毫秒时间戳>-<uuid>，清理时无需读取对象元数据 */
const expireOfKey = (key) => {
  const m = /^(\d{10,})-/.exec(key);
  return m ? Number(m[1]) : 0;
};

/** 校验客户端传来的 key，挡掉路径穿越与超长值 */
const usableKey = (key) =>
  typeof key === "string" && key.length > 0 && key.length <= 200 && key.indexOf("..") < 0;

/* ============================== 操作凭证 ============================== */

const PASS_TTL_MS = 10 * 60 * 1000;

async function issuePass(request, env) {
  const ip = clientIp(request);
  if (rateLimited("pass", ip, 20, 60000)) {
    return json({ ok: false, msg: "操作过于频繁，请稍后再试" }, 429);
  }

  let token = "";
  try {
    token = String((await request.json()).token || "");
  } catch (e) {
    token = "";
  }

  if (env.TURNSTILE_SECRET) {
    if (!token) return json({ ok: false, msg: "缺少人机验证结果" }, 400);
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", token);
    form.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const out = await res.json().catch(() => ({}));
    if (!out.success) return json({ ok: false, msg: "人机验证未通过，请重新验证" }, 403);
  }

  const expires = Date.now() + PASS_TTL_MS;
  const payload = expires + "." + (await ipTag(env, ip));
  return json({ ok: true, pass: payload + "." + (await sign(env, payload)), expires });
}

async function verifyPass(request, env) {
  if (!env.TURNSTILE_SECRET) return true; // 未开启人机验证时不校验凭证
  const parts = (request.headers.get("x-pass") || "").split(".");
  if (parts.length !== 3) return false;
  const [expires, tag, sig] = parts;
  const payload = expires + "." + tag;
  if ((await sign(env, payload)) !== sig) return false;
  if (!(Number(expires) > Date.now())) return false;
  return (await ipTag(env, clientIp(request))) === tag;
}

/* ============================== 上传 ============================== */

async function handleUpload(request, env) {
  if (!(await verifyPass(request, env))) {
    return json({ ok: false, msg: "上传凭证无效或已过期，请刷新页面重试" }, 403);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json({ ok: false, msg: "请求格式错误" }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file === "string") return json({ ok: false, msg: "没有收到文件" }, 400);
  if (!file.size) return json({ ok: false, msg: "文件内容为空" }, 400);

  const maxBytes = maxBytesOf(env);
  if (file.size > maxBytes) {
    return json({ ok: false, msg: "文件超过 " + maxBytes / 1024 / 1024 + "MB 上限" }, 400);
  }

  const fallback = Number(env.DEFAULT_EXPIRE_HOURS) || 720;
  const hours = Math.min(720, Math.max(1, Number(form.get("expire")) || fallback));
  const expireAt = Date.now() + hours * 3600 * 1000;
  const name = safeName(file.name);
  const key = expireAt + "-" + crypto.randomUUID();

  await env.R2_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { name, expireAt: String(expireAt), expireHours: String(hours) },
  });

  return json({
    ok: true,
    key,
    name,
    size: file.size,
    expireHours: hours,
    expireAt,
    link: new URL(request.url).origin + "/f/" + encodeURIComponent(key),
  });
}

/* ============================== 文件状态查询 ============================== */

// 每次查询的上限。R2 的 head() 会占用一次子请求，
// 免费版每个请求最多 50 次子请求，所以这里留出安全余量。
const STATUS_MAX_KEYS = 40;

async function handleStatus(request, env) {
  const ip = clientIp(request);
  if (rateLimited("status", ip, 120, 60000)) {
    return json({ ok: false, msg: "查询过于频繁，请稍后再试" }, 429);
  }

  let keys = [];
  try {
    const body = await request.json();
    if (Array.isArray(body.keys)) keys = body.keys;
  } catch (e) {
    keys = [];
  }

  keys = keys.filter(usableKey).slice(0, STATUS_MAX_KEYS);

  const now = Date.now();
  const alive = {};
  for (const key of keys) {
    const expireAt = expireOfKey(key);
    if (expireAt && expireAt <= now) {
      await env.R2_BUCKET.delete(key).catch(() => {});
      alive[key] = { ok: false, reason: "expired" };
      continue;
    }
    const head = await env.R2_BUCKET.head(key).catch(() => null);
    alive[key] = head ? { ok: true, size: head.size } : { ok: false, reason: "missing" };
  }

  return json({ ok: true, alive });
}

/* ============================== 手动删除 ============================== */

async function handleDelete(request, env) {
  if (!(await verifyPass(request, env))) {
    return json({ ok: false, msg: "操作凭证无效或已过期，请刷新页面重试" }, 403);
  }

  let key = "";
  try {
    key = String((await request.json()).key || "");
  } catch (e) {
    key = "";
  }
  if (!usableKey(key)) return json({ ok: false, msg: "无效的文件标识" }, 400);

  await env.R2_BUCKET.delete(key);
  return json({ ok: true });
}

/* ============================== 服务端文件清单 ============================== */

/**
 * 列出桶里所有仍在有效期内的文件，任何设备打开页面查的都是这一份。
 * 文件名、大小、上传时间、到期时间全都已经在对象自己和它的 key 里，
 * 直接 list R2 就是清单，不需要再维护一份 KV 索引：
 * 文件被删掉或过期后，下一次查询自然就少这一条，永远不会出现索引对不上的情况。
 * 只读接口，不要求人机验证，但有频率限制。
 */
async function handleList(request, env) {
  const ip = clientIp(request);
  if (rateLimited("list", ip, 120, 60000)) {
    return json({ ok: false, msg: "查询过于频繁，请稍后再试" }, 429);
  }

  const now = Date.now();
  const items = [];
  let cursor;
  let pages = 0;

  do {
    const page = await env.R2_BUCKET.list({ cursor, limit: 1000, include: ["customMetadata"] });
    for (const obj of page.objects) {
      const meta = obj.customMetadata || {};
      const expireAt = expireOfKey(obj.key) || Number(meta.expireAt) || 0;
      if (expireAt && expireAt <= now) continue; // 已过期的交给清理任务，不再展示
      items.push({
        key: obj.key,
        name: meta.name || "download",
        size: obj.size,
        expireAt,
        at: obj.uploaded ? obj.uploaded.getTime() : 0,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
    pages++;
  } while (cursor && pages < 5);

  items.sort((a, b) => (b.at || 0) - (a.at || 0));
  return json({ ok: true, count: items.length, items });
}

/* ============================== 下载 ============================== */

async function handleDownload(request, env, key) {
  if (!key || key.indexOf("..") >= 0) return new Response("无效链接", { status: 400 });

  const obj = await env.R2_BUCKET.get(key);
  if (!obj) return new Response("文件不存在或已被清理", { status: 404 });

  const expireAt = expireOfKey(key);
  if (expireAt && expireAt <= Date.now()) {
    await env.R2_BUCKET.delete(key);
    return new Response("文件已过期，已自动删除", { status: 410 });
  }

  const name = (obj.customMetadata && obj.customMetadata.name) || "download";
  return new Response(obj.body, {
    headers: {
      "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
      "content-length": String(obj.size),
      "content-disposition": contentDisposition(name),
      "cache-control": "private, no-store",
    },
  });
}

/* ============================== 定时清理 ============================== */

async function cleanupExpired(env) {
  const now = Date.now();
  const legacyBefore = now - 48 * 3600 * 1000;
  let cursor;
  let removed = 0;
  let pages = 0;

  do {
    const page = await env.R2_BUCKET.list({ cursor, limit: 1000 });
    const doomed = page.objects
      .filter((o) => {
        const expireAt = expireOfKey(o.key);
        if (expireAt) return expireAt <= now;
        return o.uploaded && o.uploaded.getTime() < legacyBefore;
      })
      .map((o) => o.key);

    if (doomed.length) {
      await env.R2_BUCKET.delete(doomed);
      removed += doomed.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
    pages++;
    // 免费版单次调用最多 50 次子请求，这里限制页数，避免清理任务被截断报错
  } while (cursor && pages < 20);

  console.log("[cleanup] 已清理 " + removed + " 个过期文件");
  return removed;
}

/* ============================== 前端页面 ============================== */

function renderPage(env) {
  const sitekey = env.TURNSTILE_SITEKEY || "";
  const maxMb = Math.round(maxBytesOf(env) / 1024 / 1024);
  // 注意：占位符在页面里可能出现多次，必须全部替换
  return PAGE.split("__SITEKEY__").join(JSON.stringify(sitekey)).split("__MAXMB__").join(String(maxMb));
}

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>临时文件中转站</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:#f5f6f8;color:#1f2329;
       font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  .wrap{max-width:720px;margin:0 auto;padding:48px 20px 72px}
  h1{font-size:22px;margin:0 0 6px}
  .sub{margin:0 0 26px;color:#6b7280;font-size:13px}
  .drop{border:2px dashed #cbd5e1;border-radius:14px;background:#fff;padding:38px 20px;text-align:center;
        transition:.15s;cursor:pointer}
  .drop.hot{border-color:#2563eb;background:#eff6ff}
  .hint{margin-top:8px;font-size:12px;color:#94a3b8}
  .linkbtn{border:0;background:none;color:#2563eb;font:inherit;cursor:pointer;padding:0;text-decoration:underline}
  ul.files{list-style:none;margin:16px 0 0;padding:0}
  ul.files li{display:flex;align-items:center;gap:10px;padding:8px 12px;margin-bottom:6px;background:#fff;
              border:1px solid #e5e7eb;border-radius:9px;font-size:13px}
  .hn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hs{color:#94a3b8;font-size:12px;white-space:nowrap}
  ul.files li .x{border:0;background:none;color:#94a3b8;cursor:pointer;font-size:17px;line-height:1;padding:0 2px}
  ul.files li .x:hover{color:#ef4444}
  .bar{display:flex;align-items:center;gap:12px;margin-top:18px;flex-wrap:wrap}
  select{padding:7px 10px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font:inherit;font-size:13px}
  .primary{margin-left:auto;padding:9px 22px;border:0;border-radius:9px;background:#2563eb;color:#fff;
           font:inherit;cursor:pointer}
  .primary:disabled{background:#c7cdd6;cursor:not-allowed}
  .msg{margin-top:14px;font-size:13px;color:#6b7280}
  .msg.err{color:#b91c1c}
  .warn{margin-top:12px;font-size:12px;color:#b45309}
  #ts{margin-top:14px}
  /* 上传进度 */
  #prog{margin-top:16px}
  .pitem{background:#fff;border:1px solid #e5e7eb;border-radius:9px;padding:10px 12px;margin-bottom:6px}
  .pitem.done{border-color:#bbf7d0;background:#f0fdf4}
  .pitem.fail{border-color:#fecaca;background:#fef2f2}
  .upline{display:flex;align-items:baseline;gap:10px;font-size:13px}
  .upline .hs{flex-shrink:0}
  .track{height:6px;border-radius:4px;background:#eef2f7;overflow:hidden;margin-top:8px}
  .fill{height:100%;width:0;border-radius:4px;background:#2563eb;transition:width .15s linear}
  .pitem.done .fill{background:#16a34a}
  .pitem.fail .fill{background:#ef4444}
  /* 服务器文件清单 */
  .sec{margin-top:32px;border-top:1px solid #e5e7eb;padding-top:20px}
  .sechead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;
           font-size:14px;font-weight:600;color:#334155}
  .cnt{font-weight:400;color:#94a3b8;margin-left:4px}
  .ghost{border:1px solid #e5e7eb;background:#fff;border-radius:7px;padding:5px 10px;font:inherit;font-size:12px;
         color:#64748b;cursor:pointer}
  .ghost:hover{border-color:#fca5a5;color:#ef4444}
  .note{margin:0 0 12px;padding:9px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:9px;
        font-size:12px;color:#64748b;line-height:1.6}
  ul.hist{list-style:none;margin:0;padding:0}
  ul.hist li{display:flex;align-items:center;gap:10px;padding:9px 12px;margin-bottom:6px;background:#fff;
             border:1px solid #e5e7eb;border-radius:9px;font-size:13px}
  ul.hist li.fresh{border-color:#bfdbfe;background:#eff6ff}
  ul.hist li.dead{opacity:.6}
  .hb{display:flex;gap:6px;flex-shrink:0}
  .hb button{border:1px solid #d1d5db;background:#fff;border-radius:7px;padding:4px 9px;font:inherit;font-size:12px;
             cursor:pointer;color:#334155}
  .hb button:hover:enabled{border-color:#2563eb;color:#2563eb}
  .hb button.danger:hover:enabled{border-color:#fca5a5;color:#ef4444}
  .hb button:disabled{border-color:#e5e7eb;color:#cbd5e1;cursor:not-allowed}
  .empty{font-size:13px;color:#94a3b8;padding:2px}
  @media (max-width:560px){
    ul.hist li{flex-wrap:wrap}
    ul.hist li .hn{flex-basis:100%}
    ul.hist li .hs{order:2}
    .hb{order:3;margin-left:auto}
  }
</style>
</head>
<body>
<div class="wrap">
  <h1>临时文件中转站</h1>
  <p class="sub">免登录 · 打开即用 · 到期自动清理</p>

  <div class="drop" id="drop">
    <div>把文件拖到这里，或 <button type="button" class="linkbtn" id="pick">选择文件</button></div>
    <div class="hint">单个文件最大 __MAXMB__ MB，可一次选择多个</div>
  </div>
  <input type="file" id="file" multiple hidden>
  <ul class="files" id="list"></ul>

  <div class="bar">
    <label>保存时间
      <select id="expire">
        <option value="1">1 小时</option>
        <option value="24">24 小时</option>
        <option value="168">7 天</option>
        <option value="720" selected>1 个月</option>
      </select>
    </label>
    <button class="primary" id="go" disabled>开始上传</button>
  </div>

  <div id="ts"></div>
  <div class="warn" id="tswarn" hidden>人机验证组件加载失败，请刷新页面或更换网络后重试。</div>
  <div class="msg" id="msg"></div>
  <div id="prog"></div>

  <div class="sec">
    <div class="sechead">
      <span>服务器上的文件<span class="cnt" id="hcnt"></span></span>
    </div>
    <div class="note">这份清单存在服务器上，任何设备打开本页看到的都是同一份：可以直接下载、复制链接或删除。文件过期后会自动从这里消失。</div>
    <ul class="hist" id="hist"></ul>
    <div class="empty" id="hempty">服务器上还没有文件。上传成功后会自动出现在这里，任何设备打开本页都能看到。</div>
  </div>
</div>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
<script>
(function () {
  "use strict";

  var SITEKEY = __SITEKEY__;
  var MAXMB = __MAXMB__;
  var LMAX = 500;        // 清单最多渲染多少行

  var files = [];
  var widgetId = null;
  var passCache = { value: "", expires: 0 };
  var list = [];         // 服务器返回的文件清单
  var listErr = "";      // 清单读取失败时的原因
  var freshKeys = {};    // 本次刚上传成功的 key，用于高亮

  var drop = document.getElementById("drop");
  var picker = document.getElementById("file");
  var listEl = document.getElementById("list");
  var goBtn = document.getElementById("go");
  var progEl = document.getElementById("prog");
  var msg = document.getElementById("msg");
  var tsBox = document.getElementById("ts");
  var tswarn = document.getElementById("tswarn");
  var expireSel = document.getElementById("expire");
  var histEl = document.getElementById("hist");
  var hcnt = document.getElementById("hcnt");
  var hempty = document.getElementById("hempty");

  /* ---------------- 人机验证 ---------------- */

  function initTurnstile() {
    if (!SITEKEY || widgetId !== null) return;
    if (typeof turnstile === "undefined" || !turnstile.render) return;
    widgetId = turnstile.render(tsBox, { sitekey: SITEKEY, theme: "light" });
  }

  if (SITEKEY) {
    // 不依赖 api.js 的 onload 回调，改为自己轮询，避免脚本加载顺序问题
    var tries = 0;
    var timer = window.setInterval(function () {
      tries++;
      initTurnstile();
      if (widgetId !== null) { window.clearInterval(timer); return; }
      if (tries >= 40) { window.clearInterval(timer); tswarn.hidden = false; }
    }, 500);
  } else {
    tsBox.hidden = true;
  }

  function currentToken() {
    try { return widgetId === null ? "" : (turnstile.getResponse(widgetId) || ""); } catch (e) { return ""; }
  }

  function waitToken(ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function poll() {
        var tk = currentToken();
        if (tk) return resolve(tk);
        if (Date.now() - t0 > ms) return resolve("");
        window.setTimeout(poll, 300);
      })();
    });
  }

  /** 取一个可用的操作凭证；10 分钟内复用，过期后重新过一次人机验证 */
  function ensurePass() {
    return new Promise(function (resolve, reject) {
      if (!SITEKEY) return resolve("");
      if (passCache.value && passCache.expires > Date.now() + 30000) return resolve(passCache.value);
      if (widgetId === null) return reject(new Error("人机验证组件未加载完成，请刷新页面后重试"));

      var go = function (token) {
        if (!token) return reject(new Error("人机验证未完成，请完成验证后重试"));
        fetch("/pass", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: token })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.ok) return reject(new Error((d && d.msg) || "人机验证失败，请重试"));
          passCache.value = d.pass;
          passCache.expires = d.expires || (Date.now() + 9 * 60000);
          resolve(d.pass);
        }).catch(function () { reject(new Error("网络错误，请重试")); });
      };

      var tk = currentToken();
      if (tk) return go(tk);
      try { turnstile.reset(widgetId); } catch (e) { /* 忽略 */ }
      waitToken(30000).then(go);
    });
  }

  /* ---------------- 通用工具 ---------------- */

  function human(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
    return (n / 1073741824).toFixed(2) + " GB";
  }

  function setMsg(text, isErr) {
    msg.textContent = text || "";
    msg.className = isErr ? "msg err" : "msg";
  }

  function two(n) { return n < 10 ? "0" + n : "" + n; }

  function fmtTime(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + "-" + two(d.getDate()) + " " + two(d.getHours()) + ":" + two(d.getMinutes());
  }

  function remainText(expireAt) {
    if (!expireAt) return "";
    var ms = expireAt - Date.now();
    if (ms <= 0) return "已过期";
    var h = ms / 3600000;
    if (h < 1) return "剩余 " + Math.max(1, Math.round(ms / 60000)) + " 分钟";
    if (h < 48) return "剩余 " + Math.round(h) + " 小时";
    return "剩余 " + Math.floor(h / 24) + " 天";
  }

  function linkOf(key) {
    return window.location.origin + "/f/" + encodeURIComponent(key);
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) { /* 忽略 */ }
  }

  function copyText(text, btn) {
    var done = function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = "已复制";
      window.setTimeout(function () { btn.textContent = old; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  /* ---------------- 待上传列表 ---------------- */

  function render() {
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    files.forEach(function (f, i) {
      var li = document.createElement("li");
      var n = document.createElement("span");
      n.className = "hn";
      n.textContent = f.name;
      n.title = f.name;
      var s = document.createElement("span");
      s.className = "hs";
      s.textContent = human(f.size);
      var x = document.createElement("button");
      x.type = "button";
      x.className = "x";
      x.textContent = "×";
      x.title = "移除";
      x.onclick = function () { files.splice(i, 1); render(); };
      li.appendChild(n); li.appendChild(s); li.appendChild(x);
      listEl.appendChild(li);
    });
    goBtn.disabled = files.length === 0;
  }

  function addFiles(fl) {
    var skipped = 0;
    for (var i = 0; i < fl.length; i++) {
      if (fl[i].size > MAXMB * 1048576) { skipped++; continue; }
      files.push(fl[i]);
    }
    setMsg(skipped ? "有 " + skipped + " 个文件超过 " + MAXMB + "MB，已跳过" : "", false);
    render();
  }

  drop.addEventListener("click", function (e) {
    if (e.target && e.target.id === "pick") return;
    picker.click();
  });
  document.getElementById("pick").addEventListener("click", function (e) {
    e.stopPropagation();
    picker.click();
  });
  picker.addEventListener("change", function () { addFiles(picker.files); picker.value = ""; });

  ["dragenter", "dragover"].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("hot"); });
  });
  ["dragleave", "drop"].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("hot"); });
  });
  drop.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });

  /* ---------------- 服务器文件清单 ---------------- */

  /** 拉取服务器上的清单：任何设备、任何浏览器打开都查同一份数据 */
  function refreshList() {
    return fetch("/api/list").then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok && d.items) {
        list = d.items;
        listErr = "";
      } else {
        listErr = (d && d.msg) || "读取文件清单失败，请刷新页面重试";
      }
      renderList();
    }).catch(function () {
      listErr = "网络错误，没能读到文件清单，请刷新页面重试";
      renderList();
    });
  }

  function renderList() {
    while (histEl.firstChild) histEl.removeChild(histEl.firstChild);
    hcnt.textContent = list.length ? "（" + list.length + "）" : "";
    hempty.hidden = list.length > 0 || !!listErr;
    hempty.textContent = listErr || "服务器上还没有文件。上传成功后会自动出现在这里，任何设备打开本页都能看到。";

    list.slice(0, LMAX).forEach(function (r) {
      var li = document.createElement("li");
      if (freshKeys[r.key]) li.className = "fresh";

      var n = document.createElement("span");
      n.className = "hn";
      n.textContent = r.name || "download";
      n.title = n.textContent;

      var s = document.createElement("span");
      s.className = "hs";
      s.textContent = [human(r.size), remainText(r.expireAt), fmtTime(r.at)].filter(Boolean).join(" · ");

      var box = document.createElement("span");
      box.className = "hb";

      var dl = document.createElement("button");
      dl.type = "button";
      dl.textContent = "下载";
      dl.onclick = function () { window.open(linkOf(r.key), "_blank"); };

      var cp = document.createElement("button");
      cp.type = "button";
      cp.textContent = "复制链接";
      cp.onclick = function () { copyText(linkOf(r.key), cp); };

      var rm = document.createElement("button");
      rm.type = "button";
      rm.textContent = "删除";
      rm.className = "danger";
      rm.onclick = function () { removeItem(r.key, rm); };

      box.appendChild(dl); box.appendChild(cp); box.appendChild(rm);
      li.appendChild(n); li.appendChild(s); li.appendChild(box);
      histEl.appendChild(li);
    });
  }

  function removeItem(key, btn) {
    if (!window.confirm("确定删除这个文件吗？删除后链接立即失效。")) return;
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "删除中";
    setMsg("正在删除…", false);

    ensurePass().then(function (pass) {
      var headers = { "content-type": "application/json" };
      if (pass) headers["x-pass"] = pass;
      return fetch("/api/delete", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ key: key })
      }).then(function (r) { return r.json(); });
    }).then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.msg) || "删除失败");
      list = list.filter(function (it) { return it.key !== key; });
      renderList();
      setMsg("已删除", false);
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = old;
      setMsg(err && err.message ? err.message : "删除失败", true);
    });
  }

  /* ---------------- 上传（带真实进度） ---------------- */

  function makeProgressRow(f) {
    var box = document.createElement("div");
    box.className = "pitem";
    var line = document.createElement("div");
    line.className = "upline";
    var n = document.createElement("span");
    n.className = "hn";
    n.textContent = f.name;
    n.title = f.name;
    var s = document.createElement("span");
    s.className = "hs";
    s.textContent = "等待中";
    line.appendChild(n); line.appendChild(s);
    var track = document.createElement("div");
    track.className = "track";
    var fill = document.createElement("div");
    fill.className = "fill";
    track.appendChild(fill);
    box.appendChild(line); box.appendChild(track);
    progEl.appendChild(box);
    return { box: box, sub: s, fill: fill };
  }

  /** 用 XHR 上传：fetch 拿不到上传进度，XMLHttpRequest 才有 upload.onprogress */
  function uploadOne(f, hours, pass, onProgress) {
    return new Promise(function (resolve) {
      var fd = new FormData();
      fd.append("file", f);
      fd.append("expire", hours);

      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/upload", true);
      if (pass) xhr.setRequestHeader("x-pass", pass);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = function (e) {
          if (e.lengthComputable) onProgress(e.loaded, e.total);
        };
      }

      xhr.onload = function () {
        var d = null;
        try { d = JSON.parse(xhr.responseText); } catch (e) { d = null; }
        if (!d || typeof d.ok !== "boolean") {
          var extra = xhr.status === 413
            ? "：请求体超过 Cloudflare 套餐上限（免费版 100MB），请换小一点的文件"
            : "";
          d = { ok: false, msg: "服务器返回异常（HTTP " + xhr.status + "）" + extra };
        }
        resolve(d);
      };
      xhr.onerror = function () { resolve({ ok: false, msg: "网络错误，上传失败" }); };
      xhr.onabort = function () { resolve({ ok: false, msg: "上传已取消" }); };
      xhr.send(fd);
    });
  }

  function runOne(f, hours, pass) {
    var row = makeProgressRow(f);
    var lastT = Date.now();
    var lastB = 0;
    var speed = 0;

    function onProgress(loaded, total) {
      var now = Date.now();
      if (now - lastT > 500) {
        speed = (loaded - lastB) / ((now - lastT) / 1000);
        lastT = now;
        lastB = loaded;
      }
      var pct = total ? Math.min(100, Math.round(loaded * 100 / total)) : 0;
      row.fill.style.width = pct + "%";
      row.sub.textContent = human(loaded) + " / " + human(total) + " · " + pct + "%" +
        (speed > 1024 ? " · " + human(speed) + "/s" : "");
    }

    return uploadOne(f, hours, pass, onProgress).then(function (d) {
      if (d.ok) {
        row.box.className = "pitem done";
        row.fill.style.width = "100%";
        row.sub.textContent = "完成 · " + human(d.size);
        if (d.key) freshKeys[d.key] = 1; // 刷新清单后高亮刚传的这一行
      } else {
        row.box.className = "pitem fail";
        row.sub.textContent = d.msg || "上传失败";
      }
      return d;
    });
  }

  function upload() {
    goBtn.disabled = true;
    progEl.textContent = "";
    setMsg("", false);

    ensurePass().then(function (pass) {
      var hours = expireSel.value;
      var chain = Promise.resolve();
      var done = 0;
      var total = files.length;

      files.forEach(function (f, i) {
        chain = chain.then(function () {
          setMsg("正在上传 " + (i + 1) + " / " + total, false);
          return runOne(f, hours, pass).then(function (d) { if (d.ok) done++; });
        });
      });

      return chain.then(function () {
        setMsg(done ? "完成，共 " + done + " / " + total + " 个文件上传成功，已出现在下方清单里" : "上传结束，没有文件成功",
          done === 0);
        files = [];
        render();
        refreshList();
        if (widgetId !== null) { try { turnstile.reset(widgetId); } catch (e) { /* 忽略 */ } }
      });
    }).catch(function (err) {
      setMsg(err && err.message ? err.message : "上传失败", true);
    }).then(function () {
      goBtn.disabled = false;
    });
  }

  goBtn.addEventListener("click", function () { if (files.length) upload(); });

  /* ---------------- 初始化 ---------------- */

  render();
  refreshList();
})();
</script>
</body>
</html>
`;
