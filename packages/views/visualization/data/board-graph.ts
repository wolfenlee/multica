import { issueStatusCategory, statusCategoryOfKey } from "@multica/core/issues";
import type { Issue } from "@multica/core/types";
import type { BoardActor, BoardEdge, BoardGraph, BoardIssue } from "./types";
import { actorNodeId, memberFallbackName } from "./types";
import type { BoardSourceData } from "./board-source";

/**
 * Pure graph model for the board: turns a fetched {@link BoardSourceData}
 * into the `BoardGraph` contract plus the layout metadata the card spec
 * requires — lane assignment (stage swimlanes, ungrouped pinned on top),
 * default collapse sets (deep branches + squad expansions), the visible and
 * hidden node sets that follow from them, and the scale/degradation stats the
 * UI reads to pick zoom tiers.
 *
 * No React, no I/O — everything here is unit-testable as-is. Positioned
 * layout (dagre swimlanes, right-hand actor column) lives in the UI layer
 * (`components/layout.ts`), which consumes `BoardGraph` + these sets.
 */

// --- collapse / visibility defaults --------------------------------------

/** Branches at this depth or deeper start collapsed (depth 0 = root). */
export const BOARD_DEFAULT_COLLAPSE_DEPTH = 3;

/** Soft first-screen budget for visible nodes; metadata reports against it. */
export const BOARD_FIRST_SCREEN_TARGET = 30;

/** A stage swimlane: ungrouped (`stage === null`) first, then STAGE n ascending. */
export interface BoardLaneModel {
  stage: number | null;
  issues: BoardIssue[];
}

export interface BoardVisibility {
  visibleIssueIds: Set<string>;
  hiddenIssueIds: Set<string>;
  visibleActorIds: Set<string>;
  hiddenActorIds: Set<string>;
}

export interface BoardLayoutMetadata {
  issueCount: number;
  actorCount: number;
  edgeCount: number;
  maxDepth: number;
  laneCount: number;
  /** Visible nodes (issues + actors) under the default collapse. */
  visibleNodeCount: number;
  hiddenNodeCount: number;
  /** Whether the default view fits the first-screen node budget. */
  firstScreenWithinTarget: boolean;
}

// --- graph construction ----------------------------------------------------

/**
 * Builds the board graph from fetched data:
 *
 * - one `BoardIssue` node per fetched issue, with tree depth computed from
 *   the parent chain (top-level = 0) and child progress joined in;
 * - one `BoardActor` per squad, agent, and member reference (squad member
 *   rows + issue assignees), ordered squads → agents → members to match the
 *   right-hand dispatch column;
 * - `parent` edges (parent → child, cross-lane allowed), `assignee` edges
 *   (issue → dispatch actor), and `squadMember` edges (squad → leader →
 *   member). Parent edges to nodes outside the fetched set (or onto corrupt
 *   cycles) are dropped; missing actor nodes are synthesized with fallback
 *   names so every edge endpoint resolves.
 */
/** Right-column rendering order: squads on top, agents in the middle, members below. */
function actorTypeRank(actor: BoardActor): number {
  return actor.actorType === "squad" ? 0 : actor.actorType === "agent" ? 1 : 2;
}

export function buildBoardGraph(source: BoardSourceData): BoardGraph {
  const { byId, order } = indexIssues(source.issues, source.childProgress);
  const actors = collectActors(source, byId);
  const edges = collectEdges(source, byId, order, actors);
  const issueNodes = order
    .map((id) => byId.get(id)?.issue)
    .filter((issue): issue is BoardIssue => issue !== undefined)
    .sort((a, b) => laneOrder(a) - laneOrder(b) || a.number - b.number);
  // Stable sort: roster insertion order survives within each actor type, and
  // synthesized placeholder actors (assignees outside every roster) land at
  // the bottom of their own group.
  const actorNodes = [...actors.values()].sort((a, b) => actorTypeRank(a) - actorTypeRank(b));

  return { issueNodes, actorNodes, edges };
}

/** Groups issues into swimlanes: `stage=null` pinned on top, then STAGE 1..n. */
export function assignBoardLanes(issues: readonly BoardIssue[]): BoardLaneModel[] {
  const ungrouped: BoardIssue[] = [];
  const byStage = new Map<number, BoardIssue[]>();
  for (const issue of issues) {
    if (issue.stage == null) {
      ungrouped.push(issue);
    } else {
      const bucket = byStage.get(issue.stage);
      if (bucket) bucket.push(issue);
      else byStage.set(issue.stage, [issue]);
    }
  }
  const lanes: BoardLaneModel[] = ungrouped.length > 0 ? [{ stage: null, issues: ungrouped }] : [];
  const stages = [...byStage.keys()].sort((a, b) => a - b);
  for (const stage of stages) {
    const bucket = byStage.get(stage);
    if (bucket) lanes.push({ stage, issues: bucket });
  }
  return lanes;
}

