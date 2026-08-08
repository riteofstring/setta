import { describe, expect, it } from "vitest";
import { resolveDockStripReservedWidthPx } from "./projectChatBottomDockLayout";

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
});
