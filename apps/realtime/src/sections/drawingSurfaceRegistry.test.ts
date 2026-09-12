import { describe, expect, it, vi } from "vitest";
import { createWorkspaceHost } from "@setta/workspace";

import type { DrawingSelectionSnapshot } from "./drawingRuntime";
import {
  alignDrawingSelection,
  bringDrawingSelectionForward,
  bringDrawingSelectionToFront,
  clearDrawingSelection,
  copyDrawingSelection,
  deleteDrawingSelection,
  distributeDrawingSelection,
  duplicateDrawingSelection,
  EMPTY_DRAWING_SELECTION_SNAPSHOT,
  fitDrawingSectionToCanvas,
  getDrawingCanvasSize,
  getDrawingSurfaceSnapshot,
  groupDrawingSelection,
  nudgeDrawingSelection,
  pasteDrawingSelection,
  registerDrawingSurface,
  resizeDrawingCanvas,
  selectAllDrawingObjects,
  sendDrawingSelectionBackward,
  sendDrawingSelectionToBack,
  setDrawingGridSnapEnabled,
  setDrawingGridVisible,
  setDrawingSelectionAppearance,
  setDrawingSelectionTypography,
  subscribeDrawingSurface,
  toggleDrawingSelectionLock,
  UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT,
  ungroupDrawingSelection,
  type DrawingCanvasSize,
  type DrawingSurfaceController,
} from "./drawingSurfaceRegistry";

type ControllerHarness = {
  controller: DrawingSurfaceController;
  publish: (next?: {
    canvasSize?: DrawingCanvasSize;
    selection?: DrawingSelectionSnapshot;
  }) => void;
  subscribedListeners: Array<() => void>;
  subscriberCount: () => number;
};

function selectedSnapshot(
  patch: Partial<DrawingSelectionSnapshot> = {},
): DrawingSelectionSnapshot {
  return Object.freeze({
    ...EMPTY_DRAWING_SELECTION_SNAPSHOT,
    canClearSelection: true,
    canCopy: true,
    canDelete: true,
    canDuplicate: true,
    canLock: true,
    count: 1,
    fillColor: "#2563eb",
    fillEnabled: true,
    kind: "rectangle" as const,
    locked: false,
    opacity: 1,
    strokeColor: "#111827",
    strokeEnabled: true,
    strokeWidth: 2,
    supportsCornerRadius: true,
    supportsFill: true,
    supportsStroke: true,
    ...patch,
  });
}

function createControllerHarness(options?: {
  canvasSize?: DrawingCanvasSize;
  selection?: DrawingSelectionSnapshot;
}): ControllerHarness {
  let canvasSize = options?.canvasSize ?? { height: 320, width: 480 };
  let selection = options?.selection ?? EMPTY_DRAWING_SELECTION_SNAPSHOT;
  const subscribers = new Set<() => void>();
  const subscribedListeners: Array<() => void> = [];
  const controller: DrawingSurfaceController = {
    alignSelection: vi.fn(() => true),
    bringSelectionForward: vi.fn(() => true),
    bringSelectionToFront: vi.fn(() => true),
    clearSelection: vi.fn(() => true),
    copySelection: vi.fn(() => true),
    deleteSelection: vi.fn(() => true),
    distributeSelection: vi.fn(() => true),
    duplicateSelection: vi.fn(async () => true),
    fitSectionToCanvas: vi.fn(() => true),
    getCanvasSize: vi.fn(() => ({ ...canvasSize })),
    getGridOptions: vi.fn(() => ({ snapEnabled: false, visible: false })),
    getSelectionSnapshot: vi.fn(() => selection),
    groupSelection: vi.fn(() => true),
    nudgeSelection: vi.fn(() => true),
    pasteSelection: vi.fn(async () => true),
    resizeCanvas: vi.fn((request) => {
      canvasSize = { height: request.height, width: request.width };
      return true;
    }),
    selectAll: vi.fn(() => true),
    sendSelectionBackward: vi.fn(() => true),
    sendSelectionToBack: vi.fn(() => true),
    setSelectionAppearance: vi.fn(() => true),
    setSelectionTypography: vi.fn(() => true),
    setGridSnapEnabled: vi.fn(() => true),
    setGridVisible: vi.fn(() => true),
    subscribeSelection: vi.fn((listener) => {
      subscribedListeners.push(listener);
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    }),
    toggleSelectionLock: vi.fn(() => true),
    ungroupSelection: vi.fn(() => true),
  };
  return {
    controller,
    publish: (next) => {
      canvasSize = next?.canvasSize ?? canvasSize;
      selection = next?.selection ?? selection;
      for (const subscriber of [...subscribers]) {
        subscriber();
      }
    },
    subscribedListeners,
    subscriberCount: () => subscribers.size,
  };
}

