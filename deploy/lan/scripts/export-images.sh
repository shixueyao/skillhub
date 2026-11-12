#!/usr/bin/env bash
# ============================================================================
# 在【可联网的机器】上导出 SkillHub 运行镜像，供完全离线的局域网目标机使用。
#
#   ./export-images.sh                      导出 lan.env 中指定的版本
#   ./export-images.sh --version v0.2.25   固定版本导出（推荐，便于回滚）
#   ./export-images.sh --registry reg.lan/skillhub   使用内网镜像仓库前缀
#   ./export-images.sh --aliyun          国内加速：使用官方阿里云镜像通道（推荐）
#
# 产物： deploy/lan/images/*.tar + manifest.txt（校验值）+ manifest.env（版本对齐）
# 之后把整个 skillhub 目录（可删 .git）拷贝到目标机执行 ./run.sh 即可。
# ============================================================================
set -Eeuo pipefail

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAN_DIR="$(cd "$SCRIPTS_DIR/.." && pwd)"
IMAGES_DIR="${LAN_DIR}/images"
ENV_FILE="${LAN_DIR}/env/lan.env"
EXAMPLE_FILE="${LAN_DIR}/env/lan.env.example"

VERSION_OVERRIDE=""
REGISTRY_PREFIX=""
OUTPUT_DIR="$IMAGES_DIR"

usage() {
  cat <<'EOF'
用法: ./export-images.sh [选项]

  --version <tag>              镜像版本 tag（默认取 lan.env，初始 latest）
  --registry <prefix>          替换全部 5 个镜像的前缀，如 reg.lan/skillhub
  --aliyun                     使用官方阿里云镜像通道（国内加速，等价于指定官方前缀）
  --output <dir>               导出目录（默认 deploy/lan/images）
  -h, --help                   显示本帮助

需要 Docker 且可访问 ghcr.io（若 GHCR 包为私有请先 docker login ghcr.io）。
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --version)  [ "$#" -ge 2 ] || { echo "ERROR: --version 缺少参数" >&2; exit 1; }; VERSION_OVERRIDE="$2"; shift 2 ;;
    --registry) [ "$#" -ge 2 ] || { echo "ERROR: --registry 缺少参数" >&2; exit 1; }; REGISTRY_PREFIX="${2%/}"; shift 2 ;;
    --aliyun)   REGISTRY_PREFIX="crpi-ptu2rqimrigtq0qx.cn-hangzhou.personal.cr.aliyuncs.com/skill_hub"; shift ;;
    --output)   [ "$#" -ge 2 ] || { echo "ERROR: --output 缺少参数" >&2; exit 1; }; OUTPUT_DIR="$2"; shift 2 ;;
    -h|--help)  usage; exit 0 ;;
    *) echo "ERROR: 未知参数：$1" >&2; usage >&2; exit 1 ;;
  esac
done

log()  { printf '[export] %s\n' "$*"; }
warn() { printf '[warn ] %s\n' "$*" >&2; }
die()  { printf '[fail ] %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "未找到 docker"

read_env() {
  [ -f "$2" ] || return 0
  awk -v key="$1" 'index($0, key "=") == 1 { sub(/^[^=]*=/, ""); print; exit }' "$2"
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    openssl dgst -sha256 "$1" | awk '{ print $NF }'
  fi
}

SOURCE_ENV="$ENV_FILE"
[ -f "$SOURCE_ENV" ] || SOURCE_ENV="$EXAMPLE_FILE"
[ -f "$SOURCE_ENV" ] || die "找不到 $EXAMPLE_FILE"

VERSION="${VERSION_OVERRIDE:-$(read_env SKILLHUB_VERSION "$SOURCE_ENV")}"
VERSION="${VERSION:-latest}"

if [ -n "$REGISTRY_PREFIX" ]; then
  # 与官方 scripts/runtime.sh --aliyun / --mirror-registry 的命名保持一致
  SERVER_IMAGE="$REGISTRY_PREFIX/skillhub-server"
  WEB_IMAGE="$REGISTRY_PREFIX/skillhub-web"
  SCANNER_IMAGE="$REGISTRY_PREFIX/skillhub-scanner"
  POSTGRES_IMAGE="$REGISTRY_PREFIX/postgres:16-alpine"
  REDIS_IMAGE="$REGISTRY_PREFIX/redis:7-alpine"
else
  SERVER_IMAGE="$(read_env SKILLHUB_SERVER_IMAGE "$SOURCE_ENV")";  SERVER_IMAGE="${SERVER_IMAGE:-ghcr.io/iflytek/skillhub-server}"
  WEB_IMAGE="$(read_env SKILLHUB_WEB_IMAGE "$SOURCE_ENV")";        WEB_IMAGE="${WEB_IMAGE:-ghcr.io/iflytek/skillhub-web}"
  SCANNER_IMAGE="$(read_env SKILLHUB_SCANNER_IMAGE "$SOURCE_ENV")"; SCANNER_IMAGE="${SCANNER_IMAGE:-ghcr.io/iflytek/skillhub-scanner}"
  POSTGRES_IMAGE="$(read_env POSTGRES_IMAGE "$SOURCE_ENV")";        POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
  REDIS_IMAGE="$(read_env REDIS_IMAGE "$SOURCE_ENV")";              REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine}"
