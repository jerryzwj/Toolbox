# MSProxy - 多站代理服务

> 基于 Cloudflare Workers + D1 数据库的多站代理服务，支持子域名整站透传与网页可视化管理

## 📋 项目简介

MSProxy 是一个运行在 Cloudflare Workers 上的多站代理服务。代理配置存入 D1 数据库，内置网页管理面板（增/删/改，密码保护），并支持子域名整站透传，彻底解决被代理站点下级菜单/链接跳转错误的问题。

**核心价值**：
- 配置存入 D1 数据库，网页端可视化管理，无需改代码或进后台
- 子域名整站透传，被代理站的菜单/分页/详情页链接全部正常
- 解决跨域访问问题，前端可安全访问受限 API
- 5 分钟缓存 + 10 秒超时保护，性能与稳定性兼顾

## ✨ 核心特性

- **D1 数据库存储**：配置存入 Cloudflare D1，首次请求自动建表，无需手动初始化
- **网页可视化管理**：内置管理面板，密码登录后可在网页上增/删/改配置
- **子域名透传（推荐）**：`N.域名/任意路径` 整站代理，页面内所有链接天然正确
- **路径代理（兼容）**：`域名/N` 仍可用，向后兼容已有引用
- **密码保护**：管理功能通过 `ADMIN_PASSWORD` 环境变量鉴权，未配置时禁用（默认安全）
- **智能缓存**：5 分钟内存缓存，增删配置后即时失效
- **超时保护**：10 秒超时，避免服务阻塞
- **跨域 + 防反爬**：自动添加 CORS 头、伪装请求头

## 🚀 快速开始

### 1. 部署 Worker

1. Cloudflare Dashboard → Workers & Pages → Create Worker
2. 复制 `worker.js` 内容到编辑器 → Save and Deploy

### 2. 创建并绑定 D1 数据库

1. **创建数据库**：Dashboard → Workers & Pages → D1 → Create database（如 `toolbox-proxy`）
2. **绑定到 Worker**：Worker 详情 → Settings → Bindings → Add binding → D1 database
   - Variable name：`DB`（必须与代码中 `D1_BINDING_NAME` 一致）
   - D1 database：选刚创建的数据库
3. **表自动创建**：首次访问时 Worker 自动建表（`proxy_config`），无需手动建表

> wrangler.toml 等价配置：
> ```toml
> [[d1_databases]]
> binding = "DB"
> database_name = "toolbox-proxy"
> database_id = "你的数据库ID"
> ```

### 3. 配置管理密码（启用网页管理）

Worker 详情 → Settings → Variables and Secrets → Add：
- Type：`Secret`（推荐，加密存储）
- Variable name：`ADMIN_PASSWORD`
- Value：你的管理密码

> 未配置 `ADMIN_PASSWORD` 时管理功能禁用，任何人无法通过页面增删配置（默认安全）

### 4. 配置子域名透传（推荐）

子域名方案需用自己的域名（`*.workers.dev` 不支持通配符子域名）：

1. **通配符 DNS**：DNS → Records → Add record
   - Type：`A`，Name：`*`，IPv4：`192.0.2.1`（占位 IP），Proxy status：🟠 Proxied
2. **Worker 路由**：Worker → Settings → Triggers → Routes → Add route
   - Route：`*.你的域名/*`
   - Zone：选你的域名

完成后 `1.你的域名`、`2.你的域名`... 自动全部生效，无需逐个添加。

### 5. 添加配置

访问 Worker 根路径 → 点右上角「管理」→ 输入密码 → 填名称 + URL → 添加/更新

## 📖 使用方法

### 访问代理

| 方式 | 地址 | 说明 |
|------|------|------|
| 子域名透传（推荐） | `https://1.你的域名/` | 整站代理，下级菜单/链接正常 |
| 子域名子路径 | `https://1.你的域名/任意路径` | 透传到目标站对应路径 |
| 路径代理（兼容） | `https://你的域名/1` | 仅透传查询参数 |

**根路径**：访问主域名 `https://你的域名/` 查看代理列表页。

### 网页管理

1. 点右上角「管理」→ 输入密码登录
2. **添加**：填名称 + URL（顺序可空，自动追加到末尾）→ 添加/更新
3. **编辑**：点某项「编辑」→ 表单自动回填 → 修改 → 添加/更新（同名覆盖）
4. **删除**：点某项「删除」→ 确认