/**
 * Default collapsed issue ids: every branch at or below
 * {@link BOARD_DEFAULT_COLLAPSE_DEPTH} that actually has children. Keeps the
 * first screen focused on the top of each tree per the design contract.
 */
export function defaultCollapsedIssueIds(issues: readonly BoardIssue[]): Set<string> {
  const parents = new Set<string>();
  for (const issue of issues) {
    if (issue.parentId != null) parents.add(issue.parentId);
  }
  const collapsed = new Set<string>();
  for (const issue of issues) {
    if (issue.depth >= BOARD_DEFAULT_COLLAPSE_DEPTH && parents.has(issue.id)) {
      collapsed.add(issue.id);
    }
  }
  return collapsed;
}

/** Squad expansions start collapsed — the squad card renders, its members don't. */
export function defaultCollapsedActorIds(actors: readonly BoardActor[]): Set<string> {
  const collapsed = new Set<string>();
  for (const actor of actors) {
    if (actor.actorType === "squad") collapsed.add(actor.id);
  }
  return collapsed;
}

/**
 * Resolves which nodes stay on the canvas under a collapse state:
 *
 * - issues hide when any ancestor branch is collapsed;
 * - squads are always visible (the collapsed card IS the expand affordance);
 * - a squad's leader/members hide while that squad is collapsed, unless an
 *   assignee edge from a still-visible issue anchors them independently.
 */
export function resolveBoardVisibility(
  graph: BoardGraph,
  collapsedIssueIds: ReadonlySet<string>,
  collapsedActorIds: ReadonlySet<string>,
): BoardVisibility {
  const childrenByParent = new Map<string, string[]>();
  for (const issue of graph.issueNodes) {
    if (issue.parentId == null) continue;
    const bucket = childrenByParent.get(issue.parentId);
    if (bucket) bucket.push(issue.id);
    else childrenByParent.set(issue.parentId, [issue.id]);
  }

  // Depth-first from the roots; a collapsed branch hides its whole subtree —
  // hiding propagates through descendants, it stops at the collapsed node.
  const visibleIssues = new Set<string>();
  const hiddenIssues = new Set<string>();
  const stack = graph.issueNodes
    .filter((issue) => issue.parentId == null || !childrenByParent.has(issue.parentId))
    .map((issue) => ({ id: issue.id, hidden: false }));
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    if (entry.hidden) {
      hiddenIssues.add(entry.id);
    } else {
      visibleIssues.add(entry.id);
    }
    const childHidden = entry.hidden || collapsedIssueIds.has(entry.id);
    for (const childId of childrenByParent.get(entry.id) ?? []) {
      stack.push({ id: childId, hidden: childHidden });
    }
  }
  // Corrupt parent chains (cycles) have no root to start from — render them
  // as visible roots rather than silently dropping the nodes.
  for (const issue of graph.issueNodes) {
    if (!visibleIssues.has(issue.id) && !hiddenIssues.has(issue.id)) visibleIssues.add(issue.id);
  }

  // Actors anchored by an assignee edge from a visible issue stay visible.
  const anchored = new Set<string>();
  for (const issue of graph.issueNodes) {
    if (!visibleIssues.has(issue.id) || !issue.assignee) continue;
    anchored.add(issue.assignee.id);
  }

  // Squad composition: squad → leader → members, via squadMember edges.
  const squadOfActor = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.type !== "squadMember") continue;
    const squads = squadOfActor.get(edge.target) ?? new Set<string>();
    squads.add(edge.source);
    squadOfActor.set(edge.target, squads);
  }

  const visibleActors = new Set<string>();
  const hiddenActors = new Set<string>();
  for (const actor of graph.actorNodes) {
    if (actor.actorType === "squad") {
      visibleActors.add(actor.id);
      continue;
    }
    let inCollapsedSquad = false;
    for (const squadId of squadOfActor.get(actor.id) ?? []) {
      if (collapsedActorIds.has(squadId)) {
        inCollapsedSquad = true;
        break;
      }
    }
    if (inCollapsedSquad && !anchored.has(actor.id)) {
      hiddenActors.add(actor.id);
    } else {
      visibleActors.add(actor.id);
    }
  }

  return {
    visibleIssueIds: visibleIssues,
    hiddenIssueIds: hiddenIssues,
    visibleActorIds: visibleActors,
    hiddenActorIds: hiddenActors,
  };
}

