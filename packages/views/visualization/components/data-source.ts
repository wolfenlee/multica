"use client";

import { useMemo } from "react";
import { useWorkspaceId } from "@multica/core/hooks";
import { useBoardData, useBoardRealtime } from "../data";
import type { BoardActorType, BoardGraph } from "./contract";

/**
 * The single data seam between the board UI and the data layer.
 *
 * Stage-2 integration wiring: the fixture body is replaced by the data card's
 * `useBoardData` + `useBoardRealtime`; the exported names and the returned
 * shape stay frozen (plus the additive `isLoading` / `isError` gates the
 * canvas renders while live data is in flight). Nothing else in components/
 * may fetch data.
 */

export interface BoardRealtime {
  /** WS connection state — toolbar indicator; gray "reconnecting" when false. */
  connected: boolean;
  /** Epoch ms of the last applied event; rendered as the sync clock. */
  lastSyncedAt: number;
  /** Node ids to pulse (brand glow) because an event just touched them. */
  flashIds: readonly string[];
}

export interface BoardDataSourceResult {
  graph: BoardGraph;
  realtime: BoardRealtime;
  /** "live" — kept from the fixture era so the demo chip logic still compiles. */
  source: "demo" | "live";
  /** True while the first snapshot is in flight (canvas shows the loading gate). */
  isLoading: boolean;
  /** True when the snapshot query failed (canvas shows the error gate). */
  isError: boolean;
}

export function useBoardDataSource(): BoardDataSourceResult {
  const wsId = useWorkspaceId();
  const data = useBoardData(wsId);
  const realtime = useBoardRealtime(wsId);

  // Wall clock for the sync indicator before any event lands: frozen at the
  // moment the first snapshot finishes loading, then superseded by events.
  const loadedAt = useMemo(() => (data.isLoading ? 0 : Date.now()), [data.isLoading]);

  return {
    graph: data.graph,
    realtime: {
      // The WS provider exposes no reactive transport state (subscribe /
      // onReconnect only — see packages/core/realtime/provider.tsx), so the
      // indicator approximates liveness from the snapshot: green once data
      // has arrived, red on query error. A provider-level signal is a
      // tracked follow-up.
      connected: !data.isLoading && !data.isError,
      lastSyncedAt: realtime.lastSyncedAt || loadedAt,
      flashIds: realtime.flashIds,
    },
    source: "live",
    isLoading: data.isLoading,
    isError: data.isError,
  };
}

/** Assignee type → actor roster coverage check used by tests and filters. */
export const FIXTURE_ACTOR_TYPES: readonly BoardActorType[] = ["squad", "agent", "member"];
