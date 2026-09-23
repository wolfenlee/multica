"use client";

import { Workflow } from "lucide-react";
import { useT } from "../i18n";
import { CollectionPageHeader } from "../layout";

/**
 * Placeholder for the workspace visualization board (`/{slug}/visualization`).
 *
 * Scaffold only (WOLFLEE-159 card A): the route, nav entry, and this export
 * name are the stable contract — the data layer and the React Flow board
 * replace the body in follow-up changes without renaming the export.
 */
export function VisualizationBoardPage() {
  const { t } = useT("layout");

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <CollectionPageHeader
        icon={Workflow}
        title={t(($) => $.nav.visualization)}
      />
      <div className="flex flex-1 items-center justify-center">
        <p className="text-caption text-muted-foreground">
          {t(($) => $.visualization.wip_notice)}
        </p>
      </div>
    </div>
  );
}
