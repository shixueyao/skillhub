# 网站与页面设置

管理员可以在 `/dashboard/pages` 统一设置网站名称、顶部标签页显示名称，以及以下公共页面的标题和描述：

| 页面 | 地址 |
| --- | --- |
| AI 应用 | `/apps` |
| AI 工具 | `/tools` |
| MCP 服务 | `/mcp` |
| 技能市场 | `/search` |
| 技能套件 | `/suites` |
| DSH 插件 | `/plugins` |

入口位于控制台左侧「管理员」区域的「页面设置」。

## 内容模型

定义保存在 `deploy/lan/site/content/pages.json`：

```json
{
  "version": 1,
  "updatedAt": "2026-11-06T12:00:00.000Z",
  "siteName": "SkillHub",
  "tabLabels": {
    "home": "",
    "apps": "",
    "tools": "",
    "mcp": "",
    "skills": "",
    "suites": "",
    "plugins": "",
    "publish": "",
    "mySkills": "",
    "mySuites": "",
    "myPlugins": "",
    "namespaces": "",
    "dashboard": "",
    "help": ""
  },
  "pages": {
    "apps": { "title": "AI 应用", "description": "团队 AI 应用与内部工具" },
    "tools": { "title": "", "description": "" },
    "mcp": { "title": "", "description": "" },
    "skills": { "title": "", "description": "" },
    "suites": { "title": "", "description": "" },
    "plugins": { "title": "", "description": "" }
  }
}
```

- `siteName` 只影响前端品牌显示：顶部导航、登录/注册页左侧品牌区、旧版 `/skills` 首页、落地页架构图，以及浏览器标签标题。留空默认 `SkillHub`。
- `tabLabels` 控制顶部导航标签文字，支持首页、AI 应用、AI 工具、MCP、技能市场、技能套件、DSH 插件、发布、我的技能、我的套件、我的插件、命名空间、控制台、学习与帮助；留空使用当前界面语言的默认名称。
- 它不会修改接口、CLI、安装包、数据库或目录名称。
- 页面字段留空时使用界面语言内置的默认文案。
- 有值时覆盖页面的 `<h1>` 和描述，不影响页面中的徽标、按钮或筛选区。
- 网站名称与各页面共用同一个 `updatedAt` 冲突检查。

## 运行时

- 管理页：`web/src/pages/dashboard/pages.tsx`
- 读取/保存：`web/src/features/pages/page-content.ts`
- 网站名称与标签页上下文：`web/src/features/site/site-name.tsx`
- 顶部导航读取标签页覆盖：`web/src/app/layout.tsx`
- 公共页通过 `usePageHeader` 读取覆盖值，并在请求失败时回退到 i18n 默认文案。
- 保存通过 nginx WebDAV PUT 写入 `/site/content/pages.json`。
