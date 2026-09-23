## Why

Multica 的工作区缺少一张全局视角的「可视化调度画板」：智能体、小队、任务等实体之间的协作关系只能通过列表页逐个查看，无法一眼看清整体调度拓扑。母卡 WOLFLEE-159 立项开发该画板，本变更是其规范基线。

## What Changes

- 新增 workspace 级页面 `/<workspaceSlug>/visualization`，作为只读的可视化调度画板。
- 画板使用 React Flow（`@xyflow/react` v12）渲染节点图，使用 `@dagrejs/dagre` 做自动布局。
- 只读可视化：复用既有 REST API 与 WebSocket 通道获取实体与状态，**零后端改动**。
- 实施分三段：scaffold（路由/导航/依赖基线，已完成）→ data（数据层）→ ui（画板 UI）。

## Capabilities

### New Capabilities
- `visualization-board`: workspace 可视化调度画板 —— 页面路由与导航入口、只读图渲染（节点/边/自动布局）、实时状态展示。

### Modified Capabilities

## Impact

- `apps/web`：新增 `/{workspaceSlug}/visualization` 路由页。
- `apps/desktop`：workspace 路由表新增同名路由（tab 承载）。
- `packages/core/paths`：`workspacePaths.visualization`、WORKSPACE_PAGES、保留字表。
- `packages/views`：新增 `visualization` 模块；`app-sidebar` AI Team 导航组新增入口；5 语言 layout 文案。
- 依赖：catalog 新增 `@xyflow/react@^12`、`@dagrejs/dagre@^1.1.4`（仅前端）。
- 不涉及 `server/` 业务代码与数据库（保留字登记除外）。
