# SkillHub 局域网离线部署包

把 `iflytek/skillhub` 变成一套**可整体搬迁、完全离线运行、能分享和管理 DSH 插件**的内网服务。
本方案**不修改官方任何 Java / React 源码**，只在仓库内新增一个叠加 Compose 文件和一套运维脚本，
因此后续升级上游代码不会冲突。

---

## 1. 它能做什么

| 能力 | 说明 |
| --- | --- |
| SkillHub 私有注册表 | 官方能力：技能发布、版本、命名空间、权限、搜索、CLI/REST API |
| DSH 插件内网分发（静态仓库） | 插件 tarball 由 SkillHub 自己的 nginx 在 `/dsh-plugins/` 提供，无需公网、无需 npm。新版 SkillHub 已提供一等插件托管（见 [DSH 插件托管](../../docs/dsh-plugin-hosting.md)），本静态仓库保留给旧镜像和既有安装地址 |
| 顶部功能标签 | 新增：首页、技能市场、技能套装、DSH 插件、发布、我的技能/套件/插件、命名空间、首页内容、控制台放在顶部标签，移动端折叠为菜单 |
| DSH 插件原生市场 | 新增：`/plugins` 搜索、分类、排序、详情与安装命令；`/dashboard/plugins` 我的插件；`/dashboard/plugins/publish` 发布；旧 `#dsh-plugins` 静态面板仅作兼容 |
| 分类 / 标签 / 搜索 | 新增：分类筛选与统计、标签、关键字搜索（名称/描述/分类/标签/版本/说明）、四种排序；CLI 同样支持筛选 |
| Web 端统一发布 | 新增：技能走 `/dashboard/publish`，DSH 插件走 `/dashboard/plugins/publish`；上传 `.tgz` 由 Java 后端解析 `package.json`、校验 semver/版本冲突/SHA-256 |
| 插件版本管理 | 新增：登录后在插件详情或 CLI `publish / list / verify / activate / yank / remove`，含 sha256 校验、编辑分类/标签/简介与一键回滚 |
| 统一网站登录 | 新增：插件发布、技能发布、首页内容编辑都用 SkillHub 网站账号，**无独立口令**；写操作最终由服务端会话校验 |
| 插件门户页 | 新增：详情页查看版本、兼容范围、sha256，一键复制 `dsh plugin add` 命令 |
| 首页内容管理 | 新增：超级管理员在 `/dashboard/home-content` 维护公告、Hero、AI 应用区块与卡片，发布后即时生效 |
| 一键起停 | 新增：根目录 `run.sh` / `stop.sh`，离线优先、自动探测内网 IP、自动生成凭据 |
| 离线镜像迁移 | 新增：`export-images.sh` 把 5 个运行镜像导出为 tar，目标机自动 `docker load` |

内置首版插件：`@astron-team/skillhub-dsh@0.6.2`（官方 npm 发行版，709 KB），
已写入 `plugins/index.json` 与 sha256，可直接分发。

---

## 2. 目录结构

