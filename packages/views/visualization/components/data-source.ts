"use client";

import type { BoardActor, BoardActorType, BoardEdge, BoardGraph, BoardIssue } from "./contract";

/**
 * The single data seam between the board UI and the data layer.
 *
 * This card ships a fixture whose shape IS the contract (`BoardGraph`); the
 * stage-2 integration replaces the body of {@link useBoardDataSource} with the
 * data card's `useBoardData` + `useBoardRealtime` while the exported names and
 * the returned shape stay frozen. Nothing else in components/ may fetch data.
 */

export interface BoardRealtime {
  /** WS connection state — toolbar indicator; gray "reconnecting" when false. */
  connected: boolean;
  /** Epoch ms of the last applied event; rendered as the sync clock. */
  lastSyncedAt: number;
  /** Node ids to pulse (brand glow) because an event just touched them. */
  flashIds: readonly string[];
}

export interface BoardDataSourceResult {
  graph: BoardGraph;
  realtime: BoardRealtime;
  /** "demo" while the fixture is wired in; the integration flips it to "live". */
  source: "demo" | "live";
}

export function useBoardDataSource(): BoardDataSourceResult {
  return { graph: FIXTURE_GRAPH, realtime: FIXTURE_REALTIME, source: "demo" };
}

// ---------------------------------------------------------------------------
// fixture — synthetic but shaped exactly like the contract; mirrors the design
// sample's coverage: multi-level issue tree, cross-lane parents, all seven
// built-in statuses plus a custom one, squad/agent/member assignment, a squad
// with leader and members, an unnamed member, and a long title.
// ---------------------------------------------------------------------------

const issue = (partial: BoardIssue): BoardIssue => partial;

