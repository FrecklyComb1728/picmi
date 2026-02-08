# 运行与部署

## 开发模式

启动 Nuxt 应用：

```bash
pnpm dev
```

启动独立 Express：

```bash
node --watch server/index.js
```

## 生产模式

构建与启动 Nuxt：

```bash
pnpm build && pnpm start
```

启动独立 Express：

```bash
node server/index.js
```

## 目录与文件

- public/uploads：本地存储目录
- logs/app.log：日志输出文件
- data/sqlite.db：默认数据库

## 端口管理

- 默认 5408
- 通过 config.json 或环境变量 PORT/NUXT_PORT 覆盖

## 日志级别

- 通过 config.json 的 logLevel 设置
- 可用 INFO/WARN/DEBUG

## 运行建议

> 提示：生产环境必须设置 auth.cookieSecret，否则会触发错误。

> 提示：使用反向代理时请确保 logIpHeader 与代理配置一致。
