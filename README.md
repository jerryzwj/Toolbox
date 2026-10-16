# Toolbox - 实用工具集合

> 基于 Cloudflare Workers / Pages 的实用工具集合，并包含 NAS 上的 Docker 一键部署脚本

## 📋 项目简介

Toolbox 是一个实用工具集合，包含七个项目：

1. **DPNAddress** - 基于 D1 数据库的链接管理与重定向服务
2. **Homepage** - 个人网址导航服务，支持书签分类管理
3. **MSProxy** - 多站代理服务，D1 配置 + 子域名透传 + 网页可视化管理
4. **YutuCMS** - 玉兔CMS 在飞牛 NAS 上的 Docker 一键部署脚本
5. **ip-nav-cloudflare** - IP 导航页：设备/IP/端口三级管理，Cloudflare Pages + D1 持久化
6. **TempFileShare** - 临时文件中转站：免登录上传、直链分享，文件清单存服务器端，Worker + R2 + Turnstile
7. **DeviceCostTracker** - 设备成本追踪：记录设备买入/卖出价与使用天数，自动算每日成本，Worker + D1

DPNAddress、Homepage、MSProxy、TempFileShare、DeviceCostTracker 运行在 Cloudflare Workers 上，ip-nav-cloudflare 运行在 Cloudflare Pages 上，均具有全球边缘部署、低延迟访问的优势；YutuCMS 为飞牛 NAS 本地 Docker 部署方案。

## 📁 项目结构

```
Toolbox/
├── DPNAddress/          # 链接管理与重定向服务
│   ├── android/         # Android 客户端
│   ├── worker_d1.js     # Cloudflare Worker 主代码
│   └── link_redirect_d1_worker.md  # 项目文档
├── Homepage/            # 个人网址导航服务
│   ├── PersonalHome/    # Android 客户端
│   ├── worker_home.js   # Cloudflare Worker 主代码
│   └── readme_home.md   # 项目文档
├── MSProxy/             # 多站代理服务
│   ├── worker.js        # Cloudflare Worker 主代码
│   └── README.md        # 项目文档
├── YutuCMS/             # 玉兔CMS 飞牛NAS 一键部署
│   ├── deploy.sh        # Docker 一键部署脚本
│   └── README.md        # 项目文档
├── ip-nav-cloudflare/   # IP 导航服务（Pages + D1）
│   ├── public/          # 前端页面
│   ├── functions/       # Pages Functions API
│   └── README.md        # 项目文档
├── TempFileShare/       # 临时文件中转站（Worker + R2 + Turnstile）
│   ├── src/index.js     # Worker 全部逻辑（含内联上传页）
│   ├── wrangler.toml    # 部署配置（R2 绑定、定时触发、环境变量）
│   ├── test-e2e.mjs     # HTTP 层回归测试
│   ├── check-page.mjs   # 页面自检
│   ├── verify-live.mjs  # 线上页面校验
│   ├── test-cron.ps1    # 定时清理验证
│   └── README.md        # 项目文档
├── DeviceCostTracker/   # 设备成本追踪（Worker + D1）
│   ├── public/index.html  # 前端页面（单文件，样式与逻辑内联）
│   ├── src/index.js       # Worker API（增删改查 /api/devices）
│   ├── schema.sql         # D1 建表语句
│   ├── wrangler.toml      # 部署配置（D1 绑定）
│   └── README.md          # 项目文档
├── README.md            # 本文件 - 项目总览
└── 其他文档文件...
```

## 🚀 项目详情

### 1. DPNAddress - 链接管理与重定向服务

**核心功能**：
- 基于 Cloudflare D1 数据库存储链接数据
- 支持通过 POST 请求添加或更新链接
- 提供短链接形式访问目标 URL（如 `域名/id`）
- 响应式布局的导航页面，适配不同屏幕尺寸
- 支持删除链接功能，带有确认对话框防止误删
- 显示链接最后更新时间
- 支持手动刷新链接列表

