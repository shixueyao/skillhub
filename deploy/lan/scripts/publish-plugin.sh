#!/usr/bin/env bash
# SkillHub LAN - DSH plugin repository CLI (thin wrapper around plugin-repo.py)
#
#   ./publish-plugin.sh init
#   ./publish-plugin.sh publish /path/to/my-plugin-1.0.0.tgz --notes "修复 xxx"
#   ./publish-plugin.sh list
#   ./publish-plugin.sh verify
#   ./publish-plugin.sh activate @astron-team/skillhub-dsh 0.6.1
#   ./publish-plugin.sh install
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHON=""
for candidate in python3 python py; do
  if command -v "$candidate" >/dev/null 2>&1 \
      && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "ERROR: 需要 Python 3.8+（plugin-repo.py 仅用标准库，无需安装依赖）" >&2
  exit 1
fi

# Git Bash / MSYS on Windows: a Windows Python cannot resolve /tmp/... paths.
# Convert existing absolute POSIX paths to native Windows paths.
if command -v cygpath >/dev/null 2>&1; then
  CONVERTED=()
  for arg in "$@"; do
    case "$arg" in
      /*)
        if [ -e "$arg" ]; then
          CONVERTED+=("$(cygpath -w "$arg")")
        else
          CONVERTED+=("$arg")
        fi
        ;;
      *)
        CONVERTED+=("$arg")
        ;;
    esac
  done
  set -- "${CONVERTED[@]}"
fi

exec "$PYTHON" "$HERE/plugin-repo.py" "$@"
