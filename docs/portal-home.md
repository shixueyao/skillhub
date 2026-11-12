# 内部 AI 门户：首页与 AI 应用

局域网部署中，根路径 `/` 是团队门户首页（公告、Hero、精选 AI 应用入口），
`/apps` 是独立的 AI 应用页（分类筛选、全部应用卡片）。首页设置由超级管理员在
`/dashboard/home-content` 维护，AI 应用内容在 `/dashboard/apps` 维护，二者保存在
`deploy/lan/site/content/home.json`。

## 内容模型

```json
{
  "version": 2,
  "updatedAt": "2026-11-06T00:00:00.000Z",
  "enabled": true,
  "homeManagedByApp": true,
  "notice": { "enabled": true, "level": "info", "text": "公告" },
  "hero": {
    "title": "内部 AI 工作台",
    "description": "团队 AI 应用统一入口",
    "primaryButtonText": "浏览 AI 应用",
    "primaryButtonUrl": "/apps"
  },
  "sections": [
    {
      "id": "apps",
      "title": "AI 应用",
      "description": "团队常用能力",
      "layout": "grid",
      "items": [
        {
          "title": "知识库助手",
          "body": "检索团队知识",
          "linkText": "打开",
          "linkUrl": "/search",
          "icon": "📚",
          "category": "知识",
          "tags": ["RAG"],
          "showOnHome": true
        }
      ]
    }
  ],
  "nav": {}
}
```

- `enabled=false` 或读取失败时，首页回退到官方营销 Landing 页。
- `homeManagedByApp=true` 时，局域网注入脚本不再改写首页 DOM。
- 旧版 `cards` 文档会自动迁移为一个 `AI 应用` 区块；新写入始终使用 `sections`。
- `sections` 始终渲染在 `/apps`；其中 `showOnHome=true` 的卡片同时出现在首页
  「AI 应用」区域，首页不展示未勾选的卡片。
- 首页「AI 应用」区域右上角的「更多 AI 应用」跳转到 `/apps`。
- 链接以 `http(s)://` 开头时按外链打开，否则按站内路径处理。

## 编辑与发布

1. 使用 `SUPER_ADMIN` 账号登录。
2. 首页：控制台左侧「首页内容」→ `/dashboard/home-content`，编辑公告与 Hero。
3. AI 应用：控制台左侧「AI 应用」→ `/dashboard/apps`，或从 `/apps` 页点「管理 AI 应用」，
   编辑区块与卡片；在卡片上勾选「在首页展示」，即可把该入口放到首页。
4. 点击「发布」。`/apps` 更新全部应用；勾选的卡片同时更新首页快捷入口。

保存前会重新 GET 当前文件并比较 `updatedAt`；如果其他管理员已发布更新，页面会
提示冲突并要求重新载入，避免静默覆盖。保存通过 nginx WebDAV PUT 写入
`/site/content/home.json`，需要网站会话；未登录返回 401。

## 运行时

- 首页组件：`web/src/pages/portal-home.tsx`
- AI 应用页：`web/src/pages/apps.tsx`
- 应用卡片：`web/src/features/portal/portal-item-card.tsx`
- 首页编辑器：`web/src/pages/dashboard/home-content.tsx`
- AI 应用管理：`web/src/pages/dashboard/apps.tsx`
- 区块/卡片编辑器：`web/src/features/portal/portal-sections-editor.tsx`
- 内容读取/保存/迁移：`web/src/features/portal/home-content.ts`
- 旧 `/site/admin.html` 仅做跳转。
- 内容端点：`GET /site/content/home.json` 公开；`PUT` 需要网站登录。
