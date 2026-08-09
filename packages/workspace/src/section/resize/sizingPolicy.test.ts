import { describe, expect, it } from "vitest";
import { getSectionMinMaxDims, SECTION_SIZING_POLICY } from "./sizingPolicy";

// Freezes the reference's shipped sizing-policy defaults and the reachable branches of
// `useSectionMinMaxDims`: minimized sections pin their height to the minimized height, and
// auto-height sections cap at the auto ceiling except while a resize is in flight.
describe("getSectionMinMaxDims", () => {
  it("pins minimized sections to the minimized height", () => {
    expect(
      getSectionMinMaxDims({ isMinimized: true, isAutoHeight: false, isResizing: false }),
    ).toEqual({
      minHeight: 32,
      maxHeight: 32,
      minWidth: 200,
      maxWidth: 100_000,
    });
  });

  it("caps auto-height sections at the auto ceiling while idle", () => {
    expect(
      getSectionMinMaxDims({ isMinimized: false, isAutoHeight: true, isResizing: false }).maxHeight,
    ).toBe(350);
  });

  it("lifts the auto ceiling to the policy maximum during a resize", () => {
    expect(
      getSectionMinMaxDims({ isMinimized: false, isAutoHeight: true, isResizing: true }).maxHeight,
    ).toBe(SECTION_SIZING_POLICY.maxHeight);
  });

  it("uses the policy bounds for manually sized sections", () => {
    expect(
      getSectionMinMaxDims({ isMinimized: false, isAutoHeight: false, isResizing: false }),
    ).toEqual({
      minHeight: 0,
      maxHeight: 100_000,
      minWidth: 200,
      maxWidth: 100_000,
    });
  });

  it("applies a meta control's projected minimum without changing the policy maxima", () => {
    expect(
      getSectionMinMaxDims({
        isMinimized: false,
        isAutoHeight: false,
        isResizing: false,
        minimumSize: { width: 240, height: 120 },
      }),
    ).toEqual({
      minHeight: 120,
      maxHeight: 100_000,
      minWidth: 240,
      maxWidth: 100_000,
    });
  });
});
