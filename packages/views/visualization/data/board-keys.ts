/**
 * Query keys for the visualization board module.
 *
 * Scoped under their own tree (not `issueKeys`) because the board is one
 * aggregated snapshot, not a window over the shared issue caches: refetching
 * it means re-walking the tree, so it must not be dragged along by the broad
 * `["issues", wsId]` invalidations other surfaces trigger. Realtime healing
 * is the board's own hook (`useBoardRealtime`), which invalidates this tree
 * on the events that touch board-visible fields.
 */
export const boardKeys = {
  all: (wsId: string) => ["visualization-board", wsId] as const,
  /** FULL KEY for the aggregated board snapshot query. */
  graph: (wsId: string) => [...boardKeys.all(wsId), "graph"] as const,
};
