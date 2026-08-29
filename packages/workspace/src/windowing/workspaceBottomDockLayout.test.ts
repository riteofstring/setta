import { describe, expect, it } from "vitest";
import {
  resolveNextWorkspaceBottomDockPillDisplayMode,
  resolveWorkspaceBottomDockStripReservedWidthPx,
  resolveWorkspaceBottomDockWindowWidthsToFit,
  resolveWorkspaceMaxVisibleBottomDockWindowCount,
} from "./workspaceBottomDockLayout";

describe("workspace bottom dock layout", () => {
  it("reserves the frozen strip widths for single and multiple windows", () => {
    expect(
      resolveWorkspaceBottomDockStripReservedWidthPx({
        nonClosedWindowCount: 1,
        showManagerMenu: false,
      }),
    ).toBe(56);
    expect(
      resolveWorkspaceBottomDockStripReservedWidthPx({
        nonClosedWindowCount: 1,
        showManagerMenu: true,
      }),
    ).toBe(88);
    expect(
      resolveWorkspaceBottomDockStripReservedWidthPx({
        nonClosedWindowCount: 2,
        showManagerMenu: false,
      }),
    ).toBe(144);
    expect(
      resolveWorkspaceBottomDockStripReservedWidthPx({
        nonClosedWindowCount: 2,
        showManagerMenu: true,
      }),
    ).toBe(176);
  });

  it("only admits whole minimum-width panels", () => {
    expect(resolveWorkspaceMaxVisibleBottomDockWindowCount(3, 579)).toBe(1);
    expect(resolveWorkspaceMaxVisibleBottomDockWindowCount(3, 580)).toBe(2);
    expect(resolveWorkspaceMaxVisibleBottomDockWindowCount(1, 287)).toBe(0);
  });

  it("clamps desired widths and shrinks excess proportionally", () => {
    expect(
      resolveWorkspaceBottomDockWindowWidthsToFit(
        [{ id: "a" }, { id: "b" }],
        { a: 600, b: 500 },
        900,
      ),
    ).toEqual({
      a: expect.closeTo(469.6296296296296, 10),
      b: expect.closeTo(410.3703703703704, 10),
    });

    expect(
      resolveWorkspaceBottomDockWindowWidthsToFit(
        [{ id: "a" }, { id: "b" }],
        { a: 1, b: 9_999 },
        700,
      ),
    ).toEqual({ a: 280, b: 400 });
  });

  it("uses no width allocation when no panel can be measured", () => {
    expect(
      resolveWorkspaceBottomDockWindowWidthsToFit([{ id: "a" }], { a: 460 }, 0),
    ).toEqual({});
  });

  it("selects full, compact, cycle, and menu strip modes at frozen thresholds", () => {
    expect(
      resolveNextWorkspaceBottomDockPillDisplayMode({
        currentMode: "compact",
        stripPillCount: 3,
        viewportWidthPx: 900,
        availableWidthPx: 220,
        fullWidthPx: 220,
        compactWidthPx: 80,
      }),
    ).toBe("full");
    expect(
      resolveNextWorkspaceBottomDockPillDisplayMode({
        currentMode: "full",
        stripPillCount: 3,
        viewportWidthPx: 900,
        availableWidthPx: 120,
        fullWidthPx: 220,
        compactWidthPx: 80,
      }),
    ).toBe("compact");
    expect(
      resolveNextWorkspaceBottomDockPillDisplayMode({
        currentMode: "full",
        stripPillCount: 3,
        viewportWidthPx: 900,
        availableWidthPx: 118,
        fullWidthPx: 220,
        compactWidthPx: 160,
      }),
    ).toBe("cycle");
    expect(
      resolveNextWorkspaceBottomDockPillDisplayMode({
        currentMode: "cycle",
        stripPillCount: 3,
        viewportWidthPx: 900,
        availableWidthPx: 117,
        fullWidthPx: 220,
        compactWidthPx: 160,
      }),
    ).toBe("menu");
    expect(
      resolveNextWorkspaceBottomDockPillDisplayMode({
        currentMode: "full",
        stripPillCount: 2,
        viewportWidthPx: 520,
        availableWidthPx: 900,
        fullWidthPx: 80,
        compactWidthPx: 56,
      }),
    ).toBe("menu");
  });

  it("keeps the previous mode until a strip has a positive measurement", () => {
    expect(
      resolveNextWorkspaceBottomDockPillDisplayMode({
        currentMode: "cycle",
        stripPillCount: 3,
        viewportWidthPx: 900,
        availableWidthPx: 0,
        fullWidthPx: 1,
        compactWidthPx: 1,
      }),
    ).toBe("cycle");
  });
});
