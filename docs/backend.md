# 后端说明

## 服务入口

- Express 入口：server/index.js
- Nitro API 入口：server/api/**

## 进程模型

- 生产环境下使用 cluster 按 CPU 核心数启动多进程
- 子进程异常退出会自动拉起

## Express 中间件链

1. helmet 安全头
2. compression 压缩
3. JSON 与表单解析（20MB）
4. cookie-parser
5. response-time
6. request-logger
7. 静态资源 public/
8. 路由加载 routes/*
9. error-handler

## 路由加载机制

routes 目录下所有 .js 文件将被动态加载，需导出 router 与 basePath。

## 日志系统

- 使用 Pino 多路输出
- logFile 存在时写入文件
- 日志级别默认 INFO
- 请求日志格式：

```
{ip} - [YYYY/MM/DD-HH:MM:SS] "{method} {url} {http}" {status} {bytes} "{referer}" "{ua}" "{forwardedIp}"
```

## 鉴权机制

- Cookie 名：picmi.auth
- AES-256-GCM 加密
- cookieSecret 为空且生产环境会抛错
- maxAgeSeconds 最小 60 秒

## 密码哈希

- 默认使用 scrypt
- 旧 SHA256 哈希在登录时自动升级
- 可通过 PICMI_SCRYPT_* 环境变量调整参数

## 安全与路径处理

- normalizePath 规整路径
- resolvePath 确保访问不越界
- 上传文件名进行严格清洗
