## 1. Scaffold（卡 A · 已完成）

- [x] 1.1 OpenSpec 脚手架 init 并直推 main（`chore(openspec): 初始化 OpenSpec 脚手架`）
- [x] 1.2 catalog 新增 `@xyflow/react@^12`、`@dagrejs/dagre@^1.1.4`，`packages/views` 以 `catalog:` 引入并更新 lockfile
- [x] 1.3 路由接线：web `/{ws}/visualization` 页、`workspacePaths.visualization`、保留字表（JSON + 生成物）、sidebar 导航项、route-icons/WORKSPACE_PAGES/tab-subject、桌面端路由
- [x] 1.4 i18n：5 语言 `layout.nav.visualization` 与占位文案
- [x] 1.5 占位模块 `packages/views/visualization/index.tsx`（导出名 `VisualizationBoardPage` 定死）
- [x] 1.6 `pnpm typecheck` / `pnpm lint` / `pnpm test` 通过

## 2. Data（卡 B）

- [ ] 2.1 选定画板实体范围与关系边语义（智能体/小队/任务等），纯客户端组合既有 queries
- [ ] 2.2 数据 hook 层：复用既有 REST queries 与 WS 失效机制，产出画板节点/边模型
- [ ] 2.3 dagre 自动布局工具函数（节点尺寸 → 坐标），含单测

## 3. UI（卡 C）

- [ ] 3.1 React Flow 画板组件：节点/边渲染、自动布局接入、空态
- [ ] 3.2 只读交互：缩放/平移、节点详情跳转（复用既有路由）；不提供画布内增删改
- [ ] 3.3 桌面端 tab 标题/图标走既有 tab-presentation 通道
- [ ] 3.4 重写占位页 body（不改 `VisualizationBoardPage` 导出名），补组件测试与 E2E
