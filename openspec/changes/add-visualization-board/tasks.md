## 1. Scaffold（卡 A · 已完成）

- [x] 1.1 OpenSpec 脚手架 init 并直推 main（`chore(openspec): 初始化 OpenSpec 脚手架`）
- [x] 1.2 catalog 新增 `@xyflow/react@^12`、`@dagrejs/dagre@^1.1.4`，`packages/views` 以 `catalog:` 引入并更新 lockfile
- [x] 1.3 路由接线：web `/{ws}/visualization` 页、`workspacePaths.visualization`、保留字表（JSON + 生成物）、sidebar 导航项、route-icons/WORKSPACE_PAGES/tab-subject、桌面端路由
- [x] 1.4 i18n：5 语言 `layout.nav.visualization` 与占位文案
- [x] 1.5 占位模块 `packages/views/visualization/index.tsx`（导出名 `VisualizationBoardPage` 定死）
- [x] 1.6 `pnpm typecheck` / `pnpm lint` / `pnpm test` 通过

## 2. Data（卡 B · 已完成）

- [x] 2.1 选定画板实体范围与关系边语义（智能体/小队/任务等），纯客户端组合既有 queries（`data/types.ts` 契约真身：issue/member/agent/squad 节点 + parent/assignee/squadMember 三类边）
- [x] 2.2 数据 hook 层：复用既有 REST queries 与 WS 失效机制，产出画板节点/边模型（`use-board-data.ts` + `use-board-realtime.ts`，8 类事件失效/闪光）
- [x] 2.3 dagre 自动布局工具函数（节点尺寸 → 坐标），含单测（落地于 `components/layout.ts` `layoutBoard`，与 UI 单源；`data/board-graph.ts` 供泳道/折叠/可见性等布局输入，集成审定的偏离）

## 3. UI（卡 C · 已完成）

- [x] 3.1 React Flow 画板组件：节点/边渲染、自动布局接入、空态
- [x] 3.2 只读交互：缩放/平移、节点详情跳转（复用既有路由）；不提供画布内增删改
- [x] 3.3 桌面端 tab 标题/图标走既有 tab-presentation 通道
- [x] 3.4 重写占位页 body（不改 `VisualizationBoardPage` 导出名），补组件测试与 E2E（组件测试 39 例已落；E2E 未做——本仓无既有 E2E 基线，浏览器真实数据冒烟列 PR 遗留项）