**技术栈**：
- Cloudflare Workers
- Cloudflare D1 数据库
- JavaScript (ES Module)
- HTML5/CSS3

**使用方法**：
1. 部署 `worker_d1.js` 到 Cloudflare Workers
2. 配置 D1 数据库绑定（绑定名称为 `DB`）
3. 通过 POST 请求添加链接：
   ```json
   {
     "name": "显示名称",
     "value": "https://目标链接.com"
   }
   ```
4. 访问 `域名/id` 进行链接重定向

### 2. Homepage - 个人网址导航服务

**核心功能**：
- 基于 Cloudflare KV 存储书签数据
- 支持书签分类管理
- 美观的响应式界面，支持深色模式
- 支持添加、编辑、删除书签
- 密码验证保护，防止未授权修改
- 本地缓存机制，提高加载速度
- 支持从旧数据结构迁移到分类结构

**技术栈**：
- Cloudflare Workers
- Cloudflare KV 存储
- JavaScript (ES Module)
- HTML5/CSS3
- Tailwind CSS

**使用方法**：
1. 部署 `worker_home.js` 到 Cloudflare Workers
2. 配置 KV 命名空间绑定（绑定名称为 `BOOKMARKS_KV`）
3. 可选：设置环境变量 `BOOKMARK_PASSWORD` 自定义操作密码
4. 访问 Worker 地址，使用界面添加和管理书签

### 3. MSProxy - 多站代理服务

**核心功能**：
- 配置存入 Cloudflare D1 数据库，首次访问自动建表
- 子域名整站透传（`N.域名/任意路径`），被代理站下级菜单/链接正常
- 路径代理（`域名/N`）向后兼容
- 网页可视化管理：密码保护下增/删/改配置
- 5 分钟内存缓存 + 10 秒超时保护
- 跨域支持 + 防反爬处理

**技术栈**：
- Cloudflare Workers
- Cloudflare D1 数据库
- JavaScript (ES Module)

**使用方法**：
1. 部署 `worker.js` 到 Cloudflare Workers
2. 绑定 D1 数据库（变量名 `DB`），配置 `ADMIN_PASSWORD` 环境变量
3. （推荐）配置通配符 DNS 与 Worker 路由启用子域名透传
4. 访问根路径点「管理」添加配置，通过 `N.域名` 或 `域名/N` 访问代理

> 详见 [MSProxy/README.md](MSProxy/README.md)

### 4. YutuCMS - 玉兔CMS 飞牛NAS 一键部署

**核心功能**：
- 玉兔CMS(JCSQL) 在飞牛 fnOS X86 上的 Docker 一键部署
- 自动修复 Docker 权限、APT 源、PHP 扩展依赖
- 自动安装 zip/GD 扩展（验证码所需）并配置目录权限
- 全流程检查，失败即报错

**技术栈**：
- Docker / docker-compose
- PHP 5.6 + Apache
- Bash 脚本

**使用方法**：
```bash
curl -fsSL https://raw.githubusercontent.com/jerryzwj/Toolbox/main/YutuCMS/deploy.sh | bash
```
部署完成后访问 `http://NAS内网IP:8000`，上传 YutuCMS 源码到 `/vol1/1000/docker/yutu`。

> 详见 [YutuCMS/README.md](YutuCMS/README.md)

### 5. ip-nav-cloudflare - IP 导航服务

**核心功能**：
- 设备 → IP → 端口 三级管理，IP 和端口都绑定设备
- 设备下拉 → IP下拉 → 端口卡片，点击卡片跳转 `http://选中IP:端口`
- 数据存储于 Cloudflare D1 数据库，持久化不丢失
- 删除操作需密码（环境变量 `DELETE_PASSWORD`），删除设备时级联删除其 IP 和端口
- 深色响应式界面，适配电脑与手机

**技术栈**：
- Cloudflare Pages + Functions
- Cloudflare D1 数据库
- JavaScript (ES Module)
- HTML5/CSS3

