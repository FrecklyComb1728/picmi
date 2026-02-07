# 系统架构

## 组件划分

- 前端应用：Nuxt 4 + Vue 3，位于 app/ 目录
- Nitro API：Nuxt 内置服务端接口，位于 server/api
- Express 后端：独立 Node 服务，位于 server/ 与 routes/
- 数据库层：server/store.js 与 server/db/*
- 节点监控：server/node-monitor.js

## 两种运行模式

### 模式一：Nuxt 应用（推荐用于一体化部署）

- 启动命令：pnpm dev 或 pnpm start
- API 由 Nitro（server/api）处理
- 前端与 API 统一在 Nuxt 进程内

### 模式二：独立 Express 后端（适合拆分部署）

- 启动命令：node server/index.js 或 scripts/dev.ps1
- 路由由 routes/ 下的模块加载
- 静态资源由 Express 直接暴露 public/

两套 API 实现逻辑一致，路径与响应结构保持统一。

## 请求流转

### 认证流

- 登录后写入 picmi.auth Cookie
- Cookie 使用 AES-256-GCM 加密
- 读取与校验由 server/utils/auth-cookie.js 处理
- 未登录请求返回 40101 与“未登录”信息

### 图片列表流

1. 前端调用 /api/images/list
2. API 判定是否为公开目录
3. 根据配置选择本地存储或 PicMi-Node
4. 返回目录与图片条目列表

### 上传流

1. 前端以 multipart/form-data 发送文件
2. API 校验文件名与大小上限
3. 本地存储时写入 public/uploads
4. 节点存储时转发到 PicMi-Node

## 存储策略

- enableLocalStorage=true 且无启用节点时使用本地存储
- 有启用节点时优先使用 PicMi-Node
- 本地存储路径由 config.json 的 storageRoot 控制

## 节点监控

- 监控周期：5 秒同步，节点探测 10 秒/500 ms
- PicMi-Node 使用 SSE 通道 /api/status/stream
- WebDAV 使用 OPTIONS 探测并支持 Basic Auth
- FTP 使用 TCP 端口连通性检测

## 安全策略

- 路径归一化与安全解析，避免目录穿越
- 统一响应结构防止信息泄露
- 日志记录请求关键字段
