"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { cn } from "@multica/ui/lib/utils";
import type { ActorFlowNode, IssueFlowNode, LaneFlowNode, SquadFlowNode } from "./layout";
import { ACTOR_NODE_SIZE, ISSUE_NODE_SIZE, SQUAD_NODE_SIZE } from "./layout";
import { StatusPill, statusColorVar } from "./status-display";
import { useBoardRuntime } from "./board-context";
import { BOARD_STRINGS as S } from "./strings";

/**
 * The three custom node types plus the lane container. Components are pure
 * display: geometry comes from layout.ts, actions and lookups from
 * BoardRuntimeContext, so each renders standalone in tests with plain props.
 *
 * Relation-edge anchors are invisible Handles; the board is read-only, so
 * handles are never connectable.
 */

function FoldChevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground transition-transform",
        expanded && "rotate-180",
      )}
      aria-hidden
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M3 4.5 L6 7.5 L9 4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Enter/Space selects the node — a11y contract from 01-style §9. */
function useNodeKeyboardSelect(id: string) {
  const { selectNode } = useBoardRuntime();
  return (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectNode(id);
    }
  };
}

function FlashRing({ flashing }: { flashing: boolean }) {
  if (!flashing) return null;
  return <span className="board-flash pointer-events-none absolute inset-0 rounded-[10px] ring-2 ring-brand" aria-hidden />;
}

// ---------------------------------------------------------------------------
// issue
// ---------------------------------------------------------------------------

