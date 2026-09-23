"use client";

import { isBuiltInIssueStatus } from "@multica/core/issue-statuses";
import { StatusIcon } from "../../issues/components/status-icon";
import { BOARD_STRINGS as S } from "./strings";

/**
 * Status presentation for the board: every status is encoded by glyph + text +
 * color together (design rule: color is never the only channel). The seven
 * built-ins reuse the repo's `StatusIcon` geometry and token colors verbatim;
 * unknown/custom keys fall back to a dashed ring + "?" so a future status
 * value can never render blank.
 *
 * The board contract carries `statusKey`/`statusName` only — no catalog — so a
 * custom status's backend color is not available here yet; the fallback gray
 * matches the design's default. When the data layer lands, the assignee of
 * richer per-status data extends `statusColorVar` without touching call sites.
 */

/** Token-backed color for a status key; neutral keys and unknowns resolve to muted-foreground. */
export function statusColorVar(statusKey: string): string {
  switch (statusKey) {
    case "in_progress":
      return "var(--warning)";
    case "in_review":
      return "var(--success)";
    case "done":
      return "var(--info)";
    case "blocked":
      return "var(--destructive)";
    default:
      // backlog / todo / cancelled / unknown custom keys
      return "var(--muted-foreground)";
  }
}

/** Dashed ring + "?" — the never-blank fallback for unknown status keys. */
export function UnknownStatusGlyph({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 14 14" fill="none" className={`${className} shrink-0 text-muted-foreground`} aria-hidden>
      <circle cx={7} cy={7} r={5.5} fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="2.5 2.2" />
      <text x={7} y={9.6} textAnchor="middle" fontSize={8} fontWeight={600} fill="currentColor" stroke="none">
        {"?"}
      </text>
    </svg>
  );
}

/** Glyph only — minimap, degraded node blocks, legend swatches. */
export function StatusGlyph({ statusKey, className }: { statusKey: string; className?: string }) {
  if (isBuiltInIssueStatus(statusKey)) {
    return <StatusIcon status={statusKey} className={className ?? "size-3"} />;
  }
  return <UnknownStatusGlyph className={className} />;
}

/**
 * Status badge: glyph + label in a tinted pill. Built-ins tint from their
 * semantic token; unknown keys use the muted surface so the pill stays legible.
 */
export function StatusPill({ statusKey, statusName }: { statusKey: string; statusName: string }) {
  const known = isBuiltInIssueStatus(statusKey);
  const colorVar = statusColorVar(statusKey);
  const background = known
    ? `color-mix(in oklch, ${colorVar} 14%, transparent)`
    : "var(--muted)";
  const foreground = known
    ? `color-mix(in oklch, ${colorVar} 72%, var(--foreground))`
    : "var(--muted-foreground)";

  return (
    <span
      className="inline-flex max-w-[160px] items-center gap-1 rounded-full px-1.5 py-0.5 text-micro font-medium"
      style={{ background, color: foreground }}
      data-status={statusKey}
    >
      <StatusGlyph statusKey={statusKey} />
      <span className="truncate">{statusName || S.unknownStatus}</span>
    </span>
  );
}
