"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useWSReconnect, useWSEvent } from "@multica/core/realtime";
import type { WSEventPayloadMap, WSEventType } from "@multica/core/types";
import { boardKeys } from "./board-keys";

export interface BoardRealtimeState {
  /** Epoch ms of the last applied realtime event (0 = none this session). */
  lastSyncedAt: number;
  /** Node ids the most recent events touched — the UI pulses them. */
  flashIds: readonly string[];
}

/**
 * Keeps the board snapshot fresh off the EXISTING WebSocket channel — no new
 * events, rooms, or backend surface. Board-relevant events invalidate the
 * board's query tree (snapshot semantics: events patch issue caches elsewhere,
 * but the board is one aggregated query, so invalidate-and-refetch is the
 * correct unit here) and record what changed for the sync indicator.
 *
 * Subscribed events, scoped to what the board renders (title/status/stage/
 * assignee/progress/squad composition/agent liveness):
 *
 * - `issue:created` / `issue:updated` / `issue:deleted` — tree shape, status,
 *   assignee, and child-progress shifts (child add/remove/done);
 * - `issue_status:changed` — status names/categories resolve from the catalog;
 * - `agent:status` — agent runtime pills;
 * - `squad:created` / `squad:updated` / `squad:deleted` — dispatch roster.
 */
export function useBoardRealtime(wsId: string): BoardRealtimeState {
  const qc: QueryClient = useQueryClient();
  const [state, setState] = useState<BoardRealtimeState>({ lastSyncedAt: 0, flashIds: [] });

  const invalidate = useCallback(() => {
    if (wsId === "") return;
    void qc.invalidateQueries({ queryKey: boardKeys.all(wsId) });
  }, [qc, wsId]);

  // One shared applier per event kind; handler identity stays stable (qc and
  // wsId are stable) so useWSEvent subscriptions don't churn per render.
  const apply = useCallback(
    (event: WSEventType, payload: unknown) => {
      invalidate();
      setState({ lastSyncedAt: Date.now(), flashIds: flashIdsForEvent(event, payload) });
    },
    [invalidate],
  );

  const onIssueCreated = useCallback(
    (payload: unknown) => apply("issue:created", payload),
    [apply],
  );
  useWSEvent("issue:created", onIssueCreated);

  const onIssueUpdated = useCallback(
    (payload: unknown) => apply("issue:updated", payload),
    [apply],
  );
  useWSEvent("issue:updated", onIssueUpdated);

  const onIssueDeleted = useCallback(
    (payload: unknown) => apply("issue:deleted", payload),
    [apply],
  );
  useWSEvent("issue:deleted", onIssueDeleted);

  const onIssueStatusChanged = useCallback(
    (payload: unknown) => apply("issue_status:changed", payload),
    [apply],
  );
  useWSEvent("issue_status:changed", onIssueStatusChanged);

  const onAgentStatus = useCallback(
    (payload: unknown) => apply("agent:status", payload),
    [apply],
  );
  useWSEvent("agent:status", onAgentStatus);

  const onSquadChanged = useCallback(() => {
    invalidate();
    setState({ lastSyncedAt: Date.now(), flashIds: [] });
  }, [invalidate]);
  useWSEvent("squad:created", onSquadChanged);
  useWSEvent("squad:updated", onSquadChanged);
  useWSEvent("squad:deleted", onSquadChanged);

  // A disconnect can silently drop events; refetch on reconnect so the board
  // heals instead of waiting for the next unrelated event.
  useWSReconnect(invalidate);

  return state;
}

/**
 * Maps an event payload to the node ids the board should pulse. Payloads for
 * squad events aren't formally typed yet — they invalidate without a flash.
 * Narrowing casts only: the WS handler boundary hands over `unknown` payloads.
 */
function flashIdsForEvent(event: WSEventType, payload: unknown): string[] {
  if (event === "issue:created" || event === "issue:updated") {
    const issueId = (payload as WSEventPayloadMap["issue:updated"]).issue?.id;
    return issueId ? [issueId] : [];
  }
  if (event === "issue:deleted") {
    const issueId = (payload as WSEventPayloadMap["issue:deleted"]).issue_id;
    return issueId ? [issueId] : [];
  }
  if (event === "agent:status") {
    const agent = (payload as WSEventPayloadMap["agent:status"]).agent;
    return agent?.id ? [`agent:${agent.id}`] : [];
  }
  return [];
}