```
skillhub/                              ← 整个目录就是迁移单元
├── run.sh                             ← 一键启动
├── stop.sh                            ← 一键停止（默认保留数据）
├── compose.release.yml                ← 官方文件，未改动
├── deploy/lan/
│   ├── README.md                      ← 本文档
│   ├── compose.lan.yml                ← 服务栈叠加：插件目录（可写）+ nginx/site 片段挂载
│   ├── nginx/
│   │   ├── dsh-plugins.conf           ← 静态托管 + .auth 写权限探测 + 受保护 DAV PUT/DELETE
│   │   └── site.conf                  ← sub_filter 注入 + /site/.auth-check（网站会话）+ 首页内容 DAV
│   ├── env/
│   │   ├── lan.env.example            ← 自包含配置模板（由官方 .env.release.example 派生）
│   │   └── lan.env                    ← 运行时生成，含随机密码（勿提交/外传）
│   ├── plugins/                       ← DSH 插件仓库（rw 挂到 web:/srv/dsh-plugins/）
│   │   ├── index.html                 ← 独立门户页，纯静态零依赖
│   │   ├── install.md                 ← 客户端安装指引
│   │   ├── index.json                 ← 版本清单、sha256、分类/标签、推荐版本（Web/CLI 唯一事实来源）
│   │   └── versions/
│   │       ├── *.tgz                  ← 插件 tarball（Web 发布后落盘于此）
│   │       └── .tmp/                  ← nginx 上传临时目录（运行时生成，不对外可读）
│   ├── site/
│   │   ├── site-auth.js               ← 共用模块：GET /api/v1/auth/me 判断网站登录态 + CSRF 辅助
│   │   ├── inject.js                  ← 注入脚本：顶部导航、首页内容、发布类型切换条、登录态显隐
│   │   ├── plugin-market.js           ← 插件市场面板：分类/搜索 + 发布类型二选一 + 版本管理（纯 JS SHA-256）
│   │   ├── admin.html                 ← 旧首页管理入口（跳转到 /dashboard/home-content）
│   │   ├── home.default.json          ← 首页内容默认模板
│   │   └── content/home.json          ← 已发布的首页内容（运行时数据，随目录迁移）
│   ├── scripts/
│   │   ├── export-images.sh           ← 联网机导出镜像
│   │   ├── fetch-official-plugin.sh   ← 联网机抓取官方插件 tarball
│   │   ├── publish-plugin.sh          ← 插件仓库管理 CLI（与 Web 端共用 index.json）
│   │   └── plugin-repo.py             ← 管理核心（Python 标准库，零依赖）
│   ├── images/                        ← 离线镜像 tar + manifest（准备机生成）
│   └── ACCESS.txt                     ← 启动后生成，含访问地址与管理员凭据
```

---

## 3. 三步迁移（完全离线目标机）

> 当前项目的迁移包还包含**数据库与对象存储**（`deploy/lan/migration/backup/`）。
> 在目标机解压后先执行：
>
> ```sh
> ./deploy/lan/migration/restore.sh --host 192.168.1.20
> ./run.sh --host 192.168.1.20
> ```
>
> 详细说明见 [`migration/README.md`](migration/README.md)。全新空库部署可跳过
> `restore.sh`。

### 步骤 1 · 在**可联网 + Docker 引擎正常**的机器上准备离线包

```sh
cd skillhub
deploy/lan/scripts/export-images.sh --aliyun --version latest
# 产物：deploy/lan/images/*.tar、manifest.txt、manifest.env
```

- `--aliyun` 使用官方阿里云镜像通道，**国内强烈建议加上**；直连 ghcr.io 实测极慢。
- 不加则走 GHCR；若 GHCR 包仍为私有，先 `docker login ghcr.io`。
- 有内网镜像仓库时可加 `--registry reg.lan/skillhub`，会替换全部 5 个镜像（含
  postgres / redis）的前缀；镜像名写入 `manifest.env`，`run.sh` 自动对齐配置。
- 建议固定版本（`--version v0.2.25`）而不是 `latest`，便于回滚。

插件包默认已内置。需要追加其它 DSH 插件或旧版本（用于回滚）时：

```sh
deploy/lan/scripts/fetch-official-plugin.sh 0.6.1     # 官方插件指定版本
deploy/lan/scripts/publish-plugin.sh publish /path/to/my-plugin-1.0.0.tgz \
    --notes "修复 xxx" --compat "DSH 0.2.1-rc.5"
deploy/lan/scripts/publish-plugin.sh verify            # 离线包完整性校验
```

### 步骤 2 · 拷贝到内网目标机

拷贝**整个 `skillhub/` 目录**（`.git/` 可删，能显著减小体积）到目标机，例如 `/opt/skillhub`。
必须保留 `compose.release.yml`、`deploy/lan/` 全部内容。目标机只需：

- Docker Engine / Docker Desktop + Compose v2
- Python 3.8+（仅插件管理脚本使用，标准库即可）
- 无需公网、无需 npm、无需 Java/Node 构建环境

### 步骤 3 · 启动

