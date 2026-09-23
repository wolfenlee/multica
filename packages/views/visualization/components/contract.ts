/**
 * Board data contract between the UI (this package) and the data layer
 * (`visualization/data/`, owned by the data card).
 *
 * The data card owns the canonical `data/types.ts`; this mirror exists so the
 * UI compiles before that card lands. The leader's stage-2 integration swaps
 * `data-source.ts` over to the real hooks — at that point the UI keeps
 * compiling because both shapes are structurally identical. Do not rename or
 * retype the fields below; deviations belong to the data card via the leader.
 */

export type BoardActorType = "member" | "agent" | "squad";

export interface BoardIssue {
  id: string;
  number: number;
  identifier: string;
  title: string;
  statusKey: string;
  statusCategory: string;
  statusName: string;
  parentId: string | null;
  stage: number | null;
  depth: number;
  assignee: { id: string; type: BoardActorType } | null;
  childProgress: { total: number; done: number } | null;
}

export interface BoardActor {
  id: string; // `${type}:${uuid}`
  actorType: BoardActorType;
  name: string;
  runtimeStatus?: string;
  /**
   * Display-only hints the UI renders when present and hides when absent —
   * agents show "model / active count" in the design sample. Optional so the
   * canonical (narrower) contract stays assignable to this shape.
   */
  model?: string;
  activeCount?: number;
}

export type BoardEdgeType = "parent" | "assignee" | "squadMember";

export interface BoardEdge {
  id: string;
  type: BoardEdgeType;
  source: string;
  target: string;
}

export interface BoardGraph {
  issueNodes: BoardIssue[];
  actorNodes: BoardActor[];
  edges: BoardEdge[];
}

/** Node kind behind a graph node id: actor ids are `${type}:` prefixed, issue ids are bare. */
export function boardNodeKind(id: string): "issue" | "actor" {
  return /^(member|agent|squad):/.test(id) ? "actor" : "issue";
}
