"use client";

import { createContext, useContext } from "react";
import type { BoardZoomTier } from "./zoom-tier";

/**
 * Runtime plumbing from the page into node components. Node components must
 * stay display-only (renderable standalone in tests), so everything that needs
 * the React Flow instance or page state travels through this context instead
 * of RF hooks.
 */
export interface BoardRuntimeValue {
  /** Zoom degradation tier shared by all nodes (block/dot thresholds). */
  tier: BoardZoomTier;
  /** Node ids currently flashing (realtime event hit); page clears after 600ms. */
  flashIds: ReadonlySet<string>;
  /** Display name for an actor id (assignee chips); falls back to the raw id. */
  actorName: (id: string) => string;
  toggleIssueCollapse: (id: string) => void;
  toggleSquadExpand: (id: string) => void;
  /** Keyboard selection / drawer-open equivalent of clicking a node. */
  selectNode: (id: string) => void;
}

export const BoardRuntimeContext = createContext<BoardRuntimeValue | null>(null);

export function useBoardRuntime(): BoardRuntimeValue {
  const value = useContext(BoardRuntimeContext);
  if (!value) {
    throw new Error("BoardRuntimeContext is missing — node components render inside BoardPage");
  }
  return value;
}
