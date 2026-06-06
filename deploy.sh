#!/bin/bash
set -e
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$REPO_DIR/logs/deploy.log"
LOCK_DIR="$REPO_DIR/.deploy-lock"
mkdir -p "$(dirname "$LOG_FILE")"
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}
log_stderr() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
  echo "$1" >&2
}
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log "已有部署在进行中，跳过"
  exit 0
fi
cleanup() {
  local exit_code=$?
  rmdir "$LOCK_DIR" 2>/dev/null
  if [ $exit_code -ne 0 ]; then
    log "部署失败，行号: ${BASH_LINENO[0]}，exit code: $exit_code"
  fi
}
trap cleanup EXIT
log "开始部署..."
cd "$REPO_DIR"
PREV_COMMIT=$(git rev-parse --short HEAD)
log "当前版本: $PREV_COMMIT"
GIT_FETCH_ERR=$(git fetch origin main 2>&1) || { log_stderr "git fetch 失败: $GIT_FETCH_ERR"; if echo "$GIT_FETCH_ERR" | grep -qi "read-only\|Read-only"; then log_stderr "→ 文件系统只读，检查 webhook systemd 服务的 ReadWritePaths 是否包含项目目录"; fi; exit 1; }
GIT_RESET_ERR=$(git reset --hard origin/main 2>&1) || { log_stderr "git reset 失败: $GIT_RESET_ERR"; exit 1; }
NEW_COMMIT=$(git rev-parse --short HEAD)
log "新版本: $NEW_COMMIT"
if [ ! -d "node_modules" ] || git diff "$PREV_COMMIT" HEAD --name-only | grep -qE "package\.json|pnpm-lock\.yaml"; then
  log "依赖有变动或首次安装，开始安装..."
  INSTALL_ERR=$(pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com 2>&1) || { log_stderr "pnpm install 失败"; echo "$INSTALL_ERR" >> "$LOG_FILE"; exit 1; }
fi
log "开始构建..."
BUILD_ERR=$(pnpm build 2>&1) || { log_stderr "pnpm build 失败"; echo "$BUILD_ERR" >> "$LOG_FILE"; exit 1; }
RELOAD_ERR=$(pm2 reload ecosystem.config.cjs --update-env 2>&1) || {
  log "pm2 reload 失败，尝试 pm2 start..."
  echo "$RELOAD_ERR" >> "$LOG_FILE"
  START_ERR=$(pm2 start ecosystem.config.cjs 2>&1) || { log_stderr "pm2 start 失败"; echo "$START_ERR" >> "$LOG_FILE"; exit 1; }
}
pm2 save >> "$LOG_FILE" 2>&1
log "部署完成: $PREV_COMMIT -> $NEW_COMMIT"
