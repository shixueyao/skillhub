# SkillHub 局域网迁移包

本目录包含当前在线实例的数据库与对象存储恢复数据，配合 `deploy/lan/images/*.tar`
中的离线镜像，可在没有外网的局域网机器上恢复完整环境。

## 包内内容

```text
skillhub/
├── run.sh / stop.sh
├── compose.release.yml
├── deploy/lan/
│   ├── env/lan.env                 # 目标配置（含数据库/管理员密码）
│   ├── images/*.tar                # 5 个离线镜像
│   ├── site/                       # 首页、帮助、页面设置等内容
│   ├── plugins/                    # DSH 插件仓库
│   └── migration/
│       ├── restore.sh
│       └── backup/
│           ├── postgres.dump       # 当前数据库
│           └── storage.tar.gz      # 技能/工具/MCP 附件对象存储
└── 源码、文档、脚本
```

## 目标机要求

- Linux 局域网机器（推荐）
- Docker Engine + Docker Compose v2
- 解压后至少预留 4 GB 磁盘空间（镜像 + 数据 + 运行空间）

## 迁移步骤

1. 将压缩包上传到目标机并解压：

   ```bash
   tar xzf skillhub-lan-*.tar.gz
   cd skillhub
   chmod +x run.sh stop.sh deploy/lan/migration/restore.sh deploy/lan/scripts/*.sh
   ```

2. 恢复数据库和对象存储（首次迁移必须执行）：

   ```bash
   ./deploy/lan/migration/restore.sh --host 192.168.1.20
   ```

   如果目标机已有旧的 SkillHub 数据卷，确认覆盖时加 `--force`。

3. 启动服务：

   ```bash
   ./run.sh --host 192.168.1.20
   ```

4. 打开 `http://192.168.1.20`，使用 `deploy/lan/ACCESS.txt` 中的管理员账号登录。

如果 8080 已被其他程序占用，`run.sh` 会自动改用下一个可用 API 端口，并在
`ACCESS.txt` 中写入实际端口；也可以显式指定：

```bash
./run.sh --host 192.168.1.20 --api-port 18080
```

## 注意事项

- `restore.sh` 会导入镜像、启动 PostgreSQL、恢复 `postgres.dump`，并把
  `storage.tar.gz` 解压到 `skillhub-lan_skillhub_storage` 卷。
- 数据恢复完成后不要再执行 `./stop.sh --purge`，否则会删除数据库和对象存储。
- 目标机 IP 改变时，重新执行 `./run.sh --host <新IP>` 即可；它会更新
  `SKILLHUB_PUBLIC_BASE_URL` 和插件清单。
- `deploy/lan/env/lan.env` 含密码，请按敏感文件保管。
- 迁移包包含当前数据库中的用户、技能、AI 工具、MCP 服务及附件、DSH 插件、页面设置与网站名称。
- 若只想全新部署（不迁移现有数据），不要运行 `restore.sh`，直接执行
  `./run.sh --host <IP>`。
