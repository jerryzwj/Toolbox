# 临时文件中转站（Cloudflare Worker + R2）

**线上演示：<https://down.wenjun.eu.org>**

访客**免登录、打开即用**：打开网页 → 拖文件 → 拿到链接发人 → 对方点开即下载。文件到期由定时任务自动删除。

---

## 一、部署需要的资源

| 资源 | 名称 | 说明 |
| --- | --- | --- |
| Worker | `temp-file-share` | 提供上传页面、上传/下载/状态/删除接口、定时清理 |
| R2 存储桶 | `temp-share` | 专门给本站用，建议与其它桶隔离 |
| 自定义域名 | 例如 `down.example.com` | 可选但推荐，比 `*.workers.dev` 在国内更稳、链接也更好记 |
| 定时触发器 | `17 * * * *` | 每小时第 17 分扫描一次，删除所有过期文件 |
| Turnstile 组件 | `temp-file-share` | 人机验证防刷；**新增域名必须同步加进域名白名单** |
| 账号 | 你自己的 Cloudflare 账号 | |

## 二、怎么用

1. 浏览器打开线上地址（无需登录、无需注册）
2. 把文件拖进虚线框（支持一次多个），或点「选择文件」
3. 选保存时间：默认 **1 个月**，也可选 1 小时 / 24 小时 / 7 天
4. 点「开始上传」，人机验证会自动通过；上传时每个文件都有**实时进度条**（已传 / 总量、百分比、速度）
5. 传完的文件会进入页面下方「**服务器上的文件**」列表，在那里可以**再次下载、复制链接或删除**
6. 点「复制链接」发给对方 —— **对方同样不需要登录**，打开链接直接下载

> 用自定义域名打开时，生成的链接也会自动是这个域名（例如 `https://down.example.com/f/…`），比 `*.workers.dev` 的链接更短也更好发。

### 「服务器上的文件」是怎么来的

- 清单**存在服务器上**：打开页面就调一次 `GET /api/list`，列出桶里所有还没过期的对象，按上传时间倒序。所以**换浏览器、换手机、换地址打开，看到的都是同一份**，不依赖任何本机存储。
- 不需要额外的索引表：R2 对象自己就带着清单所需的全部信息 —— key 前缀是到期时间戳（用来判过期）、`uploaded` 是上传时间、`size` 是大小、自定义元数据 `name` 是原始文件名。**文件被删或过期，下一次查询自然就少这一条**，不会出现「索引还在、文件没了」的脏数据。
- 页面上的「删除」是**真的从 R2 删掉**（`POST /api/delete`，要过人机验证），刚传完的那一条会在清单里淡蓝色高亮。
- 清单只读、不要求人机验证（谁打开都能看），但做了 120 次/分钟的频率限制。

## 三、能改哪些配置

| 想改什么 | 改哪里 | 改完执行 |
| --- | --- | --- |
| 单文件大小上限（默认 100MB） | `wrangler.toml` → `MAX_MB` | `npx wrangler deploy` |
| 默认保存时长（默认 1 个月 = 720 小时） | `wrangler.toml` → `DEFAULT_EXPIRE_HOURS`，同时改 `src/index.js` 里 `<select id="expire">` 的 `selected` 档 | `npx wrangler deploy` |
| 清理频率 | `wrangler.toml` → `[triggers] crons` | `npx wrangler deploy` |
| 关闭人机验证 | 删掉 `wrangler.toml` 里的 `TURNSTILE_SITEKEY`，并删除密钥 `TURNSTILE_SECRET` | `npx wrangler deploy` |
| 再加 / 更换域名 | Cloudflare 控制台 → Workers → temp-file-share → 设置 → 域和路由 | **必须**同步把新域名加进 Turnstile 白名单，否则新域名上人机验证会报「域名无效」、上传被拦：`npx wrangler turnstile widget update <组件sitekey> --domain <旧域名> --domain <新域名>` |

> **单文件上限的真相**：`MAX_MB` 只是页面上的拦截阈值。真正卡人的是 **Cloudflare 账号套餐**的请求体上限 —— Free / Pro 都是 100 MB，Business 200 MB，Enterprise 500 MB 起；超过会在边缘直接返回 **413**，根本进不到 Worker。
> 也就是说**免费版把 `MAX_MB` 调到 100 以上是无效的**，升到每月 5 美元的 Workers 付费套餐也不会提升这个数字（它由站点套餐档位决定，与 Workers 套餐无关）。
> 想在免费版传更大的文件，需要改成「分片上传」（每片 ≤100MB，R2 端合并）或「浏览器直传 R2（Worker 签发预签名 URL）」，理论上能到 R2 的单对象上限。

## 四、常用命令

在本目录下执行（可本地 `npm i -D wrangler`，无需全局安装）：