const ISSUES: BoardIssue[] = [
  // ---- ungrouped (stage=null) — research lane
  issue({
    id: "i157", number: 157, identifier: "WOLFLEE-157", title: "调研：可视化调度画板技术选型与规模策略",
    statusKey: "in_progress", statusCategory: "started", statusName: "In Progress",
    parentId: null, stage: null, depth: 0,
    assignee: { id: "agent:flowwatch", type: "agent" }, childProgress: { total: 3, done: 1 },
  }),
  issue({
    id: "i158", number: 158, identifier: "WOLFLEE-158", title: "设计：可视化调度画板布局与视觉规范（含高保真样张与交互契约）",
    statusKey: "in_progress", statusCategory: "started", statusName: "In Progress",
    parentId: "i157", stage: null, depth: 1,
    assignee: { id: "agent:designer", type: "agent" }, childProgress: { total: 3, done: 0 },
  }),
  issue({
    id: "i159", number: 159, identifier: "WOLFLEE-159", title: "开发：实现可视化调度画板",
    statusKey: "backlog", statusCategory: "unstarted", statusName: "Backlog",
    parentId: "i157", stage: null, depth: 1,
    assignee: { id: "squad:dev-strike", type: "squad" }, childProgress: { total: 3, done: 0 },
  }),
  issue({
    id: "i160", number: 160, identifier: "WOLFLEE-160", title: "v0.6.0 发布说明与升级公告",
    statusKey: "blocked", statusCategory: "started", statusName: "Blocked",
    parentId: "i157", stage: null, depth: 1,
    assignee: { id: "agent:maker", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i161", number: 161, identifier: "WOLFLEE-161", title: "拆分：数据层与图模型聚合",
    statusKey: "todo", statusCategory: "unstarted", statusName: "Todo",
    parentId: "i158", stage: null, depth: 2,
    assignee: { id: "agent:codex", type: "agent" }, childProgress: { total: 2, done: 0 },
  }),
  issue({
    id: "i161a", number: 1611, identifier: "WOLFLEE-1611", title: "types 与数据钩子骨架",
    statusKey: "done", statusCategory: "done", statusName: "Done",
    parentId: "i161", stage: null, depth: 3,
    assignee: { id: "agent:codex", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i161b", number: 1612, identifier: "WOLFLEE-1612", title: "dagre 泳道布局纯函数与单测",
    statusKey: "todo", statusCategory: "unstarted", statusName: "Todo",
    parentId: "i161", stage: null, depth: 3,
    assignee: null, childProgress: null,
  }),
  issue({
    id: "i162", number: 162, identifier: "WOLFLEE-162", title: "拆分：画板 UI 与交互",
    statusKey: "todo", statusCategory: "unstarted", statusName: "Todo",
    parentId: "i158", stage: null, depth: 2,
    assignee: { id: "member:human", type: "member" }, childProgress: { total: 2, done: 0 },
  }),
  issue({
    id: "i163", number: 163, identifier: "WOLFLEE-163", title: "拆分：实时刷新与事件接入",
    statusKey: "todo", statusCategory: "unstarted", statusName: "Todo",
    parentId: "i158", stage: null, depth: 2,
    assignee: { id: "member:8c1e42aa", type: "member" }, childProgress: null,
  }),
  // ungrouped ops issues (sample coverage)
  issue({
    id: "i140", number: 140, identifier: "WOLFLEE-140", title: "docker 构建支持 GOPROXY 覆盖",
    statusKey: "done", statusCategory: "done", statusName: "Done",
    parentId: null, stage: null, depth: 0,
    assignee: { id: "agent:claude", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i144", number: 144, identifier: "WOLFLEE-144", title: "修复 registry 内网穿透与缓存一致性",
    statusKey: "cancelled", statusCategory: "closed", statusName: "Cancelled",
    parentId: null, stage: null, depth: 0,
    assignee: { id: "agent:maker", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i145", number: 145, identifier: "WOLFLEE-145", title: "v0.6.0 发布与升级公告",
    statusKey: "awaiting_customer", statusCategory: "started", statusName: "待客户验收",
    parentId: null, stage: null, depth: 0,
    assignee: { id: "agent:claude-elite", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i146", number: 146, identifier: "WOLFLEE-146", title: "Gitea 每日备份与恢复演练",
    statusKey: "in_review", statusCategory: "started", statusName: "In Review",
    parentId: null, stage: null, depth: 0,
    assignee: { id: "agent:maker", type: "agent" }, childProgress: null,
  }),

  // ---- stage 1 · research
  issue({
    id: "i151", number: 151, identifier: "WOLFLEE-151", title: "调研：任务稽查与报表盘点",
    statusKey: "done", statusCategory: "done", statusName: "Done",
    parentId: null, stage: 1, depth: 0,
    assignee: { id: "agent:researcher", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i155", number: 155, identifier: "WOLFLEE-155", title: "文档：每执行手册与调用交代",
    statusKey: "done", statusCategory: "done", statusName: "Done",
    parentId: "i151", stage: 1, depth: 1,
    assignee: { id: "agent:maker", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i156", number: 156, identifier: "WOLFLEE-156", title: "调研：multica 数据面板可视化方案（跨泳道子卡）",
    statusKey: "in_review", statusCategory: "started", statusName: "In Review",
    parentId: "i157", stage: 1, depth: 1,
    assignee: { id: "agent:researcher", type: "agent" }, childProgress: null,
  }),

  // ---- stage 2 · design
  issue({
    id: "i154", number: 154, identifier: "WOLFLEE-154", title: "设计：告警路由与升级策略",
    statusKey: "blocked", statusCategory: "started", statusName: "Blocked",
    parentId: null, stage: 2, depth: 0,
    assignee: { id: "agent:codex", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i154a", number: 1541, identifier: "WOLFLEE-1541", title: "papercut：接入 PageDuty（已取消未排期）",
    statusKey: "cancelled", statusCategory: "closed", statusName: "Cancelled",
    parentId: "i154", stage: 2, depth: 1,
    assignee: null, childProgress: null,
  }),
  issue({
    id: "i154b", number: 1542, identifier: "WOLFLEE-1542", title: "设计：可视化调度画板布局与视觉规范",
    statusKey: "in_progress", statusCategory: "started", statusName: "In Progress",
    parentId: "i158", stage: 2, depth: 2,
    assignee: { id: "squad:dev-strike", type: "squad" }, childProgress: { total: 2, done: 0 },
  }),

  // ---- stage 3 · development
  issue({
    id: "i152", number: 152, identifier: "WOLFLEE-152", title: "开发：告警路由抑制聚合",
    statusKey: "blocked", statusCategory: "started", statusName: "Blocked",
    parentId: "i154", stage: 3, depth: 1,
    assignee: { id: "agent:claude", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i150", number: 150, identifier: "WOLFLEE-150", title: "开发：实现可视化调度画板（React Flow 接入与三层自定义节点）",
    statusKey: "backlog", statusCategory: "unstarted", statusName: "Backlog",
    parentId: "i159", stage: 3, depth: 2,
    assignee: { id: "squad:dev-strike", type: "squad" }, childProgress: { total: 2, done: 0 },
  }),
  issue({
    id: "i164", number: 164, identifier: "WOLFLEE-164", title: "拆分：脚手架（依赖与路由占位）",
    statusKey: "done", statusCategory: "done", statusName: "Done",
    parentId: "i150", stage: 3, depth: 3,
    assignee: { id: "agent:claude", type: "agent" }, childProgress: null,
  }),
  issue({
    id: "i165", number: 165, identifier: "WOLFLEE-165", title: "拆分：React Flow 接入与三层自定义节点定义",
    statusKey: "todo", statusCategory: "unstarted", statusName: "Todo",
    parentId: "i150", stage: 3, depth: 3,
    assignee: null, childProgress: null,
  }),
];

const ACTORS: BoardActor[] = [
  { id: "squad:dev-strike", actorType: "squad", name: "dev-strike", runtimeStatus: "working", activeCount: 2 },
  { id: "agent:dev-leader", actorType: "agent", name: "dev-leader", runtimeStatus: "working", model: "glm-5.3", activeCount: 2 },
  { id: "agent:claude", actorType: "agent", name: "claude", runtimeStatus: "working", model: "glm-5.3-flash", activeCount: 1 },
  { id: "agent:claude-elite", actorType: "agent", name: "claude-elite", runtimeStatus: "idle", model: "glm-5.3", activeCount: 0 },
  { id: "agent:codex", actorType: "agent", name: "codex", runtimeStatus: "working", model: "gpt-5.6-sol", activeCount: 2 },
  { id: "agent:designer", actorType: "agent", name: "designer", runtimeStatus: "working", model: "glm-5.3-flash", activeCount: 1 },
  { id: "agent:flowwatch", actorType: "agent", name: "flowwatch", runtimeStatus: "online", model: "claude-4.5", activeCount: 1 },
  { id: "agent:maker", actorType: "agent", name: "maker", runtimeStatus: "idle", model: "doubao-seed", activeCount: 0 },
  { id: "agent:researcher", actorType: "agent", name: "researcher", runtimeStatus: "offline", model: "qwen-max", activeCount: 0 },
  { id: "agent:fleet-heartbeat", actorType: "agent", name: "fleet-heartbeat", runtimeStatus: "idle", model: "haiku-4.5", activeCount: 0 },
  { id: "member:human", actorType: "member", name: "human", runtimeStatus: "offline", activeCount: 1 },
  // human members have no display name in the API — data layer backfills
  // 「成员 + short id」, the fixture mirrors that convention.
  { id: "member:8c1e42aa", actorType: "member", name: "Member 8c1e42aa", runtimeStatus: "offline" },
];

function edgesOf(issues: BoardIssue[]): BoardEdge[] {
  const edges: BoardEdge[] = [];
  for (const item of issues) {
    if (item.parentId) {
      edges.push({ id: `parent:${item.id}`, type: "parent", source: item.parentId, target: item.id });
    }
    if (item.assignee) {
      edges.push({ id: `assignee:${item.id}`, type: "assignee", source: item.id, target: item.assignee.id });
    }
  }
  // squad dev-strike: leader + members (leader is the agent that fans out)
  edges.push({ id: "sm:squad-leader", type: "squadMember", source: "squad:dev-strike", target: "agent:dev-leader" });
  for (const member of ["agent:claude", "agent:codex", "agent:designer", "member:human"]) {
    edges.push({ id: `sm:leader-${member}`, type: "squadMember", source: "agent:dev-leader", target: member });
  }
  return edges;
}

const FIXTURE_GRAPH: BoardGraph = {
  issueNodes: ISSUES,
  actorNodes: ACTORS,
  edges: edgesOf(ISSUES),
};

const FIXTURE_REALTIME: BoardRealtime = {
  connected: true,
  lastSyncedAt: Date.now(),
  flashIds: [],
};

/** Assignee type → actor roster coverage check used by tests and filters. */
export const FIXTURE_ACTOR_TYPES: readonly BoardActorType[] = ["squad", "agent", "member"];
