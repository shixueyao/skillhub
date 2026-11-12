# 学习与帮助

`/help` 是团队的学习与帮助中心。它包含应用自带的使用指南，也允许超级管理员发布
Markdown 文章。左侧搜索框会同时匹配文章标题、摘要和 Markdown 正文。

## 页面

| 页面 | 地址 | 权限 |
| --- | --- | --- |
| 学习与帮助 | `/help` | 公开 |
| 帮助文章管理 | `/dashboard/help` | `SUPER_ADMIN` |

顶部标签「学习与帮助」位于最右侧；管理员在控制台左侧「管理员」区域可以看到
「帮助文章」。

## 自带文章

- `skills`：Skill 的浏览、下载、发布和选择建议
- `dsh-plugins`：DSH 插件的浏览、安装、发布和常见问题
- `ai-tools`：AI 工具的下载、SHA-256 校验和发布

## 内容存储

```text
deploy/lan/site/content/help.json
deploy/lan/site/content/help/
  skills.md
  dsh-plugins.md
  ai-tools.md
```

`help.json` 是文章索引：

```json
{
  "version": 1,
  "updatedAt": "2026-11-06T08:00:00.000Z",
  "articles": [
    {
      "id": "skills",
      "title": "Skill 使用方法",
      "summary": "浏览、搜索、下载和安装团队技能。",
      "file": "help/skills.md",
      "builtin": true,
      "updatedAt": "2026-11-06T08:00:00.000Z"
    }
  ]
}
```

## 管理员编辑

`/dashboard/help` 提供：

- 新建文章（ID 仅允许小写字母、数字和连字符）
- 编辑标题、摘要和 Markdown 正文
- Markdown 预览
- 保存/发布
- 删除非内置文章

保存时先写 `help/{id}.md`，再写 `help.json`；通过 nginx WebDAV PUT 完成，需要网站
登录。保存前会重新读取索引并比较 `updatedAt`，其他管理员已更新时提示冲突。

## 运行时

- 公开页面：`web/src/pages/help.tsx`
- 管理页面：`web/src/pages/dashboard/help.tsx`
- 索引/文章读写：`web/src/features/help/help-content.ts`
- Markdown 渲染：`web/src/features/skill/markdown-renderer.tsx`
- 文章索引：`deploy/lan/site/content/help.json`
