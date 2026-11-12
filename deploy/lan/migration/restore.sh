#!/usr/bin/env bash
# ============================================================================
# SkillHub 迁移包恢复脚本
#   在目标局域网机器上，从 migration/backup 恢复 PostgreSQL 与对象存储数据。
#
#   用法：
#     ./deploy/lan/migration/restore.sh --host 192.168.1.20
#     ./deploy/lan/migration/restore.sh --host 192.168.1.20 --force
#
#   目标机需要 Docker + Docker Compose v2；镜像将优先从 deploy/lan/images 导入。
# ============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$LAN_DIR/../.." && pwd)"
BACKUP_DIR="$SCRIPT_DIR/backup"
IMAGES_DIR="$LAN_DIR/images"
ENV_FILE="$LAN_DIR/env/lan.env"
COMPOSE_FILE="$ROOT_DIR/compose.release.yml"
OVERLAY_FILE="$LAN_DIR/compose.lan.yml"
PROJECT_NAME="skillhub-lan"
HOST=""
FORCE=false

usage() {
  cat <<'EOF'
用法: ./deploy/lan/migration/restore.sh --host <IP|域名> [--force]

  --host <IP|域名>  目标局域网访问地址；写入 SKILLHUB_PUBLIC_BASE_URL 与插件清单
  --force           目标已有对象存储数据时，覆盖恢复
  -h, --help        显示帮助

恢复完成后执行: ./run.sh --host <IP|域名>
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)  [ "$#" -ge 2 ] || { echo "ERROR: --host 缺少参数" >&2; exit 1; }; HOST="$2"; shift 2 ;;
    --force) FORCE=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: 未知参数：$1" >&2; usage >&2; exit 1 ;;
  esac
done

[ -n "$HOST" ] || { echo "ERROR: 必须提供 --host <IP|域名>" >&2; exit 1; }
[ -f "$BACKUP_DIR/postgres.dump" ] || { echo "ERROR: 缺少 $BACKUP_DIR/postgres.dump" >&2; exit 1; }
[ -f "$BACKUP_DIR/storage.tar.gz" ] || { echo "ERROR: 缺少 $BACKUP_DIR/storage.tar.gz" >&2; exit 1; }
[ -f "$COMPOSE_FILE" ] || { echo "ERROR: 缺少 $COMPOSE_FILE" >&2; exit 1; }
[ -f "$OVERLAY_FILE" ] || { echo "ERROR: 缺少 $OVERLAY_FILE" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || { echo "ERROR: 未找到 docker" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: 需要 Docker Compose v2" >&2; exit 1; }

read_env() {
  [ -f "$2" ] || return 0
  awk -v key="$1" 'index($0, key "=") == 1 { sub(/^[^=]*=/, ""); print; exit }' "$2"
}

log() { printf '[restore] %s\n' "$*"; }
die() { printf '[restore][fail] %s\n' "$*" >&2; exit 1; }

# 目标机可能尚未登录镜像仓库；先导入离线镜像。
if [ -d "$IMAGES_DIR" ]; then
  shopt -s nullglob
  for tar in "$IMAGES_DIR"/*.tar; do
    log "导入镜像 $(basename "$tar")"
    docker load -i "$tar" >/dev/null || die "镜像导入失败：$tar"
  done
  shopt -u nullglob
fi

if [ ! -f "$ENV_FILE" ]; then
  cp "$LAN_DIR/env/lan.env.example" "$ENV_FILE"
  log "已生成 $ENV_FILE；请确认数据库密码等配置"
fi

# 恢复前先统一写入目标地址，后续 run.sh 会复用该配置。
awk -v v="http://$HOST" '
  BEGIN { found = 0 }
  $0 ~ "^SKILLHUB_PUBLIC_BASE_URL=" { print "SKILLHUB_PUBLIC_BASE_URL=" v; found = 1; next }
  { print }
  END { if (!found) print "SKILLHUB_PUBLIC_BASE_URL=" v }
' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"

COMPOSE=(docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$OVERLAY_FILE")
POSTGRES_IMAGE="$(read_env POSTGRES_IMAGE "$LAN_DIR/images/manifest.env")"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
STORAGE_VOLUME="${PROJECT_NAME}_skillhub_storage"

log "启动 PostgreSQL 用于恢复"
"${COMPOSE[@]}" up -d postgres

for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "${PROJECT_NAME}-postgres-1" 2>/dev/null || true)"
  [ "$status" = "healthy" ] && break
  sleep 2
done
[ "${status:-}" = "healthy" ] || die "PostgreSQL 未在预期时间内就绪"

PG_USER="$(read_env POSTGRES_USER "$ENV_FILE")"; PG_USER="${PG_USER:-skillhub}"
PG_DB="$(read_env POSTGRES_DB "$ENV_FILE")"; PG_DB="${PG_DB:-skillhub}"

log "清空并恢复 PostgreSQL"
docker exec -e PGPASSWORD="$(read_env POSTGRES_PASSWORD "$ENV_FILE")" "${PROJECT_NAME}-postgres-1" \
  psql -U "$PG_USER" -d "$PG_DB" \
  -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'

docker exec -i "${PROJECT_NAME}-postgres-1" pg_restore -U "$PG_USER" -d "$PG_DB" \
  --no-owner --no-privileges < "$BACKUP_DIR/postgres.dump"

log "恢复对象存储数据"
docker volume create "$STORAGE_VOLUME" >/dev/null
if docker run --rm -v "$STORAGE_VOLUME:/data" "$POSTGRES_IMAGE" sh -c '[ -n "$(find /data -mindepth 1 -print -quit 2>/dev/null)" ]' >/dev/null 2>&1; then
  [ "$FORCE" = true ] || die "对象存储卷 $STORAGE_VOLUME 已有数据；确认覆盖请加 --force"
  docker run --rm -v "$STORAGE_VOLUME:/data" "$POSTGRES_IMAGE" sh -c 'find /data -mindepth 1 -delete'
fi
docker run --rm -v "$STORAGE_VOLUME:/data" -v "$BACKUP_DIR:/backup:ro" "$POSTGRES_IMAGE" \
  tar xzf /backup/storage.tar.gz -C /data

log "恢复完成。下一步："
log "  ./run.sh --host $HOST"
