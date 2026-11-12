#!/usr/bin/env bash
# ============================================================================
# SkillHub 局域网离线部署 · 一键启动
#
#   ./run.sh                          自动探测内网 IP，离线启动
#   ./run.sh --host 192.168.1.20     指定访问地址
#   ./run.sh --web-port 8081         改用非 80 端口
#   ./run.sh --online                允许联网拉取镜像（准备机可省略导出步骤）
#
# 迁移方式：整个 skillhub 目录（可删 .git）拷贝到目标机，先在有网机器上执行
#   deploy/lan/scripts/export-images.sh 导出镜像，再在目标机执行 ./run.sh。
# ============================================================================
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAN_DIR="$ROOT_DIR/deploy/lan"
ENV_FILE="$LAN_DIR/env/lan.env"
EXAMPLE_FILE="$LAN_DIR/env/lan.env.example"
IMAGES_DIR="$LAN_DIR/images"
PLUGINS_DIR="$LAN_DIR/plugins"
COMPOSE_FILE="$ROOT_DIR/compose.release.yml"
OVERLAY_FILE="$LAN_DIR/compose.lan.yml"
PROJECT_NAME="skillhub-lan"

LAN_HOST=""
WEB_PORT_OVERRIDE=""
API_PORT_OVERRIDE=""
VERSION_OVERRIDE=""
ONLINE=false
SKIP_LOAD=false
NO_WAIT=false
CHECK_ONLY=false