**使用方法**：
1. 按 [ip-nav-cloudflare/README.md](ip-nav-cloudflare/README.md) 部署到 Cloudflare Pages
2. 创建 D1 数据库并执行 `schema.sql`，在 Pages 项目中绑定（变量名 `DB`）
3. 设置环境变量 `DELETE_PASSWORD`（Secret），删除操作需输入该密码
4. 访问 Pages 域名：添加设备 → 添加IP → 添加端口，点击端口卡片跳转

> 详见 [ip-nav-cloudflare/README.md](ip-nav-cloudflare/README.md)

### 6. TempFileShare - 临时文件中转站

**核心功能**：
- **免登录、打开即用**：拖文件上传，拿到直链发人，对方点开即下载
- 文件清单**存在服务器端**（直接 list R2，无需额外索引），任何设备打开都看到同一份，可二次下载 / 复制链接 / 删除
- 每个文件带**真实上传进度条**（已传 / 总量、百分比、速度）
- 保存时长可选 1 小时 / 24 小时 / 7 天 / 1 个月，默认 1 个月
- Cron 每小时清理过期文件；过期链接被访问时也会立即删除
- Turnstile 人机验证防刷：上传前先换一张 10 分钟有效的操作凭证

**技术栈**：
- Cloudflare Workers
- Cloudflare R2 存储桶
- Cloudflare Turnstile 人机验证
- JavaScript (ES Module)，页面样式内联、不依赖构建

**使用方法**：
1. `npm i -D wrangler` 后执行 `npx wrangler deploy`（配置见 `wrangler.toml`）
2. 创建 R2 存储桶并绑定，变量名 `R2_BUCKET`
3. 设置变量 `TURNSTILE_SITEKEY`（人机验证公钥）与密钥 `TURNSTILE_SECRET`（私钥，同时用作上传凭证签名）；留空则关闭人机验证
4. 可选：绑定自定义域名。**新增域名后必须把域名加进 Turnstile 白名单**，否则上传会被拦
5. 可选：`MAX_MB` 改单文件上限（默认 100），`DEFAULT_EXPIRE_HOURS` 改默认保存时长（默认 720）

> 详见 [TempFileShare/README.md](TempFileShare/README.md)

### 7. DeviceCostTracker - 设备成本追踪

**核心功能**：
- 记录每台设备的买入价与买入日期，退役时填卖出价（可为 0）
- 自动计算使用天数与**每日成本**：`(买入价 − 卖出价) ÷ 使用天数`
- 卡片区分「使用中 / 已退役」，退役设备同时显示买入价与卖出价（绿色）
- 顶部统计：使用中台数、今日总成本、累计退役、设备合计价格、售出合计价格
- 数据存 Cloudflare D1，跨设备同步；深色响应式界面，手机电脑通用
- 可选访问密码（`ADMIN_PASSWORD`），未设置则页面公开

**技术栈**：
- Cloudflare Workers
- Cloudflare D1 数据库
- JavaScript (ES Module)
- HTML5/CSS3

**使用方法**：
1. `npx wrangler d1 create device-cost-tracker` 创建数据库，把返回的 `database_id` 填进 `wrangler.toml`
2. `npx wrangler d1 execute device-cost-tracker --remote --file=./schema.sql` 建表
3. `npx wrangler deploy` 部署
4. 可选：`npx wrangler secret put ADMIN_PASSWORD` 设置访问密码；在控制台绑定自定义域名

> 详见 [DeviceCostTracker/README.md](DeviceCostTracker/README.md)

## 🔧 部署指南

### 前提条件

- Cloudflare 账户（DPNAddress / Homepage / MSProxy / TempFileShare / ip-nav-cloudflare / DeviceCostTracker）
- 飞牛 NAS fnOS X86 + Docker（YutuCMS）
- 对于 DPNAddress / MSProxy / ip-nav-cloudflare / DeviceCostTracker：Cloudflare D1 数据库
- 对于 Homepage：Cloudflare KV 存储
- 对于 TempFileShare：Cloudflare R2 存储桶 + Turnstile 人机验证组件

### 通用部署步骤（Cloudflare Workers 项目）

