"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import type { EdgeTypes, OnMove } from "@xyflow/react";
import { BezierEdge, StraightEdge } from "@xyflow/react";
import type { EdgeProps } from "@xyflow/react";
import { useWorkspacePaths } from "@multica/core/paths";
import { BUILT_IN_STATUS_LABEL } from "@multica/core/issues/config";
import type { BoardActorType, BoardIssue } from "./components/contract";
import { useBoardDataSource } from "./components/data-source";
import {
  defaultCollapsedIssues,
  layoutBoard,
  squadStructure,
} from "./components/layout";
import type { BoardFlowNode } from "./components/layout";
import { boardNodeTypes } from "./components/nodes";
import { BoardRuntimeContext } from "./components/board-context";
import { BoardToolbar } from "./components/board-toolbar";
import { BoardLegend } from "./components/board-legend";
import { BoardDrawer } from "./components/board-drawer";
import type { DrawerSelection } from "./components/board-drawer";
import { statusColorVar } from "./components/status-display";
import { BOARD_STRINGS as S } from "./components/strings";
import { zoomTier } from "./components/zoom-tier";
import "./components/board.css";

/**
 * Scheduling board page (React Flow). Owns all board state — fold, squad
 * expansion, filters, search, selection, zoom tier, flash — and feeds the
 * layout + display components. Data comes exclusively from the
 * `components/data-source.ts` seam (fixture today, data-layer hooks later).
 */


// Read-only canvas: relation edges route per contract; users never connect.
const edgeTypes: EdgeTypes = {
  parent: ParentEdge,
  assignee: AssigneeEdge,
  squadMember: SquadEdge,
};

function ParentEdge(props: EdgeProps) {
  return <BezierEdge {...props} pathOptions={{ curvature: 0.4 }} />;
}
function SquadEdge(props: EdgeProps) {
  return <BezierEdge {...props} pathOptions={{ curvature: 0.25 }} />;
}
function AssigneeEdge(props: EdgeProps) {
  return <StraightEdge {...props} />;
}

function MiniMapDot({ x, y, width, height, color }: { x: number; y: number; width: number; height: number; color?: string }) {
  // Minimap stays round dots regardless of node shape (design contract).
  return (
    <circle
      cx={x + width / 2}
      cy={y + height / 2}
      r={5}
      className="transition-[r] duration-150"
      style={{ fill: color ?? "var(--muted-foreground)" }}
    />
  );
}

