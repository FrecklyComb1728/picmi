# 数据库说明

## 驱动选择

- sqlite：默认，基于 sql.js
- mysql：使用 mysql2/promise
- postgresql：使用 pg
- supabase：使用 @supabase/supabase-js

驱动由 config.json 中 database.driver 决定。

## 表结构

### users

- username TEXT/VARCHAR 主键
- password_hash TEXT/VARCHAR
- created_at（仅部分 SQLite 版本存在）

### settings

- key TEXT/VARCHAR 主键
- value TEXT

### nodes

- id TEXT/VARCHAR 主键
- name TEXT/VARCHAR
- type TEXT/VARCHAR
- address TEXT
- username TEXT
- password TEXT
- enabled BOOLEAN/INTEGER
- root_dir TEXT

### public_paths

- path TEXT 主键

## 存储配置与限制

- listApi 默认 /api/images/list
- enableLocalStorage 默认 false
- maxUploadBytes 默认 20MB
- Supabase 模式最大上传上限 200MB

## SQL 方言差异

- SQLite 使用 INSERT OR REPLACE
- MySQL 使用 ON DUPLICATE KEY UPDATE
- PostgreSQL 使用 ON CONFLICT

## Supabase 行为

- replace 会先清空再插入
- nodes 表可能不存在 type/username 时自动降级