```sh
cd /opt/skillhub
chmod +x run.sh stop.sh deploy/lan/scripts/*.sh
./run.sh                              # 自动探测内网 IP
# 或显式指定： ./run.sh --host 192.168.1.20 --web-port 8081
```

`run.sh` 会依次：生成配置与随机凭据 → 初始化站点内容与插件仓库可写目录 →
清理历史版本遗留的 `site.htpasswd` / `SITE_ADMIN_PASSWORD` →
从 `images/*.tar` 导入镜像 → 校验 Compose → 启动 → 健康检查 →
把内网地址写回插件清单 → 输出访问信息到 `deploy/lan/ACCESS.txt`。

启动完成后：

| 入口 | 地址 |
| --- | --- |
| SkillHub Web UI | `http://<内网地址>/` |
| **内部 AI 门户首页** | `http://<内网地址>/`（公告、Hero、快捷入口） |
| **AI 应用页** | `http://<内网地址>/apps`（独立页面，分类筛选与应用卡片；管理员可发布/修改） |
| **AI 工具下载** | `http://<内网地址>/tools`（公开下载；超级管理员上传、编辑、删除） |
| **学习与帮助** | `http://<内网地址>/help`（自带技能/插件/工具指南；管理员可发布 Markdown 文章） |
| **DSH 插件市场** | `http://<内网地址>/plugins`（只读浏览无需登录；登录后可发布与管理） |
| 我的插件 / 发布插件 | `http://<内网地址>/dashboard/plugins`、`http://<内网地址>/dashboard/plugins/publish` |
| 旧 DSH 插件静态门户 | `http://<内网地址>/dsh-plugins/`（兼容旧安装地址与既有 tarball） |
| 首页内容管理 | `http://<内网地址>/dashboard/home-content`（控制台左侧「首页内容」，仅超级管理员） |
| AI 应用管理 | `http://<内网地址>/dashboard/apps`（控制台左侧「AI 应用」，仅超级管理员） |
| 帮助文章管理 | `http://<内网地址>/dashboard/help`（控制台左侧「帮助文章」，仅超级管理员） |
| 页面设置 | `http://<内网地址>/dashboard/pages`（控制台左侧「页面设置」，网站名称/页面标题，仅超级管理员） |
| MCP 服务 | `http://<内网地址>/mcp`（登录用户可发布；详情页提供客户端 JSON 配置） |
| 官方技能发布页 | `http://<内网地址>/dashboard/publish` |
| 后端 API（仅本机） | `http://127.0.0.1:8080` |
| 管理员账号 | 见 `deploy/lan/ACCESS.txt`（默认 `admin`），网站账号同时用于发布与管理，**无第二套口令** |

> 首次登录请立刻修改管理员密码。PostgreSQL / Redis 只绑定 `127.0.0.1`，不对外暴露。

---

## 4. 客户端：安装 DSH 插件并接入内网

门户页会自动生成命令，也可以直接执行：

```sh
dsh plugin --profile web add \
  http://<内网地址>/dsh-plugins/versions/astron-team-skillhub-dsh-0.6.2.tgz \
  --ignore-scripts
dsh web --port 3080
```

**关键一步**：插件缺省连接公网 `https://skill.xfyun.cn`，必须改为内网实例。
进入 DSH **插件 → @astron-team/skillhub-dsh → SkillHub 设置 → 技能来源**，
把地址填为 `http://<内网地址>`（只填基础地址，勿带 `/api`），测试连接后保存。
之后技能搜索、下载、安装、启停、升级全部走内网，无需公网。

官方插件 0.6.2 兼容 DSH `0.2.0-rc.2` / `0.2.1-rc.2` / `0.2.1-rc.5`，
Host Node `>=24.2.0 <25`；版本不匹配会被 DSH 拒绝写入，请到门户页选择匹配版本。

---

## 5. 插件与首页内容管理

### 5.1 DSH 插件（原生页面，推荐）

插件已作为 SkillHub 一等资源托管，入口全部在顶部标签：

- `/plugins`：市场。匿名可搜索、按分类筛选、排序、查看版本 / 兼容性 / sha256、
  复制 `dsh plugin --profile web add <url>`。
