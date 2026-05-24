/* @vitest-environment jsdom */

import { useContextMenus } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  openPaneContextMenu,
  openSelectionContextMenu,
  openTypeErrorContextMenu,
} from "./contextMenus";

describe("context menu actions", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
  });

  it("keeps context menu surfaces mutually exclusive", () => {
    const paneEvent = createContextMenuEvent(10, 20);
    openPaneContextMenu(paneEvent);

    expect(paneEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(useContextMenus.getState().pane).toEqual({
      isOpen: true,
      x: 10,
      y: 20,
    });

    const selectionEvent = createContextMenuEvent(30, 40);
    openSelectionContextMenu(selectionEvent, ["section-a"]);

    expect(selectionEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(useContextMenus.getState().pane.isOpen).toBe(false);
    expect(useContextMenus.getState().selection).toEqual({
      isOpen: true,
      nodeIds: ["section-a"],
      x: 30,
      y: 40,
    });

    const typeErrorEvent = createContextMenuEvent(50, 60);
    openTypeErrorContextMenu(typeErrorEvent, "section-b", "param-a");

    expect(typeErrorEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(useContextMenus.getState().selection.isOpen).toBe(false);
    expect(useContextMenus.getState().typeError).toEqual({
      isOpen: true,
      paramInfoId: "param-a",
      sectionId: "section-b",
      x: 50,
      y: 60,
    });
  });
});

function createContextMenuEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
  };
}
