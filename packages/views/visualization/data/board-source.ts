import { api } from "@multica/core/api";
import { CHILDREN_BY_PARENTS_CHUNK_SIZE } from "@multica/core/issues/queries";
import type { Agent, Issue, Squad, SquadMember, SquadMemberStatus } from "@multica/core/types";

/**
 * Raw aggregates the board needs, fetched once per snapshot. Everything the
 * pure graph model (`board-graph.ts`) consumes; no shaping happens here
 * beyond fanning the requests out.
 */
export interface BoardSourceData {
  /** Top-level issues plus every fetched descendant. */
  issues: Issue[];
  /** Parent issue id → child progress (`GET /api/issues/child-progress`). */
  childProgress: Map<string, { total: number; done: number }>;
  squads: Squad[];
  /** Squad id → member rows. */
  squadMembers: Map<string, SquadMember[]>;
  /** Squad id → per-member runtime status rows. */
  squadMemberStatus: Map<string, SquadMemberStatus[]>;
  agents: Agent[];
}

/** Page size for the top-level walk. The card spec pins it at 100. */
export const BOARD_TOP_LEVEL_PAGE_SIZE = 100;

/**
 * Paranoia cap on the top-level walk. A workspace with more root issues than
 * this is a data problem, not a rendering one — the guard keeps a buggy
 * server `total` from spinning the loop forever (same pattern as
 * `PROJECT_GANTT_MAX_ISSUES`).
 */
export const BOARD_MAX_TOP_LEVEL_ISSUES = 5_000;

/**
 * Paranoia cap on tree depth. Barriers are 2–3 stages with a handful of
 * levels each; 8 is far beyond anything real and stops corrupt parent chains
 * (or cycles) from looping.
 */
export const BOARD_MAX_TREE_DEPTH = 8;

/**
 * Walks `GET /api/issues?top_level_only=true` in `limit`-sized pages until
 * the server's `total` is reached. The fetcher is injected so the walk is
 * unit-testable without a module mock.
 */
export async function walkTopLevelIssues(
  fetchPage: (limit: number, offset: number) => Promise<{ issues: Issue[]; total: number }>,
  limit = BOARD_TOP_LEVEL_PAGE_SIZE,
): Promise<Issue[]> {
  const all: Issue[] = [];
  let offset = 0;
  while (offset < BOARD_MAX_TOP_LEVEL_ISSUES) {
    const res = await fetchPage(limit, offset);
    all.push(...res.issues);
    if (res.issues.length < limit) break;
    if (all.length >= res.total) break;
    offset += limit;
  }
  return all;
}

/** Splits parent ids into `listChildrenByParents`-sized chunks. */
export function chunkParentIds(
  parentIds: readonly string[],
  size = CHILDREN_BY_PARENTS_CHUNK_SIZE,
): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < parentIds.length; i += size) {
    chunks.push(parentIds.slice(i, i + size).map((id) => id));
  }
  return chunks;
}

/**
 * Collects every descendant of the given roots, one tree level per batched
 * `GET /api/issues/children` round (no N-request fan-out per parent). Returns
 * the descendants in breadth-first level order, deduplicated by id — the
 * roots themselves are NOT included. `maxDepth` bounds the walk.
 */
export async function collectDescendants(
  rootIds: readonly string[],
  fetchChildrenBatch: (parentIds: readonly string[]) => Promise<Issue[]>,
  maxDepth = BOARD_MAX_TREE_DEPTH,
): Promise<Issue[]> {
  const seen = new Set<string>(rootIds);
  const collected: Issue[] = [];
  let frontier = [...rootIds];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const children = await fetchChildrenBatch(frontier);
    const next: string[] = [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      collected.push(child);
      next.push(child.id);
    }
    frontier = next;
  }
  return collected;
}

async function fetchChildrenByParentsBatch(parentIds: readonly string[]): Promise<Issue[]> {
  const chunks = chunkParentIds(parentIds);
  const responses = await Promise.all(chunks.map((c) => api.listChildrenByParents(c)));
  const issues: Issue[] = [];
  for (const res of responses) issues.push(...res.issues);
  return issues;
}

/**
 * Fetches the full board snapshot. Issue/child/progress/squad-status
 * endpoints parse through their existing zod schemas inside the client;
 * `listAgents` / `listSquadMembers` ride the existing client methods as-is
 * (they predate schema parsing in core, which is outside this module's file
 * scope).
 */
export async function fetchBoardSource(wsId: string): Promise<BoardSourceData> {
  const topLevel = await walkTopLevelIssues((limit, offset) =>
    api.listIssues({ top_level_only: true, limit, offset }),
  );
  const descendants = await collectDescendants(
    topLevel.map((i) => i.id),
    fetchChildrenByParentsBatch,
  );

  const progress = new Map<string, { total: number; done: number }>();
  if (topLevel.length + descendants.length > 0) {
    const { progress: rows } = await api.getChildIssueProgress();
    for (const row of rows) {
      progress.set(row.parent_issue_id, { total: row.total, done: row.done });
    }
  }

  // Squads carry no workspace filter on the wire; the list is workspace-scoped
  // by auth. Archived squads are excluded — the board shows live dispatch.
  const squads = (await api.listSquads()).filter((s) => s.archived_at == null);
  const squadMembers = new Map<string, SquadMember[]>();
  const squadMemberStatus = new Map<string, SquadMemberStatus[]>();
  await Promise.all(
    squads.map(async (squad) => {
      const [members, status] = await Promise.all([
        api.listSquadMembers(squad.id).catch(() => []),
        api.getSquadMemberStatus(squad.id).then((r) => r.members).catch(() => []),
      ]);
      squadMembers.set(squad.id, members);
      squadMemberStatus.set(squad.id, status);
    }),
  );

  const agents = await api.listAgents({ workspace_id: wsId });

  return { issues: [...topLevel, ...descendants], childProgress: progress, squads, squadMembers, squadMemberStatus, agents };
}
