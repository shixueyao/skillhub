#!/usr/bin/env bash
# ============================================================================
# SkillHub 局域网部署 · 一键停止
#
#   ./stop.sh              停止容器，保留数据库 / Redis / 技能文件（默认）
#   ./stop.sh --purge      同时删除数据卷（不可逆，需二次确认）
#   ./stop.sh --timeout 10 指定停止等待秒数
# ============================================================================
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAN_DIR="$ROOT_DIR/deploy/lan"
ENV_FILE="$LAN_DIR/env/lan.env"
COMPOSE_FILE="$ROOT_DIR/compose.release.yml"
OVERLAY_FILE="$LAN_DIR/compose.lan.yml"
PROJECT_NAME="skillhub-lan"

PURGE=false
ASSUME_YES=false
TIMEOUT=30
DOWN_ARGS=()

usage() {
  cat <<'EOF'
用法: ./stop.sh [选项]

  --purge        额外删除数据卷（postgres_data / redis_data / skillhub_storage）
  --yes          与 --purge 合用，跳过交互确认（用于自动化脚本）
  --timeout <N>  停止容器等待秒数（默认 30）
  -h, --help     显示本帮助

默认只停止并移除容器，全部数据保留；再次 ./run.sh 即可原样恢复。
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --purge)      PURGE=true; shift ;;
    --yes|-y)     ASSUME_YES=true; shift ;;
    --timeout)    [ "$#" -ge 2 ] || { echo "ERROR: --timeout 缺少参数" >&2; exit 1; }; TIMEOUT="$2"; shift 2 ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "ERROR: 未知参数：$1" >&2; usage >&2; exit 1 ;;
  esac
done

log()  { printf '[stop] %s\n' "$*"; }
die()  { printf '[fail] %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "未找到 docker"
[ -f "$COMPOSE_FILE" ] || die "缺少 $COMPOSE_FILE"
[ -f "$OVERLAY_FILE" ] || die "缺少 $OVERLAY_FILE"

COMPOSE=(docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" -f "$OVERLAY_FILE")
if [ -f "$ENV_FILE" ]; then
  COMPOSE+=(--env-file "$ENV_FILE")
else
  # down 不需要真实配置值；补齐 compose.release.yml 中的 :?required 变量即可
  export SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET="${SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET:-stop-placeholder}"
  printf '[warn] 未找到 %s，使用默认配置停止\n' "$ENV_FILE" >&2
fi

if [ "$PURGE" = true ]; then
  printf '\n'
  printf '⚠️  警告：--purge 将永久删除 PostgreSQL / Redis / 技能文件数据卷，不可恢复！\n'
  printf '    受影响：skillhub-lan_postgres_data, skillhub-lan_redis_data, skillhub-lan_skillhub_storage\n'
  printf '    建议先备份： docker run --rm -v skillhub-lan_skillhub_storage:/data -v "$PWD":/backup alpine tar czf /backup/skillhub-storage-backup.tgz /data\n'
  printf '\n'
  if [ "$ASSUME_YES" != true ]; then
    printf '确认删除请输入 yes： '
    read -r answer
    [ "$answer" = "yes" ] || die "已取消，数据未删除"
  fi
  DOWN_ARGS=(--volumes)
fi

log "停止 SkillHub 服务栈（project=$PROJECT_NAME）…"
"${COMPOSE[@]}" down "${DOWN_ARGS[@]}" --timeout "$TIMEOUT"

if [ "$PURGE" = true ]; then
  log "已停止并删除数据卷。"
else
  log "已停止。数据卷全部保留，执行 ./run.sh 可原样恢复。"
fi
log "查看剩余容器： docker compose -p $PROJECT_NAME ps -a"
