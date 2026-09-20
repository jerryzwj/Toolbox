-- 迁移：去掉 ips.name 字段（设备名称即IP名称）
-- 通过重建表保留现有数据（id/device_id/value/created_at）

CREATE TABLE ips_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(device_id, value)
);

INSERT INTO ips_new (id, device_id, value, created_at)
  SELECT id, device_id, value, created_at FROM ips;

DROP TABLE ips;
ALTER TABLE ips_new RENAME TO ips;