- `/dashboard/plugins`：我创建或管理的插件（含隐藏）。
- `/dashboard/plugins/publish`：上传 `.tgz`，服务端读取 `package/package.json`，
  校验 npm 包名、SemVer、版本冲突、SHA-256、压缩包大小与不安全路径。
- `/plugins/{namespace}/{slug}`：详情与版本账本；创建者、命名空间 OWNER/ADMIN
  或平台管理员可编辑信息、设为推荐、下架/恢复、删除版本、隐藏/恢复插件。

发布与管理使用 SkillHub 网站账号登录，没有独立口令。所有写操作都会在服务端
按命名空间角色 / 插件归属校验，并写入审计日志。

### 5.2 首页与 AI 应用（超级管理员）

`/` 首页展示公告、Hero 与管理员精选的 AI 应用入口；完整 AI 应用列表在 `/apps`。
管理入口统一放在控制台左侧「管理员」区域：

- 首页内容 `/dashboard/home-content`：公告（级别 + 文案）、Hero。
- AI 应用 `/dashboard/apps`：任意数量的区块（卡片网格 / 列表）及卡片
  （标题、描述、图标、分类、标签、链接）；勾选「在首页展示」后该入口会出现在首页，
  「更多 AI 应用」按钮跳转到 `/apps`。

保存前会重新读取当前 `home.json`，如果其他管理员已发布更新，会提示冲突并要求
重新载入，避免静默覆盖。两个页面分别发布，互不覆盖对方的字段。

内容保存在 `deploy/lan/site/content/home.json`，随部署目录迁移。旧的
`/site/admin.html` 已改为跳转到新页面，不再接受编辑。

### 5.3 AI 工具下载

`/tools` 是独立的 AI 工具下载页，管理员在 `/dashboard/tools` 管理、在
`/dashboard/tools/publish` 上传：

- 上传任意工具文件（EXE、MSI、ZIP、压缩包等，不设固定大小上限）
- 填写名称、版本、分类、简介与使用说明
- 公开列表支持搜索、分类筛选与按最新/下载量/名称排序
- 详情页展示文件名、大小、SHA-256 与使用说明，公开下载
- 管理员可编辑元数据或删除工具（同时删除存储文件）
- 发布/更新/删除写入审计日志

包内不解析元数据；工具是单文件制品，不维护版本历史。详见
[AI 工具下载](../../docs/ai-tools.md)。

### 5.4 旧静态插件面板（兼容）

`/dsh-plugins/` 仍由 nginx 提供历史 tarball 和 `index.json`，已有
`dsh plugin add` 安装地址继续可用。新的 Web 发布不再写 `index.json`；需要把历史包
展示到新市场时，用同一 tarball 通过 `/dashboard/plugins/publish` 重新发布一次。

### 5.5 学习与帮助

顶部最右侧「学习与帮助」提供应用自带的 Skill、DSH 插件和 AI 工具使用说明；
超级管理员可在控制台「帮助文章」中新增、编辑或删除 Markdown 文章。

索引保存在 `deploy/lan/site/content/help.json`，正文位于
`deploy/lan/site/content/help/*.md`，通过 nginx WebDAV PUT 写入。管理员保存时会
比较索引 `updatedAt`，避免覆盖其他管理员刚发布的文章。

与 SkillHub skill 包管理的对应关系：

| skill 包 | DSH 插件 |
| --- | --- |
| 上传技能包、服务端读取元数据 | 上传 `.tgz`、浏览器读取 `package.json` |
| 分类 / 标签 / 搜索 / 排序 | 分类筛选、标签、关键字搜索、四种排序与统计 |
| 版本号 semver 合法性 + 冲突校验 | 同样校验，且默认拒绝覆盖已有版本 |
| 文件逐个记录 SHA-256 | 整包记录 SHA-256 与大小（`verify` 可复核） |
| `latest` 已发布版本指针 | `latest` 推荐版本 + `recommended` 推荐插件 |
| 版本列表、yank、删除 | 版本表格内一键操作（需登录） |
| 登录账号鉴权 | 统一使用 SkillHub 网站登录（SESSION cookie + nginx `auth_request` 复核），无独立口令 |

