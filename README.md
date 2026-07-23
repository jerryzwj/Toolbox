# Toolbox - 实用工具集合

> 基于 Cloudflare Workers 的实用工具集合，并包含 NAS 上的 Docker 一键部署脚本

## 📋 项目简介

Toolbox 是一个实用工具集合，包含四个项目：

1. **DPNAddress** - 基于 D1 数据库的链接管理与重定向服务
2. **Homepage** - 个人网址导航服务，支持书签分类管理
3. **MSProxy** - 多站代理服务，D1 配置 + 子域名透传 + 网页可视化管理
4. **YutuCMS** - 玉兔CMS 在飞牛 NAS 上的 Docker 一键部署脚本

前三个工具运行在 Cloudflare Workers 上，具有全球边缘部署、低延迟访问的优势；YutuCMS 为飞牛 NAS 本地 Docker 部署方案。

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

## 🔧 部署指南

### 前提条件

- Cloudflare 账户（DPNAddress / Homepage / MSProxy）
- 飞牛 NAS fnOS X86 + Docker（YutuCMS）
- 对于 DPNAddress / MSProxy：Cloudflare D1 数据库
- 对于 Homepage：Cloudflare KV 存储

### 通用部署步骤（Cloudflare Workers 项目）

1. **登录 Cloudflare 控制台**
2. **创建 Worker**：
   - 导航到 "Workers & Pages"
   - 点击 "Create Worker"
   - 命名你的 Worker，然后点击 "Deploy"
3. **配置绑定**：
   - 对于 DPNAddress / MSProxy：添加 D1 数据库绑定，名称为 `DB`
   - 对于 Homepage：添加 KV 命名空间绑定，名称为 `BOOKMARKS_KV`
4. **部署代码**：
   - 进入 Worker 编辑页面
   - 复制对应项目的 Worker 代码到编辑器
   - 配置必要的环境变量（如 MSProxy 的 `ADMIN_PASSWORD`）
   - 点击 "Save and Deploy"

> YutuCMS 为 NAS 本地 Docker 部署，见其 [README](YutuCMS/README.md)。

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

### Q: 如何提高安全性？

**A:** 
- 对于 Homepage / MSProxy：设置强管理密码并定期更换
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
