# API 参考

## 通用规则

### 基础路径

- 所有接口以 /api 开头

### 统一响应结构

```json
{ "code": 0, "message": "ok", "data": {} }
```

### 鉴权

- 通过 Cookie：picmi.auth
- 未登录返回 401 与 code=40101

### 常见错误码

- 40001 参数错误
- 40002 未配置存储节点或节点不可用
- 40101 未登录或账号密码错误
- 40901 已初始化或资源冲突
- 50201 节点不可达或响应异常

## 认证

### POST /api/login

请求体：

```json
{ "username": "admin", "password": "123456" }
```

返回：

```json
{ "code": 0, "message": "ok", "data": { "username": "admin" } }
```

### POST /api/logout

返回：

```json
{ "code": 0, "message": "ok", "data": null }
```

### GET /api/auth/status

返回：

```json
{ "code": 0, "message": "ok", "data": { "needsSetup": false, "loggedIn": true } }
```

## 配置

### GET /api/config

返回：

```json
{ "code": 0, "message": "ok", "data": { "listApi": "/api/images/list", "nodes": [], "enableLocalStorage": false, "maxUploadBytes": 20971520 } }
```

### POST /api/config

请求体：

```json
{
  "listApi": "/api/images/list",
  "nodes": [
    { "id": "node-1", "name": "主节点", "type": "picmi-node", "address": "http://127.0.0.1:5409", "username": "", "password": "token", "enabled": true, "rootDir": "/" }
  ],
  "enableLocalStorage": false,
  "maxUploadBytes": 20971520
}
```

限制：

- enableLocalStorage 为 true 且 nodes 中存在启用节点时会返回 40003

## 用户管理

### GET /api/users

返回：

```json
{ "code": 0, "message": "ok", "data": { "users": [{ "username": "admin" }] } }
```

### POST /api/users

说明：新增用户或更新密码，password 为空时保留旧密码。

请求体：

```json
{ "username": "user1", "password": "secret" }
```

### DELETE /api/users?username=user1

返回：

```json
{ "code": 0, "message": "ok", "data": null }
```

### POST /api/users/update

说明：用于当前登录用户修改凭证。

请求体：

```json
{ "username": "admin", "password": "newpass" }
```

## 节点状态

### GET /api/nodes/status

返回：

```json
{ "code": 0, "message": "ok", "data": { "byId": { "node-1": { "online": true } } } }
```

## 图片管理

### GET /api/images/list?path=/

说明：列出目录。若 path 位于公开目录列表内，可免登录访问。节点不可用时可能包含 nodeError 字段。

返回：

```json
{ "code": 0, "message": "ok", "data": { "path": "/", "items": [] } }
```

### GET /api/images/exists?path=/&filename=a.png

返回：

```json
{ "code": 0, "message": "ok", "data": { "exists": true } }
```

### POST /api/images/mkdir

请求体：

```json
{ "path": "/", "name": "folder" }
```

### POST /api/images/upload

说明：multipart/form-data，字段包含 file、path、override。

示例 / Example:

```bash
curl.exe -X POST http://127.0.0.1:5408/api/images/upload -F "path=/" -F "override=0" -F "file=@D:\\1.png"
```

### POST /api/images/upload-base64

请求体：

```json
{ "path": "/", "filename": "a.png", "base64": "data:image/png;base64,..." }
```

### POST /api/images/delete

请求体：

```json
{ "paths": ["/a.png", "/dir/b.png"] }
```

### POST /api/images/rename

请求体：

```json
{ "path": "/a.png", "newName": "b.png" }
```

### POST /api/images/move

请求体：

```json
{ "toPath": "/target", "items": [{ "path": "/a.png" }] }
```

### POST /api/images/copy

请求体：

```json
{ "toPath": "/target", "items": [{ "path": "/a.png" }] }
```

### GET /api/images/raw?path=/a.png

说明：代理获取节点中的原始图片。若图片所在目录为公开目录，可免登录访问。

### GET /api/images/usage

说明：统计图片数量与占用大小。

返回：

```json
{ "code": 0, "message": "ok", "data": { "bytes": 123, "count": 4 } }
```

### POST /api/images/public

请求体：

```json
{ "path": "/public" }
```

返回：

```json
{ "code": 0, "message": "ok", "data": { "enabled": true } }
```

### GET /api/images/public-status?path=/public

返回：

```json
{ "code": 0, "message": "ok", "data": { "enabled": true } }
```

## 健康检查

### GET /api/health

返回：

```json
{ "code": 0, "message": "ok", "data": { "status": "ok" } }
```
