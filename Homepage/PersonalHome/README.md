# 个人主页 Android 应用

这是一个基于 Cloudflare Workers 导航页的原生 Android 应用，用于快速访问个人收藏的网址。

## 功能特性

- ✅ 加载 Cloudflare Workers 导航页
- ✅ 响应式设计，支持各种屏幕尺寸
- ✅ 错误处理和网络状态检测
- ✅ 离线模式支持
- ✅ 加载进度显示
- ✅ 外部链接使用浏览器打开

## 技术架构

- **前端**：WebView 加载 Cloudflare Workers 导航页
- **后端**：Cloudflare Workers + KV 存储
- **开发语言**：Java
- **最低支持 Android 版本**：Android 5.0 (API 21)
- **目标 Android 版本**：Android 14 (API 34)

## 项目结构

```
PersonalHome/
├── app/
│   ├── build.gradle          # 应用级构建配置
│   └── src/
│       └── main/
│           ├── AndroidManifest.xml    # 应用清单文件
│           ├── java/com/example/personalhome/
│           │   └── MainActivity.java  # 主活动
│           └── res/
│               ├── drawable/          # 可绘制资源
│               ├── layout/            # 布局文件
│               ├── mipmap-hdpi/       # 应用图标
│               └── values/            # 字符串、颜色等资源
├── build.gradle              # 项目级构建配置
└── settings.gradle           # 项目设置
```

## 如何使用

### 方法一：在 Android Studio 中导入项目

1. **打开 Android Studio**
2. 点击 **File > Open**
3. 导航到 `PersonalHome` 目录并选择它
4. 等待 Gradle 同步完成
5. 点击 **Run > Run 'app'** 或使用快捷键 `Shift + F10`
6. 选择一个模拟器或连接的设备
7. 应用将被安装并运行

### 方法二：构建 APK 安装包

1. **在 Android Studio 中打开项目**
2. 点击 **Build > Build Bundle(s) / APK(s) > Build APK(s)**
3. 构建完成后，点击 **locate** 查看生成的 APK 文件
4. 将 APK 文件复制到您的 Android 设备上并安装

## 配置说明

### 导航页 URL

默认导航页 URL 为 `https://zy.1970.qzz.io/`

如果需要修改导航页 URL，请编辑 `MainActivity.java` 文件中的 `BASE_URL` 常量：

```java
private static final String BASE_URL = "https://zy.1970.qzz.io/";
```

### 权限配置

应用需要以下权限：

- `INTERNET`：访问网络
- `ACCESS_NETWORK_STATE`：检测网络状态
- `ACCESS_WIFI_STATE`：检测 WiFi 状态

这些权限已在 `AndroidManifest.xml` 中配置。

## 错误处理

应用包含以下错误处理机制：

1. **网络连接检测**：启动时检查网络连接状态
2. **加载错误处理**：显示友好的错误页面
3. **离线模式**：启用 WebView 缓存，支持离线访问

## 性能优化

1. **WebView 配置**：启用硬件加速和优化渲染
2. **缓存策略**：合理的缓存配置，减少网络请求
3. **进度显示**：提供加载进度反馈
4. **外部链接处理**：使用系统浏览器打开外部链接

## 已知限制

1. **依赖网络**：核心功能依赖 Cloudflare Workers 服务
2. **缓存限制**：离线模式依赖 WebView 缓存，可能有限制
3. **性能**：WebView 性能可能不如原生应用

## 故障排除

### 应用无法加载导航页

- 检查网络连接
- 确认导航页 URL 可访问
- 检查应用权限设置

### 外部链接无法打开

- 确认设备上有可用的浏览器应用
- 检查应用权限设置

### 离线模式不工作

- 确保已在线访问过导航页，以建立缓存
- 检查设备存储空间是否充足

## 更新日志

### v1.0.0 (2026-01-30)

- 初始版本
- 实现 WebView 加载导航页
- 添加错误处理和离线模式
- 支持外部链接处理

## 许可证

MIT License

## 联系方式

如有任何问题或建议，请联系项目维护者。