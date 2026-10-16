# 设备成本追踪（Cloudflare Workers + D1 版）

基于 **Cloudflare Workers + D1 数据库** 的设备折旧记账工具：记录每台设备的买入价与买入日期，退役时填卖出价，自动算出**每天的使用成本**。

```
每日成本 = (买入价 − 卖出价) ÷ 使用天数
```

- 使用中的设备：卖出价按 0 计，天数算到今天
- 已退役的设备：天数定格在退役日，卖出价可为 0（送人 / 报废）
- 数据存 Cloudflare D1，换设备、清浏览器缓存都不丢，手机电脑都能打开

## 项目结构

```
DeviceCostTracker/
├── public/
│   └── index.html      # 前端页面（单文件，样式与逻辑内联，无构建）
├── src/
│   └── index.js        # Worker API（GET/POST/PUT/DELETE /api/devices）
├── schema.sql          # D1 建表语句（devices 表）
├── wrangler.toml       # Workers + D1 配置
└── README.md
```

## 功能

### 顶部统计

| 卡片 | 含义 |
|------|------|
| 使用中 | 当前在用的设备台数 |
| 今日总成本 | 所有在用设备每日折旧合计 |
| 累计退役 | 已退役设备台数 |
| 设备合计价格 | 所有设备买入价总和 |
| 售出合计价格 | 已退役设备卖出价总和 |

### 设备卡片

卡片显示：图标、设备名、买入价（已退役设备额外用绿色显示卖出价）、每日成本、购入日期、使用天数、状态灯。

- 使用中的设备排在前，按买入日期倒序
- 已退役的设备排在后，按退役日期倒序

### 操作

1. 点右下角 **+** 添加设备：名称、图标（16 种可选）、买入价、买入日期
2. 点任意卡片进入编辑；填写「退役日期 + 卖出价」后卡片自动转为「已退役」
3. 编辑页左下角红色按钮删除设备（带确认弹窗）

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/devices` | 列出全部设备（使用中在前） |
| POST | `/api/devices` | 新建设备 |
| PUT | `/api/devices/:id` | 更新设备 |
| DELETE | `/api/devices/:id` | 删除设备 |

POST / PUT 请求体字段：`name`、`icon`、`buyPrice`、`buyDate`、`retireDate`、`sellPrice`

## 部署

前置：Cloudflare 账号、Node.js ≥ 18

```powershell
npx wrangler login

# 创建 D1 数据库（只需一次），把输出的 database_id 填进 wrangler.toml
npx wrangler d1 create device-cost-tracker

# 建表
npx wrangler d1 execute device-cost-tracker --remote --file=./schema.sql

# 部署
npx wrangler deploy
```

部署完成后访问返回的 Worker 域名即可。

### 可选：设置访问密码

```powershell
npx wrangler secret put ADMIN_PASSWORD
```

设置后页面会要求输入密码才能查看和修改；不设置则页面完全公开。

### 可选：绑定自定义域名

Cloudflare 控制台 → Workers & Pages → 选中本 Worker → Settings → Domains & Routes → 添加自定义域名。

## 数据管理

```powershell
# 查看所有数据
npx wrangler d1 execute device-cost-tracker --remote --command "SELECT * FROM devices;"

# 清空所有设备
npx wrangler d1 execute device-cost-tracker --remote --command "DELETE FROM devices;"
```

## 字段说明

| 字段 | 类型 | 含义 |
|------|------|------|
| id | TEXT | 主键 |
| name | TEXT | 设备名称 |
| icon | TEXT | 图标 emoji |
| buy_price | REAL | 买入价格 |
| buy_date | TEXT | 买入日期 YYYY-MM-DD |
| retire_date | TEXT | 退役日期，NULL 表示使用中 |
| sell_price | REAL | 卖出价格，可为 0 |
| created_at / updated_at | TEXT | 创建 / 更新时间 |

## 免费额度

D1 免费版每天 500 万行读取、10 万行写入；Workers 免费版每天 10 万次请求。个人记账用量远低于此。
