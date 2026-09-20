-- 迁移脚本：从旧结构（ips/navs 无设备概念）升级到设备->IP/端口 结构
-- 旧数据请先备份，迁移会重建 ips/navs 两张表

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

DROP TABLE IF EXISTS ips;
DROP TABLE IF EXISTS navs;

CREATE TABLE ips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(device_id, value)
);

CREATE TABLE navs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  port TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