function IssueNodeInner({ id, data, selected }: NodeProps<IssueFlowNode>) {
  const { issue, hasChildren, descendantCount, collapsed, dimmed, crossLane } = data;
  const { toggleIssueCollapse, tier, flashIds, actorName } = useBoardRuntime();
  const onKeyDown = useNodeKeyboardSelect(id);
  const blockColor = statusColorVar(issue.statusKey);

  if (tier === "dot") {
    return (
      <div
        style={{ width: ISSUE_NODE_SIZE.width, height: ISSUE_NODE_SIZE.height }}
        className="flex items-center justify-center"
      >
        <span className="size-3 rounded-full" style={{ background: blockColor }} aria-hidden />
      </div>
    );
  }

  if (tier === "block") {
    return (
      <div
        style={{ width: ISSUE_NODE_SIZE.width, height: ISSUE_NODE_SIZE.height }}
        className="relative flex items-center justify-center rounded-[10px] border border-border bg-surface"
      >
        <span className="absolute inset-1.5 rounded-md border-2 opacity-55" style={{ borderColor: blockColor }} aria-hidden />
        <span className="relative font-mono text-micro text-muted-foreground">{issue.identifier}</span>
      </div>
    );
  }

  const name = issue.assignee ? actorName(issue.assignee.id) : null;

  return (
    <div
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={issue.identifier}
      onKeyDown={onKeyDown}
      style={{ width: ISSUE_NODE_SIZE.width, height: ISSUE_NODE_SIZE.height }}
      className={cn(
        "relative flex flex-col gap-1 rounded-[10px] border bg-surface p-3 text-left shadow-xs outline-none transition-colors",
        selected ? "border-brand ring-2 ring-brand/30" : "border-border hover:border-brand/55",
        dimmed && "opacity-15",
      )}
    >
      <FlashRing flashing={flashIds.has(id)} />
      <span className="absolute left-0 top-3 h-6 w-0.5 rounded-full" style={{ background: blockColor }} aria-hidden />
      <div className="flex items-center gap-1.5">
        <StatusPill statusKey={issue.statusKey} statusName={issue.statusName} />
        <span className="ml-auto font-mono text-micro text-muted-foreground">{issue.identifier}</span>
        {hasChildren && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={collapsed ? S.expandNode : S.collapseNode}
            onClick={(event) => {
              event.stopPropagation();
              toggleIssueCollapse(issue.id);
            }}
            className="relative inline-flex h-4 min-w-4 items-center gap-0.5 rounded text-muted-foreground hover:text-foreground"
          >
            {collapsed && descendantCount > 0 && (
              <span className="rounded-full bg-brand/10 px-1 font-mono text-[10px] font-medium text-brand">
                +{descendantCount}
              </span>
            )}
            <FoldChevron expanded={!collapsed} />
          </button>
        )}
      </div>
      <p title={issue.title} className="line-clamp-2 text-label font-semibold leading-[18px] text-foreground">
        {issue.title}
      </p>
      <div className="mt-auto flex items-center gap-2 text-micro text-muted-foreground">
        {name !== null ? (
          <span className="inline-flex min-w-0 items-center gap-1">
            <span className="size-2.5 shrink-0 rounded-full border border-border bg-muted" aria-hidden />
            <span className="truncate">{name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 shrink-0 rounded-full border border-dashed border-border" aria-hidden />
            <span className="truncate opacity-80">{S.noAssignee}</span>
          </span>
        )}
        {issue.childProgress && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono">
            {issue.childProgress.done}/{issue.childProgress.total}
          </span>
        )}
        {crossLane && issue.stage !== null && (
          <span className="shrink-0 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
            {"S"}
            {issue.stage}
          </span>
        )}
      </div>
      <Handle id="p-tgt" type="target" position={Position.Top} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle id="p-src" type="source" position={Position.Bottom} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle id="a-src" type="source" position={Position.Right} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// actor (agent / member / leader)
// ---------------------------------------------------------------------------

/** Runtime dot: solid for live states, dashed for unstable, hollow for off —
 * solidity decreases with liveness, and the text label always rides along. */
const RUNTIME_DOT: Record<string, { color: string; solid: boolean; dashed?: boolean }> = {
  working: { color: "var(--brand)", solid: true },
  idle: { color: "var(--success)", solid: true },
  online: { color: "var(--muted-foreground)", solid: true },
  unstable: { color: "var(--warning)", solid: false, dashed: true },
  offline: { color: "var(--muted-foreground)", solid: false },
  archived: { color: "var(--muted-foreground)", solid: false },
};

function RuntimeDot({ status }: { status: string }) {
  const dot = RUNTIME_DOT[status] ?? { color: "var(--muted-foreground)", solid: false };
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full border", dot.solid && "border-transparent")}
      style={
        dot.solid
          ? { background: dot.color }
          : { borderColor: dot.color, borderStyle: dot.dashed ? "dashed" : "solid" }
      }
      aria-hidden
    />
  );
}

function ActorNodeInner({ id, data, selected }: NodeProps<ActorFlowNode>) {
  const { actor, variant, dimmed } = data;
  const { flashIds, selectNode } = useBoardRuntime();
  const onKeyDown = useNodeKeyboardSelect(id);
  const isMember = actor.actorType === "member";
  const runtimeStatus = actor.runtimeStatus ?? S.runtimeStatusFallback;

  return (
    <div
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={actor.name}
      onKeyDown={onKeyDown}
      onDoubleClick={() => selectNode(id)}
      style={{ width: ACTOR_NODE_SIZE.width, height: ACTOR_NODE_SIZE.height }}
      className={cn(
        "relative flex flex-col gap-0.5 rounded-[10px] border bg-surface px-3 py-2 text-left shadow-xs outline-none transition-colors",
        selected ? "border-brand ring-2 ring-brand/30" : "border-border hover:border-brand/55",
        dimmed && "opacity-15",
      )}
    >
      <FlashRing flashing={flashIds.has(id)} />
      <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
        <RuntimeDot status={runtimeStatus} />
        <span className="truncate">{runtimeStatus}</span>
        <span className="ml-auto shrink-0 rounded border border-border px-1 font-mono text-[10px] text-muted-foreground">
          {isMember ? S.memberBadge : S.agentBadge}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold uppercase",
            isMember ? "bg-muted text-muted-foreground" : "bg-brand/10 text-brand",
          )}
          aria-hidden
        >
          {actor.name.slice(0, 1)}
        </span>
        <span className="truncate text-label font-semibold text-foreground">{actor.name}</span>
        {variant === "leader" && (
          <span className="shrink-0 rounded bg-brand/10 px-1 font-mono text-[9px] font-medium text-brand">
            {S.leaderBadge}
          </span>
        )}
      </div>
      {(actor.model !== undefined || actor.activeCount !== undefined) && (
        <span className="truncate text-micro text-muted-foreground">
          {actor.activeCount !== undefined && (
            <>
              {S.activeWork} {actor.activeCount}
              {actor.model !== undefined ? " · " : ""}
            </>
          )}
          {actor.model}
        </span>
      )}
      <Handle id="a-tgt" type="target" position={Position.Left} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle id="s-tgt" type="target" position={Position.Top} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle id="s-src" type="source" position={Position.Bottom} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// squad