/** Summarizes scale for the UI's zoom degradation tiers. */
export function boardLayoutMetadata(
  graph: BoardGraph,
  visibility: BoardVisibility,
  lanes: readonly BoardLaneModel[],
): BoardLayoutMetadata {
  let maxDepth = 0;
  for (const issue of graph.issueNodes) {
    if (issue.depth > maxDepth) maxDepth = issue.depth;
  }
  const visibleNodeCount = visibility.visibleIssueIds.size + visibility.visibleActorIds.size;
  const hiddenNodeCount = visibility.hiddenIssueIds.size + visibility.hiddenActorIds.size;
  return {
    issueCount: graph.issueNodes.length,
    actorCount: graph.actorNodes.length,
    edgeCount: graph.edges.length,
    maxDepth,
    laneCount: lanes.length,
    visibleNodeCount,
    hiddenNodeCount,
    firstScreenWithinTarget: visibleNodeCount <= BOARD_FIRST_SCREEN_TARGET,
  };
}

// --- internals -------------------------------------------------------------

interface IndexedIssue {
  issue: BoardIssue;
  childIds: string[];
  /**
   * False when the issue sits on a corrupt parent chain (a cycle) — such
   * issues are promoted to root depth and their parent edge dropped so the
   * graph stays a renderable forest.
   */
  reachable: boolean;
}

function laneOrder(issue: BoardIssue): number {
  // Ungrouped (stage=null) sorts before every stage lane.
  return issue.stage == null ? -1 : issue.stage;
}

function toBoardIssue(
  raw: Issue,
  childProgress: ReadonlyMap<string, { total: number; done: number }>,
): BoardIssue {
  return {
    id: raw.id,
    number: raw.number,
    identifier: raw.identifier,
    title: raw.title,
    statusKey: raw.status,
    statusCategory: issueStatusCategory(raw) ?? statusCategoryOfKey(raw.status),
    statusName: raw.status_name ?? "",
    parentId: raw.parent_issue_id,
    stage: raw.stage,
    depth: 0,
    assignee:
      raw.assignee_id && raw.assignee_type
        ? { id: actorNodeId(raw.assignee_type, raw.assignee_id), type: raw.assignee_type }
        : null,
    childProgress: childProgress.get(raw.id) ?? null,
  };
}

