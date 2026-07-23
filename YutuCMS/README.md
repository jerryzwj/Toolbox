# YutuCMS - 飞牛 NAS 一键部署

> 玉兔CMS(JCSQL) 在飞牛 fnOS X86 架构上的 Docker 一键部署脚本

## 📋 项目简介

YutuCMS（JCSQL）是玉兔内容管理系统。本目录提供在飞牛 NAS（X86 架构）上通过 Docker 一键部署 YutuCMS 运行环境的脚本，自动完成容器创建、PHP 扩展安装、目录权限配置等全部流程。

**核心价值**：
- 一条命令完成 YutuCMS 运行环境搭建
- 自动修复 Docker 权限、APT 源、PHP 扩展依赖
- 自动安装验证码所需的 GD 扩展并配置缓存目录权限
- 全流程检查，失败即报错，部署结果可信

## ✨ 脚本功能

脚本自动完成 8 个步骤：

1. **Docker 权限检查**：自动检测并尝试修复当前用户的 Docker 权限
2. **创建项目目录**：`/vol1/1000/docker/yutu`
3. **写入 compose 文件**：生成 `docker-compose.yml`（PHP 5.6 + Apache）
4. **启动容器**：拉取 `php:5.6-apache` 镜像并启动，端口 `8000:80`
5. **容器内配置**：修复 Debian 源、安装 zip/GD 扩展、配置权限
6. **PHP 扩展检查**：验证 zip、gd 扩展已加载
7. **目录权限检查**：验证 cache 目录存在且可写
8. **完成提示**：输出访问地址

## 🚀 快速部署

### 环境要求

- 系统：飞牛 NAS fnOS（X86 架构）
- 已开启 Docker 功能
- 可正常访问外网（拉取镜像和安装依赖）

### 在线执行（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/jerryzwj/Toolbox/main/YutuCMS/deploy.sh | bash
```

### 本地执行

将 `deploy.sh` 下载到飞牛 NAS 后执行：

```bash
chmod +x deploy.sh
./deploy.sh
```

## 🔧 配置说明

| 配置项 | 默认值 | 说明 |
|-------|-------|------|
| `BASE_PATH` | `/vol1/1000/docker/yutu` | 项目挂载目录 |
| `CONTAINER_NAME` | `yutucms` | 容器名称 |
| `IMAGE_NAME` | `php:5.6-apache` | PHP 镜像 |
| 端口映射 | `8000:80` | 宿主机 8000 → 容器 80 |

> 修改 `deploy.sh` 顶部的配置变量即可自定义路径、容器名、端口等。

## 📁 项目结构

```
YutuCMS/
├── deploy.sh    # 一键部署脚本
└── README.md    # 项目文档
```

## 📖 部署后

1. 部署完成后访问 `http://NAS内网IP:8000`
2. 将 YutuCMS 源码上传到 `/vol1/1000/docker/yutu` 目录
3. 按玉兔 CMS 安装向导完成安装

## 🔍 常见问题

### Q: 提示需要重新登录 SSH？

**A:** 脚本检测到当前用户无 Docker 权限时会自动添加到 docker 组，但需重新登录 SSH 才能生效。退出当前会话重新登录后再次运行脚本即可。

### Q: 容器启动失败？

**A:** 检查：
- 端口 8000 是否被占用
- 磁盘空间是否充足
- 外网是否可达（需拉取镜像和 apt 依赖）

### Q: 验证码不显示？

**A:** 脚本已自动安装 GD 扩展并配置 cache 目录权限。若仍不显示，进入容器执行 `php -m | grep gd` 确认扩展已加载，检查 `/var/www/html/JCSQL/cache` 目录权限。

## 📄 许可证

本项目采用 MIT 许可证。

---

**免责声明**：本项目仅用于学习和开发目的，请勿用于非法用途。使用本项目时，请遵守相关法律法规。
