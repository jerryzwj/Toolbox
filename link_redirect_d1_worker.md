# Link Redirect D1 Worker

## 项目介绍

Link Redirect D1 Worker 是一个基于 Cloudflare Workers 和 D1 数据库的链接管理与重定向服务。它允许用户通过简单的 HTTP 请求管理链接，并通过短链接形式访问目标 URL。

## 功能特性

- **链接管理**：通过 POST 请求添加或更新链接
- **短链接服务**：支持 `域名/id` 格式的短链接访问
- **响应式布局**：适配不同屏幕尺寸，支持多卡片布局
- **删除功能**：支持通过删除按钮移除链接，带有确认对话框防止误删
- **更新时间显示**：在每个链接卡片上显示最后更新时间
- **实时刷新**：支持通过刷新按钮手动更新链接列表

## 技术栈

- **Cloudflare Workers**：无服务器计算平台，用于处理 HTTP 请求
- **Cloudflare D1**：SQLite 兼容的服务器less数据库，用于存储链接数据
- **JavaScript (ES Module)**：Worker 脚本开发语言
- **HTML5/CSS3**：前端页面布局与样式

## 快速开始

### 前提条件

- Cloudflare 账户
- Cloudflare Workers 订阅
- Cloudflare D1 数据库

### 环境配置

1. **创建 D1 数据库**
   - 登录 Cloudflare 控制台
   - 导航到 `Workers & Pages` > `D1`
   - 创建一个新的数据库，名称为 `link_redirect`

2. **配置 Worker**
   - 创建一个新的 Worker
   - 在 Worker 设置中，添加 D1 数据库绑定
   - 绑定名称设置为 `DB`，选择刚刚创建的 `link_redirect` 数据库

3. **部署代码**
   - 将 `worker_d1.js` 的内容复制到 Worker 编辑器中
   - 点击部署按钮

## 部署方法

### 通过 Cloudflare 控制台部署

1. 登录 Cloudflare 控制台
2. 导航到 `Workers & Pages`
3. 创建新的 Worker
4. 在 Worker 编辑器中粘贴 `worker_d1.js` 的内容
5. 配置 D1 数据库绑定（名称：`DB`，数据库：`link_redirect`）
6. 点击部署

### 通过 Wrangler CLI 部署

1. 安装 Wrangler CLI：`npm install -g wrangler`
2. 初始化项目：`wrangler init link-redirect`
3. 配置 `wrangler.toml` 文件：

```toml
name = "link-redirect"
main = "worker_d1.js"
compatibility_date = "2023-12-01"

d1_databases = [
  {
    binding = "DB",
    database_name = "link_redirect",
    database_id = "<YOUR_DATABASE_ID>"
  }
]
```

4. 部署项目：`wrangler deploy`

## API 文档

### GET 请求

#### 获取导航页面

- **URL**：`/`
- **方法**：`GET`
- **参数**：
  - `refresh`：可选，设置为 `true` 强制刷新链接列表
- **响应**：HTML 导航页面

#### 短链接重定向

- **URL**：`/:id`
- **方法**：`GET`
- **参数**：
  - `id`：链接的唯一标识符（数字）
- **响应**：302 重定向到目标 URL

### POST 请求

#### 添加或更新链接

- **URL**：`/`
- **方法**：`POST`
- **请求头**：
  - `Content-Type`: `application/json` 或 `application/x-www-form-urlencoded`
- **请求体**：
  - JSON 格式：
  ```json
  {
    "name": "显示名称",
    "value": "https://目标链接.com"
  }
  ```
  - Form 格式：
  ```
  name=显示名称&value=https://目标链接.com
  ```
- **响应**：
  ```json
  {
    "success": true,
    "message": "写入成功"
  }
  ```

### DELETE 请求

#### 删除链接

- **URL**：`/?delete=:id`
- **方法**：`DELETE`
- **参数**：
  - `delete`：要删除的链接 ID
- **响应**：
  ```json
  {
    "success": true,
    "message": "删除成功"
  }
  ```

## 项目结构

```
link/
├── worker.js          # 原始 KV 版本
├── worker_d1.js       # D1 数据库版本
└── link_redirect_d1_worker.md  # 本 README 文件
```

## 代码说明

### 核心功能

1. **数据库初始化**：自动创建 `redirect_links` 表，包含 `id`、`name`、`url`、`created_at` 和 `updated_at` 字段
2. **链接管理**：支持添加、更新、删除和查询链接
3. **短链接重定向**：解析 `/:id` 路径，重定向到对应 URL
4. **响应式布局**：根据屏幕尺寸自动调整卡片布局
5. **用户交互**：添加了删除确认、刷新按钮等交互元素

### 数据库结构

```sql
CREATE TABLE IF NOT EXISTS redirect_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 注意事项

1. **D1 数据库配额**：Cloudflare D1 有查询次数和存储大小的限制，请合理使用
2. **链接数量**：建议不要存储过多链接，以免影响页面加载速度
3. **安全性**：本项目未实现用户认证，建议仅在内部网络使用或添加访问控制
4. **域名配置**：需要将自定义域名指向 Worker，才能使用自定义域名的短链接

## 许可证

本项目采用 MIT 许可证。详见 LICENSE 文件。

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

## 联系

如果您有任何问题或建议，请随时联系项目维护者。