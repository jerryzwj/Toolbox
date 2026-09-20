# IP导航（Cloudflare Pages + D1 版）

基于 **Cloudflare Pages + D1 数据库** 的 IP 导航页：配置保存在云端（SQLite），换设备、清缓存都不丢。
结构为三级：**设备 → IP → 端口**，IP 和端口都绑定设备；删除操作必须输入密码（环境变量 `DELETE_PASSWORD`）。

## 项目结构

```
ip-nav-cloudflare/
├── public/
│   └── index.html          # 前端页面（设备/IP/端口三级选择，增删查走 API）
├── functions/
│   ├── _auth.js            # 删除操作通用密码校验（DELETE_PASSWORD）
│   └── api/
│       ├── devices.js          # GET/POST /api/devices
│       ├── devices/[id].js     # DELETE /api/devices/:id（级联删 IP+端口，需密码）
│       ├── ips.js              # GET/POST /api/ips（支持 ?device_id= 筛选）
│       ├── ips/[id].js         # DELETE /api/ips/:id（需密码）
│       ├── navs.js             # GET/POST /api/navs（支持 ?device_id= 筛选）
│       └── navs/[id].js        # DELETE /api/navs/:id（需密码）
├── schema.sql              # D1 建表语句（devices / ips / navs）
├── migration.sql           # 旧结构 -> 新结构迁移脚本（会重建 ips/navs）
├── migration_remove_ip_name.sql # 去掉 ips.name 字段迁移（保留数据）
├── wrangler.toml           # Pages + D1 配置
├── .dev.vars.example       # 本地环境变量模板（复制为 .dev.vars 填入删除密码）
├── package.json
├── tests/api-smoke.mjs     # API 冒烟测试（Mock D1）
└── README.md
```

## 使用流程

1. 展开「添加配置」→ 先添加**设备**（如：客厅软路由）
2. 给设备添加 **IP**（直接填地址，如 192.168.1.5；不单独设IP名称，设备名称即标识）和**端口**（服务名称 + 端口）
3. 主界面三级选择：**1.选设备 → 2.选IP → 3.点端口卡片**，新标签打开 `http://选中IP:端口`
4. 删除设备（连其IP和端口一起删）/ 删除IP / 删除端口，均需输入删除密码

## 一、本地开发（可选）

前置：Node.js ≥ 18、Cloudflare 账号、已安装 wrangler

```powershell
npm install -g wrangler
wrangler login

# 创建 D1 数据库（只需一次），把输出里的 database_id 填进 wrangler.toml
wrangler d1 create ip-nav-db

# 初始化本地表结构
wrangler d1 execute ip-nav-db --local --file=schema.sql

# 复制 .dev.vars.example 为 .dev.vars 并填入删除密码，然后本地起服务
wrangler pages dev
```

## 二、部署到 Cloudflare

### 方式 A：Wrangler CLI（推荐）

```powershell
wrangler d1 create ip-nav-db        # 把返回的 database_id 填到 wrangler.toml
wrangler d1 execute ip-nav-db --remote --file=schema.sql
wrangler pages deploy public --project-name ip-nav --branch main

# 设置删除密码（Secret）
wrangler pages secret put DELETE_PASSWORD --project-name ip-nav
```

### 方式 B：控制台上传

1. D1 → Create database `ip-nav-db`，进入数据库 Console 执行 `schema.sql`
2. Workers & Pages → Create → Pages → Upload assets → 上传 `ip-nav-cloudflare-deploy.zip`
3. Settings → Bindings → D1 database → 变量名 `DB`、选 `ip-nav-db`
4. Settings → Environment variables → 新增 `DELETE_PASSWORD`（Secret）
5. 保存后**重新部署一次**生效

## 三、数据迁移说明

旧版本（IP/端口无设备概念）升级到本版本时：

1. 先备份旧数据（GET /api/ips、/api/navs）
2. 执行 `migration.sql`（重建 ips/navs 表 + 新建 devices 表）
3. 建一个「默认设备」，把旧 IP/端口挂到它下面

## 四、验证

```powershell
npm test   # 语法检查 + API 冒烟测试（18 项：增删查、按设备筛选、级联删除、密码校验）
```

部署后验证：
1. 打开页面 → 添加配置 → 新建设备 → 给设备添加IP和端口
2. 主界面依次选择设备/IP → 点击端口卡片跳转
3. 刷新页面数据仍在；删除任意项需输入 `DELETE_PASSWORD` 对应密码，输错被拒绝

## 免费额度说明

D1 免费版：每天 500 万行读取、10 万行写入，个人导航完全够用。
