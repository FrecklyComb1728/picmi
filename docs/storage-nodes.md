# 存储节点

## 节点类型

- picmi-node：自建节点，支持完整 API
- webdav：WebDAV 节点，支持可达性检测
- ftp：FTP 节点，支持连通性检测

## 节点字段

- id：唯一标识
- name：显示名称
- type：picmi-node/webdav/ftp
- address：节点地址
- username：可选账号
- password：可选密码或 Token
- enabled：启用状态
- rootDir：节点内根目录

## PicMi-Node 接口约定

PicMi-Node 需要实现与主程序一致的图片 API：

- GET /api/images/list
- GET /api/images/exists
- POST /api/images/mkdir
- POST /api/images/upload
- POST /api/images/upload-base64
- POST /api/images/delete
- POST /api/images/rename
- POST /api/images/move
- POST /api/images/copy
- GET /api/images/raw
- GET /api/images/usage

## 节点鉴权

- picmi-node 使用 Authorization: Bearer {password}
- webdav 使用 Basic Auth（username/password）
- ftp 仅进行 TCP 探测，不做账号验证

## 节点路径映射

- 业务路径会与 rootDir 合并
- 根目录为 / 时保持原路径
- 使用 normalizePath 保证路径安全

## 节点监控

### PicMi-Node SSE

- 地址：/api/status/stream
- 数据格式 JSON
- 兼容字段：
  - cpuPercent 或 cpu
  - memoryUsed 或 memUsed
  - memoryTotal 或 memTotal
  - diskUsed、diskTotal
  - bandwidthUp 或 up
  - bandwidthDown 或 down
  - latencyMs

### WebDAV

- 使用 OPTIONS 请求验证
- 10 秒周期探测

### FTP

- 使用 TCP 连接 21 端口
- 10 秒周期探测
