"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { cn } from "@multica/ui/lib/utils";
import { BUILT_IN_STATUS_LABEL } from "@multica/core/issues/config";
import { statusColorVar, StatusGlyph, UnknownStatusGlyph } from "./status-display";
import { BOARD_STRINGS as S } from "./strings";

/**
 * Canvas legend, bottom-left float (design B4): the three relation edges with
 * their line-pattern + color + arrow encoding, the eight status badges, the
 * lane samples, and the fold/degrade note. Collapsible to keep the corner clear.
 */

const EDGE_SAMPLES: { key: "parent" | "assignee" | "squadMember"; label: string }[] = [
  { key: "parent", label: S.legendParentEdge },
  { key: "assignee", label: S.legendAssigneeEdge },
  { key: "squadMember", label: S.legendSquadEdge },
];

function EdgeSample({ type }: { type: "parent" | "assignee" | "squadMember" }) {
  const brand = type === "assignee";
  const dasharray = type === "assignee" ? "6 4" : type === "squadMember" ? "2 4" : undefined;
  const color = brand ? "var(--brand)" : "var(--muted-foreground)";
  return (
    <svg width={44} height={10} viewBox="0 0 44 10" aria-hidden>
      <defs>
        <marker id={`legend-arrow-${type}`} markerWidth={6} markerHeight={6} refX={5} refY={3} orient="auto">
          <path d="M0,0 L6,3 L0,6 z" style={{ fill: color }} />
        </marker>
      </defs>
      <line
        x1={0}
        y1={5}
        x2={40}
        y2={5}
        style={{ stroke: color, strokeDasharray: dasharray }}
        strokeWidth={1.5}
        markerEnd={`url(#legend-arrow-${type})`}
      />
    </svg>
  );
}

const STATUS_KEYS = Object.keys(BUILT_IN_STATUS_LABEL);

export function BoardLegend({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="pointer-events-auto w-[300px] rounded-[10px] border border-border bg-surface/95 p-3 shadow-md backdrop-blur-sm">
      <div className="mb-1 flex items-center gap-1">
        <span className="text-label font-semibold text-foreground">{S.legend}</span>
        <Button
          variant="ghost"
          size="sm"
          className="hit-44 ml-auto h-6 w-6 p-0"
          aria-label={open ? S.legendCollapse : S.legendExpand}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-2.5">
          <div>
            <p className="mb-1 font-mono text-micro text-muted-foreground">{S.legendEdges}</p>
            <ul className="flex flex-col gap-1">
              {EDGE_SAMPLES.map((sample) => (
                <li key={sample.key} className="flex items-center gap-2 text-micro text-muted-foreground">
                  <EdgeSample type={sample.key} />
                  <span className="min-w-0 flex-1">{sample.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 font-mono text-micro text-muted-foreground">{S.legendStatuses}</p>
            <div className="flex flex-wrap gap-1">
              {STATUS_KEYS.map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-micro"
                  style={{
                    background: `color-mix(in oklch, ${statusColorVar(key)} 14%, transparent)`,
                    color: `color-mix(in oklch, ${statusColorVar(key)} 72%, var(--foreground))`,
                  }}
                >
                  <StatusGlyph statusKey={key} />
                  {BUILT_IN_STATUS_LABEL[key as keyof typeof BUILT_IN_STATUS_LABEL]}
                </span>
              ))}
              <span
                className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-micro text-muted-foreground"
              >
                <UnknownStatusGlyph />
                {S.unknownStatus}
              </span>
            </div>
          </div>

          <div>
            <p className="mb-1 font-mono text-micro text-muted-foreground">{S.legendLanes}</p>
            <ul className="flex flex-col gap-1 text-micro text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-5 rounded-sm border border-solid border-border bg-[color-mix(in_oklch,var(--muted)_34%,transparent)]" aria-hidden />
                {S.legendStageLane}
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-border" aria-hidden />
                {S.legendUnassignedLane}
              </li>
            </ul>
          </div>

          <p className={cn("border-t border-border pt-2 text-micro leading-4 text-muted-foreground")}>{S.legendFooter}</p>
        </div>
      )}
    </div>
  );
}
