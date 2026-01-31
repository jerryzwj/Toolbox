# Toolbox - 实用工具集合

> 基于 Cloudflare Workers 的实用工具集合，包含链接管理、个人导航和多站代理服务

## 📋 项目简介

Toolbox 是一个基于 Cloudflare Workers 的实用工具集合，包含三个核心项目：

1. **DPNAddress** - 基于 D1 数据库的链接管理与重定向服务
2. **Homepage** - 个人网址导航服务，支持书签分类管理
3. **MSProxy** - 多站代理服务，支持远程配置管理

这些工具都运行在 Cloudflare Workers 上，具有全球边缘部署、低延迟访问的优势。

## � 项目结构

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
- 支持通过远程 JSON 配置文件管理多个代理目标
- 提供缓存机制（5分钟），减少重复请求
- 支持跨域访问，添加 `Access-Control-Allow-Origin: *` 头
- 提供代理列表页面，显示所有代理目标
- 防反爬处理，自动修改请求头
- 请求超时保护（10秒）

**技术栈**：
- Cloudflare Workers
- JavaScript (ES Module)
- HTML5/CSS3

**使用方法**：
1. 部署 `worker.js` 到 Cloudflare Workers
2. 修改 `REMOTE_CONFIG_URL` 为你的远程配置文件 URL
3. 配置远程 JSON 文件，格式如下：
   ```json
   {
     "代理名称1": "https://目标站点1/api路径",
     "代理名称2": "https://目标站点2/api路径"
   }
   ```
4. 通过 `域名/1`、`域名/2` 等路径访问对应代理

## 🔧 部署指南

### 前提条件

- Cloudflare 账户
- Cloudflare Workers 订阅
- 对于 DPNAddress：Cloudflare D1 数据库
- 对于 Homepage：Cloudflare KV 存储

### 通用部署步骤

1. **登录 Cloudflare 控制台**
2. **创建 Worker**：
   - 导航到 "Workers & Pages"
   - 点击 "Create Worker"
   - 命名你的 Worker，然后点击 "Deploy"
3. **配置绑定**：
   - 对于 DPNAddress：添加 D1 数据库绑定，名称为 `DB`
   - 对于 Homepage：添加 KV 命名空间绑定，名称为 `BOOKMARKS_KV`
4. **部署代码**：
   - 进入 Worker 编辑页面
   - 复制对应项目的 Worker 代码到编辑器
   - 修改必要的配置项（如远程配置 URL）
   - 点击 "Save and Deploy"

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

## � 常见问题

### Q: 服务启动失败怎么办？

**A:** 检查以下几点：
- Cloudflare Workers 订阅是否有效
- 数据库或存储绑定是否正确配置
- 远程配置文件（如果使用）是否可访问
- 代码是否有语法错误

### Q: 如何更新配置？

**A:** 
- 对于 DPNAddress：通过 POST 请求添加或更新链接
- 对于 Homepage：在界面上直接添加、编辑或删除书签
- 对于 MSProxy：更新远程 JSON 配置文件，服务会自动加载（最多延迟 5 分钟）

### Q: 如何提高安全性？

**A:** 
- 对于 Homepage：设置强密码并定期更换
- 对于 DPNAddress：考虑添加访问控制，限制只有特定 IP 可以修改链接
- 对于 MSProxy：避免代理敏感内容，定期检查代理目标

## 📄 许可证

本项目采用 MIT 许可证。详见各子项目的 LICENSE 文件。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

## 📞 联系方式

如有问题或建议，请通过 GitHub Issues 与我们联系。

---

**免责声明**：本项目仅用于学习和开发目的，请勿用于非法用途。使用本项目时，请遵守相关法律法规。