function BoardCanvas() {
  const paths = useWorkspacePaths();
  const { graph, realtime, source } = useBoardDataSource();
  const reactFlow = useReactFlow<BoardFlowNode>();

  // --- view state -----------------------------------------------------------
  const [collapsedIssues, setCollapsedIssues] = useState<ReadonlySet<string>>(() => defaultCollapsedIssues(graph));
  const [expandedSquads, setExpandedSquads] = useState<ReadonlySet<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<string>>(new Set());
  const [assigneeFilter, setAssigneeFilter] = useState<ReadonlySet<BoardActorType>>(new Set());
  const [query, setQuery] = useState("");
  const [legendOpen, setLegendOpen] = useState(true);
  const [selected, setSelected] = useState<DrawerSelection | null>(null);
  const [flashIds, setFlashIds] = useState<ReadonlySet<string>>(new Set());
  const [viewport, setViewport] = useState<{ pct: number; tier: ReturnType<typeof zoomTier> }>({ pct: 100, tier: "full" });
  const searchRef = useRef<HTMLInputElement>(null);

  // --- derived lookups ------------------------------------------------------
  const actorById = useMemo(() => new Map(graph.actorNodes.map((actor) => [actor.id, actor])), [graph]);
  const actorName = useCallback(
    (id: string) => actorById.get(id)?.name ?? id,
    [actorById],
  );

  const matchesQuery = useCallback(
    (issue: BoardIssue): boolean => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        issue.identifier.toLowerCase().includes(q) ||
        issue.title.toLowerCase().includes(q) ||
        issue.statusName.toLowerCase().includes(q) ||
        (issue.assignee ? actorName(issue.assignee.id).toLowerCase().includes(q) : false)
      );
    },
    [query, actorName],
  );

  const searchDimmed = useMemo(() => {
    const dimmed = new Set<string>();
    if (!query.trim()) return dimmed;
    for (const issue of graph.issueNodes) {
      if (!matchesQuery(issue)) dimmed.add(issue.id);
    }
    for (const actor of graph.actorNodes) {
      if (!actor.name.toLowerCase().includes(query.trim().toLowerCase())) dimmed.add(actor.id);
    }
    return dimmed;
  }, [graph, matchesQuery, query]);

  const filterHidden = useMemo(() => {
    const hidden = new Set<string>();
    if (statusFilter.size === 0 && assigneeFilter.size === 0) return hidden;
    for (const issue of graph.issueNodes) {
      const statusOk = statusFilter.size === 0 || statusFilter.has(issue.statusKey);
      const assigneeOk =
        assigneeFilter.size === 0 || (issue.assignee !== null && assigneeFilter.has(issue.assignee.type));
      if (!statusOk || !assigneeOk) hidden.add(issue.id);
    }
    return hidden;
  }, [graph, statusFilter, assigneeFilter]);

  const layout = useMemo(
    () =>
      layoutBoard(graph, {
        collapsedIssues,
        expandedSquads,
        filterHidden,
        searchDimmed,
        laneTitle: (stage) => (stage === null ? S.ungroupedLane : `${S.stageLane} ${stage}`),
      }),
    [graph, collapsedIssues, expandedSquads, filterHidden, searchDimmed],
  );

  // --- realtime flash -------------------------------------------------------
  useEffect(() => {
    if (realtime.flashIds.length === 0) return;
    setFlashIds(new Set(realtime.flashIds));
    const timer = window.setTimeout(() => setFlashIds(new Set()), 600);
    return () => window.clearTimeout(timer);
  }, [realtime.flashIds]);

  // --- selection / focus ----------------------------------------------------
  const focusNode = useCallback(
    (id: string) => {
      const node = reactFlow.getNodes().find((n) => n.id === id);
      if (node) {
        reactFlow.setCenter(node.position.x + (node.width ?? 0) / 2, node.position.y + (node.height ?? 0) / 2, {
          zoom: Math.max(viewport.pct / 100, 0.7),
          duration: 400,
        });
      }
    },
    [reactFlow, viewport.pct],
  );

  const selectIssue = useCallback(
    (issue: BoardIssue) => {
      // deep-link semantics: open the parent chain, then center + open drawer
      const byId = new Map(graph.issueNodes.map((item) => [item.id, item]));
      const chain: string[] = [];
      let cursor = issue.parentId;
      while (cursor) {
        chain.push(cursor);
        cursor = byId.get(cursor)?.parentId ?? null;
      }
      if (chain.length > 0) {
        setCollapsedIssues((prev) => {
          const next = new Set(prev);
          for (const id of chain) next.delete(id);
          return next;
        });
      }
      setSelected({ kind: "issue", issue });
      if (typeof window !== "undefined") window.history.replaceState(null, "", `#${issue.number}`);
      requestAnimationFrame(() => focusNode(issue.id));
    },
    [graph, focusNode],
  );

  const selectNodeById = useCallback(
    (id: string) => {
      if (id.startsWith("lane:")) return;
      if (id.includes("::")) {
        // expanded squad copy → focus the standalone actor card instead
        const actorId = id.split("::")[1] ?? "";
        const actor = actorById.get(actorId);
        if (actor) {
          setSelected({ kind: "actor", actor, role: actor.actorType === "member" ? "member" : "agent" });
          focusNode(actor.id);
        }
        return;
      }
      const issue = graph.issueNodes.find((item) => item.id === id);
      if (issue) {
        selectIssue(issue);
        return;
      }
      const actor = actorById.get(id);
      if (actor) {
        if (actor.actorType === "squad") {
          const structure = squadStructure(graph, actor.id);
          setSelected({ kind: "squad", actor, leader: structure.leader, members: structure.members });
        } else {
          setSelected({ kind: "actor", actor, role: actor.actorType === "member" ? "member" : "agent" });
        }
        focusNode(id);
      }
    },
    [graph, actorById, focusNode, selectIssue],
  );

  // deep link: #158 / #i158 / #WOLFLEE-158
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const match = /^(?:i|wolflee-)?(\d+)$/i.exec(hash);
    if (!match) return;
    const number = Number(match[1]);
    const issue = graph.issueNodes.find((item) => item.number === number);
    if (issue) selectIssue(issue);
    // run once per graph load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // ⌘K / Ctrl+K focuses search
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- canvas handlers ------------------------------------------------------
  const onMove: OnMove = useCallback((_, viewportEvent) => {
    const pct = Math.round(viewportEvent.zoom * 100);
    const tier = zoomTier(viewportEvent.zoom);
    setViewport((prev) => (prev.pct === pct && prev.tier === tier ? prev : { pct, tier }));
  }, []);

  const runtime = useMemo(
    () => ({
      tier: viewport.tier,
      flashIds,
      actorName,
      toggleIssueCollapse: (id: string) =>
        setCollapsedIssues((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      toggleSquadExpand: (id: string) =>
        setExpandedSquads((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      selectNode: selectNodeById,
    }),
    [viewport.tier, flashIds, actorName, selectNodeById],
  );

  const issueHref = useCallback((issue: BoardIssue) => paths.issueDetail(issue.id), [paths]);

  const statusOptions = useMemo(() => {
    const options = Object.entries(BUILT_IN_STATUS_LABEL).map(([key, label]) => ({ key, label }));
    const customKeys = new Set(graph.issueNodes.map((issue) => issue.statusKey).filter((key) => !(key in BUILT_IN_STATUS_LABEL)));
    for (const key of customKeys) {
      const sample = graph.issueNodes.find((issue) => issue.statusKey === key);
      options.push({ key, label: sample?.statusName ?? S.unknownStatus });
    }
    return options;
  }, [graph]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: BoardFlowNode) => {
      reactFlow.setNodes((nodes) => nodes.map((n) => ({ ...n, selected: n.id === node.id })));
      selectNodeById(node.id);
    },
    [reactFlow, selectNodeById],
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <BoardToolbar
        ref={searchRef}
        query={query}
        onQueryChange={setQuery}
        onQueryEnter={() => {
          const first = graph.issueNodes.find((issue) => !searchDimmed.has(issue.id));
          if (first) selectIssue(first);
        }}
        statusFilter={statusFilter}
        onToggleStatus={(key) =>
          setStatusFilter((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        statusOptions={statusOptions}
        assigneeFilter={assigneeFilter}
        onToggleAssignee={(type) =>
          setAssigneeFilter((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
          })
        }
        zoomPct={viewport.pct}
        legendOpen={legendOpen}
        onToggleLegend={() => setLegendOpen((open) => !open)}
        realtime={realtime}
        demoData={source === "demo"}
        zoomControls={{
          onFit: () => reactFlow.fitView({ duration: 400, padding: 0.1 }),
          onZoomIn: () => reactFlow.zoomIn({ duration: 200 }),
          onZoomOut: () => reactFlow.zoomOut({ duration: 200 }),
        }}
      />

      <div className="relative min-h-0 flex-1">
        {/* narrow viewport notice (design: minimum usable width 1024px) */}
        <div className="absolute inset-0 z-20 hidden items-center justify-center bg-page-canvas max-lg:flex">
          <p className="text-label text-muted-foreground">{S.narrowViewport}</p>
        </div>

          <BoardRuntimeContext.Provider value={runtime}>
            <ReactFlow<BoardFlowNode>
              nodes={layout.nodes}
              edges={layout.edges}
              nodeTypes={boardNodeTypes}
              edgeTypes={edgeTypes}
              onNodeClick={onNodeClick}
              onPaneClick={() => {
                setSelected(null);
                if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
              }}
              onMove={onMove}
              onInit={(instance) => {
                const zoom = instance.getZoom();
                setViewport({ pct: Math.round(zoom * 100), tier: zoomTier(zoom) });
                window.setTimeout(() => instance.fitView({ duration: 0, padding: 0.08 }), 0);
              }}
              fitView
              fitViewOptions={{ padding: 0.08 }}
              minZoom={0.1}
              maxZoom={2}
              onlyRenderVisibleElements
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              edgesFocusable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1.4}
                color="var(--border)"
                style={{ opacity: gridOpacity(viewport.pct) }}
              />
              <Panel position="bottom-left" className="!m-3 max-md:!hidden">
                <BoardLegend open={legendOpen} onToggle={() => setLegendOpen((open) => !open)} />
              </Panel>
              <Panel position="bottom-right" className="!m-3">
                <MiniMap<BoardFlowNode>
                  pannable
                  zoomable
                  ariaLabel="Mini map"
                  bgColor="var(--surface)"
                  maskColor="color-mix(in oklch, var(--muted) 62%, transparent)"
                  nodeComponent={MiniMapDot}
                  nodeColor={(node) =>
                    node.type === "issue"
                      ? statusColorVar(node.data.issue.statusKey)
                      : node.type === "squad"
                        ? "var(--brand)"
                        : "var(--muted-foreground)"
                  }
                  className="!h-28 !w-44 rounded-md border border-border"
                />
              </Panel>
              <Panel position="top-right" className="!m-3 flex flex-col gap-1">
                <BoardEdgeLegendZoomButtons
                  onFit={() => reactFlow.fitView({ duration: 400, padding: 0.1 })}
                  onZoomIn={() => reactFlow.zoomIn({ duration: 200 })}
                  onZoomOut={() => reactFlow.zoomOut({ duration: 200 })}
                />
              </Panel>
            </ReactFlow>

            <BoardDrawer
              selection={selected}
              onClose={() => setSelected(null)}
              onLocate={selectNodeById}
              issueHref={issueHref}
            />
          </BoardRuntimeContext.Provider>
      </div>
    </div>
  );
}

function BoardEdgeLegendZoomButtons({ onFit, onZoomIn, onZoomOut }: { onFit: () => void; onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <>
      <button type="button" aria-label={S.fitView} onClick={onFit} className="hit-44 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground shadow-xs hover:text-foreground">
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" aria-label={S.zoomIn} onClick={onZoomIn} className="hit-44 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground shadow-xs hover:text-foreground">
        <span className="text-body leading-none">+</span>
      </button>
      <button type="button" aria-label={S.zoomOut} onClick={onZoomOut} className="hit-44 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground shadow-xs hover:text-foreground">
        <span className="text-body leading-none">−</span>
      </button>
    </>
  );
}

/** Grid fades out below 60% zoom, gone at 20% (design contract). */
function gridOpacity(pct: number): number {
  if (pct >= 60) return 1;
  return Math.max(0, (pct - 20) / 40);
}

/**
 * Workspace page export lives in `index.tsx` (`VisualizationBoardPage`); this
 * component is the board itself so tests can mount it standalone. The provider
 * wraps the canvas because the canvas body reads the React Flow instance.
 */
export function BoardPage() {
  return (
    <ReactFlowProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <BoardCanvas />
      </div>
    </ReactFlowProvider>
  );
}
