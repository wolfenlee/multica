// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { BoardGraph, BoardIssue } from "./contract";
import { defaultCollapsedIssues, layoutBoard, resolveVisibleIssues, squadStructure } from "./layout";

function issue(parts: Partial<BoardIssue> & Pick<BoardIssue, "id">): BoardIssue {
  return {
    number: 100,
    identifier: `WOLFLEE-${parts.number ?? 100}`,
    title: `issue ${parts.id}`,
    statusKey: "todo",
    statusCategory: "open",
    statusName: "To Do",
    parentId: null,
    stage: null,
    depth: 0,
    assignee: null,
    childProgress: null,
    ...parts,
  };
}

function graph(issues: BoardIssue[], extra: Partial<BoardGraph> = {}): BoardGraph {
  return { issueNodes: issues, actorNodes: [], edges: [], ...extra };
}

// chain: i1 → i2 → i3 → i4 → i5 → i7, plus i6 under i5
const CHAIN = [
  issue({ id: "i1", depth: 0 }),
  issue({ id: "i2", parentId: "i1", depth: 1, stage: 1 }),
  issue({ id: "i3", parentId: "i2", depth: 2, stage: 1 }),
  issue({ id: "i4", parentId: "i3", depth: 3, stage: 2 }),
  issue({ id: "i5", parentId: "i4", depth: 4, stage: 2 }),
  issue({ id: "i6", parentId: "i5", depth: 5, stage: 2 }),
  issue({ id: "i7", parentId: "i5", depth: 5, stage: 2 }),
];

describe("defaultCollapsedIssues", () => {
  it("folds branches at depth >= 3 only below an already-folded ancestor (or deeper)", () => {
    const collapsed = defaultCollapsedIssues(graph(CHAIN));
    // i5 sits deeper than the first-screen budget; i4 is the visible frontier
    expect(collapsed).toContain("i5");
    expect(collapsed).not.toContain("i4");
  });

  it("never folds leaf nodes", () => {
    const collapsed = defaultCollapsedIssues(graph(CHAIN));
    expect(collapsed).not.toContain("i6");
    expect(collapsed).not.toContain("i7");
  });
});

describe("resolveVisibleIssues", () => {
  it("hides descendants of folded nodes", () => {
    const visible = resolveVisibleIssues(graph(CHAIN), { collapsedIssues: new Set(["i5"]), filterHidden: new Set() });
    expect(visible.has("i5")).toBe(true);
    expect(visible.has("i6")).toBe(false);
    expect(visible.has("i7")).toBe(false);
  });

  it("keeps the ancestor chain of filter-kept nodes (broken-tree prevention)", () => {
    const visible = resolveVisibleIssues(graph(CHAIN), {
      collapsedIssues: new Set(),
      filterHidden: new Set(["i1", "i2", "i5", "i6", "i7"]),
    });
    // only i3 and i4 match the filter, but their parents stay on the canvas
    expect(visible).toEqual(new Set(["i1", "i2", "i3", "i4"]));
  });

  it("lets folding yield to a kept node further down", () => {
    const visible = resolveVisibleIssues(graph(CHAIN), {
      collapsedIssues: new Set(["i5"]),
      filterHidden: new Set(["i1", "i2", "i3", "i4", "i6"]),
    });
    // i7 is kept below the folded i5, so that path stays expanded
    expect(visible.has("i7")).toBe(true);
    expect(visible.has("i6")).toBe(false);
  });
});

describe("squadStructure", () => {
  const actors = [
    { id: "squad:s1", actorType: "squad" as const, name: "dev-strike" },
    { id: "agent:l1", actorType: "agent" as const, name: "leader" },
    { id: "agent:m1", actorType: "agent" as const, name: "member" },
  ];
  const squadGraph = graph([], {
    actorNodes: actors,
    edges: [
      { id: "se1", type: "squadMember", source: "squad:s1", target: "agent:l1" },
      { id: "se2", type: "squadMember", source: "agent:l1", target: "agent:m1" },
    ],
  });

  it("reads the leader as the squad-edge target that fans out to members", () => {
    const { leader, members } = squadStructure(squadGraph, "squad:s1");
    expect(leader?.id).toBe("agent:l1");
    expect(members.map((actor) => actor.id)).toEqual(["agent:m1"]);
  });
});

describe("layoutBoard", () => {
  const actors = [
    { id: "squad:s1", actorType: "squad" as const, name: "dev-strike" },
    { id: "agent:l1", actorType: "agent" as const, name: "leader" },
    { id: "agent:m1", actorType: "agent" as const, name: "member" },
  ];
  const squadEdges: BoardGraph["edges"] = [
    { id: "se1", type: "squadMember", source: "squad:s1", target: "agent:l1" },
    { id: "se2", type: "squadMember", source: "agent:l1", target: "agent:m1" },
  ];
  const laneTitle = (stage: number | null) => (stage === null ? "Ungrouped" : `STAGE ${stage}`);

  it("stacks the ungrouped lane first, then stages ascending", () => {
    const layout = layoutBoard(graph(CHAIN), {
      collapsedIssues: new Set(),
      expandedSquads: new Set(),
      filterHidden: new Set(),
      searchDimmed: new Set(),
      laneTitle,
    });
    const stages = layout.lanes.map((lane) => lane.stage);
    expect(stages[0]).toBeNull();
    expect(stages.slice(1)).toEqual([1, 2]);
    expect(layout.nodes.map((node) => node.id)).toContain("lane:null");
  });

  it("renders expanded squad blocks with composite member ids and point edges", () => {
    const layout = layoutBoard(
      graph([CHAIN[0]!], { actorNodes: actors, edges: squadEdges }),
      {
        collapsedIssues: new Set(),
        expandedSquads: new Set(["squad:s1"]),
        filterHidden: new Set(),
        searchDimmed: new Set(),
        laneTitle,
      },
    );
    const ids = layout.nodes.map((node) => node.id);
    // squad header + in-block leader/member copies with composite ids
    expect(ids).toContain("squad:s1");
    expect(ids).toContain("squad:s1::agent:l1");
    expect(ids).toContain("squad:s1::agent:m1");
    // block edges are synthesized squadview point-lines; raw squadMember edges never render
    const edgeIds = layout.edges.map((edge) => edge.id);
    expect(edgeIds).toContain("squadview:squad:s1:agent:l1");
    expect(edgeIds).toContain("squadview:squad:s1:agent:m1");
    expect(edgeIds).not.toContain("se1");
    expect(edgeIds).not.toContain("se2");
  });

  it("keeps assignee edges whose endpoints stay visible and drops the rest", () => {
    const layout = layoutBoard(
      graph(CHAIN, {
        edges: [
          { id: "ae1", type: "assignee", source: "i1", target: "agent:m1" },
          { id: "ae2", type: "assignee", source: "i7", target: "agent:m1" },
        ],
        actorNodes: actors,
      }),
      {
        collapsedIssues: new Set(["i5"]),
        expandedSquads: new Set(),
        filterHidden: new Set(),
        searchDimmed: new Set(),
        laneTitle,
      },
    );
    const edgeIds = layout.edges.map((edge) => edge.id);
    expect(edgeIds).toContain("ae1"); // i1 visible
    expect(edgeIds).not.toContain("ae2"); // i7 folded away
  });
});