describe("drawing surface registry", () => {
  it("shares an immutable unavailable snapshot without creating registrations", () => {
    const host = createWorkspaceHost();

    const first = getDrawingSurfaceSnapshot(host, "drawing-main");
    const second = getDrawingSurfaceSnapshot(host, "drawing-main");

    expect(first).toBe(UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT);
    expect(second).toBe(first);
    expect(first.selection).toBe(EMPTY_DRAWING_SELECTION_SNAPSHOT);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.selection)).toBe(true);
    expect(getDrawingCanvasSize(host, "drawing-main")).toBeNull();
  });

  it("retains subscribers across mount cycles and publishes only semantic changes", () => {
    const host = createWorkspaceHost();
    const listener = vi.fn();
    const unsubscribe = subscribeDrawingSurface(host, "drawing-main", listener);
    const firstSelection = selectedSnapshot();
    const first = createControllerHarness({ selection: firstSelection });

    const unregisterFirst = registerDrawingSurface(
      host,
      "drawing-main",
      first.controller,
    );
    const ready = getDrawingSurfaceSnapshot(host, "drawing-main");

    expect(listener).toHaveBeenCalledOnce();
    expect(ready.available).toBe(true);
    expect(ready.canvasSize).toEqual({ height: 320, width: 480 });
    expect(ready.grid).toEqual({ snapEnabled: false, visible: false });
    expect(ready.selection).toEqual(firstSelection);
    expect(ready.selection).not.toBe(firstSelection);
    expect(Object.isFrozen(ready)).toBe(true);
    expect(Object.isFrozen(ready.canvasSize)).toBe(true);
    expect(Object.isFrozen(ready.selection)).toBe(true);
    expect(getDrawingSurfaceSnapshot(host, "drawing-main")).toBe(ready);

    first.publish({ selection: selectedSnapshot() });
    expect(listener).toHaveBeenCalledOnce();
    expect(getDrawingSurfaceSnapshot(host, "drawing-main")).toBe(ready);

    first.publish({
      selection: selectedSnapshot({ fillColor: "#dc2626" }),
    });
    const changedSelection = getDrawingSurfaceSnapshot(host, "drawing-main");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(changedSelection).not.toBe(ready);
    expect(changedSelection.selection.fillColor).toBe("#dc2626");

    first.publish({ canvasSize: { height: 640, width: 960 } });
    const changedSize = getDrawingSurfaceSnapshot(host, "drawing-main");
    expect(listener).toHaveBeenCalledTimes(3);
    expect(changedSize.canvasSize).toEqual({ height: 640, width: 960 });

    unregisterFirst();
    expect(listener).toHaveBeenCalledTimes(4);
    expect(getDrawingSurfaceSnapshot(host, "drawing-main")).toBe(
      UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT,
    );

    const second = createControllerHarness({
      canvasSize: { height: 200, width: 300 },
    });
    const unregisterSecond = registerDrawingSurface(
      host,
      "drawing-main",
      second.controller,
    );
    expect(listener).toHaveBeenCalledTimes(5);
    expect(getDrawingSurfaceSnapshot(host, "drawing-main").canvasSize).toEqual({
      height: 200,
      width: 300,
    });

    unsubscribe();
    unregisterSecond();
  });

  it("ignores stale cleanup and forwarded notifications from replaced registrations", () => {
    const host = createWorkspaceHost();
    const listener = vi.fn();
    const unsubscribe = subscribeDrawingSurface(host, "drawing-main", listener);
    const first = createControllerHarness({
      canvasSize: { height: 100, width: 100 },
    });
    const unregisterFirst = registerDrawingSurface(
      host,
      "drawing-main",
      first.controller,
    );
    const retiredListener = first.subscribedListeners[0]!;
    const second = createControllerHarness({
      canvasSize: { height: 240, width: 360 },
    });
    const unregisterSecond = registerDrawingSurface(
      host,
      "drawing-main",
      second.controller,
    );

    expect(first.subscriberCount()).toBe(0);
    expect(second.subscriberCount()).toBe(1);
    unregisterFirst();
    retiredListener();
    expect(getDrawingSurfaceSnapshot(host, "drawing-main").canvasSize).toEqual({
      height: 240,
      width: 360,
    });

    const sameControllerCleanup = registerDrawingSurface(
      host,
      "drawing-main",
      second.controller,
    );
    unregisterSecond();
    expect(getDrawingSurfaceSnapshot(host, "drawing-main").available).toBe(
      true,
    );

    sameControllerCleanup();
    expect(getDrawingSurfaceSnapshot(host, "drawing-main")).toBe(
      UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT,
    );
    unsubscribe();
  });

  it("isolates subscriptions by host and section", () => {
    const firstHost = createWorkspaceHost();
    const secondHost = createWorkspaceHost();
    const firstListener = vi.fn();
    const secondSectionListener = vi.fn();
    const secondHostListener = vi.fn();
    const unsubscribes = [
      subscribeDrawingSurface(firstHost, "first", firstListener),
      subscribeDrawingSurface(firstHost, "second", secondSectionListener),
      subscribeDrawingSurface(secondHost, "first", secondHostListener),
    ];
    const harness = createControllerHarness();

    const unregister = registerDrawingSurface(
      firstHost,
      "first",
      harness.controller,
    );
    harness.publish({ selection: selectedSnapshot() });

    expect(firstListener).toHaveBeenCalledTimes(2);
    expect(secondSectionListener).not.toHaveBeenCalled();
    expect(secondHostListener).not.toHaveBeenCalled();
    expect(getDrawingSurfaceSnapshot(firstHost, "second")).toBe(
      UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT,
    );
    expect(getDrawingSurfaceSnapshot(secondHost, "first")).toBe(
      UNAVAILABLE_DRAWING_SURFACE_SNAPSHOT,
    );

    unregister();
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  });

  it("delegates drawing commands and refreshes size after registry-mediated resize", async () => {
    const host = createWorkspaceHost();
    const listener = vi.fn();
    const unsubscribe = subscribeDrawingSurface(host, "drawing-main", listener);
    const harness = createControllerHarness({ selection: selectedSnapshot() });
    const unregister = registerDrawingSurface(
      host,
      "drawing-main",
      harness.controller,
    );
    const resizeRequest = {
      anchor: "bottom-right" as const,
      height: 720,
      mode: "keep-artwork" as const,
      width: 1280,
    };

    expect(getDrawingCanvasSize(host, "drawing-main")).toEqual({
      height: 320,
      width: 480,
    });
    expect(resizeDrawingCanvas(host, "drawing-main", resizeRequest)).toBe(true);
    expect(harness.controller.resizeCanvas).toHaveBeenCalledWith(resizeRequest);
    expect(getDrawingSurfaceSnapshot(host, "drawing-main").canvasSize).toEqual({
      height: 720,
      width: 1280,
    });
    expect(listener).toHaveBeenCalledTimes(2);

    expect(fitDrawingSectionToCanvas(host, "drawing-main")).toBe(true);
    expect(setDrawingGridVisible(host, "drawing-main", true)).toBe(true);
    expect(harness.controller.setGridVisible).toHaveBeenCalledWith(true);
    expect(setDrawingGridSnapEnabled(host, "drawing-main", true)).toBe(true);
    expect(harness.controller.setGridSnapEnabled).toHaveBeenCalledWith(true);
    expect(
      setDrawingSelectionAppearance(host, "drawing-main", {
        fill: "#16a34a",
        opacity: 0.5,
      }),
    ).toBe(true);
    expect(harness.controller.setSelectionAppearance).toHaveBeenCalledWith({
      fill: "#16a34a",
      opacity: 0.5,
    });
    expect(
      setDrawingSelectionTypography(host, "drawing-main", {
        fontFamily: "Inter",
        fontSize: 24,
      }),
    ).toBe(true);
    expect(harness.controller.setSelectionTypography).toHaveBeenCalledWith({
      fontFamily: "Inter",
      fontSize: 24,
    });
    expect(toggleDrawingSelectionLock(host, "drawing-main")).toBe(true);
    expect(bringDrawingSelectionForward(host, "drawing-main")).toBe(true);
    expect(sendDrawingSelectionBackward(host, "drawing-main")).toBe(true);
    expect(bringDrawingSelectionToFront(host, "drawing-main")).toBe(true);
    expect(sendDrawingSelectionToBack(host, "drawing-main")).toBe(true);
    expect(alignDrawingSelection(host, "drawing-main", "left")).toBe(true);
    expect(harness.controller.alignSelection).toHaveBeenCalledWith("left");
    expect(distributeDrawingSelection(host, "drawing-main", "horizontal")).toBe(
      true,
    );
    expect(harness.controller.distributeSelection).toHaveBeenCalledWith(
      "horizontal",
    );
    expect(groupDrawingSelection(host, "drawing-main")).toBe(true);
    expect(ungroupDrawingSelection(host, "drawing-main")).toBe(true);
    expect(await duplicateDrawingSelection(host, "drawing-main")).toBe(true);
    expect(copyDrawingSelection(host, "drawing-main")).toBe(true);
    expect(await pasteDrawingSelection(host, "drawing-main")).toBe(true);
    expect(selectAllDrawingObjects(host, "drawing-main")).toBe(true);
    expect(clearDrawingSelection(host, "drawing-main")).toBe(true);
    expect(deleteDrawingSelection(host, "drawing-main")).toBe(true);
    expect(nudgeDrawingSelection(host, "drawing-main", -10, 4)).toBe(true);
    expect(harness.controller.nudgeSelection).toHaveBeenCalledWith(-10, 4);

    unregister();
    expect(resizeDrawingCanvas(host, "drawing-main", resizeRequest)).toBe(
      false,
    );
    expect(fitDrawingSectionToCanvas(host, "drawing-main")).toBe(false);
    expect(setDrawingGridVisible(host, "drawing-main", true)).toBe(false);
    expect(setDrawingGridSnapEnabled(host, "drawing-main", true)).toBe(false);
    expect(setDrawingSelectionAppearance(host, "drawing-main", {})).toBe(false);
    expect(setDrawingSelectionTypography(host, "drawing-main", {})).toBe(false);
    expect(toggleDrawingSelectionLock(host, "drawing-main")).toBe(false);
    expect(bringDrawingSelectionForward(host, "drawing-main")).toBe(false);
    expect(sendDrawingSelectionBackward(host, "drawing-main")).toBe(false);
    expect(bringDrawingSelectionToFront(host, "drawing-main")).toBe(false);
    expect(sendDrawingSelectionToBack(host, "drawing-main")).toBe(false);
    expect(alignDrawingSelection(host, "drawing-main", "left")).toBe(false);
    expect(distributeDrawingSelection(host, "drawing-main", "horizontal")).toBe(
      false,
    );
    expect(groupDrawingSelection(host, "drawing-main")).toBe(false);
    expect(ungroupDrawingSelection(host, "drawing-main")).toBe(false);
    expect(await duplicateDrawingSelection(host, "drawing-main")).toBe(false);
    expect(copyDrawingSelection(host, "drawing-main")).toBe(false);
    expect(await pasteDrawingSelection(host, "drawing-main")).toBe(false);
    expect(selectAllDrawingObjects(host, "drawing-main")).toBe(false);
    expect(clearDrawingSelection(host, "drawing-main")).toBe(false);
    expect(deleteDrawingSelection(host, "drawing-main")).toBe(false);
    expect(nudgeDrawingSelection(host, "drawing-main", 1, 0)).toBe(false);

    unsubscribe();
  });
});