// ---------------------------------------------------------------------------

function SquadNodeInner({ id, data, selected }: NodeProps<SquadFlowNode>) {
  const { actor, memberCount, leaderName, expanded, dimmed } = data;
  const { toggleSquadExpand, flashIds } = useBoardRuntime();
  const onKeyDown = useNodeKeyboardSelect(id);

  return (
    <div
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-expanded={expanded}
      aria-label={actor.name}
      onKeyDown={onKeyDown}
      style={{ width: SQUAD_NODE_SIZE.width, height: SQUAD_NODE_SIZE.height }}
      className={cn(
        "relative flex flex-col gap-1 rounded-[10px] border bg-surface p-3 text-left shadow-xs outline-none transition-colors",
        selected ? "border-brand ring-2 ring-brand/30" : "border-border hover:border-brand/55",
        dimmed && "opacity-15",
      )}
    >
      <FlashRing flashing={flashIds.has(id)} />
      <div className="flex items-center gap-1.5">
        <span className="rounded-full bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-brand">
          {S.squadBadge} · {memberCount}
        </span>
        <button
          type="button"
          tabIndex={-1}
          aria-label={expanded ? S.collapseNode : S.expandNode}
          onClick={(event) => {
            event.stopPropagation();
            toggleSquadExpand(actor.id);
          }}
          className="ml-auto inline-flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <FoldChevron expanded={expanded} />
        </button>
      </div>
      <span className="truncate text-label font-semibold text-foreground">{actor.name}</span>
      {leaderName && (
        <span className="truncate text-micro text-muted-foreground">
          {S.squadLeader}: {leaderName}
        </span>
      )}
      <span className="truncate text-micro text-muted-foreground">
        {S.squadMembers} {memberCount}/{memberCount}
      </span>
      <Handle id="a-tgt" type="target" position={Position.Left} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
      <Handle id="s-src" type="source" position={Position.Bottom} className="!size-1 !min-h-0 !min-w-0 !border-0 !bg-transparent" isConnectable={false} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// lane container
// ---------------------------------------------------------------------------

function LaneNodeInner({ data }: NodeProps<LaneFlowNode>) {
  const { stage, label, count } = data;
  return (
    <div
      className={cn(
        "h-full w-full rounded-[10px] border",
        stage === null
          ? "border-dashed border-border bg-transparent"
          : "border-border bg-[color-mix(in_oklch,var(--muted)_34%,transparent)]",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-1.5">
        <span className="font-mono text-micro text-muted-foreground">{label}</span>
        <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{count}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// registration — memoized: node data objects are stable across page re-renders
// (layout is memoized), so memo keeps zoom-tier changes from re-rendering
// everything except through the context subscription.
// ---------------------------------------------------------------------------

export const boardNodeTypes = {
  issue: memo(IssueNodeInner),
  actor: memo(ActorNodeInner),
  squad: memo(SquadNodeInner),
  lane: memo(LaneNodeInner),
};
