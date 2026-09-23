"use client";

import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import type { BoardGraph } from "./types";
import {
  assignBoardLanes,
  boardLayoutMetadata,
  buildBoardGraph,
  defaultCollapsedActorIds,
  defaultCollapsedIssueIds,
  resolveBoardVisibility,
  type BoardLaneModel,
  type BoardLayoutMetadata,
  type BoardVisibility,
} from "./board-graph";
import { boardKeys } from "./board-keys";
import { fetchBoardSource } from "./board-source";

export interface BoardDataResult {
  graph: BoardGraph;
  /** Swimlanes (stage=null pinned on top, then STAGE n ascending). */
  lanes: BoardLaneModel[];
  /** Collapse state a fresh board starts from. */
  defaultCollapsedIssues: Set<string>;
  defaultCollapsedActors: Set<string>;
  /** Visible/hidden node sets under the default collapse. */
  visibility: BoardVisibility;
  /** Scale stats for zoom-tier degradation. */
  metadata: BoardLayoutMetadata;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * Aggregates everything the board needs for a workspace into one snapshot
 * query: top-level issues (paginated), the full subtree (batched children
 * levels), child progress, squads + members + runtime status, and agents.
 * The derived graph/lane/collapse/metadata values recompute only when the
 * snapshot identity changes.
 *
 * Refetching is realtime-driven: the global query config treats caches as
 * immortal (`staleTime: Infinity`), and `useBoardRealtime` invalidates
 * `boardKeys` on the events that touch board-visible fields.
 */
export function useBoardData(wsId: string): BoardDataResult {
  const query: UseQueryResult<Awaited<ReturnType<typeof fetchBoardSource>>, Error> = useQuery({
    queryKey: boardKeys.graph(wsId),
    queryFn: () => fetchBoardSource(wsId),
    enabled: wsId !== "",
    placeholderData: keepPreviousData,
  });

  return useMemo(() => {
    const source = query.data;
    const emptySet = new Set<string>();
    if (!source) {
      return {
        graph: { issueNodes: [], actorNodes: [], edges: [] },
        lanes: [],
        defaultCollapsedIssues: emptySet,
        defaultCollapsedActors: emptySet,
        visibility: {
          visibleIssueIds: emptySet,
          hiddenIssueIds: emptySet,
          visibleActorIds: emptySet,
          hiddenActorIds: emptySet,
        },
        metadata: {
          issueCount: 0,
          actorCount: 0,
          edgeCount: 0,
          maxDepth: 0,
          laneCount: 0,
          visibleNodeCount: 0,
          hiddenNodeCount: 0,
          firstScreenWithinTarget: true,
        },
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
      };
    }
    const graph = buildBoardGraph(source);
    const lanes = assignBoardLanes(graph.issueNodes);
    const defaultCollapsedIssues = defaultCollapsedIssueIds(graph.issueNodes);
    const defaultCollapsedActors = defaultCollapsedActorIds(graph.actorNodes);
    const visibility = resolveBoardVisibility(graph, defaultCollapsedIssues, defaultCollapsedActors);
    const metadata = boardLayoutMetadata(graph, visibility, lanes);
    return {
      graph,
      lanes,
      defaultCollapsedIssues,
      defaultCollapsedActors,
      visibility,
      metadata,
      isLoading: query.isLoading,
      isError: query.isError,
      error: query.error,
    };
  }, [query.data, query.isLoading, query.isError, query.error]);
}