/** Indexes issues, computes depths from the parent chain, and preserves input order. */
function indexIssues(
  issues: readonly Issue[],
  childProgress: ReadonlyMap<string, { total: number; done: number }>,
): { byId: Map<string, IndexedIssue>; order: string[] } {
  const byId = new Map<string, IndexedIssue>();
  const order: string[] = [];
  for (const raw of issues) {
    if (byId.has(raw.id)) continue;
    byId.set(raw.id, { issue: toBoardIssue(raw, childProgress), childIds: [], reachable: false });
    order.push(raw.id);
  }
  for (const entry of byId.values()) {
    const parentId = entry.issue.parentId;
    if (parentId == null || parentId === entry.issue.id) continue;
    const parent = byId.get(parentId);
    if (parent) parent.childIds.push(entry.issue.id);
  }

  // BFS from true roots marks reachability and assigns canonical depths.
  const queue: string[] = [];
  for (const entry of byId.values()) {
    const parentId = entry.issue.parentId;
    if (parentId == null || parentId === entry.issue.id || !byId.has(parentId)) {
      entry.reachable = true;
      entry.issue.depth = 0;
      queue.push(entry.issue.id);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift();
    const entry = id !== undefined ? byId.get(id) : undefined;
    if (!entry) continue;
    for (const childId of entry.childIds) {
      const child = byId.get(childId);
      if (!child || child.reachable) continue;
      child.reachable = true;
      child.issue.depth = entry.issue.depth + 1;
      queue.push(childId);
    }
  }
  // Cycle survivors are promoted to root depth but keep `reachable: false`
  // so their parent edge is dropped below.
  for (const entry of byId.values()) {
    if (!entry.reachable) entry.issue.depth = 0;
  }
  return { byId, order };
}

function collectActors(
  source: BoardSourceData,
  byId: ReadonlyMap<string, IndexedIssue>,
): Map<string, BoardActor> {
  const actors = new Map<string, BoardActor>();

  // Active agent count per agent, folded from squad member-status rows.
  const activeCount = new Map<string, number>();
  const memberStatus = new Map<string, string>();
  for (const rows of source.squadMemberStatus.values()) {
    for (const row of rows) {
      const nodeId = actorNodeId(row.member_type === "member" ? "member" : "agent", row.member_id);
      if (row.status) memberStatus.set(nodeId, row.status);
      if (row.active_issues.length > 0) {
        activeCount.set(nodeId, Math.max(activeCount.get(nodeId) ?? 0, row.active_issues.length));
      }
    }
  }

  for (const squad of source.squads) {
    actors.set(actorNodeId("squad", squad.id), {
      id: actorNodeId("squad", squad.id),
      actorType: "squad",
      name: squad.name,
    });
  }
  for (const agent of source.agents) {
    const id = actorNodeId("agent", agent.id);
    actors.set(id, {
      id,
      actorType: "agent",
      name: agent.name,
      runtimeStatus: agent.status,
      ...(agent.model ? { model: agent.model } : {}),
      ...(activeCount.has(id) ? { activeCount: activeCount.get(id) } : {}),
    });
  }

  // Squad leader is an agent per repo convention; synthesize the node when the
  // agents list doesn't carry it (archived / not visible to this viewer).
  for (const squad of source.squads) {
    const leaderId = actorNodeId("agent", squad.leader_id);
    if (!actors.has(leaderId)) {
      actors.set(leaderId, {
        id: leaderId,
        actorType: "agent",
        name: squad.leader_id.slice(0, 8),
        ...(memberStatus.has(leaderId) ? { runtimeStatus: memberStatus.get(leaderId) } : {}),
      });
    }
  }

  // Human members: from squad member rows and issue assignees. Members carry
  // no display name in the current API surface — the fallback name + the UI's
  // gray-avatar treatment covers them.
  const addMember = (memberId: string) => {
    if (memberId === "") return;
    const id = actorNodeId("member", memberId);
    if (actors.has(id)) return;
    actors.set(id, {
      id,
      actorType: "member",
      name: memberFallbackName(memberId),
      ...(memberStatus.has(id) ? { runtimeStatus: memberStatus.get(id) } : {}),
    });
  };
  for (const members of source.squadMembers.values()) {
    for (const member of members) {
      if (member.member_type === "member") addMember(member.member_id);
    }
  }
  for (const entry of byId.values()) {
    const assignee = entry.issue.assignee;
    if (assignee?.type === "member") {
      addMember(assignee.id.slice("member:".length));
    }
  }

  return actors;
}

function collectEdges(
  source: BoardSourceData,
  byId: ReadonlyMap<string, IndexedIssue>,
  order: readonly string[],
  actors: Map<string, BoardActor>,
): BoardEdge[] {
  const edges: BoardEdge[] = [];

  // parent — parent → child; only inside the fetched set and off corrupt cycles.
  for (const id of order) {
    const entry = byId.get(id);
    if (!entry || !entry.reachable) continue;
    const parentId = entry.issue.parentId;
    if (parentId == null || !byId.has(parentId) || parentId === id) continue;
    edges.push({ id: `parent:${parentId}:${id}`, type: "parent", source: parentId, target: id });
  }

  // assignee — issue → dispatch actor; synthesize a placeholder actor node if
  // the assignee is outside every fetched roster so the edge endpoint resolves.
  for (const id of order) {
    const entry = byId.get(id);
    const assignee = entry?.issue.assignee;
    if (!entry || !assignee) continue;
    if (!actors.has(assignee.id)) {
      actors.set(assignee.id, {
        id: assignee.id,
        actorType: assignee.type,
        name:
          assignee.type === "member"
            ? memberFallbackName(assignee.id.slice("member:".length))
            : assignee.id.slice(0, 8),
      });
    }
    edges.push({ id: `assignee:${id}:${assignee.id}`, type: "assignee", source: id, target: assignee.id });
  }

  // squadMember — squad → leader → member, dotted composition lines. The
  // leader is an agent per repo convention (squad-detail-page).
  for (const squad of source.squads) {
    const squadNode = actorNodeId("squad", squad.id);
    const leaderNode = actorNodeId("agent", squad.leader_id);
    edges.push({
      id: `squadMember:${squad.id}:${squadNode}:${leaderNode}`,
      type: "squadMember",
      source: squadNode,
      target: leaderNode,
    });
    const seen = new Set<string>([leaderNode]);
    for (const member of source.squadMembers.get(squad.id) ?? []) {
      const memberNode = actorNodeId(member.member_type === "member" ? "member" : "agent", member.member_id);
      if (seen.has(memberNode)) continue;
      seen.add(memberNode);
      edges.push({
        id: `squadMember:${squad.id}:${leaderNode}:${memberNode}`,
        type: "squadMember",
        source: leaderNode,
        target: memberNode,
      });
    }
  }

  return edges;
}