> 自动解析依赖浏览器 `DecompressionStream`（Chrome / Edge 80+、Firefox 113+）。
> 老浏览器解析失败时会提示手动填写包名与版本，发布功能不受影响。
> 内网是 HTTP 非安全上下文，SHA-256 由脚本自带纯 JS 实现，不依赖 `crypto.subtle`。
> `index.json` 新增的 `categories` / `category` / `tags` 是可选扩展字段，
> 旧版 CLI 会忽略但不丢失，`schemaVersion` 保持 1。

### 5.2 命令行（等价，可离线批量操作）

Web 端与 CLI **共用同一份 `index.json` 和 `versions/` 目录**，两边发布的结果互相可见，
CLI 的 `verify` 也能校验 Web 发布的包。

```sh
cd deploy/lan/scripts

./publish-plugin.sh list                                   # 版本清单与推荐版本
./publish-plugin.sh list --category 官方插件 -q DSH         # 按分类 / 关键字筛选
./publish-plugin.sh publish /path/plugin-1.0.0.tgz --notes "变更说明" \
    --category 集成扩展 --tags "官方,DSH"                   # 分类与标签
./publish-plugin.sh verify                                 # 重算所有 sha256 / 大小
./publish-plugin.sh activate @astron-team/skillhub-dsh 0.6.1   # 回滚推荐版本
./publish-plugin.sh yank @astron-team/skillhub-dsh 0.6.2        # 下架（保留文件）
./publish-plugin.sh remove @astron-team/skillhub-dsh 0.6.1      # 删除版本
./publish-plugin.sh install --profile web                 # 打印安装命令
./publish-plugin.sh set-url http://192.168.1.20          # 修正清单里的内网地址
```

- 发布/回滚**无需重启容器**：目录是 bind mount，刷新页面即可生效。
- `index.json` 是唯一事实来源，迁移或备份时连同 `versions/` 一起拷贝。
- 单个上传包上限 `50 MB`（`nginx/dsh-plugins.conf` 的 `client_max_body_size`）。
- 边界：Web 发布与技能发布共用**同一个网站登录态**，但 DSH 插件仓库仍是一套独立的
  静态制品目录，不接入 SkillHub 的命名空间 / RBAC / 审核工作流；`auth_request` 只校验
  「是否已登录网站」，不区分角色（任何登录用户都能发布或删除插件）。需要按角色管控时应
  在后端增加插件制品类型，或在 `/site/.auth-check` 里换成带权限校验的端点。
  CLI 不受登录门槛约束（直接操作宿主机文件），因此**服务器目录权限就是发布权限**，
  请限制部署目录的访问。

---

## 6. 日常运维

```sh
./stop.sh                    # 停止容器，保留全部数据卷
./run.sh                     # 原样恢复
./run.sh --check             # 只校验配置，不启动容器（排障用）
./run.sh --online            # 准备机联网直接拉取镜像启动
./stop.sh --purge            # 危险：连同数据卷一起删除，需输入 yes 确认
docker compose -p skillhub-lan logs -f        # 日志
```

**备份**（技能文件 + 数据库）：

```sh
docker run --rm -v skillhub-lan_skillhub_storage:/data -v "$PWD":/backup \
  alpine tar czf /backup/skillhub-storage.tgz /data
docker compose -p skillhub-lan exec -T postgres pg_dump -U skillhub skillhub \
  > skillhub-db.sql
```

**升级**：在联网机重新执行 `export-images.sh --version <新 tag>` → 覆盖 `images/` →
目标机 `./run.sh`（版本由 `manifest.env` 自动对齐）。升级前先备份，且不要删除
`deploy/lan/env/lan.env`，否则随机密码会重新生成。

---

## 7. 配置要点

