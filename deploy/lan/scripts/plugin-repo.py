#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SkillHub LAN - DSH plugin repository manager.

Zero third-party dependencies (Python 3.8+ standard library only).

The repository is a plain directory served by the SkillHub web container at
/dsh-plugins/.  index.json is the single source of truth for versions,
checksums, compatibility metadata and the active (recommended) release.

Commands:
  init                          Create an empty repository
  publish FILE [options]         Import a DSH plugin .tgz as a new version
                                 (--category / --tags set searchable metadata)
  list [--category C] [-q WORD]  List or filter packages and versions
  verify                         Re-check every tarball against its sha256/size
  activate PKG VERSION           Point the recommended version at VERSION
  yank PKG VERSION               Mark a version as withdrawn (files kept)
  unyank PKG VERSION             Undo yank
  remove PKG VERSION             Delete a version and its tarball
  install PKG [VERSION]           Print the dsh plugin add command
  set-url URL                    Record the LAN SkillHub base URL in index.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
INDEX_NAME = "index.json"
VERSIONS_DIRNAME = "versions"
ENV_RELATIVE_PATH = Path("env/lan.env")

# 可选分类：Web 端下拉的候选项，插件实际使用的 category 会自动并入。
# 未知字段对旧版 CLI 完全透明，因此无需提升 schemaVersion。
DEFAULT_CATEGORIES = ["官方插件", "技能管理", "开发工具", "集成扩展", "其他"]


# --------------------------------------------------------------------------- helpers

def default_repo() -> Path:
    return Path(__file__).resolve().parent.parent / "plugins"


def repo_path(args) -> Path:
    return Path(args.repo).resolve() if getattr(args, "repo", None) else default_repo()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def new_index() -> dict:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "name": "SkillHub LAN DSH Plugin Repository",
        "description": "内网 DSH 插件分发仓库：版本化发布、校验与回滚",
        "updatedAt": now_iso(),
        "skillhubBaseUrl": "",
        "recommended": "",
        "categories": list(DEFAULT_CATEGORIES),
        "plugins": {},
    }


def load_index(repo: Path) -> dict:
    path = repo / INDEX_NAME
    if not path.is_file():
        raise SystemExit("ERROR: 仓库未初始化：缺少 %s（请先执行 init）" % path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise SystemExit("ERROR: 无法读取 %s: %s" % (path, exc))
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise SystemExit("ERROR: index.json schemaVersion 不匹配（期望 %d）" % SCHEMA_VERSION)
    data.setdefault("plugins", {})
    return data


def save_index(repo: Path, index: dict) -> None:
    repo.mkdir(parents=True, exist_ok=True)
    index["updatedAt"] = now_iso()
    target = repo / INDEX_NAME
    fd, tmp = tempfile.mkstemp(prefix=".index-", suffix=".json", dir=str(repo))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(index, handle, ensure_ascii=False, indent=2, sort_keys=False)
            handle.write("\n")
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_slug(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", name.replace("/", "-")).strip("-") or "plugin"


def version_key(version: str):
    """Semver-ish sort key: releases sort after their own pre-releases."""
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)(?:[-.](.+))?$", version)
    if not match:
        return (0, 0, 0, 0, version)
    pre = match.group(4) or ""
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)),
            1 if not pre else 0, pre)


def read_lan_base_url() -> str:
    """Read SKILLHUB_PUBLIC_BASE_URL from deploy/lan/env/lan.env when present."""
    env_file = (default_repo().parent / ENV_RELATIVE_PATH).resolve()
    if env_file.is_file():
        for raw in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if line.startswith("SKILLHUB_PUBLIC_BASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")
    return ""


def base_url(index: dict, override: str = "") -> str:
    return (override or index.get("skillhubBaseUrl") or read_lan_base_url()
            or "http://<内网地址>").rstrip("/")


def tarball_url(index: dict, rel_file: str, override: str = "") -> str:
    return "%s/dsh-plugins/%s" % (base_url(index, override), rel_file.lstrip("/"))


