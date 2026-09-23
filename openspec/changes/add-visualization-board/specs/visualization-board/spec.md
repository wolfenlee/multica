## ADDED Requirements

### Requirement: 画板页面路由与导航入口

系统 SHALL 在 workspace 作用域提供 `/{workspaceSlug}/visualization` 页面，并将其登记为一级导航页：`workspacePaths` 提供无参路径方法、路由段 `visualization` 进入保留字表（前后端同源）、侧边栏 AI Team 导航组出现入口、桌面端可承载同名 tab。

#### Scenario: 打开画板页面

- **WHEN** 已登录用户访问 `/{workspaceSlug}/visualization`（web 或桌面端 tab）

- **THEN** 页面在 dashboard 布局内渲染可视化调度画板，侧边栏对应项呈选中态

#### Scenario: 路由段不被工作区占用

- **WHEN** 创建 slug 为 `visualization` 的工作区

- **THEN** 创建被拒绝（该段已在保留字表中登记）

### Requirement: 只读图渲染

画板 SHALL 以 React Flow（`@xyflow/react` v12）渲染 workspace 内调度实体的节点-边图，并使用 `@dagrejs/dagre` 自动布局；初始版本为只读视图，SHALL NOT 提供画布内的增删改能力。

#### Scenario: 展示实体拓扑

- **WHEN** 页面加载完成且工作区存在智能体/小队等可调度实体

- **THEN** 画板以自动布局渲染对应节点与关系边，无手工排版

#### Scenario: 无可展示实体

- **WHEN** 工作区内没有任何可展示实体

- **THEN** 画板呈现空态提示而非空白画布

### Requirement: 复用既有数据通道零后端改动

画板的数据获取 SHALL 复用既有 REST API 与 WebSocket 事件通道（含断线重连语义），实现 SHALL NOT 为画板新增后端接口、数据库迁移或新的 WS 消息类型。

#### Scenario: 实时状态更新

- **WHEN** 画板打开期间某实体的既有 WS 事件到达

- **THEN** 对应节点状态随事件更新，无需手动刷新