fi

REFS=(
  "$SERVER_IMAGE:$VERSION"
  "$WEB_IMAGE:$VERSION"
  "$SCANNER_IMAGE:$VERSION"
  "$POSTGRES_IMAGE"
  "$REDIS_IMAGE"
)

mkdir -p "$OUTPUT_DIR"
log "目标目录：$OUTPUT_DIR"
log "镜像版本：$VERSION"
log "共 ${#REFS[@]} 个镜像，首次导出可能需要数 GB 磁盘空间与较长时间。"

for ref in "${REFS[@]}"; do
  if docker image inspect "$ref" >/dev/null 2>&1; then
    log "本机已有 $ref（跳过 pull；需要最新版请先 docker pull）"
  else
    log "拉取 $ref …（-q 静默进度）"
    docker pull -q "$ref" || die "拉取失败：$ref。GHCR 包若为私有请先 docker login ghcr.io；国内可加 --aliyun"
    log "已就绪 $ref"
  fi
done

MANIFEST="$OUTPUT_DIR/manifest.txt"
: > "$MANIFEST"
printf '# filename  bytes  sha256  image-ref\n' >> "$MANIFEST"

for ref in "${REFS[@]}"; do
  filename="$(printf '%s' "$ref" | tr '/:' '__').tar"
  target="$OUTPUT_DIR/$filename"
  log "导出 $filename …"
  docker save -o "$target" "$ref" || die "导出失败：$ref"
  size="$(wc -c < "$target" | tr -d '[:space:]')"
  sum="$(hash_file "$target")"
  printf '%s  %s  %s  %s\n' "$filename" "$size" "$sum" "$ref" >> "$MANIFEST"
done

# run.sh 读取 manifest.env，把 lan.env 的版本/镜像名与离线包自动对齐
cat > "$OUTPUT_DIR/manifest.env" <<EOF
SKILLHUB_VERSION=$VERSION
SKILLHUB_SERVER_IMAGE=$SERVER_IMAGE
SKILLHUB_WEB_IMAGE=$WEB_IMAGE
SKILLHUB_SCANNER_IMAGE=$SCANNER_IMAGE
POSTGRES_IMAGE=$POSTGRES_IMAGE
REDIS_IMAGE=$REDIS_IMAGE
EXPORTED_AT=$(date '+%Y-%m-%dT%H:%M:%S%z')
EOF

total="$(du -sh "$OUTPUT_DIR" 2>/dev/null | awk '{ print $1 }')"
cat <<EOF

============================================================
 离线镜像包已生成：$OUTPUT_DIR
 版本：$VERSION     总计：${total:-未知}
============================================================
 迁移步骤：
   1. 把整个 skillhub 目录（可删除 .git）拷贝到内网目标机
   2. 目标机安装 Docker + Docker Compose v2（无需联网）
   3. cd skillhub && ./run.sh
 校验清单：$MANIFEST
EOF
