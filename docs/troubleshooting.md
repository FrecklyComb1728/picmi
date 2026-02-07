# 常见问题与排障

## 无法登录

- 检查数据库中是否存在用户
- 若无用户，使用 /api/auth/init 初始化
- 检查 Cookie 是否被浏览器阻止

## 上传失败

- 检查 enableLocalStorage 或节点是否启用
- 确认 maxUploadBytes 限制
- 确认文件名未被清洗为非法

## 节点状态异常

- 检查节点地址是否正确
- PicMi-Node 确认 /api/status/stream 是否可达
- WebDAV 确认 OPTIONS 能返回 2xx~4xx

## 图片列表为空

- 确认目录路径是否存在
- 节点模式下确认 rootDir 配置
- 检查是否启用公开目录但未授权

## 端口冲突

- 修改 config.json 的 port
- 设置 PORT/NUXT_PORT 环境变量

## Supabase 连接失败

- 检查 url 与 serviceRoleKey
- 确保表结构已创建