配置文件 `deploy/lan/env/lan.env` 由 `run.sh` 从 `lan.env.example` 首次生成。常用项：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SKILLHUB_PUBLIC_BASE_URL` | 自动探测 | 内网访问地址，决定 CLI 安装命令与 OAuth 回调 |
| `WEB_PORT` / `API_PORT` | `80` / `8080` | 端口冲突时用 `--web-port` / `--api-port` |
| `SKILLHUB_VERSION` | `latest` | 由 `images/manifest.env` 自动对齐 |
| `SKILLHUB_STORAGE_PROVIDER` | `local` | 离线用本地磁盘，不依赖 S3/MinIO |
| `SKILLHUB_SECURITY_SCANNER_ENABLED` | `false` | 离线无 LLM 审核服务时关闭在线扫描 |
| `BOOTSTRAP_ADMIN_ENABLED` | `true` | 初始化管理员；改完密码建议置 `false` 并重启 |

---

## 8. 故障排查

| 现象 | 处理 |
| --- | --- |
| `本机缺少运行镜像且 images/ 下没有 *.tar` | 在联网机执行 `export-images.sh`，把 `images/*.tar` 一起拷贝 |
| 端口 80 被占用 | `./run.sh --web-port 8081`，并把新端口写进客户端 `registryUrl` |
| 健康检查超时 | `docker compose -p skillhub-lan logs --tail=100 server web` |
| `/dsh-plugins/` 404 | 确认 `deploy/lan/plugins/index.json` 存在，且用 `-f compose.lan.yml` 叠加启动 |
| 门户页显示旧内网 IP | `./publish-plugin.sh set-url http://<新地址>`，或重跑 `./run.sh` |
| web 容器反复 `Restarting (1)` | 多半是把含 `index.html` 的目录挂进了 `/usr/share/nginx/html`：镜像的 `20-base-path.sh` 会对全部 `*.html` 执行 `sed -i`，只读挂载必然失败。本方案已改为挂到 `/srv/dsh-plugins` 并用 include 钩子注入 location，确认 `compose.lan.yml` 未被改回 |
| `run.sh` 健康检查超时但容器正常 | 本机设置了 HTTP 代理，curl 把 `127.0.0.1` 也发给代理；脚本已加 `--noproxy '*'`，手工排查时同样加上 |
| DSH 插件装不上 | 核对 DSH / Node 兼容范围；`sha256sum` 比对 tarball；检查 `--profile` 名称 |
| DSH 搜不到技能 | 检查插件设置里的技能来源是否指向内网 SkillHub，而非公网 `skill.xfyun.cn` |
| 忘记管理员密码 | 查看 `deploy/lan/ACCESS.txt` 或 `deploy/lan/env/lan.env` |
| 首页看不到插件市场 / 点导航没反应 | 确认 `/site/site-auth.js`、`/site/plugin-market.js` 与 `/dsh-plugins/.auth` 可访问；`run.sh` 健康检查会提示。检查浏览器控制台是否有脚本报错 |
| 看不到「+ 发布」按钮 | 正常现象：未登录网站时只提供只读浏览。用网站右上角登录（账号见 `ACCESS.txt`） |
| 匿名访问 `/dsh-plugins/.auth` 不是 401 | 检查 `site.conf` 的 `/site/.auth-check` 与 `dsh-plugins.conf` 是否被 nginx 加载；后端 `GET /api/cli/v1/auth/whoami` 匿名应返回 401 |
| 发布时提示 401 / 网站登录已失效 | 会话过期或在别处退出登录，重新登录网站后刷新面板 |
| 发布技能提示 403 | 多是 XSRF-TOKEN 缺失；刷新页面后重试，或到官方 `/dashboard/publish` 页发布 |
| 发布技能提示「必须启用安全扫描器」 | 离线部署 `SKILLHUB_SECURITY_SCANNER_ENABLED=false` 时平台不允许公开 / 命名空间可见技能；把可见性改为「私有（仅自己可见）」即可，或在 `lan.env` 启用扫描器 |
| 发布时提示 413 | 包超过 50 MB，调整 `nginx/dsh-plugins.conf` 的 `client_max_body_size` 后重启 web 容器 |
| 上传失败 / 提示跨设备错误 | `versions/.tmp` 不存在或不可写；重跑 `./run.sh` 让脚本重建目录并放宽权限 |
| 版本列表与 CLI `list` 不一致 | 两边共用 `index.json`；点面板「刷新」，或执行 `./publish-plugin.sh verify` 复核 |
| 分类下拉缺少某分类 | 发布时输入的新分类会自动并入 `index.json` 的 `categories`；也可手工编辑该字段 |

---

## 9. 安全与边界

- `lan.env`、`ACCESS.txt` 含明文凭据，**不要提交到 Git、不要随公开分享包外传**。
  网站管理员账号同时用于技能发布、DSH 插件发布/删除与首页内容保存；没有第二套口令。
- 本方案面向可信局域网：默认 HTTP、bootstrap admin 开启。若需更强隔离，请加反向代理 + HTTPS，
  修改管理员密码后置 `BOOTSTRAP_ADMIN_ENABLED=false`。
- 登录凭据是 `SESSION`（HttpOnly + SameSite=Lax，数据存 Redis）。nginx 的 `auth_request`
  把子请求发到 `GET /api/cli/v1/auth/whoami`，**匿名 401 / 已登录 200**；写操作不使用
  Basic Auth，也就没有浏览器弹窗或需要保管的管理口令。
- 插件仓库目录以 `rw` 挂载，`index.json` 与 `versions/*.tgz` 的
  **GET 公开、PUT/DELETE 需网站登录**；`/dsh-plugins/.auth` 是只读写权限探测端点
  （匿名 401、已登录 200），不写任何文件。`versions/.tmp` 与隐藏文件已拒绝公开读取。
  上传前请确认包来源可信——安装命令带 `--ignore-scripts` 只是不执行安装脚本，
  插件本身仍需审核。
- 插件仓库做的是**内网分发与版本管理**，不替代 SkillHub 自身的命名空间 / RBAC / 审核治理；
  技能内容权限仍由 SkillHub 控制。
- 未改动官方源码：`compose.lan.yml` 只新增 bind mount（插件目录 rw、site 目录 rw、
  两个 nginx 片段），全部通过官方 web 镜像模板自带的
  `include /etc/nginx/skillhub-base-path*.conf` 与 `sub_filter` 生效。
  升级上游后请确认 `compose.release.yml`、`.env.release.example` 的变量，以及该 include 钩子
  和 nginx 的 `dav_module` / `sub_module` / `auth_request_module` 仍然存在。

---

## 10. 与新版 DSH 插件托管的关系

仓库主线已经提供一等 DSH 插件托管：`/plugins` 市场、`/dashboard/plugins` 管理页、
`/api/{v1,web}/dsh-plugins/*` 接口、数据库版本账本和对象存储。它与本目录的静态方案关系如下：

- **新发布**：升级到包含 `V120__dsh_plugin_hosting.sql` 的服务端镜像后，从
  `/dashboard/plugins/publish` 发布；不再写 `index.json`，也不再使用 WebDAV。
- **旧安装地址**：`/dsh-plugins/versions/*.tgz` 继续由 nginx 提供，已安装的 DSH profile 不受影响。
- **历史包展示**：新市场读取数据库。需要把 `index.json` 里的历史包展示到新市场时，用同一 tarball
  通过新接口重新发布一次（空库不会产生版本冲突）。
- **不要双写**：新页面不再修改 `index.json`，避免 Web 与 `publish-plugin.sh` 两套事实来源互相覆盖。
- **导航切换**：确认新版 Web 镜像已经包含 `/plugins` 后，在 `site/content/home.json` 的 `nav` 中
  增加 `"dshPluginsHref": "/plugins"` 与 `"publishPluginHref": "/dashboard/plugins/publish"`，
  旧静态入口就会让位给原生页面；删除这两个键即回退到静态面板。默认模板仍保留旧入口，避免尚未升级
  Web 镜像时导航跳到不存在的路由。
- **回退**：如果暂时回退到不含插件托管的服务端镜像，保留 `/dsh-plugins/` 目录和 nginx 片段即可继续
  用旧面板与 CLI 分发；数据库中的插件记录不会影响旧镜像启动。
