-- IP导航数据库表结构（Cloudflare D1 / SQLite）
-- 结构：设备(devices) -> IP(ips) / 端口(navs)，IP和端口都绑定设备

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(device_id, value)
);

CREATE TABLE IF NOT EXISTS navs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  port TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
