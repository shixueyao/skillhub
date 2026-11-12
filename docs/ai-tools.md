# AI 工具下载

AI 工具是管理员发布的单个可下载文件（安装包、压缩包、脚本等），用于在局域网内分发
内部 AI 工具。支持 Windows `.exe`、`.msi`，以及 ZIP、压缩包等格式；应用层不设固定
上传大小上限。它与技能（SKILL.md 包）和 DSH 插件（npm tarball）分开存储，因为工具
只有一个制品，不需要技能包结构或插件版本账本。

## 页面

| 页面 | 地址 | 权限 |
| --- | --- | --- |
| AI 工具列表 | `/tools` | 公开 |
| 工具详情 / 下载 | `/tools/{id}` | 公开 |
| 工具管理 | `/dashboard/tools` | `SUPER_ADMIN` |
| 上传发布 | `/dashboard/tools/publish` | `SUPER_ADMIN` |

顶部标签「AI 工具」进入列表页；管理员在列表页右上角看到「上传工具」，在管理页可
编辑元数据或删除工具。

## 字段

| 字段 | 说明 |
| --- | --- |
| `name` | 工具名称，必填，≤256 字符 |
| `version` | 版本号，可选，≤64 字符 |
| `summary` | 简介，可选，≤2000 字符 |
| `usage_instructions` | 使用说明，可选，≤20000 字符 |
| `category` | 分类，可选，≤64 字符 |
| `filename` | 上传文件名 |
| `content_type` | 规范化后的 MIME 类型 |
| `size_bytes` | 文件大小 |
| `sha256` | 服务端计算的文件摘要 |
| `download_count` | 下载次数 |

## API

公开读取：

```text
GET /api/web/ai-tools?q=&category=&sort=newest&page=0&size=24
GET /api/web/ai-tools/categories
GET /api/web/ai-tools/{id}
GET /api/web/ai-tools/{id}/download
```

管理员写入（服务端同时校验 `SUPER_ADMIN`）：

```text
POST   /api/web/ai-tools              multipart: file, name, version, summary, usageInstructions, category
PUT    /api/web/ai-tools/{id}         JSON metadata
DELETE /api/web/ai-tools/{id}
```

`/api/v1/ai-tools` 提供同样的读写接口，供 CLI / API 令牌客户端使用；读取允许匿名，
写入要求 `SUPER_ADMIN`。

## 存储与审计

- 文件写入现有 `ObjectStorageService`，key 为
  `ai-tools/{uuid}/{filename}`；删除工具时同时删除对象。
- 发布、更新、删除写入 `audit_log`，资源类型为 `AI_TOOL`。
- 下载会同时增加工具级计数；不记录下载者身份。
- 事务回滚时注册清理，避免数据库失败后残留对象。

## 下载响应

```text
Content-Disposition: attachment; filename="..."
Content-Type: <stored content type>
X-Checksum-Sha256: <sha256>
```

详情页展示文件名、大小、下载次数和 SHA-256，便于内网校验。

## 限制

- 当前每个工具只有一个文件；替换文件需要删除后重新上传。
- 不支持版本历史、审核流、命名空间隔离或可见性控制。
- 应用层与 nginx 不再设置固定上传大小上限；实际可用空间取决于服务器磁盘与内存。
