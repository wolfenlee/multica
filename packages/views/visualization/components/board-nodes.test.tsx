import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Node, NodeProps } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import { BoardRuntimeContext } from "./board-context";
import type { BoardRuntimeValue } from "./board-context";
import type { ActorFlowNode, IssueFlowNode, SquadFlowNode } from "./layout";
import { boardNodeTypes } from "./nodes";
import { statusColorVar, UnknownStatusGlyph } from "./status-display";
import type { BoardIssue } from "./contract";

/**
 * Node components render standalone: geometry is plain props, runtime plumbing
 * comes from BoardRuntimeContext — no React Flow instance, no router mocks.
 */

const IssueNode = boardNodeTypes.issue;
const ActorNode = boardNodeTypes.actor;
const SquadNode = boardNodeTypes.squad;

function nodeProps<N extends Node>(parts: Pick<N, "id" | "data" | "type">): NodeProps<N> {
  return {
    ...parts,
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: false,
    selected: false,
    draggable: false,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as NodeProps<N>;
}

function issue(parts: Partial<BoardIssue> & Pick<BoardIssue, "id" | "identifier">): BoardIssue {
  return {
    number: 158,
    title: `issue ${parts.id}`,
    statusKey: "in_progress",
    statusCategory: "in_progress",
    statusName: "In Progress",
    parentId: null,
    stage: 1,
    depth: 1,
    assignee: null,
    childProgress: null,
    ...parts,
  };
}

function runtime(overrides: Partial<BoardRuntimeValue> = {}): BoardRuntimeValue {
  return {
    tier: "full",
    flashIds: new Set<string>(),
    actorName: (id) => `name:${id}`,
    toggleIssueCollapse: vi.fn(),
    toggleSquadExpand: vi.fn(),
    selectNode: vi.fn(),
    ...overrides,
  };
}

function renderNode(ui: React.ReactElement, value: BoardRuntimeValue = runtime()) {
  // Handles read the React Flow store, so nodes render inside a bare provider;
  // the node-id context stays unset exactly like an edge-less standalone render.
  return render(
    <ReactFlowProvider>
      <BoardRuntimeContext.Provider value={value}>{ui}</BoardRuntimeContext.Provider>
    </ReactFlowProvider>,
  );
}

describe("IssueNode", () => {
  const data: IssueFlowNode["data"] = {
    issue: issue({ id: "i-158", identifier: "WOLFLEE-158", title: "Fix the fold badge" }),
    hasChildren: true,
    descendantCount: 3,
    collapsed: true,
    dimmed: false,
    crossLane: false,
  };

  it("keeps the identifier always visible next to the status name", () => {
    renderNode(<IssueNode {...nodeProps<IssueFlowNode>({ id: "i-158", data, type: "issue" })} />);
    expect(screen.getByText("WOLFLEE-158")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Fix the fold badge")).toBeInTheDocument();
  });

  it("shows the folded descendant count on the fold toggle and toggles on click", () => {
    const toggle = vi.fn();
    renderNode(<IssueNode {...nodeProps<IssueFlowNode>({ id: "i-158", data, type: "issue" })} />, runtime({ toggleIssueCollapse: toggle }));
    expect(screen.getByText("+3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(toggle).toHaveBeenCalledWith("i-158");
  });

  it("has no fold toggle without children", () => {
    renderNode(
      <IssueNode
        {...nodeProps<IssueFlowNode>({ id: "i-158", data: { ...data, hasChildren: false }, type: "issue" })}
      />,
    );
    expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
  });

  it("resolves the assignee display name, or shows the unassigned fallback", () => {
    const { unmount } = renderNode(
      <IssueNode
        {...nodeProps<IssueFlowNode>({
          id: "i-158",
          data: { ...data, issue: { ...data.issue, assignee: { id: "agent:a1", type: "agent" } } },
          type: "issue",
        })}
      />,
    );
    expect(screen.getByText("name:agent:a1")).toBeInTheDocument();
    unmount();
    renderNode(<IssueNode {...nodeProps<IssueFlowNode>({ id: "i-158", data, type: "issue" })} />);
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("dims search non-matches to 15% opacity", () => {
    renderNode(
      <IssueNode
        {...nodeProps<IssueFlowNode>({ id: "i-158", data: { ...data, dimmed: true }, type: "issue" })}
      />,
    );
    expect(screen.getByRole("button", { name: "WOLFLEE-158" }).className).toContain("opacity-15");
  });

  it("selects on Enter from the keyboard", () => {
    const selectNode = vi.fn();
    renderNode(<IssueNode {...nodeProps<IssueFlowNode>({ id: "i-158", data, type: "issue" })} />, runtime({ selectNode }));
    fireEvent.keyDown(screen.getByRole("button", { name: "WOLFLEE-158" }), { key: "Enter" });
    expect(selectNode).toHaveBeenCalledWith("i-158");
  });
});

describe("IssueNode zoom degradation", () => {
  const data: IssueFlowNode["data"] = {
    issue: issue({ id: "i-158", identifier: "WOLFLEE-158", title: "Fix the fold badge" }),
    hasChildren: false,
    descendantCount: 0,
    collapsed: false,
    dimmed: false,
    crossLane: false,
  };

  it("below 40% keeps the identifier + color block but drops the body", () => {
    renderNode(
      <IssueNode {...nodeProps<IssueFlowNode>({ id: "i-158", data, type: "issue" })} />,
      runtime({ tier: "block" }),
    );
    expect(screen.getByText("WOLFLEE-158")).toBeInTheDocument();
    expect(screen.queryByText("Fix the fold badge")).not.toBeInTheDocument();
  });

  it("below 20% degrades to the status dot alone", () => {
    renderNode(
      <IssueNode {...nodeProps<IssueFlowNode>({ id: "i-158", data, type: "issue" })} />,
      runtime({ tier: "dot" }),
    );
    expect(screen.queryByText("WOLFLEE-158")).not.toBeInTheDocument();
    expect(screen.queryByText("Fix the fold badge")).not.toBeInTheDocument();
  });
});

describe("long titles", () => {
  it("clamp on the card and keep the full text reachable (title attr + drawer)", () => {
    const long = "Truncate this very long issue title down to two lines while keeping the tooltip";
    renderNode(
      <IssueNode
        {...nodeProps<IssueFlowNode>({
          id: "i-long",
          data: {
            issue: issue({ id: "i-long", identifier: "WOLFLEE-999", title: long }),
            hasChildren: false,
            descendantCount: 0,
            collapsed: false,
            dimmed: false,
            crossLane: false,
          },
          type: "issue",
        })}
      />,
    );
    const title = screen.getByText(long);
    expect(title.className).toContain("line-clamp-2");
    expect(title).toHaveAttribute("title", long);
  });
});

describe("ActorNode", () => {
  it("renders agent badge, runtime status, model, and active count", () => {
    const data: ActorFlowNode["data"] = {
      actor: { id: "agent:a1", actorType: "agent", name: "claude", runtimeStatus: "working", model: "glm-5.3", activeCount: 2 },
      variant: "agent",
      dimmed: false,
    };
    renderNode(<ActorNode {...nodeProps<ActorFlowNode>({ id: "agent:a1", data, type: "actor" })} />);
    expect(screen.getByText("working")).toBeInTheDocument();
    expect(screen.getByText("AGENT")).toBeInTheDocument();
    expect(screen.getByText("Active 2 · glm-5.3")).toBeInTheDocument();
  });

  it("marks the leader variant and falls back to idle without runtime data", () => {
    const data: ActorFlowNode["data"] = {
      actor: { id: "agent:l1", actorType: "agent", name: "leader" },
      variant: "leader",
      dimmed: false,
    };
    renderNode(<ActorNode {...nodeProps<ActorFlowNode>({ id: "agent:l1", data, type: "actor" })} />);
    expect(screen.getByText("LEADER")).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("opens the drawer on double click", () => {
    const selectNode = vi.fn();
    const data: ActorFlowNode["data"] = {
      actor: { id: "agent:a1", actorType: "agent", name: "claude" },
      variant: "agent",
      dimmed: false,
    };
    renderNode(<ActorNode {...nodeProps<ActorFlowNode>({ id: "agent:a1", data, type: "actor" })} />, runtime({ selectNode }));
    fireEvent.doubleClick(screen.getByRole("button", { name: "claude" }));
    expect(selectNode).toHaveBeenCalledWith("agent:a1");
  });
});

describe("SquadNode", () => {
  const data: SquadFlowNode["data"] = {
    actor: { id: "squad:s1", actorType: "squad", name: "dev-strike" },
    memberCount: 3,
    leaderName: "leader",
    expanded: false,
    dimmed: false,
  };

  it("shows squad size, leader line, and expand state", () => {
    renderNode(<SquadNode {...nodeProps<SquadFlowNode>({ id: "squad:s1", data, type: "squad" })} />);
    expect(screen.getByText("dev-strike")).toBeInTheDocument();
    expect(screen.getByText("Leader: leader")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dev-strike" })).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles expansion through the runtime context", () => {
    const toggle = vi.fn();
    renderNode(<SquadNode {...nodeProps<SquadFlowNode>({ id: "squad:s1", data, type: "squad" })} />, runtime({ toggleSquadExpand: toggle }));
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(toggle).toHaveBeenCalledWith("squad:s1");
  });
});

describe("status display", () => {
  it("maps built-in statuses to semantic tokens, not hardcoded colors", () => {
    expect(statusColorVar("in_progress")).toBe("var(--warning)");
    expect(statusColorVar("blocked")).toBe("var(--destructive)");
    expect(statusColorVar("done")).toBe("var(--info)");
  });

  it("falls back to a dashed-ring ? glyph for unknown statuses", () => {
    render(
      <div>
        <UnknownStatusGlyph />
        <span>custom pill</span>
      </div>,
    );
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByText("custom pill")).toBeInTheDocument();
  });
});
