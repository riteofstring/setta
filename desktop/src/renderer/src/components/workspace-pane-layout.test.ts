import { describe, expect, test } from "vitest";

import { insertWorkspacePaneAtSplitTarget } from "./workspace-pane-layout";

describe("workspace pane layout", () => {
  test("drops a third pane into the top-right quadrant without moving the left pane", () => {
    const next = insertWorkspacePaneAtSplitTarget(
      "columns",
      ["left-chat", "right-chat"],
      "settings",
      "top-right",
    );

    expect(next.layout).toBe("top-split");
    expect(next.panes).toEqual(["left-chat", "settings", "right-chat"]);
  });

  test("drops a third pane into the top-left quadrant without moving the right pane", () => {
    const next = insertWorkspacePaneAtSplitTarget(
      "columns",
      ["left-chat", "right-chat"],
      "settings",
      "top-left",
    );

    expect(next.layout).toBe("top-split");
    expect(next.panes).toEqual(["settings", "right-chat", "left-chat"]);
  });

  test("splits a top row from vertical panes without moving the bottom pane", () => {
    const next = insertWorkspacePaneAtSplitTarget(
      "rows",
      ["top-chat", "bottom-chat"],
      "settings",
      "top-right",
    );

    expect(next.layout).toBe("top-split");
    expect(next.panes).toEqual(["top-chat", "settings", "bottom-chat"]);
  });
});
