"use client";

import { forwardRef } from "react";
import { Maximize, Minus, Plus, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@multica/ui/components/ui/dropdown-menu";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { cn } from "@multica/ui/lib/utils";
import type { BoardActorType } from "./contract";
import { BOARD_STRINGS as S } from "./strings";

/**
 * Top toolbar: search (⌘K), status/assignee filters, fit + zoom controls with
 * the live percentage, legend toggle, and the realtime indicator. Buttons keep
 * a ≥44px hit area over their compact visual (01-style §3) via the `hit-44`
 * helper class in board.css.
 */

export interface ToolbarZoomControls {
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export interface BoardToolbarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onQueryEnter: () => void;
  statusFilter: ReadonlySet<string>;
  onToggleStatus: (key: string) => void;
  statusOptions: { key: string; label: string }[];
  assigneeFilter: ReadonlySet<BoardActorType>;
  onToggleAssignee: (type: BoardActorType) => void;
  zoomPct: number;
  legendOpen: boolean;
  onToggleLegend: () => void;
  realtime: { connected: boolean; lastSyncedAt: number };
  demoData: boolean;
  zoomControls: ToolbarZoomControls;
}

const ASSIGNEE_OPTIONS: { type: BoardActorType; label: string }[] = [
  { type: "squad", label: "Squad" },
  { type: "agent", label: "Agent" },
  { type: "member", label: "Member" },
];

function syncClock(lastSyncedAt: number): string {
  const d = new Date(lastSyncedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const BoardToolbar = forwardRef<HTMLInputElement, BoardToolbarProps>(function BoardToolbar(
  {
    query,
    onQueryChange,
    onQueryEnter,
    statusFilter,
    onToggleStatus,
    statusOptions,
    assigneeFilter,
    onToggleAssignee,
    zoomPct,
    legendOpen,
    onToggleLegend,
    realtime,
    demoData,
    zoomControls,
  },
  searchRef,
) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
      <div className="relative min-w-[220px] flex-1 md:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={searchRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onQueryEnter();
          }}
          placeholder={S.searchPlaceholder}
          aria-label={S.searchLabel}
          className="h-8 pl-8 text-label"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="hit-44 h-8">
              {S.filterStatus}
              {statusFilter.size > 0 && <span className="font-mono text-micro text-brand">({statusFilter.size})</span>}
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          {statusOptions.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.key}
              checked={statusFilter.has(option.key)}
              onCheckedChange={() => onToggleStatus(option.key)}
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="hit-44 h-8">
              {S.filterAssignee}
              {assigneeFilter.size > 0 && <span className="font-mono text-micro text-brand">({assigneeFilter.size})</span>}
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          {ASSIGNEE_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.type}
              checked={assigneeFilter.has(option.type)}
              onCheckedChange={() => onToggleAssignee(option.type)}
              onSelect={(event) => event.preventDefault()}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="hidden truncate text-label text-muted-foreground md:inline">{S.layoutStandard}</span>

      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="outline" size="sm" className="hit-44 h-8 gap-1" onClick={zoomControls.onFit}>
          <Maximize className="size-3.5" aria-hidden />
          {S.fitView}
        </Button>
        <div className="flex items-center rounded-md border border-border">
          <Button variant="ghost" size="sm" className="hit-44 h-7 w-7 p-0" aria-label={S.zoomOut} onClick={zoomControls.onZoomOut}>
            <Minus className="size-3.5" aria-hidden />
          </Button>
          <span className="min-w-[38px] text-center font-mono text-micro tabular-nums text-muted-foreground">{zoomPct}%</span>
          <Button variant="ghost" size="sm" className="hit-44 h-7 w-7 p-0" aria-label={S.zoomIn} onClick={zoomControls.onZoomIn}>
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>

        <Button
          variant={legendOpen ? "secondary" : "outline"}
          size="sm"
          className="hit-44 h-8"
          aria-pressed={legendOpen}
          onClick={onToggleLegend}
        >
          {S.legend}
        </Button>

        <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-micro" title={S.realtimeHint}>
          <span
            className={cn(
              "size-2 rounded-full",
              realtime.connected ? "bg-success" : "animate-pulse bg-muted-foreground",
            )}
            aria-hidden
          />
          <span className={cn("font-mono tabular-nums", realtime.connected ? "text-muted-foreground" : "text-destructive")}>
            {realtime.connected ? `${S.live} · ${syncClock(realtime.lastSyncedAt)}` : S.reconnecting}
          </span>
        </span>

        {demoData && (
          <span className="hidden rounded-md bg-muted px-1.5 py-1 font-mono text-micro text-muted-foreground lg:inline">
            {S.demoData}
          </span>
        )}
      </div>
    </div>
  );
});
