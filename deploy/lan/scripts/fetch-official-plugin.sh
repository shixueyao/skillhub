#!/usr/bin/env bash
# 在【可联网的机器】上抓取官方 SkillHub DSH 插件并发布到内网仓库。
# 迁移到离线环境之前执行；插件 tarball 会随 deploy/lan/plugins 一起拷贝。
#
#   ./fetch-official-plugin.sh            # 默认 0.6.2
#   ./fetch-official-plugin.sh 0.6.1      # 指定版本（可用于保留旧版以便回滚）
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${1:-0.6.2}"
PACKAGE="@astron-team/skillhub-dsh"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: 需要 Node.js / npm（仅在联网准备机上使用，离线目标机不需要）" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "==> 查询 npm：$PACKAGE@$VERSION"
npm view "$PACKAGE@$VERSION" version >/dev/null

echo "==> 下载 tarball（--ignore-scripts，不执行包内脚本）"
npm pack "$PACKAGE@$VERSION" --ignore-scripts --silent --pack-destination "$TMP_DIR"

TARBALL="$(find "$TMP_DIR" -maxdepth 1 -name '*.tgz' -print -quit)"
if [ -z "$TARBALL" ]; then
  echo "ERROR: npm pack 未生成 tarball" >&2
  exit 1
fi

echo "==> 发布到内网插件仓库"
"$HERE/publish-plugin.sh" publish "$TARBALL" \
  --notes "官方 npm 发行版 $VERSION（离线内网分发）" \
  --compat "DSH 0.2.0-rc.2 / 0.2.1-rc.2 / 0.2.1-rc.5；Host Node >=24.2.0 <25" \
  --replace

echo "==> 完成。执行 ./publish-plugin.sh list 查看仓库内容。"
