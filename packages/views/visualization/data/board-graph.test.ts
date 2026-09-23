// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Agent, Issue, Squad, SquadMember, SquadMemberStatus } from "@multica/core/types";

import type { BoardSourceData } from "./board-source";
import {
  assignBoardLanes,
  boardLayoutMetadata,
  buildBoardGraph,
  BOARD_DEFAULT_COLLAPSE_DEPTH,
  BOARD_FIRST_SCREEN_TARGET,
  defaultCollapsedActorIds,
  defaultCollapsedIssueIds,
  resolveBoardVisibility,
} from "./board-graph";
import { memberFallbackName } from "./types";

const WS_ID = "ws-1";

function makeIssue(overrides: Partial<Issue> & Pick<Issue, "id">): Issue {
  const { id, ...rest } = overrides;
  const idx = Number(id.replace(/\D/g, "")) || 0;
  return {
    id,
    workspace_id: WS_ID,
    number: idx,
    identifier: `MUL-${idx}`,
    title: `Issue ${id}`,
    description: null,
    status: "todo",
    priority: "none",
    assignee_type: null,
    assignee_id: null,
    creator_type: "member",
    creator_id: "user-1",
    parent_issue_id: null,
    project_id: null,
    position: idx,
    stage: null,
    start_date: null,
    due_date: null,
    metadata: {},
    properties: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

function makeAgent(id: string, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    workspace_id: WS_ID,
    runtime_id: "runtime-1",
    name: `Agent ${id}`,
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "cloud",
    provider: "anthropic",
    launch_header: "",
    status: "idle",
    device_info: "",
    metadata: {},
    owner_id: null,
    visibility: "workspace",
    issue_id: "",
    priority: 0,
    permission_mode: "private",
    invocation_targets: [],
    max_concurrent_tasks: 1,
    model: "claude-fable-5-1",
    runtime_config: {},
    custom_args: [],
    skills: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    ...overrides,
  } as Agent;
}

function makeSquad(id: string, overrides: Partial<Squad> = {}): Squad {
  return {
    id,
    workspace_id: WS_ID,
    name: `Squad ${id}`,
    description: "",
    instructions: "",
    avatar_url: null,
    leader_id: "agent-leader",
    creator_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    member_count: 0,
    member_preview: [],
    ...overrides,
  };
}

function makeMember(memberId: string, memberType: "agent" | "member" = "member"): SquadMember {
  return {
    id: `sm-${memberId}`,
    squad_id: "squad-1",
    member_type: memberType,
    member_id: memberId,
    role: "member",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function makeStatus(
  memberId: string,
  memberType: "agent" | "member",
  status: SquadMemberStatus["status"],
): SquadMemberStatus {
  return { member_type: memberType, member_id: memberId, status, active_issues: [], last_active_at: null };
}

function makeSource(overrides: Partial<BoardSourceData> = {}): BoardSourceData {
  return {
    issues: [],
    childProgress: new Map(),
    squads: [],
    squadMembers: new Map(),
    squadMemberStatus: new Map(),
    agents: [],
    ...overrides,
  };
}

const edgesOf = (source: BoardSourceData, type: "parent" | "assignee" | "squadMember") =>
  buildBoardGraph(source).edges.filter((e) => e.type === type);

describe("buildBoardGraph — edge construction", () => {
  it("builds parent edges parent→child from parent_issue_id, including across lanes", () => {
    const source = makeSource({
      issues: [
        makeIssue({ id: "i1", stage: 1 }),
        makeIssue({ id: "i2", parent_issue_id: "i1", stage: 1 }),
        // Cross-lane: child lives in stage 2 while its parent sits in stage 1.
        makeIssue({ id: "i3", parent_issue_id: "i1", stage: 2 }),
      ],
    });
    const parentEdges = edgesOf(source, "parent");
    expect(parentEdges).toHaveLength(2);
    expect(parentEdges).toContainEqual({ id: "parent:i1:i2", type: "parent", source: "i1", target: "i2" });
    expect(parentEdges).toContainEqual({ id: "parent:i1:i3", type: "parent", source: "i1", target: "i3" });
    expect(parentEdges.every((e) => e.source === "i1")).toBe(true);
  });

  it("drops parent edges whose parent is outside the fetched set", () => {
    const source = makeSource({
      issues: [makeIssue({ id: "i1", parent_issue_id: "missing" })],
    });
    expect(edgesOf(source, "parent")).toHaveLength(0);
    // The orphan still renders — promoted to root depth.
    const graph = buildBoardGraph(source);
    expect(graph.issueNodes[0]?.depth).toBe(0);
  });

  it("builds assignee edges issue→actor for all three assignee types", () => {
    const source = makeSource({
      issues: [
        makeIssue({ id: "i1", assignee_id: "agent-a", assignee_type: "agent" }),
        makeIssue({ id: "i2", assignee_id: "member-m", assignee_type: "member" }),
        makeIssue({ id: "i3", assignee_id: "squad-s", assignee_type: "squad" }),
      ],
      agents: [makeAgent("agent-a")],
      squads: [makeSquad("squad-s")],
    });
    const assigneeEdges = edgesOf(source, "assignee");
    expect(assigneeEdges).toEqual([
      { id: "assignee:i1:agent:agent-a", type: "assignee", source: "i1", target: "agent:agent-a" },
      { id: "assignee:i2:member:member-m", type: "assignee", source: "i2", target: "member:member-m" },
      { id: "assignee:i3:squad:squad-s", type: "assignee", source: "i3", target: "squad:squad-s" },
    ]);
  });

  it("builds squadMember edges squad→leader→member", () => {
    const source = makeSource({
      squads: [makeSquad("squad-1", { leader_id: "agent-leader" })],
      squadMembers: new Map([["squad-1", [makeMember("agent-leader", "agent"), makeMember("member-h")]]]),
      agents: [makeAgent("agent-leader")],
    });
    const squadEdges = edgesOf(source, "squadMember");
    expect(squadEdges).toContainEqual({
      id: "squadMember:squad-1:squad:squad-1:agent:agent-leader",
      type: "squadMember",
      source: "squad:squad-1",
      target: "agent:agent-leader",
    });
    expect(squadEdges).toContainEqual({
      id: "squadMember:squad-1:agent:agent-leader:member:member-h",
      type: "squadMember",
      source: "agent:agent-leader",
      target: "member:member-h",
    });
  });

  it("synthesizes a leader actor when the agents roster does not carry it", () => {
    const source = makeSource({
      squads: [makeSquad("squad-1", { leader_id: "agent-ghost" })],
    });
    const graph = buildBoardGraph(source);
    const leader = graph.actorNodes.find((a) => a.id === "agent:agent-ghost");
    expect(leader).toMatchObject({ actorType: "agent", name: "agent-gh" });
    expect(graph.edges.some((e) => e.type === "squadMember" && e.target === "agent:agent-ghost")).toBe(true);
  });
});

describe("buildBoardGraph — actor resolution", () => {
  it("resolves all three assignee types; unnamed members fall back to 「成员」+short id", () => {
    const source = makeSource({
      issues: [
        makeIssue({ id: "i1", assignee_id: "agent-a", assignee_type: "agent" }),
        makeIssue({ id: "i2", assignee_id: "member-1234567890", assignee_type: "member" }),
        makeIssue({ id: "i3", assignee_id: "squad-s", assignee_type: "squad" }),
      ],
      agents: [makeAgent("agent-a", { name: "Flowwatch" })],
      squads: [makeSquad("squad-s", { name: "Strike" })],
    });
    const graph = buildBoardGraph(source);
    const byId = new Map(graph.actorNodes.map((a) => [a.id, a]));
    expect(byId.get("agent:agent-a")).toMatchObject({ actorType: "agent", name: "Flowwatch" });
    expect(byId.get("squad:squad-s")).toMatchObject({ actorType: "squad", name: "Strike" });
    // No member roster mentions member-1234567890 — synthesized from the assignee.
    expect(byId.get("member:member-1234567890")).toMatchObject({
      actorType: "member",
      name: memberFallbackName("member-1234567890"),
    });
    expect(memberFallbackName("member-1234567890")).toBe("成员 member-1");
  });

  it("carries agent runtime status, model, and active issue count; member status from squad rows", () => {
    const source = makeSource({
      agents: [makeAgent("agent-a", { status: "working", model: "glm-5.3" })],
      squads: [makeSquad("squad-1")],
      squadMembers: new Map([["squad-1", [makeMember("member-h")]]]),
      squadMemberStatus: new Map([
        [
          "squad-1",
          [
            { ...makeStatus("agent-a", "agent", "working"), active_issues: [{ issue_id: "i9", identifier: "MUL-9", title: "t", issue_status: "in_progress" }] },
            makeStatus("member-h", "member", "idle"),
          ],
        ],
      ]),
    });
    const graph = buildBoardGraph(source);
    const byId = new Map(graph.actorNodes.map((a) => [a.id, a]));
    expect(byId.get("agent:agent-a")).toMatchObject({
      runtimeStatus: "working",
      model: "glm-5.3",
      activeCount: 1,
    });
    expect(byId.get("member:member-h")).toMatchObject({ runtimeStatus: "idle" });
  });

  it("orders actors squads → agents → members for the right-hand column", () => {
    const source = makeSource({
      issues: [makeIssue({ id: "i1", assignee_id: "member-m", assignee_type: "member" })],
      agents: [makeAgent("agent-a")],
      squads: [makeSquad("squad-1", { leader_id: "agent-a" })],
    });
    const graph = buildBoardGraph(source);
    const types = graph.actorNodes.map((a) => a.actorType);
    expect(types).toEqual(["squad", "agent", "member"]);
  });
});

describe("buildBoardGraph — depth and tree shape", () => {
  it("computes depth from the parent chain and joins child progress", () => {
    const source = makeSource({
      issues: [
        makeIssue({ id: "i1" }),
        makeIssue({ id: "i2", parent_issue_id: "i1" }),
        makeIssue({ id: "i3", parent_issue_id: "i2" }),
      ],
      childProgress: new Map([["i1", { total: 2, done: 1 }]]),
    });
    const graph = buildBoardGraph(source);
    const depthOf = new Map(graph.issueNodes.map((i) => [i.id, i.depth]));
    expect(depthOf.get("i1")).toBe(0);
    expect(depthOf.get("i2")).toBe(1);
    expect(depthOf.get("i3")).toBe(2);
    const root = graph.issueNodes.find((i) => i.id === "i1");
    expect(root?.childProgress).toEqual({ total: 2, done: 1 });
    expect(graph.issueNodes.find((i) => i.id === "i3")?.childProgress).toBeNull();
  });

  it("breaks corrupt parent cycles instead of looping", () => {
    const source = makeSource({
      issues: [
        makeIssue({ id: "i1", parent_issue_id: "i2" }),
        makeIssue({ id: "i2", parent_issue_id: "i1" }),
      ],
    });
    const graph = buildBoardGraph(source);
    expect(graph.issueNodes).toHaveLength(2);
    // Both cycle members render as roots; no parent edge connects them.
    expect(graph.issueNodes.every((i) => i.depth === 0)).toBe(true);
    expect(edgesOf(source, "parent")).toHaveLength(0);
  });

  it("sorts issue nodes by lane (null first) then issue number", () => {
    const source = makeSource({
      issues: [
        makeIssue({ id: "i50", stage: 2 }),
        makeIssue({ id: "i10", stage: null }),
        makeIssue({ id: "i40", stage: 1 }),
      ],
    });
    const graph = buildBoardGraph(source);
    expect(graph.issueNodes.map((i) => i.id)).toEqual(["i10", "i40", "i50"]);
  });
});

describe("assignBoardLanes", () => {
  it("pins the ungrouped lane on top and orders stage lanes ascending", () => {
    const board = (id: string, stage: number | null) => makeIssue({ id, stage });
    const lanes = assignBoardLanes(
      buildBoardGraph(makeSource({ issues: [board("a", 2), board("b", null), board("c", 1), board("d", null)] })).issueNodes,
    );
    expect(lanes.map((l) => l.stage)).toEqual([null, 1, 2]);
    expect(lanes[0]?.issues.map((i) => i.id)).toEqual(["b", "d"]);
    expect(lanes[1]?.issues.map((i) => i.id)).toEqual(["c"]);
  });

  it("keeps lane membership independent of parent edges (cross-lane parents stay legal)", () => {
    const root = makeIssue({ id: "r", stage: 1 });
    const child = makeIssue({ id: "c", parent_issue_id: "r", stage: 3 });
    const lanes = assignBoardLanes(buildBoardGraph(makeSource({ issues: [root, child] })).issueNodes);
    expect(lanes.map((l) => l.stage)).toEqual([1, 3]);
    expect(lanes[0]?.issues.map((i) => i.id)).toEqual(["r"]);
    expect(lanes[1]?.issues.map((i) => i.id)).toEqual(["c"]);
    // And the parent edge still connects them in the graph.
    const graph = buildBoardGraph(makeSource({ issues: [root, child] }));
    expect(graph.edges.some((e) => e.type === "parent" && e.source === "r" && e.target === "c")).toBe(true);
  });
});

describe("collapse defaults", () => {
  const treeSource = () =>
    makeSource({
      // i1(0) → i2(1) → i3(2) → i4(3) → i5(4); i4 has two children.
      issues: [
        makeIssue({ id: "i1" }),
        makeIssue({ id: "i2", parent_issue_id: "i1" }),
        makeIssue({ id: "i3", parent_issue_id: "i2" }),
        makeIssue({ id: "i4", parent_issue_id: "i3" }),
        makeIssue({ id: "i5", parent_issue_id: "i4" }),
        makeIssue({ id: "i6", parent_issue_id: "i4" }),
      ],
    });

  it("collapses branches at depth ≥ 3 that have children; leaves and shallow branches stay open", () => {
    const collapsed = defaultCollapsedIssueIds(buildBoardGraph(treeSource()).issueNodes);
    expect(collapsed).toEqual(new Set(["i4"]));
    expect(collapsed.has("i3")).toBe(false);
    expect(BOARD_DEFAULT_COLLAPSE_DEPTH).toBe(3);
  });

  it("collapses every squad expansion by default", () => {
    const graph = buildBoardGraph(
      makeSource({
        squads: [makeSquad("s1"), makeSquad("s2")],
        agents: [makeAgent("agent-a")],
      }),
    );
    expect(defaultCollapsedActorIds(graph.actorNodes)).toEqual(
      new Set(["squad:s1", "squad:s2"]),
    );
  });
});

describe("resolveBoardVisibility", () => {
  it("hides the whole subtree under a collapsed branch", () => {
    const graph = buildBoardGraph(
      makeSource({
        issues: [
          makeIssue({ id: "i1" }),
          makeIssue({ id: "i2", parent_issue_id: "i1" }),
          makeIssue({ id: "i3", parent_issue_id: "i2" }),
          makeIssue({ id: "i4", parent_issue_id: "i3" }),
        ],
      }),
    );
    const visibility = resolveBoardVisibility(graph, new Set(["i2"]), new Set());
    expect(visibility.visibleIssueIds).toEqual(new Set(["i1", "i2"]));
    expect(visibility.hiddenIssueIds).toEqual(new Set(["i3", "i4"]));
  });

  it("keeps squads visible when collapsed; hides unanchored members but keeps assignee-anchored ones", () => {
    const graph = buildBoardGraph(
      makeSource({
        issues: [makeIssue({ id: "i1", assignee_id: "member-h", assignee_type: "member" })],
        squads: [makeSquad("squad-1", { leader_id: "agent-leader" })],
        squadMembers: new Map([["squad-1", [makeMember("agent-leader", "agent"), makeMember("member-h")]]]),
        agents: [makeAgent("agent-leader")],
      }),
    );
    const visibility = resolveBoardVisibility(graph, new Set(), defaultCollapsedActorIds(graph.actorNodes));
    // Squad card itself is the expand affordance — always visible.
    expect(visibility.visibleActorIds.has("squad:squad-1")).toBe(true);
    // member-h is anchored by a visible assignee edge → stays on canvas.
    expect(visibility.visibleActorIds.has("member:member-h")).toBe(true);
    // The leader has no issue card → hidden until the squad is expanded.
    expect(visibility.hiddenActorIds.has("agent:agent-leader")).toBe(true);

    const expanded = resolveBoardVisibility(graph, new Set(), new Set());
    expect(expanded.visibleActorIds.has("agent:agent-leader")).toBe(true);
  });
});

describe("boardLayoutMetadata", () => {
  it("summarizes scale and the first-screen budget", () => {
    const issues = [
      makeIssue({ id: "i1" }),
      makeIssue({ id: "i2", parent_issue_id: "i1" }),
      makeIssue({ id: "i3", assignee_id: "agent-a", assignee_type: "agent" }),
    ];
    const source = makeSource({ issues, agents: [makeAgent("agent-a")] });
    const graph = buildBoardGraph(source);
    const lanes = assignBoardLanes(graph.issueNodes);
    const visibility = resolveBoardVisibility(graph, new Set(), new Set());
    const metadata = boardLayoutMetadata(graph, visibility, lanes);
    expect(metadata.issueCount).toBe(3);
    expect(metadata.actorCount).toBe(1);
    // one parent edge (i1→i2) + one assignee edge (i3→agent:agent-a)
    expect(metadata.edgeCount).toBe(2);
    expect(metadata.maxDepth).toBe(1);
    expect(metadata.laneCount).toBe(1);
    expect(metadata.visibleNodeCount).toBe(4);
    expect(metadata.hiddenNodeCount).toBe(0);
    expect(metadata.firstScreenWithinTarget).toBe(true);
    expect(BOARD_FIRST_SCREEN_TARGET).toBe(30);
  });

  it("reports the budget as blown past 30 visible nodes", () => {
    const issues = Array.from({ length: 40 }, (_, i) => makeIssue({ id: `i${i + 1}` }));
    const graph = buildBoardGraph(makeSource({ issues }));
    const lanes = assignBoardLanes(graph.issueNodes);
    const visibility = resolveBoardVisibility(graph, new Set(), new Set());
    const metadata = boardLayoutMetadata(graph, visibility, lanes);
    expect(metadata.visibleNodeCount).toBe(40);
    expect(metadata.firstScreenWithinTarget).toBe(false);
  });
});
