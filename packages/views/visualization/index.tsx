"use client";

import { Workflow } from "lucide-react";
import { useT } from "../i18n";
import { CollectionPageHeader } from "../layout";
import { BoardPage } from "./board";

/**
 * Workspace visualization board (`/{slug}/visualization`).
 *
 * The export name is the route contract fixed by the scaffold card; the body
 * is the React Flow board, fed through `components/data-source.ts` — the only
 * seam between this UI and the data layer.
 */
export function VisualizationBoardPage() {
  const { t } = useT("layout");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CollectionPageHeader icon={Workflow} title={t(($) => $.nav.visualization)} />
      <BoardPage />
    </div>
  );
}
