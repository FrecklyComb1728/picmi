# PicMi 图床管理系统

![Nuxt](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt.js&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3-42B883?logo=vue.js&logoColor=white)
![License](https://img.shields.io/badge/License-Unlicense-616161)

PicMi 是一个基于 Nuxt 4 与 Node.js 的自托管图床管理系统，提供多存储节点接入、本地与节点存储切换、图像目录化管理、上传与批量操作、用户管理与鉴权等能力。

相关项目：
- [PicMi-Node](https://github.com/FrecklyComb1728/picmi-node)：PicMi 存储节点

~~项目中如果有神秘注释的地方，就是AI写的，不用在意，能用就行~~
## 功能特性

- 目录化图片管理，支持排序、分页、筛选与批量操作
- 上传方式覆盖粘贴上传、选择文件上传与多文件上传
- 存储策略支持本地存储与 PicMi-Node/WebDAV/FTP 节点
- 可配置公共目录列表访问（无需登录）
- 用户管理与凭证更新
- 节点状态监控与统计指标展示
- 完整的 API 封装与统一响应结构
- **可直接Ctrl+V来粘贴上传图片（仅图片管理页面）**

## 技术栈

- 前端框架：Nuxt 4、Vue 3
- UI 组件：Naive UI、@vicons/ionicons5
- 样式方案：Tailwind CSS 4
- 后端框架：Nuxt Nitro API、Express 5
- 日志与安全：Pino、helmet、compression
- 存储与数据库：sql.js(SQLite)、MySQL、PostgreSQL、Supabase

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

### 启动独立 Express 后端

```bash
node server/index.js
```

默认端口来源于 config.json 中的 port 字段，默认值为 5408。

### 生产构建与启动

```bash
pnpm build && pnpm start
```

默认端口来源于 config.json 中的 port 字段，默认值为 5408。

### 单元测试

```bash
pnpm test:unit
```

### 代码检查

```bash
pnpm lint && pnpm typecheck
```

## 配置概览

配置文件位于 config.json，以下为默认结构：

```json
{
  "port": 5408,
  "logLevel": "INFO",
  "logFile": "./logs/app.log",
  "logIpHeader": "x-forwarded-for",
  "storageRoot": "./public/uploads",
  "auth": {
    "cookieSecret": "PicMi-Cookie-Secret",
    "maxAgeSeconds": 604800,
    "allowRemoteInit": false
  },
  "database": {
    "driver": "sqlite",
    "sqlite": { "file": "./data/sqlite.db" },
    "mysql": { "host": "", "port": 3306, "user": "", "password": "", "database": "" },
    "postgresql": { "host": "", "port": 5432, "user": "", "password": "", "database": "", "ssl": false },
    "supabase": { "url": "", "serviceRoleKey": "" }
  }
}
```

完整字段说明见 [configuration.md](docs/configuration.md)。

## API 速览

所有 API 以 /api 为前缀，统一返回结构：

```json
{ "code": 0, "message": "ok", "data": {} }
```

常用接口示例：

- POST /api/login
- GET /api/auth/status
- GET /api/images/list
- POST /api/images/upload
- POST /api/images/rename
- POST /api/images/move
- POST /api/images/copy
- POST /api/images/delete
- GET /api/images/raw
- GET /api/images/usage

详细参数与返回见 [api.md](docs/api.md)。

## 目录结构

```text
app/              Nuxt 前端应用
server/           Nitro API 与后端能力封装
routes/           Express 路由
middleware/       Express 中间件
public/           静态资源与本地上传目录
data/             SQLite 默认存储
```

## 文档导航

- [index.md](docs/index.md)
- [architecture.md](docs/architecture.md)
- [configuration.md](docs/configuration.md)
- [api.md](docs/api.md)
- [frontend.md](docs/frontend.md)
- [backend.md](docs/backend.md)
- [database.md](docs/database.md)
- [storage-nodes.md](docs/storage-nodes.md)
- [operations.md](docs/operations.md)
- [troubleshooting.md](docs/troubleshooting.md)

## 贡献指南

- 提交前请确保 pnpm lint 与 pnpm typecheck 通过
- 提交内容应包含必要的测试或复现步骤
- 请在提交信息中说明影响范围与变更理由

## 许可证

本项目采用 Unlicense 发布，详情见 [LICENSE](LICENSE)。

~~看不懂没关系，本来就没打算给别人用，不会有什么人有我这需求的（）~~
