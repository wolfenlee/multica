import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import type { Agent, Issue, Squad, SquadMember, SquadMemberStatus } from "@multica/core/types";

const h = vi.hoisted(() => {
  const api = {
    listIssues: vi.fn(),
    listChildrenByParents: vi.fn(),
    getChildIssueProgress: vi.fn(),
    listSquads: vi.fn(),
    listSquadMembers: vi.fn(),
    getSquadMemberStatus: vi.fn(),
    listAgents: vi.fn(),
  };
  return { api };
});

vi.mock("@multica/core/api", () => ({ api: h.api }));

import { boardKeys } from "./board-keys";
import { useBoardData } from "./use-board-data";

const WS_ID = "ws-1";

function makeIssue(overrides: Partial<Issue> & Pick<Issue, "id">): Issue {
  const { id, ...rest } = overrides;
  const idx = Number(id.replace(/\D/g, "")) || 0;
  return {
    id,
    workspace_id: WS_ID,
    number: idx,
    identifier: `MUL-${idx}`,
    title: `Issue ${id}`,
    description: null,
    status: "todo",
    priority: "none",
    assignee_type: null,
    assignee_id: null,
    creator_type: "member",
    creator_id: "user-1",
    parent_issue_id: null,
    project_id: null,
    position: idx,
    stage: null,
    start_date: null,
    due_date: null,
    metadata: {},
    properties: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

function makeAgent(id: string): Agent {
  return {
    id,
    workspace_id: WS_ID,
    runtime_id: "runtime-1",
    name: `Agent ${id}`,
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "cloud",
    provider: "anthropic",
    launch_header: "",
    status: "idle",
    device_info: "",
    metadata: {},
    owner_id: null,
    visibility: "workspace",
    issue_id: "",
    priority: 0,
    permission_mode: "private",
    invocation_targets: [],
    max_concurrent_tasks: 1,
    model: "claude-fable-5-1",
    runtime_config: {},
    custom_args: [],
    skills: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
  } as Agent;
}

function makeSquad(id: string): Squad {
  return {
    id,
    workspace_id: WS_ID,
    name: `Squad ${id}`,
    description: "",
    instructions: "",
    avatar_url: null,
    leader_id: "agent-leader",
    creator_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    member_count: 1,
    member_preview: [],
  };
}

function makeMember(memberId: string, memberType: "agent" | "member" = "member"): SquadMember {
  return {
    id: `sm-${memberId}`,
    squad_id: "squad-1",
    member_type: memberType,
    member_id: memberId,
    role: "member",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function installApi() {
  h.api.listIssues.mockImplementation((params: { limit: number; offset: number }) =>
    Promise.resolve({
      // Two roots on the first page; the walk stops there (short page).
      issues:
        params.offset === 0 ? [makeIssue({ id: "i1", stage: 1 }), makeIssue({ id: "i2" })] : [],
      total: 2,
    }),
  );
  h.api.listChildrenByParents.mockImplementation((parentIds: string[]) =>
    Promise.resolve({
      issues: parentIds.includes("i1")
        ? [makeIssue({ id: "i3", parent_issue_id: "i1", stage: 2, assignee_id: "agent-a", assignee_type: "agent" })]
        : [],
    }),
  );
  h.api.getChildIssueProgress.mockResolvedValue({
    progress: [{ parent_issue_id: "i1", total: 1, done: 0 }],
  });
  h.api.listSquads.mockResolvedValue([
    makeSquad("squad-1"),
    { ...makeSquad("squad-archived"), archived_at: "2026-01-02T00:00:00Z" },
  ]);
  h.api.listSquadMembers.mockResolvedValue([makeMember("member-h"), makeMember("agent-leader", "agent")]);
  h.api.getSquadMemberStatus.mockResolvedValue({
    members: [
      { member_type: "agent", member_id: "agent-leader", status: "working", active_issues: [], last_active_at: null },
      { member_type: "member", member_id: "member-h", status: null, active_issues: [], last_active_at: null },
    ] as SquadMemberStatus[],
  });
  h.api.listAgents.mockResolvedValue([makeAgent("agent-a")]);
}

function renderBoardData(wsId: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(() => useBoardData(wsId), { wrapper }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  installApi();
});

describe("useBoardData", () => {
  it("aggregates issues (paginated + subtree), progress, squads, and agents into one graph", async () => {
    const { result } = renderBoardData(WS_ID);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const { graph, lanes, metadata } = result.current;
    // Two roots + one child of i1.
    expect(graph.issueNodes.map((i) => i.id).sort()).toEqual(["i1", "i2", "i3"]);
    expect(graph.issueNodes.find((i) => i.id === "i1")?.childProgress).toEqual({ total: 1, done: 0 });
    expect(graph.issueNodes.find((i) => i.id === "i3")?.depth).toBe(1);
    // Root walk: page 1 requested with the board page size; subtree batched.
    expect(h.api.listIssues).toHaveBeenCalledWith({ top_level_only: true, limit: 100, offset: 0 });
    expect(h.api.listChildrenByParents).toHaveBeenCalledWith(["i1", "i2"]);
    // Archived squads are excluded from the dispatch roster.
    expect(h.api.listSquadMembers).toHaveBeenCalledWith("squad-1");
    expect(h.api.listSquadMembers).not.toHaveBeenCalledWith("squad-archived");
    expect(h.api.listAgents).toHaveBeenCalledWith({ workspace_id: WS_ID });

    // All three edge kinds land in one graph.
    expect(graph.edges.some((e) => e.type === "parent" && e.source === "i1" && e.target === "i3")).toBe(true);
    expect(graph.edges.some((e) => e.type === "assignee" && e.target === "agent:agent-a")).toBe(true);
    expect(graph.edges.some((e) => e.type === "squadMember" && e.source === "squad:squad-1")).toBe(true);

    // Swimlanes: ungrouped pinned on top, then stages ascending.
    expect(lanes.map((l) => l.stage)).toEqual([null, 1, 2]);
    expect(metadata.issueCount).toBe(3);
    expect(metadata.actorCount).toBe(4);
  });

  it("seeds default collapse state (squads collapsed) and a within-budget metadata report", async () => {
    const { result } = renderBoardData(WS_ID);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.defaultCollapsedActors).toEqual(new Set(["squad:squad-1"]));
    expect(result.current.defaultCollapsedIssues).toEqual(new Set());
    expect(result.current.visibility.visibleActorIds.has("squad:squad-1")).toBe(true);
    expect(result.current.metadata.firstScreenWithinTarget).toBe(true);
  });

  it("keys the snapshot under the board query tree for the workspace", async () => {
    const { client, result } = renderBoardData(WS_ID);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(client.getQueryData(boardKeys.graph(WS_ID))).toBeDefined();
    expect(client.getQueryCache().getAll().every((q) => q.queryKey[0] === "visualization-board")).toBe(true);
  });

  it("fetches nothing without a workspace", async () => {
    const { result } = renderBoardData("");
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(h.api.listIssues).not.toHaveBeenCalled();
    expect(result.current.graph.issueNodes).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
