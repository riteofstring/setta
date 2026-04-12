import { describe, expect, it } from "vitest";
import {
  resolveDockStripReservedWidthPx,
  resolveDockWindowWidthsToFit,
  resolveMaxVisibleDockWindowCount,
  resolveNextPillDisplayMode,
} from "./projectChatBottomDockLayout";

describe("resolveDockStripReservedWidthPx", () => {
  it("reserves menu-trigger width for a single visible chat when the manager menu is shown", () => {
    const withManagerMenu = resolveDockStripReservedWidthPx({
      nonClosedChatCount: 1,
      showManagerMenu: true,
    });
    const withoutManagerMenu = resolveDockStripReservedWidthPx({
      nonClosedChatCount: 1,
      showManagerMenu: false,
    });

    expect(withManagerMenu).toBeGreaterThan(withoutManagerMenu);
  });

  it("keeps the wider multi-chat reservation when multiple chats remain visible", () => {
    const multiChatWidth = resolveDockStripReservedWidthPx({
      nonClosedChatCount: 2,
      showManagerMenu: true,
    });
    const singleChatWidth = resolveDockStripReservedWidthPx({
      nonClosedChatCount: 1,
      showManagerMenu: true,
    });

    expect(multiChatWidth).toBeGreaterThan(singleChatWidth);
  });

  it("caps the visible dock count when only one minimum-width window fits", () => {
    expect(resolveMaxVisibleDockWindowCount(3, 579)).toBe(1);
  });

  it("shrinks dock widths proportionally when the target row is too wide", () => {
    const widths = resolveDockWindowWidthsToFit(
      [{ instanceId: "a" }, { instanceId: "b" }],
      { a: 600, b: 500 },
      900,
    );

    expect(widths.a).toBeGreaterThan(widths.b ?? 0);
    expect((widths.a ?? 0) + (widths.b ?? 0)).toBeCloseTo(880, 5);
  });

  it("switches to cycle mode when only compact pills fit", () => {
    expect(
      resolveNextPillDisplayMode({
        currentMode: "full",
        stripPillCount: 3,
        viewportWidthPx: 900,
        availableWidthPx: 120,
        fullWidthPx: 220,
        compactWidthPx: 80,
      }),
    ).toBe("compact");

    expect(
      resolveNextPillDisplayMode({
        currentMode: "full",
        stripPillCount: 3,
        viewportWidthPx: 900,
        availableWidthPx: 118,
        fullWidthPx: 220,
        compactWidthPx: 160,
      }),
    ).toBe("cycle");
  });
});
