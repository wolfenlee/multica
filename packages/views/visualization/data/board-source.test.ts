// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Issue } from "@multica/core/types";

import {
  BOARD_MAX_TOP_LEVEL_ISSUES,
  BOARD_TOP_LEVEL_PAGE_SIZE,
  chunkParentIds,
  collectDescendants,
  walkTopLevelIssues,
} from "./board-source";

function makeIssue(id: string, parentIssueId: string | null = null): Issue {
  const idx = Number(id.replace(/\D/g, "")) || 0;
  return {
    id,
    workspace_id: "ws-1",
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
    parent_issue_id: parentIssueId,
    project_id: null,
    position: idx,
    stage: null,
    start_date: null,
    due_date: null,
    metadata: {},
    properties: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function issuePage(ids: string[], total: number) {
  return { issues: ids.map((id) => makeIssue(id)), total };
}

describe("walkTopLevelIssues", () => {
  it("pages until the server total is reached", async () => {
    const firstPage = Array.from({ length: BOARD_TOP_LEVEL_PAGE_SIZE }, (_, i) => `i${i + 1}`);
    const secondPage = Array.from({ length: 30 }, (_, i) => `j${i + 1}`);
    const calls: number[] = [];
    const all = await walkTopLevelIssues((_limit, offset) => {
      calls.push(offset);
      const page = offset === 0 ? firstPage : secondPage;
      return Promise.resolve(issuePage(page, 130));
    });
    expect(calls).toEqual([0, 100]);
    expect(all).toHaveLength(130);
  });

  it("stops at a short page even without a matching total", async () => {
    const all = await walkTopLevelIssues((limit) =>
      Promise.resolve(issuePage(Array.from({ length: limit - 1 }, (_, i) => `i${i}`), Number.MAX_SAFE_INTEGER)),
    );
    expect(all).toHaveLength(99);
  });

  it("stops immediately when the first page is shorter than the limit", async () => {
    const all = await walkTopLevelIssues(() => Promise.resolve(issuePage(["i1"], 999)));
    expect(all).toHaveLength(1);
  });

  it("stops at the paranoia cap even if the server keeps claiming more", async () => {
    const limit = BOARD_TOP_LEVEL_PAGE_SIZE;
    const all = await walkTopLevelIssues(
      (_limit, offset) =>
        Promise.resolve(
          issuePage(
            Array.from({ length: limit }, (_, i) => `i${offset + i}`),
            Number.MAX_SAFE_INTEGER,
          ),
        ),
      limit,
    );
    expect(all).toHaveLength(BOARD_MAX_TOP_LEVEL_ISSUES);
  });
});

describe("chunkParentIds", () => {
  it("splits parent ids into chunk-sized groups", () => {
    const ids = Array.from({ length: 7 }, (_, i) => `p${i}`);
    expect(chunkParentIds(ids, 3)).toEqual([["p0", "p1", "p2"], ["p3", "p4", "p5"], ["p6"]]);
  });

  it("returns no chunks for an empty frontier", () => {
    expect(chunkParentIds([], 3)).toEqual([]);
  });
});

describe("collectDescendants", () => {
  it("walks the tree level by level with one batched call per level", async () => {
    // i1 → { i2, i3 }; i2 → { i4 }; i3 → { i5, i6 }
    const levels: Record<string, string[]> = {
      i1: ["i2", "i3"],
      i2: ["i4"],
      i3: ["i5", "i6"],
    };
    const calls: string[][] = [];
    const descendants = await collectDescendants(["i1"], (parentIds) => {
      calls.push([...parentIds]);
      return Promise.resolve(
        parentIds.flatMap((pid) => (levels[pid] ?? []).map((id) => makeIssue(id, pid))),
      );
    });
    expect(calls).toEqual([["i1"], ["i2", "i3"], ["i4", "i5", "i6"]]);
    expect(descendants.map((i) => i.id)).toEqual(["i2", "i3", "i4", "i5", "i6"]);
  });

  it("deduplicates ids the server returns twice and skips roots", async () => {
    const descendants = await collectDescendants(["i1"], (parentIds) =>
      Promise.resolve(
        parentIds.length === 1
          ? [makeIssue("i2", "i1"), makeIssue("i2", "i1")]
          : [makeIssue("i1", "i2")], // server echo: the root comes back as a child
      ),
    );
    expect(descendants.map((i) => i.id)).toEqual(["i2"]);
  });

  it("stops at the depth cap instead of walking a pathological chain", async () => {
    let calls = 0;
    const descendants = await collectDescendants(
      ["i0"],
      (parentIds) => {
        calls += 1;
        return Promise.resolve(parentIds.map((pid) => makeIssue(`${pid}x`, pid)));
      },
      4,
    );
    expect(calls).toBe(4);
    expect(descendants).toHaveLength(4);
    expect(descendants.at(-1)?.id).toBe("i0xxxx");
  });

  it("returns nothing for childless roots", async () => {
    const descendants = await collectDescendants(["i1"], () => Promise.resolve([]));
    expect(descendants).toEqual([]);
  });
});
