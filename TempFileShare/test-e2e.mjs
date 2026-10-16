/**
 * 端到端验证脚本
 * 用法：node test-e2e.mjs https://temp-file-share.<子域>.workers.dev
 *
 * 会自动识别上传接口是否已开启人机验证：
 *   - 未开启：跑完整「上传 -> 下载 -> 校验」链路
 *   - 已开启：验证无凭证上传被拒绝、凭证接口行为正确
 */
const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!base) {
  console.error("用法: node test-e2e.mjs <站点地址>");
  process.exit(2);
}

const fails = [];
const ok = (cond, msg) => {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) fails.push(msg);
};

/* ---------- 1. 首页 ---------- */
let res = await fetch(base + "/");
const html = await res.text();
ok(res.status === 200, "首页返回 200");
ok(html.indexOf("临时文件中转站") >= 0, "首页包含标题");
ok(html.indexOf("免登录") >= 0, "首页标注免登录");
ok(res.headers.get("content-type").indexOf("text/html") >= 0, "首页 Content-Type 正确");
ok(html.indexOf("__SITEKEY__") < 0 && html.indexOf("__MAXMB__") < 0, "页面占位符已全部替换（无残留 __XXX__）");
ok(/option value="720" selected/.test(html), "页面默认保存时间为 1 个月");

/* ---------- 2. 探测上传接口是否开启人机验证 ---------- */
const probe = new FormData();
probe.append("file", new Blob(["probe"], { type: "text/plain" }), "probe.txt");
probe.append("expire", "1");
let upRes = await fetch(base + "/upload", { method: "POST", body: probe });
let up = await upRes.json().catch(() => ({}));
const gated = upRes.status === 403;
ok(gated || up.ok === true, "上传接口可用（" + (gated ? "已开启人机验证" : "未开启人机验证") + "）");

if (gated) {
  ok(html.indexOf('SITEKEY = "0x') >= 0, "页面已注入人机验证公钥");
  console.log("INFO  无凭证上传被拒绝 -> " + JSON.stringify(up));

  let r = await fetch(base + "/pass", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "" }),
  });
  const pj = await r.json().catch(() => ({}));
  ok(r.status === 400, "缺少人机验证结果时 /pass 返回 400（实际 " + r.status + "）");

  r = await fetch(base + "/pass", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "fake-token-should-fail" }),
  });
  const fj = await r.json().catch(() => ({}));
  ok(r.status === 403, "伪造人机验证结果时 /pass 返回 403（实际 " + r.status + "）");
  console.log("INFO  /pass 校验响应 -> " + JSON.stringify(fj));
} else {
  /* ---------- 3. 完整上传 / 下载链路 ---------- */
  const content = "端到端测试内容 " + new Date().toISOString() + "\n中文换行内容\n";
  const fname = "测试 文件-中文名.txt";
  const fd = new FormData();
  fd.append("file", new Blob([content], { type: "text/plain" }), fname);
  fd.append("expire", "1");
  upRes = await fetch(base + "/upload", { method: "POST", body: fd });
  up = await upRes.json().catch(() => ({}));
  ok(up.ok === true, "上传成功: " + JSON.stringify(up).slice(0, 160));
  ok(up.name === fname, "服务端回显文件名正确（" + up.name + "）");
  ok(typeof up.link === "string" && up.link.indexOf(base + "/f/") === 0, "返回 /f/ 下载链接");
  ok(up.expireHours === 1, "过期时长按请求生效");

  if (up.ok) {
    const dl = await fetch(up.link);
    const body = await dl.text();
    const cd = dl.headers.get("content-disposition") || "";
    console.log("INFO  下载响应头 -> " + JSON.stringify(Object.fromEntries(dl.headers)));
    ok(dl.status === 200, "下载返回 200");
    ok(body === content, "下载内容与上传内容完全一致");
    ok(decodeURIComponent(cd).indexOf(fname) >= 0, "中文文件名可正确还原");
    ok(/attachment/.test(cd), "下载头为附件下载");
    ok(
      dl.headers.get("content-length") === String(Buffer.byteLength(content)),
      "Content-Length 与文件字节数一致（实际 " + dl.headers.get("content-length") + "，期望 " + Buffer.byteLength(content) + "）",
    );
  }

  /* ---------- 4. 过期时间钳制 ---------- */
  const fd2 = new FormData();
  fd2.append("file", new Blob(["x"], { type: "text/plain" }), "clamp.txt");
  fd2.append("expire", "99999");
  const clamp = await (await fetch(base + "/upload", { method: "POST", body: fd2 })).json().catch(() => ({}));
  ok(clamp.expireHours === 720, "过期时长被钳制到 720 小时（实际 " + clamp.expireHours + "）");
}

