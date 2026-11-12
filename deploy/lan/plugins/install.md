# DSH 插件安装指引（内网）

本目录由 SkillHub 的 web 容器以只读方式提供，访问地址为
`http://<内网地址>/dsh-plugins/`。浏览器打开该地址可查看版本清单并一键复制安装命令。

## 1. 安装插件（在装有 dsh 的客户端机器上执行）

```sh
dsh plugin --profile web add http://<内网地址>/dsh-plugins/versions/astron-team-skillhub-dsh-0.6.2.tgz --ignore-scripts
dsh web --port 3080
```

- `--profile web` 换成你实际使用的 Web Profile。
- `--ignore-scripts` 不会执行 tarball 内的安装脚本，适合内网受控分发。
- 若首次从 URL 安装被 DSH 拒绝，请改用「先下载、再本地安装」：

```sh
curl -fLO http://<内网地址>/dsh-plugins/versions/astron-team-skillhub-dsh-0.6.2.tgz
dsh plugin --profile web add ./astron-team-skillhub-dsh-0.6.2.tgz --ignore-scripts
```

## 2. 校验包完整性（可选但建议）

```sh
# Linux / macOS
sha256sum astron-team-skillhub-dsh-0.6.2.tgz
# Windows
certutil -hashfile astron-team-skillhub-dsh-0.6.2.tgz SHA256
```

与门户页或 `index.json` 中的 `sha256` 比对。管理员可运行
`deploy/lan/scripts/publish-plugin.sh verify` 复核整个仓库。

## 3. 把技能来源指向内网 SkillHub

进入 DSH **插件 → @astron-team/skillhub-dsh → SkillHub 设置 → 技能来源**：

1. 添加/选择来源，地址填写 `http://<内网地址>`（只填基础地址，不要带 `/api`、
   不要带查询参数；子路径部署时带上子路径）。
2. 点「测试连接」，看到公开目录可读后点「保存配置」。
3. 打开侧栏「技能中心」即可搜索、下载、安装、启停和升级技能，全程不访问公网。

> 插件缺省连接公网 `https://skill.xfyun.cn`。**必须完成本步**，否则内网环境会连接失败。

## 4. 兼容性

官方插件 0.6.2 支持 DSH `0.2.0-rc.2` / `0.2.1-rc.2` / `0.2.1-rc.5`，
Host Node 要求 `>=24.2.0 <25`。版本不匹配时 DSH 会拒绝写入，请到门户页选择
与你的 DSH 版本匹配的插件版本。

## 5. 管理员：发布 / 回滚

**Web 端**：用 SkillHub 网站账号在网页右上角登录（账号见 `deploy/lan/ACCESS.txt`，
没有独立管理口令），打开首页点顶部导航「DSH 插件市场」，再点「+ 发布」；
表单顶部可选择发布 **DSH 插件 (.tgz)** 或 **技能 Skill (.zip)**。
即可发布插件、设置分类与标签、编辑简介、设为推荐 / 下架 / 删除版本。
只读浏览与复制安装命令无需登录。详见 `deploy/lan/README.md` 5.1。

**命令行**（直接操作宿主机文件，无需登录）：

```sh
cd deploy/lan/scripts
./publish-plugin.sh list                          # 查看版本
./publish-plugin.sh list --category 官方插件 -q DSH   # 按分类 / 关键字筛选
./publish-plugin.sh publish /path/to/plugin.tgz --notes "修复说明" \
    --category 集成扩展 --tags "官方,DSH"
./publish-plugin.sh activate @astron-team/skillhub-dsh 0.6.1   # 回滚推荐版本
./publish-plugin.sh yank @astron-team/skillhub-dsh 0.6.2        # 下架但保留文件
./publish-plugin.sh verify                        # 校验全部 sha256
```

发布后无需重启容器，刷新页面即可看到新版本。
