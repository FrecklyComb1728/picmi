# CI/CD 零停机部署

基于 `webhook` + `PM2` 的零停机部署方案，不依赖 GitHub Actions。

## 文件清单

| 文件 | 说明 |
|------|------|
| `ecosystem.config.cjs` | PM2 配置（fork 模式、512M 内存上限） |
| `deploy.sh` | 部署脚本（拉取代码、按需安装依赖、构建、reload） |
| `webhook.example.json` | webhook 配置模板（需改名为 `webhook.json`） |

## 步骤

### 1. 环境准备

```bash
npm install -g pm2 pnpm

sudo curl -L -o /usr/local/bin/webhook \
  https://github.com/adnanh/webhook/releases/download/2.8.2/webhook-linux-amd64.tar.gz
sudo tar -xzf /usr/local/bin/webhook -C /tmp
sudo mv /tmp/webhook-linux-amd64/webhook /usr/local/bin/webhook
sudo chmod +x /usr/local/bin/webhook
```

### 2. 首次部署

```bash
cd /www/wwwroot
git clone https://github.com/FrecklyComb1728/picmi.git
cd picmi

pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com
pnpm build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 3. 部署脚本

`deploy.sh` 已包含在项目中，功能：

- `mkdir` 原子锁防并发部署
- `git fetch` → `git reset --hard` 拉取最新代码
- 仅在 `package.json` / `pnpm-lock.yaml` 变动时重新安装依赖
- 首次部署时自动检测 `node_modules` 缺失
- `pnpm build` 构建 Nuxt 应用
- `pm2 reload` 零停机重启
- `pm2 save` 持久化进程列表
- 所有错误输出写入 `logs/deploy.log`

设置权限：
```bash
chmod +x /opt/picmi/deploy.sh
```

### 4. Webhook 配置

```bash
cd /www/wwwroot/picmi
cp webhook.example.json webhook.json
```

生成随机 secret：
```bash
openssl rand -hex 32
```

将输出填入 `webhook.json` 的 `secret` 字段。

### 5. 系统服务

创建 `/etc/systemd/system/webhook-picmi.service`：

```ini
[Unit]
Description=Webhook for Picmi Deploy
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/picmi
ExecStart=/usr/local/bin/webhook \
  -hooks /opt/picmi/webhook.json \
  -port 9000 \
Restart=always
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

启用：
```bash
sudo systemctl daemon-reload
sudo systemctl enable webhook-picmi
sudo systemctl start webhook-picmi
sudo systemctl status webhook-picmi
```

### 6. 开放端口

```bash
sudo ufw allow 9000/tcp
```

### 7. GitHub Webhook

仓库 → Settings → Webhooks → Add webhook：

| 字段 | 值 |
|------|-----|
| Payload URL | `http://服务器IP:9000/hooks/deploy` |
| Content type | `application/json` |
| Secret | 与 `webhook.json` 一致 |
| Events | Just the `push` event |

### 8. 验证

```bash
sudo journalctl -u webhook-picmi -f
pm2 status
tail -f /opt/picmi/logs/deploy.log
```

---

## 内地服务器优化

### pnpm 加速

部署脚本已配置 `--registry=https://registry.npmmirror.com`。

### Git 加速

```bash
git config --global url."https://gh.1s.fan/".insteadOf https://github.com/
```

---

## 故障排查

| 问题 | 检查 |
|------|------|
| webhook 不触发 | `journalctl -u webhook-picmi -f`，检查端口开放和 GitHub IP 可达 |
| 构建失败 | `cat logs/deploy.log`，确认 Node.js 22+、pnpm 版本 |
| PM2 reload 失败 | `pm2 logs picmi`，确认 `.output/server/index.mjs` 正常 listen |
| 端口 9000 不通 | 云服务商安全组是否放行 |
