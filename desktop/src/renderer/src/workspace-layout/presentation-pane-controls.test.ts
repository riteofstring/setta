import { describe, expect, test } from "vitest";

import {
  paneActionButtonLabel,
  paneChromeActionVisible,
  positionResizeHandle,
  resizeNeighborItem,
  surfaceSyncItem,
} from "./presentation-pane-controls";
import type { PaneRenderItem } from "./types";

describe("presentation pane controls", () => {
  test("shows pane actions only for the states that can use them", () => {
    const focused = renderItem("focused", { focused: true });
    const background = renderItem("background", { focused: false });
    const maximized = renderItem("maximized", { focused: true, maximized: true });

    expect(paneChromeActionVisible("split-down", focused)).toBe(true);
    expect(paneChromeActionVisible("add-above", background)).toBe(false);
    expect(paneChromeActionVisible("split-down", maximized)).toBe(false);
    expect(paneChromeActionVisible("maximize", background)).toBe(true);
    expect(paneActionButtonLabel("maximize", maximized)).toBe("Restore pane size");
  });

  test("finds the nearest resize neighbor with meaningful overlap", () => {
    const source = renderItem("source", { height: 200, width: 300, x: 0, y: 0 });
    const neighbor = renderItem("neighbor", { height: 180, width: 300, x: 320, y: 10 });
    const far = renderItem("far", { height: 180, width: 300, x: 900, y: 10 });
    const weakOverlap = renderItem("weak-overlap", {
      height: 80,
      width: 300,
      x: 310,
      y: 190,
    });

    expect(resizeNeighborItem(source, [source, far, weakOverlap, neighbor], "horizontal")).toBe(
      neighbor,
    );
    expect(resizeNeighborItem({ ...source, moving: true }, [neighbor], "horizontal")).toBeNull();
  });

  test("positions resize handles without rewriting unchanged style values", () => {
    const handle = { style: {} } as HTMLElement;

    positionResizeHandle(
      handle,
      "horizontal",
      { bottom: 240, left: 10, right: 310, top: 40 },
      { bottom: 220, left: 330, right: 630, top: 60 },
    );

    expect(handle.style.left).toBe("320.00px");
    expect(handle.style.top).toBe("140.00px");
    expect(handle.style.height).toBe("160.00px");
    expect(handle.style.width).toBe("20px");
  });

  test("snapshots live browser panes when a higher pane occludes them", () => {
    const browser = renderItem("browser", {
      surfaceKind: "browser",
      runtimeState: "live",
      z: 1,
    });
    const overlay = renderItem("overlay", {
      height: 120,
      surfaceKind: "fake-dom",
      width: 120,
      x: 20,
      y: 20,
      z: 2,
    });

    expect(surfaceSyncItem(browser, [browser, overlay])).toMatchObject({
      paneId: "browser",
      runtimeState: "snapshot",
    });
    expect(
      surfaceSyncItem({ ...browser, runtimeState: "live-throttled" }, [overlay]),
    ).toMatchObject({
      runtimeState: "live-throttled",
    });
  });
});

function renderItem(paneId: string, patch: Partial<PaneRenderItem> = {}): PaneRenderItem {
  return {
    focused: false,
    height: 200,
    maximized: false,
    moving: false,
    opacity: 1,
    paneId,
    presentationMode: "normal",
    resizing: false,
    runtimeState: "live",
    scale: 1,
    surfaceId: `${paneId}-surface`,
    surfaceKind: "fake-dom",
    visible: true,
    width: 300,
    x: 0,
    y: 0,
    z: 1,
    ...patch,
  };
}
