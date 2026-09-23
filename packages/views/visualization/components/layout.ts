/**
 * Board layout: turns the board graph + view state into positioned React Flow
 * nodes/edges following the design's layout source (02-prototype v1.1):
 *
 * - Swimlanes stack vertically, ungrouped (stage=null) first, then STAGE n
 *   ascending — the vertical axis reads as barrier progress and parent edges
 *   flow downward overall.
 * - Within a lane, issues lay out top-down via dagre (intra-lane parent edges
 *   only; cross-lane parent edges are drawn as long vertical curves).
 * - Dispatch actors occupy a fixed column on the right: squads top, agents
 *   middle, members bottom. An expanded squad grows its leader + member cards
 *   in place.
 *
 * Fold/filter/search are supplied as precomputed sets by the page; this module
 * resolves their interplay: filter visibility wins over folding on the paths
 * that lead to a kept node (broken-tree prevention from the design contract).
 */
import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { BoardActor, BoardEdge, BoardGraph, BoardIssue } from "./contract";
import { toFlowEdges } from "./edge-styles";

// --- node geometry (design: issue 248px, actor/squad 208px, grid 24px) ---

export const ISSUE_NODE_SIZE = { width: 248, height: 104 } as const;
export const ACTOR_NODE_SIZE = { width: 208, height: 68 } as const;
export const SQUAD_NODE_SIZE = { width: 208, height: 88 } as const;

const LANE_PAD_X = 16;
const LANE_PAD_Y = 14;
const LANE_LABEL_H = 30;
const LANE_GAP = 40;
const ACTOR_COLUMN_GAP = 96;
const DAGRE_NODESEP = 20;
const DAGRE_RANKSEP = 48;
const SQUAD_INDENT = 32;
const SQUAD_MEMBER_GAP = 10;

// --- typed flow nodes ---

export type IssueNodeData = {
  issue: BoardIssue;
  hasChildren: boolean;
  descendantCount: number;
  collapsed: boolean;
  dimmed: boolean;
  crossLane: boolean;
};

export type ActorVariant = "agent" | "member" | "leader";

export type ActorNodeData = {
  actor: BoardActor;
  variant: ActorVariant;
  dimmed: boolean;
};

export type SquadNodeData = {
  actor: BoardActor;
  memberCount: number;
  leaderName: string | null;
  expanded: boolean;
  dimmed: boolean;
};

export type LaneNodeData = {
  stage: number | null;
  label: string;
  count: number;
};

export type IssueFlowNode = Node<IssueNodeData, "issue">;
export type ActorFlowNode = Node<ActorNodeData, "actor">;
export type SquadFlowNode = Node<SquadNodeData, "squad">;
export type LaneFlowNode = Node<LaneNodeData, "lane">;
export type BoardFlowNode = IssueFlowNode | ActorFlowNode | SquadFlowNode | LaneFlowNode;

// --- options / result ---

export interface BoardLayoutOptions {
  collapsedIssues: ReadonlySet<string>;
  expandedSquads: ReadonlySet<string>;
  /** Issues removed by active filters, before parent-chain repair. */
  filterHidden: ReadonlySet<string>;
  /** Issues dimmed by search — stay visible at reduced opacity. */
  searchDimmed: ReadonlySet<string>;
  laneTitle: (stage: number | null) => string;
}

export interface BoardLane {
  stage: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
}

export interface BoardLayout {
  nodes: BoardFlowNode[];
  edges: Edge[];
  lanes: BoardLane[];
  /** Every issue id present on the canvas (lane + issue nodes). */
  visibleIssueIds: Set<string>;
}

// --- graph helpers ---

function childrenMapOf(issues: BoardIssue[]): Map<string, BoardIssue[]> {
  const children = new Map<string, BoardIssue[]>();
  for (const issue of issues) {
    if (!issue.parentId) continue;
    const list = children.get(issue.parentId);
    if (list) list.push(issue);
    else children.set(issue.parentId, [issue]);
  }
  return children;
}

function descendantCountOf(id: string, children: Map<string, BoardIssue[]>): number {
  let total = 0;
  const queue = [...(children.get(id) ?? [])];
  while (queue.length > 0) {
    const current = queue.pop()!;
    total += 1;
    queue.push(...(children.get(current.id) ?? []));
  }
  return total;
}