```powershell
npx wrangler deploy                       # 重新部署
npx wrangler deployments list             # 查看部署历史
npx wrangler rollback                     # 回滚到上一版本
npx wrangler tail                         # 实时查看运行日志
npx wrangler secret put TURNSTILE_SECRET  # 更换人机验证私钥
npx wrangler turnstile widget get <组件sitekey>   # 查看人机验证组件与域名白名单
npx wrangler delete temp-file-share       # 删除这个 Worker（连带停掉定时任务）
```

## 五、接口一览

| 方法 | 路径 | 用途 | 是否需要人机验证 |
| --- | --- | --- | --- |
| GET | `/` | 上传页面（含服务器端文件清单） | 否 |
| GET | `/api/list` | 列出桶内所有未过期文件（任何设备可见） | 否（有频率限制） |
| POST | `/pass` | 人机验证换取 10 分钟操作凭证 | Turnstile |
| POST | `/upload` | 上传文件（需带 `x-pass` 头） | 是 |
| GET | `/f/<key>` | 下载；已过期返回 410 并顺手删除 | 否（链接本身即凭证） |
| POST | `/api/status` | 批量核对文件是否还在（单次最多 40 个 key） | 否（有频率限制） |
| POST | `/api/delete` | 删除文件（需带 `x-pass` 头） | 是 |
| cron | `17 * * * *` | 清理过期对象 | — |

## 六、验证脚本

```powershell
# HTTP 层回归测试（首页/占位符/人机验证网关/进度与清单标记/状态接口/删除鉴权/清单接口/404/路径穿越）
node test-e2e.mjs https://down.example.com

# 页面自检：直接 import Worker 模块拿真实 HTML，抽内联脚本 node --check，并核对清单相关标记
node check-page.mjs

# 线上页面校验（可一次给多个地址）
node verify-live.mjs https://down.example.com https://temp-file-share.<子域>.workers.dev

# 定时清理验证：先放一个「已过期」对象，再手动触发 scheduled 处理器，确认被删掉
npx wrangler r2 object put "temp-share/1000000000000-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" --file .\some.txt --remote
powershell -ExecutionPolicy Bypass -File .\test-cron.ps1 -Key "1000000000000-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
```

## 七、目录结构

```
TempFileShare/
├─ src/index.js        # Worker 全部逻辑：上传页面 + /pass + /upload + /api/list + /api/status + /api/delete + /f/ + 定时清理
├─ wrangler.toml       # 部署配置（R2 绑定、定时触发器、环境变量）
├─ test-e2e.mjs        # HTTP 层回归测试
├─ check-page.mjs      # 页面自检（真实渲染版 HTML + 内联脚本语法）
├─ verify-live.mjs     # 线上页面校验
├─ test-cron.ps1       # 定时清理验证脚本
└─ README.md
```

## 八、费用

免费额度内基本用不完：

- **R2**：10 GB·月存储、每月 100 万次写入（Class A）、1000 万次读取（Class B），**外网流出流量永久免费**
- **Workers**：每天 10 万次请求
- **Turnstile**：免费

## 九、需要留意的几点

1. **人机验证是唯一挡在公开上传前的门槛**，不要手动删掉 `TURNSTILE_SECRET` 却又把链接到处公开，否则任何人（含脚本）都能往你的 R2 桶塞文件。
2. 新增或更换域名时，**别忘了同步 Turnstile 白名单**（见上表）。白名单里漏了这个域名，页面看着正常，但人机验证会失败、文件传不上去。反过来，域名从白名单里移除后，旧域名上的上传也会立刻失效。
3. 文本类文件（.txt/.json 等）经 Cloudflare 边缘时会被 Brotli 压缩，浏览器下载会自动还原，内容不受影响，因此这类响应不带 `content-length`（属正常现象）；二进制文件（图片/压缩包等）不受影响，实测 SHA256 完全一致。
4. 文件到期有两个清理路径：**有人访问过期链接时会立即删除**；**没人访问的靠每小时定时任务清理**，所以过期后最多再多占 1 小时容量。
5. 默认保存 1 个月，意味着文件最长会在桶里躺 30 天。R2 免费额度是 10 GB·月，长期堆太多大文件（比如反复传视频）要注意占用；急用可以先在页面上改成 1 小时或 24 小时。
6. **清单是公开的，而且不带密码** —— 任何人打开页面都能看到桶里全部文件，并且能点「删除」把它们从 R2 里真删掉。这是「免登录、打开即用」的直接后果，自己心里有数就行；如果哪天想加一把锁（访问口令、或只让列表在本机可见），可以直接在这个基础上改。
7. 想要文件秒级过期回收，或者在页面里加访问密码、下载次数限制、大文件分片上传，都可以在这个基础上改。
