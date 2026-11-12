# MCP 服务

MCP 服务页用于发布和发现可在 MCP 客户端中配置的服务。它与 AI 工具不同：AI 工具发布的是
可下载文件，MCP 服务发布的是一段连接定义或启动配置。

## 入口

| 页面 | 地址 | 权限 |
| --- | --- | --- |
| MCP 服务列表 | `/mcp` | 公开 |
| MCP 服务详情 / 客户端配置 | `/mcp/{slug}` | 公开 |
| 发布 MCP 服务 | `/dashboard/mcp/publish` | 登录用户 |
| 我的 MCP | `/dashboard/mcp` | 登录用户 |
| 编辑自己的 MCP | `/dashboard/mcp/{slug}/edit` | 发布者或超级管理员 |

发布者可以在详情页或「我的 MCP」中编辑、删除自己的服务；超级管理员可以管理全部服务。

发布页可以把服务所需的文件打成一个附件包上传。其他用户可以在详情页下载该附件；附件
会随 MCP 服务一起保存、替换和删除。

## 三种发布形式

### 1. 远程 URL

适合已经部署好的 HTTP MCP 服务：

- **Streamable HTTP**：`type` 为 `streamable-http`
- **SSE**：`type` 为 `sse`

```json
{
  "mcpServers": {
    "my-remote-mcp": {
      "type": "streamable-http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN>"
      }
    }
  }
}
```

### 2. 命令 / 包（stdio）

适合由客户端本地启动的 npm、PyPI、Docker 或自定义命令：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/workspace"
      ],
      "env": {
        "DEMO_KEY": "<YOUR_KEY>"
      }
    }
  }
}
```

Docker 形式：

```json
{
  "mcpServers": {
    "docker-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "example/mcp-server:latest"]
    }
  }
}
```

### 3. 粘贴 JSON 配置

可以直接粘贴单个服务对象，或完整的 `{"mcpServers": {...}}` 对象。发布时会自动识别
`url` 或 `command`，并生成统一的客户端配置。

## 用户如何配置客户端

发布完成后，在 MCP 详情页复制「客户端配置」，粘贴到所用 MCP 客户端的配置文件中。

### Claude Desktop / 通用 JSON 客户端

配置文件通常为 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "my-remote-mcp": {
      "type": "streamable-http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN>"
      }
    }
  }
}
```

保存后重启客户端。远程服务需要保证客户端网络能访问地址；stdio 服务需要先安装对应的
Node/Python/Docker 运行时和包。

### DSH / 其他 MCP 客户端

使用客户端提供的 MCP 配置入口，将详情页生成的 `mcpServers` 片段合并到现有配置中。
如果客户端使用不同的字段名，以该客户端文档为准；`url`、`command`、`args`、`env` 和
`headers` 是详情页提供的基础连接信息。

## 安全约定

- 请求头和环境变量只填写 `<YOUR_TOKEN>`、`<YOUR_KEY>` 等占位值，不要把真实密钥发布到公共注册表。
- 远程地址必须是 `http://` 或 `https://`。
- 发布者只应发布自己有权分发的服务；仓库地址和文档地址为可选信息。
- 客户端配置中的本地路径和密钥由使用者自行替换。

## API

```text
GET    /api/web/mcp-servers
GET    /api/web/mcp-servers/categories
GET    /api/web/mcp-servers/mine
GET    /api/web/mcp-servers/{slug}
GET    /api/web/mcp-servers/{slug}/attachment
POST   /api/web/mcp-servers
PUT    /api/web/mcp-servers/{id}
DELETE /api/web/mcp-servers/{id}
```

带附件的发布使用 `multipart/form-data`：

- `metadata`：JSON 部分，内容同下面的发布请求
- `file`：可选附件文件

发布请求示例：

```json
{
  "name": "Filesystem MCP",
  "summary": "本地文件系统 MCP 服务",
  "description": "允许 AI 客户端读取指定工作目录。",
  "version": "1.0.0",
  "category": "开发工具",
  "tags": ["filesystem", "stdio"],
  "packageType": "NPM",
  "config": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
  }
}
```

## 数据

MCP 服务保存在 `mcp_server` 表，`config_json` 保存标准客户端配置，`author_id` 用于
所有权校验；附件信息保存在同表的 `attachment_*` 字段。迁移为
`V122__mcp_server_registry.sql` 和 `V123__mcp_server_attachments.sql`。
