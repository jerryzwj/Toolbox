/**
 * 页面自检（真实渲染版）
 * 直接 import Worker 模块并调用 fetch('/')，拿到浏览器真正会收到的那份 HTML，
 * 再抽出内联脚本用 node --check 校验——这样外层模板字符串的转义问题也能被发现。
 * 用法：node check-page.mjs
 */
import mod from "./src/index.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const env = {
  TURNSTILE_SITEKEY: "0x4AAAAAAFYM49JF01aa3bWT",
  MAX_MB: "100",
  DEFAULT_EXPIRE_HOURS: "720",
};

const res = await mod.fetch(new Request("https://example.test/"), env);
const html = await res.text();

let bad = 0;
const chk = (cond, msg) => {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) bad++;
};

chk(res.status === 200, "首页返回 200");
chk(html.indexOf("__SITEKEY__") < 0 && html.indexOf("__MAXMB__") < 0, "占位符已全部替换");
chk(html.indexOf('SITEKEY = "0x') >= 0, "人机验证公钥已注入");

const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
chk(blocks.length === 1, "内联脚本块数量为 1（实际 " + blocks.length + "）");

const body = blocks[0][1];
const tmp = path.join(os.tmpdir(), "page-real.js");
fs.writeFileSync(tmp, body, "utf8");

const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
chk(r.status === 0, "内联脚本通过 node --check" + (r.status === 0 ? "" : "\n" + r.stderr));

// 附加提示：外层模板字符串把转义提前解析掉时，通常表现为某行引号不成对
const oddLines = body
  .split("\n")
  .map((ln, i) => ({ ln, i: i + 1 }))
  .filter((x) => ((x.ln.match(/"/g) || []).length % 2 === 1));
if (oddLines.length) {
  console.log("INFO  引号不成对的行号（供排查，可能只是注释）：" + oddLines.map((x) => x.i).join(", "));
}

const marks = [
  "/api/list",
  "refreshList",
  "renderList",
  "服务器上的文件",
  "freshKeys",
  "任何设备打开",
];
for (const m of marks) chk(html.indexOf(m) >= 0, "页面含标记 " + m);

chk(html.indexOf("localStorage") < 0, "页面不再依赖浏览器本地存储");
chk(html.indexOf("清空记录") < 0, "已移除「清空记录」按钮");

console.log(bad ? "\n=== 失败 " + bad + " 项 ===" : "\n=== 全部通过 ===");
process.exit(bad ? 1 : 0);
