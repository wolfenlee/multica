/**
 * Board data contract between the data layer (this directory, owned by the
 * data card) and the board UI (`visualization/components/`).
 *
 * This is the canonical copy of the contract the UI mirrors in
 * `components/contract.ts` until stage-2 integration. The shapes are
 * structurally identical; do not rename or retype fields without flagging it
 * on the card for the leader to reconcile.
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
  /** Distance from the tree root (top-level issues are 0). */
  depth: number;
  assignee: { id: string; type: BoardActorType } | null;
  childProgress: { total: number; done: number } | null;
}

export interface BoardActor {
  /** `${actorType}:${uuid}` — see {@link actorNodeId}. */
  id: string;
  actorType: BoardActorType;
  name: string;
  /** Coarse liveness for agents ("idle" | "working" | …); members resolve
   *  theirs from squad member-status rows when available. */
  runtimeStatus?: string;
  /**
   * Display-only hints the UI renders when present and hides when absent —
   * agents show "model / active count" in the design sample. Optional so the
   * narrower upstream shapes stay assignable to this contract.
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

/** Composes the actor node id for an assignee/squad member reference. */
export function actorNodeId(type: BoardActorType, uuid: string): string {
  return `${type}:${uuid}`;
}

/**
 * Display fallback for member actors. Members carry no display name in the
 * current API surface (assignee rows are bare ids), so the board shows
 * 「成员 + short id」; the UI renders the gray avatar + `#number` treatment
 * on top of this.
 */
export function memberFallbackName(memberId: string): string {
  return `成员 ${memberId.slice(0, 8)}`;
}