/** Default fold state: branches at depth >= 3 collapse (design first-screen budget). */
export function defaultCollapsedIssues(graph: BoardGraph): Set<string> {
  const children = childrenMapOf(graph.issueNodes);
  const byId = new Map(graph.issueNodes.map((issue) => [issue.id, issue]));
  const collapsed = new Set<string>();
  for (const issue of graph.issueNodes) {
    if (issue.depth >= 3 && (children.get(issue.id)?.length ?? 0) > 0) {
      // Only fold while an ancestor path is itself folded away; depth alone is
      // not meaningful when the parent chain is visible from a deep link.
      let ancestorsFolded = false;
      let cursor = issue.parentId;
      while (cursor) {
        const parent = byId.get(cursor);
        if (!parent) break;
        if (parent.depth >= 3 && (children.get(parent.id)?.length ?? 0) > 0) {
          ancestorsFolded = true;
          break;
        }
        cursor = parent.parentId;
      }
      if (ancestorsFolded || issue.depth > 3) collapsed.add(issue.id);
    }
  }
  return collapsed;
}

/**
 * Resolve which issues are on the canvas. Filter-first: kept issues plus their
 * ancestor chain (broken-tree prevention); folding then hides subtrees, except
 * along paths that still lead to a kept node.
 */
export function resolveVisibleIssues(
  graph: BoardGraph,
  options: Pick<BoardLayoutOptions, "collapsedIssues" | "filterHidden">,
): Set<string> {
  const { collapsedIssues, filterHidden } = options;
  const byId = new Map(graph.issueNodes.map((issue) => [issue.id, issue]));
  const children = childrenMapOf(graph.issueNodes);

  // 1. filter visibility + ancestor repair
  const kept = new Set<string>();
  for (const issue of graph.issueNodes) {
    if (!filterHidden.has(issue.id)) kept.add(issue.id);
  }
  const filterVisible = new Set(kept);
  const addAncestors = (id: string) => {
    let cursor = byId.get(id)?.parentId ?? null;
    while (cursor && !filterVisible.has(cursor)) {
      filterVisible.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  };
  for (const id of kept) addAncestors(id);

  // 2. folding: walk the visible forest, stop at collapsed nodes — unless a
  // filter-kept node lives below, in which case this path stays expanded.
  // With no filter active nothing is "rescued", so folds always fold.
  const filtering = filterHidden.size > 0;
  const hasKeptBelow = (id: string): boolean => {
    for (const child of children.get(id) ?? []) {
      if (kept.has(child.id)) return true;
      if (filterVisible.has(child.id) && hasKeptBelow(child.id)) return true;
    }
    return false;
  };

  const visible = new Set<string>();
  const visit = (id: string) => {
    visible.add(id);
    if (collapsedIssues.has(id) && !(filtering && hasKeptBelow(id))) return;
    for (const child of children.get(id) ?? []) {
      if (filterVisible.has(child.id)) visit(child.id);
    }
  };
  for (const issue of graph.issueNodes) {
    if (filterVisible.has(issue.id) && !(issue.parentId && filterVisible.has(issue.parentId))) {
      visit(issue.id);
    }
  }
  return visible;
}

// --- squad composition ---

export interface SquadStructure {
  leader: BoardActor | null;
  members: BoardActor[];
}

/** Leader = the squad-edge target that itself fans out to members; the rest are members. */
export function squadStructure(graph: BoardGraph, squadId: string): SquadStructure {
  const byId = new Map(graph.actorNodes.map((actor) => [actor.id, actor]));
  const squadEdges = graph.edges.filter((edge) => edge.type === "squadMember");
  const fanOut = new Set(squadEdges.map((edge) => edge.source));

  // First hop from the squad: the target that fans out itself is the leader.
  let leader: BoardActor | null = null;
  const firstHop: BoardActor[] = [];
  for (const edge of squadEdges) {
    if (edge.source !== squadId) continue;
    const actor = byId.get(edge.target);
    if (!actor) continue;
    if (fanOut.has(actor.id) && leader === null) leader = actor;
    else firstHop.push(actor);
  }

  // squad→leader→member chains hang the roster off the leader; leaderless
  // squads keep a flat squad→member list.
  if (leader) {
    const seen = new Set<string>();
    const members: BoardActor[] = [];
    for (const edge of squadEdges) {
      if (edge.source !== leader.id || edge.target === squadId) continue;
      const actor = byId.get(edge.target);
      if (actor && !seen.has(actor.id)) {
        seen.add(actor.id);
        members.push(actor);
      }
    }
    return { leader, members };
  }
  return { leader: null, members: firstHop };
}

// --- layout ---

export function layoutBoard(graph: BoardGraph, options: BoardLayoutOptions): BoardLayout {
  const { collapsedIssues, expandedSquads, filterHidden, searchDimmed, laneTitle } = options;
  const visible = resolveVisibleIssues(graph, { collapsedIssues, filterHidden });
  const byId = new Map(graph.issueNodes.map((issue) => [issue.id, issue]));
  const children = childrenMapOf(graph.issueNodes);
  const descendantCount = new Map<string, number>();
  for (const issue of graph.issueNodes) descendantCount.set(issue.id, descendantCountOf(issue.id, children));

  // lanes: ungrouped first, then ascending stage
  const laneKeys: (number | null)[] = [];
  const laneIssues = new Map<number | null, BoardIssue[]>();
  for (const issue of graph.issueNodes) {
    if (!visible.has(issue.id)) continue;
    if (!laneIssues.has(issue.stage)) {
      laneIssues.set(issue.stage, []);
      laneKeys.push(issue.stage);
    }
    laneIssues.get(issue.stage)!.push(issue);
  }
  laneKeys.sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    return a - b;
  });

  const nodes: BoardFlowNode[] = [];
  const lanes: BoardLane[] = [];
  const squadBlockEdges: BoardEdge[] = [];
  const visibleIssueIds = new Set<string>();
  let cursorY = 0;
  let maxLaneRight = 0;

  for (const stage of laneKeys) {
    const issues = laneIssues.get(stage)!;
    for (const issue of issues) visibleIssueIds.add(issue.id);

    // dagre within the lane, intra-lane parent edges only
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "TB", nodesep: DAGRE_NODESEP, ranksep: DAGRE_RANKSEP, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    const laneIds = new Set(issues.map((issue) => issue.id));
    for (const issue of issues) g.setNode(issue.id, { width: ISSUE_NODE_SIZE.width, height: ISSUE_NODE_SIZE.height });
    for (const issue of issues) {
      const parent = issue.parentId ? byId.get(issue.parentId) : undefined;
      if (parent && laneIds.has(parent.id)) g.setEdge(parent.id, issue.id);
    }
    dagre.layout(g);

    const positioned = issues.map((issue) => {
      const pos = g.node(issue.id);
      return { issue, x: pos.x - ISSUE_NODE_SIZE.width / 2, y: pos.y - ISSUE_NODE_SIZE.height / 2 };
    });
    const minX = Math.min(...positioned.map((p) => p.x));
    const maxX = Math.max(...positioned.map((p) => p.x + ISSUE_NODE_SIZE.width));
    const minY = Math.min(...positioned.map((p) => p.y));
    const maxY = Math.max(...positioned.map((p) => p.y + ISSUE_NODE_SIZE.height));
    const contentWidth = maxX - minX;

    const laneX = 0;
    const laneY = cursorY;
    const laneWidth = Math.max(contentWidth + LANE_PAD_X * 2, 320);
    const laneHeight = LANE_LABEL_H + maxY - minY + LANE_PAD_Y * 2;

    lanes.push({ stage, x: laneX, y: laneY, width: laneWidth, height: laneHeight, count: issues.length });
    nodes.push({
      id: `lane:${stage ?? "null"}`,
      type: "lane",
      position: { x: laneX, y: laneY },
      data: { stage, label: laneTitle(stage), count: issues.length },
      width: laneWidth,
      height: laneHeight,
      draggable: false,
      selectable: false,
      deletable: false,
      zIndex: -1,
      focusable: false,
    } satisfies LaneFlowNode);

    for (const { issue, x, y } of positioned) {
      const directChildren = children.get(issue.id) ?? [];
      const parent = issue.parentId ? byId.get(issue.parentId) : undefined;
      nodes.push({
        id: issue.id,
        type: "issue",
        position: { x: x - minX + LANE_PAD_X, y: laneY + LANE_LABEL_H + LANE_PAD_Y + y - minY },
        data: {
          issue,
          hasChildren: directChildren.length > 0,
          descendantCount: descendantCount.get(issue.id) ?? 0,
          collapsed: collapsedIssues.has(issue.id),
          dimmed: searchDimmed.has(issue.id),
          crossLane: Boolean(parent && parent.stage !== issue.stage),
        },
        width: ISSUE_NODE_SIZE.width,
        height: ISSUE_NODE_SIZE.height,
      } satisfies IssueFlowNode);
    }

    cursorY = laneY + laneHeight + LANE_GAP;
    maxLaneRight = Math.max(maxLaneRight, laneX + laneWidth);
  }

  // right column: squads top, agents middle, members bottom
  const columnX = maxLaneRight + ACTOR_COLUMN_GAP;
  const dimActor = (actor: BoardActor) => searchDimmed.has(actor.id);
  const squads = graph.actorNodes.filter((actor) => actor.actorType === "squad");
  const agents = graph.actorNodes.filter((actor) => actor.actorType === "agent");
  const members = graph.actorNodes.filter((actor) => actor.actorType === "member");

  let columnY = 0;

  for (const squad of squads) {
    const structure = squadStructure(graph, squad.id);
    const expanded = expandedSquads.has(squad.id);
    nodes.push({
      id: squad.id,
      type: "squad",
      position: { x: columnX, y: columnY },
      data: {
        actor: squad,
        memberCount: structure.members.length + (structure.leader ? 1 : 0),
        leaderName: structure.leader?.name ?? null,
        expanded,
        dimmed: dimActor(squad),
      },
      width: SQUAD_NODE_SIZE.width,
      height: SQUAD_NODE_SIZE.height,
    } satisfies SquadFlowNode);
    let bottom = columnY + SQUAD_NODE_SIZE.height;

    if (expanded && structure.leader) {
      // Expanded copies get composite node ids (`squad::actor`) — the same
      // actor keeps its standalone card (and assignee edges) in the column,
      // mirroring the design where expansion grows leader/member cards in place.
      const leaderNodeId = `${squad.id}::${structure.leader.id}`;
      const leaderY = columnY + SQUAD_NODE_SIZE.height + 16;
      nodes.push({
        id: leaderNodeId,
        type: "actor",
        position: { x: columnX + SQUAD_INDENT, y: leaderY },
        data: { actor: structure.leader, variant: "leader", dimmed: dimActor(structure.leader) },
        width: ACTOR_NODE_SIZE.width,
        height: ACTOR_NODE_SIZE.height,
      } satisfies ActorFlowNode);
      squadBlockEdges.push({
        id: `squadview:${squad.id}:${structure.leader.id}`,
        type: "squadMember",
        source: squad.id,
        target: leaderNodeId,
      });
      let memberY = leaderY + ACTOR_NODE_SIZE.height + SQUAD_MEMBER_GAP;
      for (const member of structure.members) {
        const memberId = `${squad.id}::${member.id}`;
        nodes.push({
          id: memberId,
          type: "actor",
          position: { x: columnX + SQUAD_INDENT, y: memberY },
          data: { actor: member, variant: "member", dimmed: dimActor(member) },
          width: ACTOR_NODE_SIZE.width,
          height: ACTOR_NODE_SIZE.height,
        } satisfies ActorFlowNode);
        squadBlockEdges.push({ id: `squadview:${squad.id}:${member.id}`, type: "squadMember", source: leaderNodeId, target: memberId });
        memberY += ACTOR_NODE_SIZE.height + SQUAD_MEMBER_GAP;
      }
      bottom = Math.max(bottom, structure.members.length > 0 ? memberY - SQUAD_MEMBER_GAP : leaderY + ACTOR_NODE_SIZE.height);
    }
    columnY = bottom + 12;
  }

  for (const actor of agents) {
    nodes.push({
      id: actor.id,
      type: "actor",
      position: { x: columnX, y: columnY },
      data: { actor, variant: "agent", dimmed: dimActor(actor) },
      width: ACTOR_NODE_SIZE.width,
      height: ACTOR_NODE_SIZE.height,
    } satisfies ActorFlowNode);
    columnY += ACTOR_NODE_SIZE.height + 12;
  }

  for (const actor of members) {
    nodes.push({
      id: actor.id,
      type: "actor",
      position: { x: columnX, y: columnY },
      data: { actor, variant: "member", dimmed: dimActor(actor) },
      width: ACTOR_NODE_SIZE.width,
      height: ACTOR_NODE_SIZE.height,
    } satisfies ActorFlowNode);
    columnY += ACTOR_NODE_SIZE.height + 12;
  }

  // edges among visible nodes; graph-level squadMember edges never render
  // directly — the expanded squad blocks synthesize their own point-line edges
  // (composite endpoints above).
  const visibleIds = new Set<string>(visibleIssueIds);
  for (const node of nodes) {
    if (node.type === "actor" || node.type === "squad") visibleIds.add(node.id);
  }
  const renderableEdges: BoardEdge[] = graph.edges.filter((edge) => {
    if (edge.type === "squadMember") return false;
    return visibleIds.has(edge.source) && visibleIds.has(edge.target);
  });

  return {
    nodes,
    edges: [...toFlowEdges(renderableEdges, visibleIds), ...toFlowEdges(squadBlockEdges, visibleIds)],
    lanes,
    visibleIssueIds,
  };
}
