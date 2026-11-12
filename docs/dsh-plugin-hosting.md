# DSH 插件托管

本文说明 SkillHub 中「DSH 插件托管」的产品边界、数据模型、接口和运维方式。
它与 [DSH 集成指南](./dsh-integration.md) 不同：后者说明如何把 SkillHub 的**技能**安装到
DeepSeek Harness；本文说明如何把 **DSH 插件**作为一等资源发布、版本化和分发。

## 1. 产品边界

- 插件按命名空间托管。`namespace` 决定谁可以发布和管理，`packageName` 是 npm 包名并在整个实例内唯一。
- 已发布插件默认对市场可见；隐藏（hide）只影响发现，管理员仍可管理。
- 当前版本不包含公开审核流（review）和可见范围（visibility）。这与技能不同，是本期明确的范围；
  不要把「已发布」理解为已经过治理审核。
- 插件 tarball 原样保存，不在服务端解包安装。服务端只读取 `package/package.json` 做身份和兼容性校验。
- 安装仍由 DSH 执行：`dsh plugin --profile <profile> add <download-url>`。

## 2. 数据模型

| 表 | 作用 |
|---|---|
| `dsh_plugin` | 插件容器：命名空间、slug、npm 包名、展示信息、分类/标签、推荐版本指针、隐藏状态、下载计数 |
| `dsh_plugin_version` | 不可变版本：SemVer、tarball 存储键、SHA-256、大小、解析后的 manifest、兼容说明、发布说明、下架状态 |

关键约束：

- `(namespace_id, slug)` 唯一；`package_name` 全局唯一。
- `(plugin_id, version)` 唯一；已发布版本不可覆盖，必须发布新版本。
- 版本状态只有 `PUBLISHED` / `YANKED`；插件容器状态为 `ACTIVE` / `ARCHIVED`。
- `latest_version_id` 指向「推荐版本」，安装命令和详情页使用它；下架当前推荐版本时会自动回退到剩余的最新已发布版本。
- 对象存储键：`dsh-plugins/{pluginId}/{version}/package.tgz`。

## 3. 权限

| 操作 | 允许的角色 |
|---|---|
| 浏览、搜索、下载 | 所有人（隐藏或归档插件对非管理员返回 404） |
| 首次发布、追加版本 | 目标命名空间的成员；`SUPER_ADMIN` / `SKILL_ADMIN` 可跨命名空间 |
| 修改信息、下架/恢复版本、设为推荐、删除版本、隐藏/恢复插件 | 插件创建者、命名空间 `OWNER` / `ADMIN`、`SUPER_ADMIN` / `SKILL_ADMIN` |

命名空间必须为 `ACTIVE` 才能发布。所有写操作写入 `audit_log`，`target_type = DSH_PLUGIN`。

## 4. 包校验

上传必须是以 `package/package.json` 为根的 npm tarball（`.tgz`）：

- 只接受 gzip tar；拒绝绝对路径、`..` 路径段、符号链接/硬链接和未知条目类型。
- `package.json` 必须包含合法的小写 npm 包名和 SemVer 版本。
- 解析并保存 `engines`、`peerDependencies` 和 `dsh` 能力键（如 `bundle`、`client`）。
- 不解包、不执行 `scripts`、不信任包内声明的路径。
- 默认限制：压缩包 50 MB、解压总量 256 MB、清单 2 MB、条目 10,000。
  通过 `SKILLHUB_DSH_PLUGIN_MAX_*` 调整，并与反向代理的 `client_max_body_size` 保持一致。

## 5. HTTP 接口

公开读取（`/api/v1` 与 `/api/web` 前缀等价）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-plugins` | 分页目录，支持 `q`、`category`、`tag`、`sort`（`newest`/`downloads`/`updated`/`name`）、`page`、`size` |
| GET | `/dsh-plugins/categories` | 分类及数量 |
| GET | `/dsh-plugins/{namespace}/{slug}` | 详情、版本清单、当前调用者可执行操作 |
| GET | `/dsh-plugins/{namespace}/{slug}/versions` | 版本清单 |
| GET | `/dsh-plugins/{namespace}/{slug}/download` | 下载推荐版本 |
| GET | `/dsh-plugins/{namespace}/{slug}/versions/{version}/download` | 下载精确版本 |

需要登录的接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-plugins/mine` | 我创建或管理的插件（含隐藏） |
| POST | `/dsh-plugins/package-preview` | 只读解析上传包，返回身份、兼容性和是否已有同版本 |
| POST | `/dsh-plugins/{namespace}/publish` | 发布新插件或新版本（multipart） |
| PUT | `/dsh-plugins/{pluginId}` | 更新展示信息、分类、标签 |
| POST | `/dsh-plugins/{pluginId}/versions/{versionId}/recommend` | 设为推荐版本 |
| POST | `/dsh-plugins/{pluginId}/versions/{versionId}/yank` | 下架版本（可带原因） |
| POST | `/dsh-plugins/{pluginId}/versions/{versionId}/unyank` | 恢复版本 |
| DELETE | `/dsh-plugins/{pluginId}/versions/{versionId}` | 删除版本及 tarball |
| POST | `/dsh-plugins/{pluginId}/hide` | 从市场隐藏 |
| POST | `/dsh-plugins/{pluginId}/restore` | 恢复展示 |

下载响应包含 `X-Checksum-Sha256`，可直接与 `index.json` 或详情页记录比对。

发布表单字段：`file` 必填；`displayName`、`summary`、`description`、`homepage`、`license`、
`category`、`tags`（逗号分隔，最多 10 个）、`compatNote`、`releaseNotes` 可选。
首次发布时未提供的展示字段使用 `package.json` 的值；追加版本时未提供的字段保持原值。

## 6. 前端入口

| 路由 | 页面 |
|---|---|
| `/plugins` | 插件市场：搜索、分类、排序、分页 |
| `/plugins/{namespace}/{slug}` | 插件详情：安装命令、兼容性、版本账本、管理操作 |
| `/dashboard/plugins` | 我的插件 |
| `/dashboard/plugins/publish` | 发布插件 / 发布新版本 |

顶部导航「DSH 插件」和控制台侧栏「我的插件」分别进入市场和自管理页面。

## 7. 运维与兼容

- 迁移：`V120__dsh_plugin_hosting.sql`。上线前先备份数据库；迁移只新增表、索引和外键。
- 对象存储：与技能共用 `skillhub-storage`，不需要新增存储桶。
- 旧版 `/dsh-plugins/` 静态仓库仍由 nginx 提供，可继续下载既有 tarball；新版页面不再写
  `index.json`，也不再使用 WebDAV 发布。需要在新市场展示的历史包，请用同一 tarball 通过新接口
  重新发布一次（数据库为空时不会冲突）。
- 反向代理：发布请求经过 Java 后端，`client_max_body_size` 至少要与
  `SKILLHUB_DSH_PLUGIN_MAX_PACKAGE_SIZE` 对齐；下载接口需要允许匿名 GET。
- 审计：发布、更新、推荐、下架/恢复、删除、隐藏/恢复分别记录
  `DSH_PLUGIN_*` 动作，详情中只保存包名、版本等非敏感字段。

## 8. 已知限制

- 没有技能式的审核、可见范围和命名空间提升流程。
- 不提供插件依赖解析或自动安装；`peerDependencies` 仅展示和记录。
- 不执行包内脚本，也不验证插件在目标 DSH 版本上可加载；兼容性以发布者声明和
  `engines` / `peerDependencies` 为准。
- 删除版本会删除对象存储文件；已安装到用户机器的副本不会被回收。
