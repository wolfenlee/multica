"use client";

import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import { Button, buttonVariants } from "@multica/ui/components/ui/button";
import { AppLink } from "../../navigation";
import { cn } from "@multica/ui/lib/utils";
import type { BoardActor, BoardIssue } from "./contract";
import { StatusPill, statusColorVar } from "./status-display";
import { BOARD_STRINGS as S } from "./strings";

/**
 * Detail drawer — a 360px float over the canvas (non-modal by design: no
 * backdrop, closes on Esc / blank-click). One variant per node kind.
 *
 * The board contract carries no creator/activity fields, so the issue drawer
 * shows identity, status, stage, assignee and child progress; creator and
 * recent-activity sections light up when the data layer lands.
 */

export type DrawerSelection =
  | { kind: "issue"; issue: BoardIssue }
  | { kind: "actor"; actor: BoardActor; role: "agent" | "member" | "leader" }
  | { kind: "squad"; actor: BoardActor; leader: BoardActor | null; members: BoardActor[] };

export interface BoardDrawerProps {
  selection: DrawerSelection | null;
  onClose: () => void;
  onLocate: (nodeId: string) => void;
  issueHref: (issue: BoardIssue) => string;
}

function DrawerChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-micro text-muted-foreground">
      {children}
    </span>
  );
}

function IssueDrawer({ issue, onClose, issueHref }: { issue: BoardIssue; onClose: () => void; issueHref: (issue: BoardIssue) => string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start gap-2">
        <span className="font-mono text-title font-semibold text-foreground">{issue.identifier}</span>
        <StatusPill statusKey={issue.statusKey} statusName={issue.statusName} />
        <Button variant="ghost" size="sm" className="hit-44 ml-auto h-7 w-7 shrink-0 p-0" aria-label={S.close} onClick={onClose}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <p className="text-body font-medium leading-5 text-foreground">{issue.title}</p>

      <div className="flex flex-wrap gap-1.5">
        <DrawerChip>
          <span className="font-mono">{issue.stage === null ? S.ungroupedLane : `${S.stageLane} ${issue.stage}`}</span>
        </DrawerChip>
        {issue.assignee && (
          <DrawerChip>
            <span className="font-mono uppercase">{issue.assignee.type}</span>
            <span className="truncate">{issue.assignee.id}</span>
          </DrawerChip>
        )}
      </div>

      {issue.childProgress && (
        <div>
          <p className="mb-1 flex items-center justify-between font-mono text-micro text-muted-foreground">
            <span>{S.childProgress}</span>
            <span className="tabular-nums">
              {issue.childProgress.done}/{issue.childProgress.total}
            </span>
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${issue.childProgress.total === 0 ? 0 : Math.round((issue.childProgress.done / issue.childProgress.total) * 100)}%`,
                background: statusColorVar(issue.statusKey),
              }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 text-label">
        <span className="text-muted-foreground">{S.stage}</span>
        <span className="truncate text-foreground">{issue.stage === null ? "—" : `stage ${issue.stage}`}</span>
        <span className="text-muted-foreground">{S.realtime}</span>
        <span className="truncate text-muted-foreground">{S.realtimeHint}</span>
      </div>

      <AppLink
        href={issueHref(issue)}
        className={`${buttonVariants({ variant: "outline" })} mt-auto w-full gap-1.5`}
      >
        {S.openInBoard}
        <ExternalLink className="size-3.5" aria-hidden />
      </AppLink>
    </div>
  );
}

function ActorDrawer({ selection, onClose, onLocate }: { selection: Extract<DrawerSelection, { kind: "actor" | "squad" }>; onClose: () => void; onLocate: (nodeId: string) => void }) {
  if (selection.kind === "actor") {
    const { actor, role } = selection;
    const badge = role === "leader" ? S.leaderBadge : actor.actorType === "member" ? S.memberBadge : S.agentBadge;
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-start gap-2">
          <span className="truncate text-title font-semibold text-foreground">{actor.name}</span>
          <Button variant="ghost" size="sm" className="hit-44 ml-auto h-7 w-7 shrink-0 p-0" aria-label={S.close} onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <DrawerChip>
            <span className="font-mono uppercase">{badge}</span>
          </DrawerChip>
          {actor.runtimeStatus && (
            <DrawerChip>
              <span>{actor.runtimeStatus}</span>
            </DrawerChip>
          )}
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-x-2 gap-y-1.5 text-label">
          {actor.model && (
            <>
              <span className="text-muted-foreground">{S.model}</span>
              <span className="truncate font-mono text-foreground">{actor.model}</span>
            </>
          )}
          {actor.activeCount !== undefined && (
            <>
              <span className="text-muted-foreground">{S.activeWork}</span>
              <span className="font-mono tabular-nums text-foreground">{actor.activeCount}</span>
            </>
          )}
        </div>
        <p className="mt-auto text-micro text-muted-foreground">{S.actorRuntimeHint}</p>
      </div>
    );
  }

  const { actor, leader, members } = selection;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start gap-2">
        <span className="truncate text-title font-semibold text-foreground">{actor.name}</span>
        <Button variant="ghost" size="sm" className="hit-44 ml-auto h-7 w-7 shrink-0 p-0" aria-label={S.close} onClick={onClose}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <DrawerChip>
          <span className="font-mono uppercase">{S.squadBadge} · {members.length + (leader ? 1 : 0)}</span>
        </DrawerChip>
      </div>

      <div>
        <p className="mb-1 font-mono text-micro text-muted-foreground">{S.squadMembers}</p>
        <ul className="flex flex-col">
          {leader && (
            <SquadMemberRow key={leader.id} actor={leader} leader onLocate={onLocate} nodeId={leader.id} />
          )}
          {members.map((member) => (
            <SquadMemberRow key={member.id} actor={member} onLocate={onLocate} nodeId={member.id} />
          ))}
        </ul>
      </div>
      <p className="mt-auto text-micro text-muted-foreground">{S.squadLeader}: {leader?.name ?? "—"}</p>
    </div>
  );
}

function SquadMemberRow({ actor, leader, nodeId, onLocate }: { actor: BoardActor; leader?: boolean; nodeId: string; onLocate: (nodeId: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onLocate(nodeId)}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-label text-foreground hover:bg-accent"
      >
        <span
          className={cn("size-2 shrink-0 rounded-full", actor.runtimeStatus === "working" ? "bg-brand" : "bg-muted-foreground/50")}
          aria-hidden
        />
        <span className="truncate">{actor.name}</span>
        {leader && (
          <span className="shrink-0 rounded bg-brand/10 px-1 font-mono text-[9px] font-medium text-brand">{S.leaderBadge}</span>
        )}
        {actor.activeCount !== undefined && (
          <span className="ml-auto shrink-0 font-mono text-micro tabular-nums text-muted-foreground">
            {S.activeWork} {actor.activeCount}
          </span>
        )}
      </button>
    </li>
  );
}

export function BoardDrawer({ selection, onClose, onLocate, issueHref }: BoardDrawerProps) {
  useEffect(() => {
    if (!selection) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, onClose]);

  if (!selection) return null;

  return (
    <aside
      className="absolute right-3 top-3 bottom-3 z-10 flex w-[360px] max-w-[calc(100%-24px)] flex-col rounded-[10px] border border-border bg-surface shadow-lg"
      aria-label={S.openDetails}
    >
      {selection.kind === "issue" ? (
        <IssueDrawer issue={selection.issue} onClose={onClose} issueHref={issueHref} />
      ) : (
        <ActorDrawer selection={selection} onClose={onClose} onLocate={onLocate} />
      )}
    </aside>
  );
}