> 登录态保存在 sessionStorage，刷新不丢失；点「退出管理」清除。

### 示例请求

```bash
# 子域名整站代理（推荐）
curl https://1.你的域名/
curl "https://1.你的域名/api.php/provide/vod?ac=list"

# 路径代理（兼容）
curl https://你的域名/1
curl "https://你的域名/2?param=value"
```

## 🔧 配置说明

### 核心配置项

| 配置项 | 说明 | 默认值 |
|-------|------|-------|
| `D1_BINDING_NAME` | D1 绑定变量名 | `"DB"` |
| `ADMIN_PATH_PREFIX` | 管理接口路径前缀 | `"/__admin"` |
| `TIMEOUT` | 请求超时时间（毫秒） | `10000` (10秒) |
| `CACHE_TTL` | 配置内存缓存 + 代理边缘缓存（秒） | `300` (5分钟) |
| `ADMIN_PASSWORD` | 管理密码（环境变量，Worker 设置中配置） | 未配置则禁用管理 |

### D1 数据表结构（自动创建）

```sql
CREATE TABLE IF NOT EXISTS proxy_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

常用 SQL（也可在 D1 Console 直接执行）：

```sql
-- 查询全部
SELECT name, target_url, sort_order FROM proxy_config ORDER BY sort_order;

-- 新增
INSERT INTO proxy_config (name, target_url, sort_order) VALUES ('示例', 'https://example.com/api', 1);

-- 修改
UPDATE proxy_config SET target_url='新地址' WHERE name='示例';

-- 删除
DELETE FROM proxy_config WHERE name='示例';
```

### 管理接口（API）

所有接口需在请求头带 `X-Admin-Password`：

| 方法 | 路径 | 功能 | 请求体 |
|------|------|------|--------|
| GET | `/__admin/config` | 列出全部配置 | — |
| POST | `/__admin/config` | 添加/更新 | `{action:"add", name, target_url, sort_order?}` |
| POST | `/__admin/config` | 删除 | `{action:"delete", name}` |

## 🛠️ 技术实现

### 核心流程

1. **管理分流**：请求优先匹配 `/__admin/*` 管理接口（密码鉴权）
2. **子域名代理**：`N.域名/路径` → 基于目标站 origin 透传对应路径
3. **路径代理**：`域名/N` → 透传查询参数到目标站（兼容）
4. **列表页**：主域名根路径渲染代理列表 + 管理面板
5. **配置读取**：D1 查询 + 5 分钟内存缓存，增删后即时失效

### 关键技术点

- **Cloudflare D1**：SQLite 数据库，存储代理配置
- **子域名透传**：基于 hostname 首段数字识别，整站路径透传，下级链接天然闭环
- **INSERT OR REPLACE**：同名配置覆盖，实现"编辑"语义
- **内存缓存 + 即时失效**：模块级变量缓存，增删后 `invalidateConfigCache` 清空
- **Promise.race**：请求超时控制

## 📁 项目结构

```
MSProxy/
├── worker.js       # 主服务代码
└── README.md       # 项目文档
```

## 🔍 常见问题

### Q: 访问显示"代理服务启动失败"？

**A:** 检查：
- Worker 是否已绑定 D1 数据库（变量名 `DB`）
- proxy_config 表是否有数据（首次需通过管理面板或 SQL 添加）

### Q: 子域名 `1.域名` 无法访问？

**A:** 子域名方案必须：
- 使用自己的域名（`*.workers.dev` 不支持通配符子域名）
- 配置通配符 DNS（`*` 记录，开启 Proxied）
- 配置 Worker 路由（`*.域名/*`）

### Q: 管理功能点不动 / 提示 403？

**A:** 未配置 `ADMIN_PASSWORD` 环境变量时管理功能禁用。在 Worker Settings → Variables and Secrets 添加即可。

### Q: 如何修改/编辑配置？

**A:** 两种方式：
- 网页：点「编辑」按钮，表单回填后修改提交
- SQL：`UPDATE proxy_config SET target_url='新地址' WHERE name='名称';`

### Q: 添加配置后多久生效？

**A:** 立即生效。增删改操作会清空内存缓存，下次请求即读最新数据。

## 📄 许可证

本项目采用 MIT 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

---

**免责声明**：本项目仅用于学习和开发目的，请勿用于非法用途。使用本项目时，请遵守相关法律法规。
