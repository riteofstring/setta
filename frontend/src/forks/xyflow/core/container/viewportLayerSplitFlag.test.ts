import { describe, expect, it } from "vitest";
import { isViewportLayerSplitFlagEnabled } from "./viewportLayerSplitFlag";

describe("viewportLayerSplitFlag", () => {
  it("accepts explicit truthy values", () => {
    expect(isViewportLayerSplitFlagEnabled("1")).toBe(true);
    expect(isViewportLayerSplitFlagEnabled(" true ")).toBe(true);
    expect(isViewportLayerSplitFlagEnabled("ON")).toBe(true);
  });

  it("rejects empty and non-truthy values", () => {
    expect(isViewportLayerSplitFlagEnabled(null)).toBe(false);
    expect(isViewportLayerSplitFlagEnabled("0")).toBe(false);
    expect(isViewportLayerSplitFlagEnabled("false")).toBe(false);
    expect(isViewportLayerSplitFlagEnabled("disabled")).toBe(false);
  });
});