usage() {
  cat <<'EOF'
用法: ./run.sh [选项]

  --host <IP|域名>     内网访问地址（默认自动探测本机第一个内网 IPv4）
  --web-port <N>       Web / 插件仓库端口（默认读取 lan.env，初始 80）
  --api-port <N>       后端 API 端口（默认读取 lan.env，初始 8080）
  --version <tag>      覆盖镜像版本 tag（需与离线导出的版本一致）
  --online             允许联网拉取镜像（默认完全离线，只从 images/*.tar 导入）
  --skip-load          跳过镜像导入（目标机已手工 docker load 时使用）
  --no-wait            启动后不等待健康检查
  --check              只生成配置并校验 Compose，不启动容器
  -h, --help           显示本帮助

首次运行会在 deploy/lan/env/lan.env 生成配置（含随机密码），
并写出 deploy/lan/ACCESS.txt 汇总访问地址与管理员凭据。
插件发布、技能发布、首页内容管理统一使用 SkillHub 网站账号登录，无额外口令。
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --host)       [ "$#" -ge 2 ] || { echo "ERROR: --host 缺少参数" >&2; exit 1; }; LAN_HOST="$2"; shift 2 ;;
    --web-port)   [ "$#" -ge 2 ] || { echo "ERROR: --web-port 缺少参数" >&2; exit 1; }; WEB_PORT_OVERRIDE="$2"; shift 2 ;;
    --api-port)   [ "$#" -ge 2 ] || { echo "ERROR: --api-port 缺少参数" >&2; exit 1; }; API_PORT_OVERRIDE="$2"; shift 2 ;;
    --version)    [ "$#" -ge 2 ] || { echo "ERROR: --version 缺少参数" >&2; exit 1; }; VERSION_OVERRIDE="$2"; shift 2 ;;
    --online)     ONLINE=true; shift ;;
    --skip-load)  SKIP_LOAD=true; shift ;;
    --no-wait)    NO_WAIT=true; shift ;;
    --check)      CHECK_ONLY=true; shift ;;
    -h|--help)    usage; exit 0 ;;
    *) echo "ERROR: 未知参数：$1" >&2; usage >&2; exit 1 ;;
  esac
done

log()  { printf '[run ] %s\n' "$*"; }
warn() { printf '[warn] %s\n' "$*" >&2; }
die()  { printf '[fail] %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- 基础工具

read_env() {
  # read_env KEY FILE
  [ -f "$2" ] || return 0
  awk -v key="$1" '
    index($0, key "=") == 1 { sub(/^[^=]*=/, ""); print; exit }
  ' "$2"
}

set_env() {
  # set_env KEY VALUE FILE  —— 保留注释与其它行，替换或追加一个键
  local key="$1" value="$2" file="$3" tmp
  value="$(printf '%s' "$value" | tr -d '\r\n')"
  tmp="$(mktemp "${file}.XXXXXX")" || die "无法创建临时文件"
  awk -v k="$key" -v v="$value" '
    $0 ~ "^" k "=" { print k "=" v; found = 1; next }
    { print }
    END { if (!found) print k "=" v }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

random_hex() {
  local bytes="${1:-24}"
  if command -v openssl >/dev/null 2>&1; then
    local out
    out="$(openssl rand -hex "$bytes" 2>/dev/null)" && [ -n "$out" ] && { printf '%s' "$out"; return 0; }
  fi
  if [ -r /dev/urandom ]; then
    od -An -N"$bytes" -tx1 /dev/urandom 2>/dev/null | tr -d ' \n' && return 0
  fi
  date +%s%N 2>/dev/null | sha256sum | cut -c1-$((bytes * 2))
}

is_ipv4() {
  [[ "$1" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || return 1
  case "$1" in
    127.*|169.254.*|0.*|255.255.255.255) return 1 ;;
  esac
  return 0
}

detect_lan_ip() {
  local ip="" iface os
  os="$(uname -s 2>/dev/null || printf 'unknown')"

  if [ "$os" = "Linux" ]; then
    if command -v hostname >/dev/null 2>&1; then
      ip="$(hostname -I 2>/dev/null | awk '{ for (i = 1; i <= NF; i++)
        if ($i !~ /^127\.|^169\.254\.|^::/) { print $i; exit } }')"
      is_ipv4 "$ip" && { printf '%s' "$ip"; return 0; }
    fi
    if command -v ip >/dev/null 2>&1; then
      ip="$(ip -o -4 addr show scope global 2>/dev/null | awk '{ split($4, a, "/"); print a[1]; exit }')"
      is_ipv4 "$ip" && { printf '%s' "$ip"; return 0; }
    fi
  fi

  if [ "$os" = "Darwin" ] && command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1; do
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      is_ipv4 "$ip" && { printf '%s' "$ip"; return 0; }
    done
  fi

  # Git Bash / MSYS on Windows: `ipconfig` output contains "IPv4" in any locale.
  case "$os" in
    MINGW*|MSYS*|CYGWIN*)
      if command -v ipconfig >/dev/null 2>&1; then
        ip="$(ipconfig 2>/dev/null | tr -d '\r' | awk -F': *' '
          /IPv4/ { gsub(/[[:space:]]/, "", $2)
                   if ($2 ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/) { print $2; exit } }')"
        is_ipv4 "$ip" && { printf '%s' "$ip"; return 0; }
      fi
      ;;
  esac

  warn "未能自动探测内网 IPv4，使用 127.0.0.1；请用 --host <内网IP> 指定"
  printf '127.0.0.1'
}

# ---------------------------------------------------------------- 前置检查

command -v docker >/dev/null 2>&1 || die "未找到 docker，请在目标机安装 Docker Engine / Docker Desktop"
docker compose version >/dev/null 2>&1 || die "未找到 docker compose v2，请升级 Docker"

[ -f "$COMPOSE_FILE" ]  || die "缺少 $COMPOSE_FILE（迁移时请拷贝整个仓库目录）"
[ -f "$OVERLAY_FILE" ]  || die "缺少 $OVERLAY_FILE"
[ -f "$EXAMPLE_FILE" ]  || die "缺少 $EXAMPLE_FILE"
[ -f "$PLUGINS_DIR/index.json" ] || die "插件仓库未初始化，请先执行 deploy/lan/scripts/publish-plugin.sh init"

mkdir -p "$LAN_DIR/env" "$IMAGES_DIR"

# ---------------------------------------------------------------- 生成配置

if [ ! -f "$ENV_FILE" ]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  set_env POSTGRES_PASSWORD "$(random_hex 18)" "$ENV_FILE"
  set_env BOOTSTRAP_ADMIN_PASSWORD "SkillHub@$(random_hex 8)" "$ENV_FILE"
  set_env SKILLHUB_DOWNLOAD_ANON_COOKIE_SECRET "$(random_hex 32)" "$ENV_FILE"
  log "已生成 $ENV_FILE（随机数据库/管理员/下载密钥已写入）"
else
  log "复用现有配置 $ENV_FILE"
fi

# ---------------------------------------------------------------- 站点定制层初始化
# 首页内容管理所需的两个文件必须早于 compose 挂载存在，否则 Docker 会把
# 缺失的挂载源自动创建成目录，导致 nginx 启动失败。

SITE_DIR="$LAN_DIR/site"
SITE_CONTENT_DIR="$SITE_DIR/content"
SITE_CONTENT_FILE="$SITE_CONTENT_DIR/home.json"

mkdir -p "$SITE_CONTENT_DIR"
if [ ! -f "$SITE_CONTENT_FILE" ]; then
  [ -f "$SITE_DIR/home.default.json" ] || die "缺少 $SITE_DIR/home.default.json"
  cp "$SITE_DIR/home.default.json" "$SITE_CONTENT_FILE"
  log "已初始化首页内容 $SITE_CONTENT_FILE"
fi
# nginx worker 需要写入 DAV 目录（Linux 目标机上尤其重要）
chmod -R a+rwX "$SITE_CONTENT_DIR" 2>/dev/null || true

# 写操作鉴权统一走 SkillHub 网站会话：
#   nginx auth_request -> GET /api/cli/v1/auth/whoami -> 200(已登录)/401(匿名)
# 因此不再生成 htpasswd，也不存在第二套站点管理口令。
# 历史版本可能留下过 env/site.htpasswd 与 SITE_ADMIN_PASSWORD，启动时清理掉，
# 避免迁移包里残留明文口令（不影响运行，配置文件不再引用它们）。
rm -f "$LAN_DIR/env/site.htpasswd" 2>/dev/null || true
if grep -q '^SITE_ADMIN_PASSWORD=' "$ENV_FILE" 2>/dev/null; then
  awk '!/^SITE_ADMIN_PASSWORD=/' "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
  log "已清理历史版本的站点管理口令"
fi

# ---------------------------------------------------------------- 插件仓库写入权限
# Web 端发布插件包时，nginx worker 通过 DAV 写 index.json 与 versions/*.tgz。
# 这些路径必须早于 compose 挂载存在，且对容器内的 nginx 用户可写
# （Linux 目标机上尤其关键；client_body_temp_path 也在同一目录内）。
PLUGIN_VERSIONS_DIR="$PLUGINS_DIR/versions"
mkdir -p "$PLUGIN_VERSIONS_DIR/.tmp"
chmod -R a+rwX "$PLUGIN_VERSIONS_DIR" 2>/dev/null || true
if [ -f "$PLUGINS_DIR/index.json" ]; then
  chmod a+rw "$PLUGINS_DIR/index.json" 2>/dev/null || true
fi

# 镜像版本 / 名称：以离线导出清单为准自动对齐，命令行 --version 优先级最高
if [ -f "$IMAGES_DIR/manifest.env" ]; then
  for key in SKILLHUB_VERSION SKILLHUB_SERVER_IMAGE SKILLHUB_WEB_IMAGE \
             SKILLHUB_SCANNER_IMAGE POSTGRES_IMAGE REDIS_IMAGE; do
    manifest_value="$(read_env "$key" "$IMAGES_DIR/manifest.env")"
    if [ -n "$manifest_value" ]; then
      set_env "$key" "$manifest_value" "$ENV_FILE"
    fi
  done
fi
if [ -n "$VERSION_OVERRIDE" ]; then
  set_env SKILLHUB_VERSION "$VERSION_OVERRIDE" "$ENV_FILE"
fi

WEB_PORT="$(read_env WEB_PORT "$ENV_FILE")";       WEB_PORT="${WEB_PORT:-80}"
API_PORT="$(read_env API_PORT "$ENV_FILE")";       API_PORT="${API_PORT:-8080}"
[ -n "$WEB_PORT_OVERRIDE" ] && WEB_PORT="$WEB_PORT_OVERRIDE"
[ -n "$API_PORT_OVERRIDE" ] && API_PORT="$API_PORT_OVERRIDE"

is_valid_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}
is_valid_port "$WEB_PORT" || die "WEB_PORT 无效：$WEB_PORT"
is_valid_port "$API_PORT" || die "API_PORT 无效：$API_PORT"

# A host process (or another Compose project) may already own 8080. The API
# host port is only a direct-access convenience; nginx reaches the server over
# the Compose network, so it is safe to pick the next free API port and record it
# in lan.env/ACCESS.txt.
skillhub_owns_port() {
  docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null \
    | awk -v p=":$1->" '$1 ~ /^skillhub-lan-/ && index($0, p) { found = 1 } END { exit !found }'
}

port_in_use() {
  local port="$1"
  skillhub_owns_port "$port" && return 1
  if command -v ss >/dev/null 2>&1; then
    if ss -ltnH 2>/dev/null | grep -Eq "[:.]${port}[[:space:]]"; then return 0; fi
  fi
  if command -v lsof >/dev/null 2>&1; then
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then return 0; fi
  fi
  if command -v netstat >/dev/null 2>&1; then
    if netstat -an 2>/dev/null | grep -Eq "[:.]${port}[[:space:]].*LISTEN"; then return 0; fi
  fi
  if command -v nc >/dev/null 2>&1 && command -v timeout >/dev/null 2>&1; then
    if timeout 1 nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then return 0; fi
  fi
  return 1
}

if [ "$CHECK_ONLY" != true ] && port_in_use "$API_PORT"; then
  original_api_port="$API_PORT"
  for candidate in $(seq $((API_PORT + 1)) $((API_PORT + 20))); do
    if ! port_in_use "$candidate"; then
      API_PORT="$candidate"
      break
    fi
  done
  if [ "$API_PORT" = "$original_api_port" ]; then
    die "API 端口 $original_api_port 已被占用，且后续 20 个端口也不可用；请用 --api-port <端口> 指定"
  fi
  warn "API 端口 $original_api_port 已被占用，改用 $API_PORT（网页访问不受影响）"
fi

[ -z "$LAN_HOST" ] && LAN_HOST="$(detect_lan_ip)"
case "$LAN_HOST" in
  http://*|https://*) BASE_URL="${LAN_HOST%/}" ;;
  *) BASE_URL="http://$LAN_HOST" ;;
esac
if [ "$WEB_PORT" != "80" ] && [ "$WEB_PORT" != "443" ] && [[ "$BASE_URL" != *":$WEB_PORT" ]]; then
  BASE_URL="$BASE_URL:$WEB_PORT"
fi

set_env SKILLHUB_PUBLIC_BASE_URL "$BASE_URL" "$ENV_FILE"
set_env WEB_PORT "$WEB_PORT" "$ENV_FILE"
set_env API_PORT "$API_PORT" "$ENV_FILE"
set_env SKILLHUB_STORAGE_PROVIDER "local" "$ENV_FILE"
# Keep the scanner setting chosen in lan.env. Disabling it here would silently
# turn off scanning on every restart, even when the scanner image is available.
if [ -z "$(read_env SKILLHUB_SECURITY_SCANNER_ENABLED "$ENV_FILE")" ]; then
  set_env SKILLHUB_SECURITY_SCANNER_ENABLED "false" "$ENV_FILE"
fi

# 把内网地址写进插件清单，门户页与 install 命令据此生成
if [ -f "$LAN_DIR/scripts/publish-plugin.sh" ]; then
  "$LAN_DIR/scripts/publish-plugin.sh" set-url "$BASE_URL" >/dev/null 2>&1 \
    || warn "无法更新插件清单中的 Registry 地址（不影响启动）"
fi

VERSION="$(read_env SKILLHUB_VERSION "$ENV_FILE")"; VERSION="${VERSION:-latest}"
SERVER_IMAGE="$(read_env SKILLHUB_SERVER_IMAGE "$ENV_FILE")";  SERVER_IMAGE="${SERVER_IMAGE:-ghcr.io/iflytek/skillhub-server}"
WEB_IMAGE="$(read_env SKILLHUB_WEB_IMAGE "$ENV_FILE")";        WEB_IMAGE="${WEB_IMAGE:-ghcr.io/iflytek/skillhub-web}"
SCANNER_IMAGE="$(read_env SKILLHUB_SCANNER_IMAGE "$ENV_FILE")"; SCANNER_IMAGE="${SCANNER_IMAGE:-ghcr.io/iflytek/skillhub-scanner}"
POSTGRES_IMAGE="$(read_env POSTGRES_IMAGE "$ENV_FILE")";       POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
REDIS_IMAGE="$(read_env REDIS_IMAGE "$ENV_FILE")";             REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine}"

COMPOSE=(docker compose -p "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$OVERLAY_FILE")

# ---------------------------------------------------------------- 仅校验模式

if [ "$CHECK_ONLY" = true ]; then
  "${COMPOSE[@]}" config -q || die "Compose 配置校验失败，请检查 $ENV_FILE"
  log "配置校验通过（--check）：$BASE_URL，镜像版本 $VERSION，插件仓库 $PLUGINS_DIR"
  log "未启动任何容器。"
  exit 0
fi

# ---------------------------------------------------------------- 镜像准备（离线优先）

REQUIRED_IMAGES=(
  "$SERVER_IMAGE:$VERSION"
  "$WEB_IMAGE:$VERSION"
  "$SCANNER_IMAGE:$VERSION"
  "$POSTGRES_IMAGE"
  "$REDIS_IMAGE"
)

images_present() {
  local ref
  for ref in "${REQUIRED_IMAGES[@]}"; do
    docker image inspect "$ref" >/dev/null 2>&1 || return 1
  done
  return 0
}

if [ "$SKIP_LOAD" = true ]; then
  log "按 --skip-load 跳过镜像导入"
elif images_present; then
  log "5 个运行镜像已在本机，跳过导入"
else
  shopt -s nullglob
  TARBALLS=("$IMAGES_DIR"/*.tar)
  shopt -u nullglob
  if [ "${#TARBALLS[@]}" -gt 0 ]; then
    for tar in "${TARBALLS[@]}"; do
      log "导入离线镜像 $(basename "$tar") …"
      docker load -i "$tar" >/dev/null || die "导入失败：$tar"
    done
    images_present || die "镜像导入后仍缺少运行镜像。请确认 export-images.sh 的版本与 lan.env 的 SKILLHUB_VERSION 一致（当前 $VERSION）"
  elif [ "$ONLINE" = true ]; then
    log "--online：从镜像仓库拉取"
    "${COMPOSE[@]}" pull -q || die "拉取镜像失败（GHCR 若仍为私有请先 docker login ghcr.io；国内可用 export-images.sh --aliyun）"
  else
    die "本机缺少运行镜像且 $IMAGES_DIR 下没有 *.tar。
  请在可联网的机器上执行： deploy/lan/scripts/export-images.sh
  把生成的 images/*.tar 随目录一起拷贝，或在联网环境用 ./run.sh --online 启动。"
  fi
fi

# ---------------------------------------------------------------- 启动

log "校验 Compose 配置 …"
"${COMPOSE[@]}" config -q || die "Compose 配置校验失败，请检查 $ENV_FILE"

log "启动 SkillHub 服务栈（project=$PROJECT_NAME, version=$VERSION）…"
"${COMPOSE[@]}" up -d --remove-orphans

# ---------------------------------------------------------------- 健康检查与输出

if [ "$NO_WAIT" = false ]; then
  log "等待 Web 服务就绪 …"
  ready=false
  for _ in $(seq 1 45); do
    if curl --noproxy '*' -fsS "http://127.0.0.1:$WEB_PORT/nginx-health" >/dev/null 2>&1; then ready=true; break; fi
    sleep 2
  done
  if [ "$ready" = true ]; then
    log "Web 服务已就绪"
  else
    warn "健康检查超时，请执行： ${COMPOSE[*]} logs --tail=100"
  fi
  if ! curl --noproxy '*' -fsS "http://127.0.0.1:$WEB_PORT/dsh-plugins/index.json" >/dev/null 2>&1; then
    warn "插件仓库 /dsh-plugins/ 暂不可访问，请确认 deploy/lan/plugins 已挂载到 web 容器"
  fi
  if ! curl --noproxy '*' -fsS "http://127.0.0.1:$WEB_PORT/site/content/home.json" >/dev/null 2>&1; then
    warn "首页内容 /site/content/home.json 暂不可访问，请检查 site.conf 是否已被 nginx 加载"
  fi
  if ! curl --noproxy '*' -fsS "http://127.0.0.1:$WEB_PORT/site/plugin-market.js" >/dev/null 2>&1; then
    warn "插件市场脚本 /site/plugin-market.js 暂不可访问，首页插件市场面板将无法显示"
  fi
  # 写权限探测端点必须拒绝匿名访问（401）；登录后应为 200。
  # 该端点由 nginx auth_request 向 Java 后端 whoami 复核网站会话。
  auth_code="$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:$WEB_PORT/dsh-plugins/.auth" 2>/dev/null || true)"
  if [ "$auth_code" != "401" ]; then
    warn "写权限探测 /dsh-plugins/.auth 返回 ${auth_code:-无响应}（期望匿名 401），请检查 dsh-plugins.conf / site.conf 是否被加载"
  fi
fi

ADMIN_USER="$(read_env BOOTSTRAP_ADMIN_USERNAME "$ENV_FILE")"; ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="$(read_env BOOTSTRAP_ADMIN_PASSWORD "$ENV_FILE")"

INSTALL_CMD=""
if [ -f "$LAN_DIR/scripts/publish-plugin.sh" ]; then
  INSTALL_CMD="$("$LAN_DIR/scripts/publish-plugin.sh" install --profile web 2>/dev/null \
    | grep '^dsh plugin' | head -1 || true)"
fi
[ -z "$INSTALL_CMD" ] && INSTALL_CMD="dsh plugin --profile web add $BASE_URL/dsh-plugins/index.json --ignore-scripts  # 请打开门户页获取正确命令"

ACCESS_FILE="$LAN_DIR/ACCESS.txt"
{
  echo "SkillHub 局域网部署信息  (生成于 $(date '+%Y-%m-%d %H:%M:%S'))"
  echo "========================================================"
  echo "Web UI        : $BASE_URL"
  echo "后端 API      : http://127.0.0.1:$API_PORT"
  echo "插件市场      : $BASE_URL/#dsh-plugins   (点顶部导航直接展开，可按分类/关键字搜索)"
  echo "插件仓库门户  : $BASE_URL/dsh-plugins/"
  echo "插件安装指引  : $BASE_URL/dsh-plugins/install.md"
  echo "首页内容管理  : $BASE_URL/site/admin.html"
  echo "管理员账号    : $ADMIN_USER"
  echo "管理员密码    : $ADMIN_PASS"
  echo "发布 / 管理登录: 直接用上方网站账号在网页右上角登录（普通有权限账号亦可）。"
  echo "                无第二套口令；登录后可在插件市场发布 DSH 插件或技能、编辑分类标签、"
  echo "                设为推荐、下架、删除，也可进入首页内容管理保存首页。"
  echo "                未登录时插件市场仅提供只读浏览。"
  echo "镜像版本      : $VERSION"
  echo "停止服务      : ./stop.sh        (保留数据)"
  echo "查看日志      : ${COMPOSE[*]} logs -f"
  echo ""
  echo "DSH 插件安装命令："
  echo "  $INSTALL_CMD"
  echo ""
  echo "安装后请在 DSH 插件设置里把技能来源(registryUrl)设为：$BASE_URL"
} > "$ACCESS_FILE"
chmod 600 "$ACCESS_FILE" 2>/dev/null || true

cat <<EOF

============================================================
 SkillHub 局域网部署已启动
============================================================
 Web UI       : $BASE_URL
 插件市场     : $BASE_URL/#dsh-plugins  (顶部导航直达 · 分类搜索 · 网站登录后发布)
 插件仓库门户 : $BASE_URL/dsh-plugins/
 首页内容管理 : $BASE_URL/site/admin.html
 管理员       : $ADMIN_USER（密码见 ACCESS.txt）
 发布 / 管理  : 用上方网站账号登录即可，无独立管理口令；发布页可选 DSH 插件或技能

 DSH 插件安装 :
   $INSTALL_CMD

 安装后在 DSH「插件 → SkillHub 设置 → 技能来源」填：$BASE_URL
------------------------------------------------------------
 访问信息与凭据已写入：$ACCESS_FILE
 停止服务： ./stop.sh     查看日志： ${COMPOSE[*]} logs -f
 请首次登录后修改管理员密码，并确认防火墙已放通 $WEB_PORT 端口。
============================================================
EOF