1. **登录 Cloudflare 控制台**
2. **创建 Worker**：
   - 导航到 "Workers & Pages"
   - 点击 "Create Worker"
   - 命名你的 Worker，然后点击 "Deploy"
3. **配置绑定**：
   - 对于 DPNAddress / MSProxy / DeviceCostTracker：添加 D1 数据库绑定，名称为 `DB`
   - 对于 Homepage：添加 KV 命名空间绑定，名称为 `BOOKMARKS_KV`
   - 对于 TempFileShare：添加 R2 存储桶绑定，名称为 `R2_BUCKET`；并设置 `TURNSTILE_SITEKEY` 变量与 `TURNSTILE_SECRET` 密钥
4. **部署代码**：
   - 进入 Worker 编辑页面
   - 复制对应项目的 Worker 代码到编辑器
   - 配置必要的环境变量（如 MSProxy 的 `ADMIN_PASSWORD`）
   - 点击 "Save and Deploy"

> YutuCMS 为 NAS 本地 Docker 部署，见其 [README](YutuCMS/README.md)。
> ip-nav-cloudflare 为 Cloudflare Pages 项目（含 Functions），部署方式不同，详见其 [README](ip-nav-cloudflare/README.md)。
> TempFileShare 需要 R2 与 Turnstile，推荐用 wrangler CLI 部署，详见其 [README](TempFileShare/README.md)。
> DeviceCostTracker 含静态资源（`public/`）与 D1 绑定，推荐用 wrangler CLI 部署，详见其 [README](DeviceCostTracker/README.md)。

## 📱 Android 客户端

项目包含两个 Android 客户端：

1. **DPNAddress/android** - 链接导航客户端
   - 支持查看和管理链接
   - 支持刷新和删除链接
   - 响应式界面设计

2. **Homepage/PersonalHome** - 书签导航客户端
   - 支持查看和管理书签
   - 支持分类浏览
   - 响应式界面设计

## 🔍 常见问题

### Q: 服务启动失败怎么办？

**A:** 检查以下几点：
- Cloudflare Workers 订阅是否有效
- 数据库或存储绑定是否正确配置
- 代码是否有语法错误

### Q: 如何更新配置？

**A:** 
- 对于 DPNAddress：通过 POST 请求添加或更新链接
- 对于 Homepage：在界面上直接添加、编辑或删除书签
- 对于 MSProxy：访问根路径点「管理」，在网页上增/删/改配置（即时生效）
- 对于 YutuCMS：修改 `deploy.sh` 顶部配置变量后重新执行
- 对于 ip-nav-cloudflare：在页面上添加设备/IP/端口，删除需输入密码
- 对于 TempFileShare：改 `wrangler.toml` 后重新 `npx wrangler deploy`（大小上限、默认时长、清理频率都在里面）
- 对于 DeviceCostTracker：在页面上增删改设备，退役时填退役日期与卖出价；改代码后重新 `npx wrangler deploy`

### Q: 如何提高安全性？

**A:** 
- 对于 Homepage / MSProxy：设置强管理密码并定期更换
- 对于 DPNAddress：考虑添加访问控制，限制只有特定 IP 可以修改链接
- 对于 MSProxy：避免代理敏感内容，定期检查代理目标
- 对于 ip-nav-cloudflare：设置强删除密码（`DELETE_PASSWORD`）并定期更换
- 对于 TempFileShare：保留 Turnstile 人机验证，不要删掉 `TURNSTILE_SECRET` 后还把地址公开；注意其文件清单默认是公开可见、可删除的
- 对于 DeviceCostTracker：设置强访问密码（`ADMIN_PASSWORD`），避免设备与花销数据公开可改

## 📄 许可证

本项目采用 MIT 许可证。详见各子项目的 LICENSE 文件。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

## 📞 联系方式

如有问题或建议，请通过 GitHub Issues 与我们联系。

---

**免责声明**：本项目仅用于学习和开发目的，请勿用于非法用途。使用本项目时，请遵守相关法律法规。
