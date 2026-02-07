# 配置说明

## config.json

配置文件位于项目根目录 config.json，启动时由 server/config.js 读取并合并默认值。

### 字段说明

- port：服务端端口，默认 5408
- logLevel：日志级别，支持 INFO/WARN/DEBUG
- logFile：日志文件路径，默认 ./logs/app.log
- logIpHeader：记录真实 IP 的请求头，默认 x-forwarded-for
- storageRoot：本地上传目录，默认 ./public/uploads

auth 子项：

- cookieSecret：Cookie 加密密钥，生产环境必须设置
- maxAgeSeconds：登录有效期秒数，最小 60
- allowRemoteInit：是否允许远程初始化管理员

database 子项：

- driver：sqlite/mysql/postgresql/supabase
- sqlite.file：SQLite 文件路径
- mysql：host/port/user/password/database
- postgresql：host/port/user/password/database/ssl
- supabase：url/serviceRoleKey

## 环境变量

- PICMI_ROOT：指定根目录，影响配置与静态资源路径
- LOG_LEVEL：覆盖 logLevel 的日志级别
- NUXT_PORT 或 PORT：覆盖 Nuxt 服务端口
- PICMI_SCRYPT_N/R/P/KEYLEN：调整密码哈希参数

非生产环境会尝试读取 .env.local。

## Nuxt 运行时配置

在 nuxt.config.ts 中定义：

- public.apiBase：默认 /api
- public.uploadPath：默认 /api/images/upload
- public.listPath：默认 /api/images/list

## 配置约束

- maxUploadBytes 最小 1MB
- Supabase 模式最大上传上限为 200MB
- 启用本地存储与启用节点不可同时为 true
