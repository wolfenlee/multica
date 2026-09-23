/**
 * Edge visuals per the design contract (03-pages/legend.md §2): the three
 * relation kinds must differ in line pattern + color + direction
 * simultaneously. Colors reference the repo's semantic tokens by `var()`
 * (01-style/tokens.md is the verified mirror of packages/ui/styles/tokens.css)
 * so light/dark themes follow the app without extra work here.
 */
import type { CSSProperties } from "react";
import { MarkerType } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { BoardEdge, BoardEdgeType } from "./contract";

export interface EdgeVisual {
  stroke: string;
  strokeWidth: number;
  /** SVG stroke-dasharray; undefined = solid. */
  dasharray?: string;
  /** Marker arrow color — arrows are the third differentiating dimension. */
  markerColor: string;
  /** Curve type: parent flows down lanes, assignee runs flat into the right column. */
  curve: "bezier" | "straight";
}

export const BOARD_EDGE_VISUALS: Record<BoardEdgeType, EdgeVisual> = {
  parent: {
    stroke: "var(--muted-foreground)",
    strokeWidth: 1.5,
    markerColor: "var(--muted-foreground)",
    curve: "bezier",
  },
  assignee: {
    stroke: "var(--brand)",
    strokeWidth: 1.5,
    dasharray: "6 4",
    markerColor: "var(--brand)",
    curve: "straight",
  },
  squadMember: {
    stroke: "var(--muted-foreground)",
    strokeWidth: 1.5,
    dasharray: "2 4",
    markerColor: "var(--muted-foreground)",
    curve: "bezier",
  },
};

const RF_MARKER = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
} as const;

/** Build the React Flow edge list from board edges; positions are layout's job. */
export function toFlowEdges(edges: BoardEdge[], visibleIds: Set<string>): Edge[] {
  const out: Edge[] = [];
  for (const edge of edges) {
    // Both endpoints must be on the canvas; one-sided relation edges render as
    // dangling lines when a subtree is folded, which the design excludes
    // ("折叠隐藏全部后代与内部边" — folded assignee edges keep pointing at the
    // parent, so the parent endpoint is the one that must survive).
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
    const visual = BOARD_EDGE_VISUALS[edge.type];
    out.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      selectable: false,
      style: {
        stroke: visual.stroke,
        strokeWidth: visual.strokeWidth,
        strokeDasharray: visual.dasharray,
      } satisfies CSSProperties,
      markerEnd: { ...RF_MARKER, color: visual.markerColor },
    });
  }
  return out;
}
