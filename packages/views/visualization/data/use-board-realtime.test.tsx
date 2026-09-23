import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";

const h = vi.hoisted(() => {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const useWSEvent = vi.fn((event: string, handler: (payload?: unknown) => void) => {
    handlers.set(event, handler);
  });
  const useWSReconnect = vi.fn((callback: () => void) => {
    handlers.set("__reconnect", callback);
  });
  return { handlers, useWSEvent, useWSReconnect };
});

vi.mock("@multica/core/realtime", () => ({ useWSEvent: h.useWSEvent, useWSReconnect: h.useWSReconnect }));

import { boardKeys } from "./board-keys";
import { useBoardRealtime } from "./use-board-realtime";

const WS_ID = "ws-1";

function renderRealtime(wsId: string) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // Seed the board cache so invalidation has something to mark stale.
  client.setQueryData(boardKeys.graph(wsId), { seed: true });
  const rendered = renderHook(() => useBoardRealtime(wsId), { wrapper });
  return { client, ...rendered };
}

const boardQuery = (client: QueryClient) =>
  client.getQueryState(boardKeys.graph(WS_ID));

beforeEach(() => {
  h.handlers.clear();
  h.useWSEvent.mockClear();
  h.useWSReconnect.mockClear();
});

describe("useBoardRealtime", () => {
  it("subscribes to the board-relevant event set", () => {
    renderRealtime(WS_ID);
    const events = h.useWSEvent.mock.calls.map((call) => call[0]);
    expect(events).toEqual([
      "issue:created",
      "issue:updated",
      "issue:deleted",
      "issue_status:changed",
      "agent:status",
      "squad:created",
      "squad:updated",
      "squad:deleted",
    ]);
    expect(h.useWSReconnect).toHaveBeenCalledTimes(1);
  });

  it("invalidates the board tree on an issue update and flashes the node", async () => {
    const { client, result } = renderRealtime(WS_ID);
    expect(result.current.lastSyncedAt).toBe(0);

    const before = Date.now();
    await act(async () => {
      h.handlers.get("issue:updated")?.({ issue: { id: "i9" } });
    });

    expect(boardQuery(client)?.isInvalidated).toBe(true);
    expect(result.current.flashIds).toEqual(["i9"]);
    expect(result.current.lastSyncedAt).toBeGreaterThanOrEqual(before);
  });

  it("maps agent:status to the prefixed actor node id", async () => {
    const { client, result } = renderRealtime(WS_ID);
    await act(async () => {
      h.handlers.get("agent:status")?.({ agent: { id: "a1" } });
    });
    expect(boardQuery(client)?.isInvalidated).toBe(true);
    expect(result.current.flashIds).toEqual(["agent:a1"]);
  });

  it("maps issue:deleted to the deleted issue id", async () => {
    const { result } = renderRealtime(WS_ID);
    await act(async () => {
      h.handlers.get("issue:deleted")?.({ issue_id: "i7" });
    });
    expect(result.current.flashIds).toEqual(["i7"]);
  });

  it("invalidates on squad events without a flash target (payload untyped upstream)", async () => {
    const { client, result } = renderRealtime(WS_ID);
    await act(async () => {
      h.handlers.get("squad:updated")?.({ id: "squad-1" });
    });
    expect(boardQuery(client)?.isInvalidated).toBe(true);
    expect(result.current.flashIds).toEqual([]);
    expect(result.current.lastSyncedAt).toBeGreaterThan(0);
  });

  it("reconnect refetches to heal events missed while disconnected", async () => {
    const { client } = renderRealtime(WS_ID);
    await act(async () => {
      h.handlers.get("__reconnect")?.();
    });
    expect(boardQuery(client)?.isInvalidated).toBe(true);
  });

  it("is a no-op without a workspace", async () => {
    const { client, result } = renderRealtime("");
    await act(async () => {
      h.handlers.get("issue:updated")?.({ issue: { id: "i9" } });
    });
    // No board query exists under "" — nothing to invalidate, no flash state.
    expect(client.getQueryState(boardKeys.graph(""))?.isInvalidated ?? false).toBe(false);
    expect(result.current.flashIds).toEqual(["i9"]);
  });
});