def read_manifest(tarball: Path) -> dict:
    if not tarball.is_file():
        raise SystemExit("ERROR: 找不到插件包：%s" % tarball)
    if not tarfile.is_tarfile(str(tarball)):
        raise SystemExit("ERROR: 不是有效的 tar/tgz 包：%s" % tarball)
    with tarfile.open(str(tarball), "r:*") as archive:
        candidates = [m for m in archive.getmembers()
                      if m.isfile() and m.name.endswith("/package.json")
                      and m.name.count("/") <= 2]
        if not candidates:
            raise SystemExit("ERROR: 包内找不到 package/package.json，不是 npm tarball")
        member = sorted(candidates, key=lambda m: len(m.name))[0]
        handle = archive.extractfile(member)
        if handle is None:
            raise SystemExit("ERROR: 无法读取包内 package.json")
        try:
            manifest = json.loads(handle.read().decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise SystemExit("ERROR: 包内 package.json 解析失败：%s" % exc)
    return manifest


def find_version(pkg: dict, version: str) -> dict:
    for entry in pkg.get("versions", []):
        if entry.get("version") == version:
            return entry
    raise SystemExit("ERROR: 版本不存在：%s" % version)


def get_package(index: dict, name: str) -> dict:
    if name not in index["plugins"]:
        available = ", ".join(index["plugins"]) or "(空)"
        raise SystemExit("ERROR: 插件包不存在：%s；可用：%s" % (name, available))
    return index["plugins"][name]


def print_table(index: dict, category: str = "", query: str = "") -> None:
    plugins = index["plugins"]
    if not plugins:
        print("仓库为空。用 publish-plugin.sh publish <file.tgz> 发布第一个版本。")
        return
    q = (query or "").strip().lower()
    names = []
    for name, pkg in plugins.items():
        cat = pkg.get("category") or ""
        if category == "__none__" and cat:
            continue
        if category and category != "__none__" and cat != category:
            continue
        if q:
            hay = " ".join([
                name, str(pkg.get("description") or ""), cat,
                " ".join(str(t) for t in (pkg.get("tags") or [])),
                " ".join(str(v.get("version") or "") for v in pkg.get("versions", [])),
                " ".join(str(v.get("notes") or "") for v in pkg.get("versions", [])),
            ]).lower()
            if q not in hay:
                continue
        names.append(name)
    if not names:
        print("没有匹配的插件（分类 %s / 关键字 %s）" % (category or "全部", query or "-"))
        return
    print("内网 DSH 插件仓库  (更新时间 %s)" % index.get("updatedAt", "-"))
    print("SkillHub 地址: %s" % (index.get("skillhubBaseUrl") or read_lan_base_url() or "未设置"))
    print("筛选: 分类=%s  关键字=%s  命中 %d/%d 个插件" %
          (category or "全部", query or "-", len(names), len(plugins)))
    print("")
    for name in names:
        pkg = plugins[name]
        active = pkg.get("latest") or "-"
        meta = "  [分类 %s" % (pkg.get("category") or "其他")
        if pkg.get("tags"):
            meta += " · 标签 %s" % ", ".join(str(t) for t in pkg["tags"])
        meta += "]"
        print("  %s   [推荐 %s]%s" % (name, active, meta))
        print("    %s" % (pkg.get("description") or "-"))
        for entry in sorted(pkg.get("versions", []), key=lambda e: version_key(e["version"])):
            flags = []
            if entry["version"] == active:
                flags.append("推荐")
            if entry.get("yanked"):
                flags.append("已撤回")
            tag = " (%s)" % ", ".join(flags) if flags else ""
            print("      %-12s %8s B  %s%s" %
                  (entry["version"], format(entry.get("size", 0), ","),
                   entry.get("file", "-"), tag))
        print("")


# --------------------------------------------------------------------------- commands

def cmd_init(args) -> None:
    repo = repo_path(args)
    (repo / VERSIONS_DIRNAME).mkdir(parents=True, exist_ok=True)
    if (repo / INDEX_NAME).is_file() and not args.force:
        print("仓库已存在：%s（使用 --force 覆盖）" % repo)
        return
    save_index(repo, new_index())
    print("已初始化插件仓库：%s" % repo)


def cmd_publish(args) -> None:
    repo = repo_path(args)
    index = load_index(repo)
    source = Path(args.file).resolve()
    manifest = read_manifest(source)

    name = args.package or manifest.get("name")
    version = args.version or manifest.get("version")
    if not name or not version:
        raise SystemExit("ERROR: 包内缺少 name 或 version 字段")
    if not re.match(r"^[A-Za-z0-9@._/-]+$", name):
        raise SystemExit("ERROR: 非法包名：%s" % name)
    if not re.match(r"^\d+\.\d+\.\d+", version):
        raise SystemExit("ERROR: 非法版本号（需要 x.y.z）：%s" % version)
    if "dsh" not in manifest and not args.force:
        raise SystemExit("ERROR: package.json 中没有 dsh 字段，看起来不是 DSH 插件。"
                         "确认无误可加 --force")

    versions_dir = repo / VERSIONS_DIRNAME
    versions_dir.mkdir(parents=True, exist_ok=True)
    filename = "%s-%s.tgz" % (safe_slug(name), re.sub(r"[^A-Za-z0-9._-]", "-", version))
    destination = versions_dir / filename

    pkg = index["plugins"].setdefault(name, {
        "name": name,
        "description": manifest.get("description") or "",
        "license": manifest.get("license") or "",
        "homepage": manifest.get("homepage") or "",
        "category": "其他",
        "tags": [],
        "latest": "",
        "versions": [],
    })
    existing = next((v for v in pkg["versions"] if v["version"] == version), None)
    if existing and not args.replace:
        raise SystemExit("ERROR: 版本 %s@%s 已存在，使用 --replace 覆盖" % (name, version))
    if destination.exists() and not args.replace:
        raise SystemExit("ERROR: 目标文件已存在：%s（使用 --replace 覆盖）" % destination)

    shutil.copyfile(str(source), str(destination))
    entry = {
        "version": version,
        "file": "%s/%s" % (VERSIONS_DIRNAME, filename),
        "sha256": sha256_file(destination),
        "size": destination.stat().st_size,
        "publishedAt": now_iso(),
        "notes": args.notes or "",
        "yanked": False,
        "package": {
            "name": manifest.get("name"),
            "version": manifest.get("version"),
            "license": manifest.get("license"),
            "engines": manifest.get("engines", {}),
            "peerDependencies": manifest.get("peerDependencies", {}),
            "dsh": sorted(manifest["dsh"].keys()) if isinstance(manifest.get("dsh"), dict) else [],
        },
    }
    if args.compat:
        entry["compatNote"] = args.compat

    if existing:
        pkg["versions"].remove(existing)
    pkg["versions"].append(entry)
    pkg["versions"].sort(key=lambda e: version_key(e["version"]))
    pkg["description"] = args.description or pkg.get("description") or manifest.get("description", "")
    pkg["license"] = pkg.get("license") or manifest.get("license", "")
    if args.category:
        pkg["category"] = args.category.strip()
    if args.tags:
        pkg["tags"] = [tag.strip() for tag in args.tags.split(",") if tag.strip()]
    pkg.setdefault("category", "其他")
    pkg.setdefault("tags", [])

    if args.set_latest or not pkg.get("latest") or version_key(version) >= version_key(pkg["latest"]):
        pkg["latest"] = version
    if not index.get("recommended") or args.set_latest:
        index["recommended"] = name
    if args.url:
        index["skillhubBaseUrl"] = args.url.rstrip("/")

    # 自定义分类自动并入候选项，前端下拉无需手工维护
    categories = index.setdefault("categories", list(DEFAULT_CATEGORIES))
    if pkg.get("category") and pkg["category"] not in categories:
        categories.append(pkg["category"])

    save_index(repo, index)
    print("已发布 %s@%s" % (name, version))
    print("  文件   : %s" % entry["file"])
    print("  SHA256 : %s" % entry["sha256"])
    print("  大小   : %s bytes" % format(entry["size"], ","))
    print("  推荐版 : %s" % pkg["latest"])
    print("  分类   : %s  标签: %s" % (pkg.get("category") or "其他",
                                     ", ".join(pkg.get("tags") or []) or "-"))
    print("")
    print("内网安装命令：")
    print("  dsh plugin --profile <your-profile> add %s --ignore-scripts" %
          tarball_url(index, entry["file"], args.url))


def cmd_list(args) -> None:
    index = load_index(repo_path(args))
    if args.json:
        print(json.dumps(index, ensure_ascii=False, indent=2))
    else:
        print_table(index, getattr(args, "category", "") or "",
                    getattr(args, "query", "") or "")


def cmd_verify(args) -> None:
    repo = repo_path(args)
    index = load_index(repo)
    failures = 0
    count = 0
    for name, pkg in index["plugins"].items():
        for entry in pkg.get("versions", []):
            count += 1
            path = repo / entry["file"]
            if not path.is_file():
                print("  MISSING  %s@%s  %s" % (name, entry["version"], entry["file"]))
                failures += 1
                continue
            actual = sha256_file(path)
            size = path.stat().st_size
            if actual != entry.get("sha256") or size != entry.get("size"):
                print("  CORRUPT  %s@%s  sha256/size 不匹配" % (name, entry["version"]))
                failures += 1
            else:
                print("  OK       %s@%s" % (name, entry["version"]))
    print("\n共 %d 个版本，%d 个异常。" % (count, failures))
    if failures:
        raise SystemExit(1)


def cmd_activate(args) -> None:
    repo = repo_path(args)
    index = load_index(repo)
    pkg = get_package(index, args.package)
    entry = find_version(pkg, args.version)
    if entry.get("yanked") and not args.force:
        raise SystemExit("ERROR: 该版本已撤回；先执行 unyank，或加 --force")
    pkg["latest"] = args.version
    index["recommended"] = args.package
    save_index(repo, index)
    print("已将 %s 的推荐版本切换为 %s" % (args.package, args.version))
    print("  dsh plugin --profile <your-profile> add %s --ignore-scripts" %
          tarball_url(index, entry["file"]))


def cmd_yank(args) -> None:
    repo = repo_path(args)
    index = load_index(repo)
    pkg = get_package(index, args.package)
    entry = find_version(pkg, args.version)
    entry["yanked"] = not args.unyank
    if entry["yanked"] and pkg.get("latest") == args.version:
        candidates = [v["version"] for v in pkg["versions"]
                      if not v.get("yanked") and v["version"] != args.version]
        pkg["latest"] = max(candidates, key=version_key) if candidates else ""
    save_index(repo, index)
    print("已%s %s@%s；推荐版本：%s" %
          ("取消撤回" if args.unyank else "撤回", args.package, args.version,
           pkg.get("latest") or "(无)"))


def cmd_remove(args) -> None:
    repo = repo_path(args)
    index = load_index(repo)
    pkg = get_package(index, args.package)
    entry = find_version(pkg, args.version)
    path = repo / entry["file"]
    if path.is_file():
        path.unlink()
    pkg["versions"].remove(entry)
    remaining = [v["version"] for v in pkg["versions"] if not v.get("yanked")]
    if pkg.get("latest") == args.version:
        pkg["latest"] = max(remaining, key=version_key) if remaining else ""
    if not pkg["versions"]:
        del index["plugins"][args.package]
        if index.get("recommended") == args.package:
            index["recommended"] = next(iter(index["plugins"]), "")
    save_index(repo, index)
    print("已删除 %s@%s" % (args.package, args.version))


def cmd_install(args) -> None:
    index = load_index(repo_path(args))
    name = args.package or index.get("recommended") or next(iter(index["plugins"]), "")
    if not name:
        raise SystemExit("ERROR: 仓库为空")
    pkg = get_package(index, name)
    version = args.version or pkg.get("latest")
    if not version:
        raise SystemExit("ERROR: 没有可用的推荐版本，请先 activate")
    entry = find_version(pkg, version)
    root = base_url(index, args.url)
    print("# %s@%s" % (name, version))
    print("# SHA256: %s" % entry["sha256"])
    print("dsh plugin --profile %s add %s --ignore-scripts" %
          (args.profile, tarball_url(index, entry["file"], args.url)))
    print("")
    print("# 安装后在 DSH「插件 → %s → SkillHub 设置 → 技能来源」填写：" % name)
    print("# %s" % root)


def cmd_set_url(args) -> None:
    repo = repo_path(args)
    index = load_index(repo)
    url = args.url.rstrip("/")
    if not re.match(r"^https?://", url):
        raise SystemExit("ERROR: 地址需以 http:// 或 https:// 开头")
    index["skillhubBaseUrl"] = url
    save_index(repo, index)
    print("已记录 SkillHub 内网地址：%s" % url)


# --------------------------------------------------------------------------- cli

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="SkillHub 局域网 DSH 插件仓库管理（零依赖）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__)
    parser.add_argument("--repo", help="插件仓库目录（默认 deploy/lan/plugins）")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init", help="初始化空仓库")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_init)

    p = sub.add_parser("publish", help="发布一个 DSH 插件 .tgz")
    p.add_argument("file")
    p.add_argument("--package", help="覆盖包名（默认读 package.json 的 name）")
    p.add_argument("--version", help="覆盖版本号（默认读 package.json 的 version）")
    p.add_argument("--notes", help="版本说明 / 变更记录")
    p.add_argument("--compat", help="兼容性备注（如 DSH rc 版本）")
    p.add_argument("--description", help="覆盖插件简介")
    p.add_argument("--category", help="插件分类，如「技能管理」；自定义值会自动并入候选列表")
    p.add_argument("--tags", help="标签，逗号分隔，如「官方,DSH,离线」")
    p.add_argument("--url", help="同时写入 SkillHub 内网地址")
    p.add_argument("--set-latest", action="store_true", help="强制设为推荐版本")
    p.add_argument("--replace", action="store_true", help="覆盖已存在的同版本")
    p.add_argument("--force", action="store_true", help="跳过 DSH 插件形态校验")
    p.set_defaults(func=cmd_publish)

    p = sub.add_parser("list", help="列出插件与版本")
    p.add_argument("--json", action="store_true")
    p.add_argument("--category", help="只列出该分类（__none__ 表示未分类）")
    p.add_argument("--query", "-q", help="按名称/描述/分类/标签/版本/说明搜索")
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("verify", help="校验所有 tarball 的 sha256 与大小")
    p.set_defaults(func=cmd_verify)

    p = sub.add_parser("activate", help="切换推荐版本（回滚）")
    p.add_argument("package")
    p.add_argument("version")
    p.add_argument("--force", action="store_true")
    p.set_defaults(func=cmd_activate)

    p = sub.add_parser("yank", help="撤回某版本（保留文件）")
    p.add_argument("package")
    p.add_argument("version")
    p.add_argument("--unyank", action="store_true", help="恢复被撤回的版本")
    p.set_defaults(func=cmd_yank)

    p = sub.add_parser("remove", help="删除某版本及其文件")
    p.add_argument("package")
    p.add_argument("version")
    p.set_defaults(func=cmd_remove)

    p = sub.add_parser("install", help="打印 dsh plugin add 安装命令")
    p.add_argument("package", nargs="?")
    p.add_argument("version", nargs="?")
    p.add_argument("--profile", default="web", help="DSH Web Profile 名称（默认 web）")
    p.add_argument("--url", help="覆盖 SkillHub 内网地址")
    p.set_defaults(func=cmd_install)

    p = sub.add_parser("set-url", help="记录 SkillHub 内网访问地址")
    p.add_argument("url")
    p.set_defaults(func=cmd_set_url)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
