// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BLOCK_BELOW_ZOOM, DOT_BELOW_ZOOM, zoomTier } from "./zoom-tier";

describe("zoomTier", () => {
  it("degrades to a status dot below 20%", () => {
    expect(zoomTier(DOT_BELOW_ZOOM - 0.01)).toBe("dot");
    expect(zoomTier(0.05)).toBe("dot");
  });

  it("degrades to a status block below 40% but at or above 20%", () => {
    expect(zoomTier(DOT_BELOW_ZOOM)).toBe("block");
    expect(zoomTier(BLOCK_BELOW_ZOOM - 0.01)).toBe("block");
  });

  it("renders full cards at or above 40%", () => {
    expect(zoomTier(BLOCK_BELOW_ZOOM)).toBe("full");
    expect(zoomTier(1)).toBe("full");
    expect(zoomTier(2)).toBe("full");
  });
});
