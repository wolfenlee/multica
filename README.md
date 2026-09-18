# Multica 自托管部署（Mac mini）

- **用途**：Multica（人 + AI agent 协作任务看板）自托管服务，管理本机开发任务
- **来源**：git@github.com:multica-ai/multica.git（GitHub 账号 wolfenlee），部署于 2026-09-18
- **负责人**：mac 用户（个人）
- **敏感性**：`.env` 含 JWT_SECRET / POSTGRES_PASSWORD / VCS 加密密钥，**禁止外传/提交**
- **访问**：Web http://localhost:3000 ，API http://localhost:8180（仅本机 127.0.0.1；远程用 SSH 隧道）
- **组件**：colima VM (4C/6G, 开机自启 `brew services`) + docker compose（postgres pgvector / backend / frontend），数据在 named volumes（pgdata、backend_uploads），**位于 ~/.colima 的 VM 磁盘内，不在本盘**
- **重建方式**：`make selfhost`（自动生成 .env 密钥）；colima 配置见 ~/.colima/default/colima.yaml（含 DNS 修复 provisioning 和 daocloud 镜像源）
- **备份状态**：未配置（pgdata 在 VM 内置盘，如需备份用 `docker exec multica-postgres-1 pg_dump`）
- **CLI**：~/.local/bin/multica（v0.4.44），daemon 日志 ~/.multica/daemon.log
