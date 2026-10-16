/**
 * 线上页面校验：抓真实响应 -> 抽内联脚本 -> node --check -> 报告结果
 * 用法：node verify-live.mjs <站点地址> [<站点地址> ...]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("用法: node verify-live.mjs <站点地址> ...");
  process.exit(2);
}

let bad = 0;
for (const t of targets) {
  const base = t.replace(/\/+$/, "");
  try {
    const res = await fetch(base + "/");
    const html = await res.text();
    const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    const tmp = path.join(os.tmpdir(), "live-" + Buffer.from(base).toString("hex").slice(0, 12) + ".js");
    fs.writeFileSync(tmp, blocks[0] ? blocks[0][1] : "", "utf8");
    const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
    const okScript = r.status === 0;
    const okMarks =
      html.indexOf("服务器上的文件") >= 0 &&
      html.indexOf("/api/list") >= 0 &&
      html.indexOf("refreshList") >= 0 &&
      html.indexOf("localStorage") < 0;
    const okPlaceholder = html.indexOf("__SITEKEY__") < 0 && html.indexOf("__MAXMB__") < 0;
    const all = okScript && okMarks && okPlaceholder && res.status === 200;
    if (!all) bad++;
    console.log(
      (all ? "PASS  " : "FAIL  ") +
        base +
        "  [http=" + res.status + " 语法=" + (okScript ? "OK" : "ERR") + " 标记=" + (okMarks ? "OK" : "缺失") +
        " 占位符=" + (okPlaceholder ? "已替换" : "有残留") + "]",
    );
    if (!okScript) console.log(r.stderr.slice(0, 400));
  } catch (e) {
    bad++;
    console.log("FAIL  " + base + "  请求异常: " + e.message);
  }
}

console.log(bad ? "\n=== 失败 " + bad + " 个站点 ===" : "\n=== 线上页面全部正常 ===");
process.exit(bad ? 1 : 0);
