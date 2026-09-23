/**
 * Zoom degradation tiers (design contract: <40% nodes lose their body and
 * keep a status-colored block + identifier, <20% degrade to a status dot).
 * Pure so the thresholds are testable and shared by node rendering and tests.
 */
export type BoardZoomTier = "full" | "block" | "dot";

export const BLOCK_BELOW_ZOOM = 0.4;
export const DOT_BELOW_ZOOM = 0.2;

export function zoomTier(zoom: number): BoardZoomTier {
  if (zoom < DOT_BELOW_ZOOM) return "dot";
  if (zoom < BLOCK_BELOW_ZOOM) return "block";
  return "full";
}
