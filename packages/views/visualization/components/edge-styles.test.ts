// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MarkerType } from "@xyflow/react";
import { BOARD_EDGE_VISUALS, toFlowEdges } from "./edge-styles";
import type { BoardEdge } from "./contract";

describe("BOARD_EDGE_VISUALS (03-pages/legend.md §2)", () => {
  it("distinguishes the three relation kinds in line pattern, color, and curve", () => {
    const { parent, assignee, squadMember } = BOARD_EDGE_VISUALS;

    // line pattern: solid / dashed / dotted — all three differ
    expect(parent.dasharray).toBeUndefined();
    expect(assignee.dasharray).toBe("6 4");
    expect(squadMember.dasharray).toBe("2 4");
    expect(new Set([parent.dasharray ?? "solid", assignee.dasharray, squadMember.dasharray]).size).toBe(3);

    // color: assignee carries the brand token, hierarchy edges stay muted
    expect(assignee.stroke).toBe("var(--brand)");
    expect(assignee.markerColor).toBe("var(--brand)");
    expect(parent.stroke).toBe("var(--muted-foreground)");
    expect(squadMember.stroke).toBe("var(--muted-foreground)");

    // direction read: parent flows down, assignee runs flat into the column
    expect(parent.curve).toBe("bezier");
    expect(assignee.curve).toBe("straight");
    expect(squadMember.curve).toBe("bezier");
  });

  it("uses semantic tokens, never hardcoded colors", () => {
    for (const visual of Object.values(BOARD_EDGE_VISUALS)) {
      expect(visual.stroke).toMatch(/^var\(--/);
      expect(visual.markerColor).toMatch(/^var\(--/);
    }
  });
});

describe("toFlowEdges", () => {
  const parentEdgeInput: BoardEdge = { id: "e1", type: "parent", source: "i1", target: "i2" };
  const assigneeEdgeInput: BoardEdge = { id: "e2", type: "assignee", source: "i2", target: "agent:a1" };
  const hiddenParentInput: BoardEdge = { id: "e3", type: "parent", source: "i2", target: "i3" };
  const edges: BoardEdge[] = [parentEdgeInput, assigneeEdgeInput, hiddenParentInput];

  it("drops edges whose endpoints left the canvas (fold/filter)", () => {
    const out = toFlowEdges(edges, new Set(["i1", "i2", "agent:a1"]));
    expect(out.map((edge) => edge.id)).toEqual(["e1", "e2"]);
  });

  it("carries pattern, color, and the closed arrow marker into the flow edge", () => {
    const assigneeEdge = toFlowEdges([assigneeEdgeInput], new Set(["i2", "agent:a1"]))[0]!;
    expect(assigneeEdge.type).toBe("assignee");
    expect(assigneeEdge.style?.strokeDasharray).toBe("6 4");
    expect(assigneeEdge.style?.stroke).toBe("var(--brand)");
    expect(assigneeEdge.markerEnd).toMatchObject({ type: MarkerType.ArrowClosed, color: "var(--brand)" });
    expect(assigneeEdge.selectable).toBe(false);
  });

  it("leaves parent edges solid with an arrow", () => {
    const parentEdge = toFlowEdges([parentEdgeInput], new Set(["i1", "i2"]))[0]!;
    expect(parentEdge.style?.strokeDasharray).toBeUndefined();
    expect(parentEdge.markerEnd).toMatchObject({ type: MarkerType.ArrowClosed });
  });
});