/* ---------- 5. 异常路径 ---------- */
let r2 = await fetch(base + "/f/" + Date.now() + "-00000000-0000-0000-0000-000000000000");
ok(r2.status === 404, "不存在的文件返回 404");

r2 = await fetch(base + "/nope");
ok(r2.status === 404, "未知路径返回 404");

r2 = await fetch(base + "/f/" + encodeURIComponent("../../etc/passwd"));
ok(r2.status === 400 || r2.status === 404, "路径穿越被拒绝（实际 " + r2.status + "）");

/* ---------- 6. 上传进度与文件清单 ---------- */
ok(html.indexOf("服务器上的文件") >= 0, "页面包含服务器端文件清单区");
ok(html.indexOf("refreshList") >= 0, "打开页面即拉取服务器清单");
ok(html.indexOf("XMLHttpRequest") >= 0, "上传走 XHR（fetch 拿不到上传进度）");
ok(html.indexOf("upload.onprogress") >= 0, "已注册上传进度回调");
ok(html.indexOf(".fill{") >= 0 && html.indexOf('className = "fill"') >= 0, "页面含进度条填充元素与样式");
ok(html.indexOf("onabort") >= 0, "处理了中断/错误分支");

/* ---------- 7. 文件状态查询接口 ---------- */
const postJson = (path, body) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const missingKey = Date.now() + 86400000 + "-00000000-0000-0000-0000-000000000000";
const stRes = await postJson("/api/status", { keys: [missingKey] });
const st = await stRes.json().catch(() => ({}));
ok(stRes.status === 200 && st.ok === true, "/api/status 返回 200 且 ok=true");
ok(st.alive && st.alive[missingKey] && st.alive[missingKey].reason === "missing", "不存在的文件被标记为 missing");

const expiredKey = "1700000000000-00000000-0000-0000-0000-000000000000";
const stExp = await (await postJson("/api/status", { keys: [expiredKey] })).json().catch(() => ({}));
ok(stExp.alive && stExp.alive[expiredKey] && stExp.alive[expiredKey].reason === "expired", "已过期的 key 被标记为 expired");

const stEmpty = await (await postJson("/api/status", { keys: [] })).json().catch(() => ({}));
ok(stEmpty.ok === true, "空 keys 查询不报错");

const stBad = await (await postJson("/api/status", "not-json")).json().catch(() => ({}));
ok(stBad.ok === true, "非法请求体不会 500（忽略该次查询）");

const stTrav = await (await postJson("/api/status", { keys: ["../../etc/passwd"] })).json().catch(() => ({}));
ok(stTrav.ok === true && Object.keys(stTrav.alive || {}).length === 0, "带路径穿越的 key 被过滤掉");

/* ---------- 8. 删除接口必须带凭证 ---------- */
const delRes = await postJson("/api/delete", { key: "1795000000000-00000000-0000-0000-0000-000000000000" });
ok(!gated || delRes.status === 403, "无凭证删除被拒绝（实际 " + delRes.status + "）");

/* ---------- 9. 服务器端文件清单（任何设备打开都能看到同一份） ---------- */
ok(html.indexOf("/api/list") >= 0, "页面会拉取服务器端文件清单");
ok(html.indexOf("任何设备打开") >= 0, "页面说明清单跨设备可见");
ok(html.indexOf("localStorage") < 0 && html.indexOf("tfs.history") < 0, "页面不再依赖浏览器本地记录");
ok(html.indexOf("清空记录") < 0, "已移除容易误解的「清空记录」按钮");

const listRes = await fetch(base + "/api/list");
const listJson = await listRes.json().catch(() => ({}));
ok(listRes.status === 200 && listJson.ok === true, "/api/list 返回 200 且 ok=true");
ok(Array.isArray(listJson.items), "/api/list 返回 items 数组");
ok(listJson.count === listJson.items.length, "count 与 items 数量一致");

const nowMs = Date.now();
const badItem = (listJson.items || []).find(
  (it) =>
    !it ||
    typeof it.key !== "string" ||
    it.key.length === 0 ||
    typeof it.name !== "string" ||
    typeof it.size !== "number" ||
    !(Number(it.expireAt) > nowMs),
);
ok(!badItem, "清单里每条都字段完整、且未过期" + (badItem ? "：" + JSON.stringify(badItem) : ""));

const sortedOk = (listJson.items || []).every((it, i, arr) => i === 0 || arr[i - 1].at >= it.at);
ok(sortedOk, "清单按上传时间倒序");
console.log(
  "INFO  当前清单 " + listJson.count + " 个：" + (listJson.items || []).map((it) => it.name).join(" / ").slice(0, 200),
);

console.log(fails.length ? "\n=== 失败 " + fails.length + " 项 ===" : "\n=== 全部通过 ===");
process.exit(fails.length ? 1 : 0);
