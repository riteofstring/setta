import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { WorkspaceLikeLayoutEngine } from "./layout-engine";
import type { WorkspaceLayoutSnapshot, WorkspaceLayoutStore } from "./layout-store";
import { FrameScheduler } from "./frame-scheduler";
import { WorkspaceMetricsCollector } from "./metrics";
import { PaneRuntimePolicy } from "./runtime-policy";
import type { LayoutFrameInput, PaneRenderItem, Rect } from "./types";
import type { PresentationEngine, PresentationWriteCounts } from "./presentation-engine";

describe("workspace frame scheduler", () => {
  let raf: InstalledRaf;

  beforeEach(() => {
    raf = installRaf();
  });

  afterEach(() => {
    raf.restore();
  });

  test("reuses normal and overview endpoint frames while only overview progress changes", () => {
    const renderCalls: LayoutFrameInput[] = [];
    const engine = {
      renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void) {
        renderCalls.push(input);
        push(renderItem(input.presentationMode, input.movementPhase));
      },
    } as unknown as WorkspaceLikeLayoutEngine;
    const store = createZoomingStore([0.2, 0.4, 0.6], 2, 360);
    const scheduler = new FrameScheduler({
      engine,
      layoutStore: store,
      metrics: new WorkspaceMetricsCollector(),
      presentation: fakePresentation(),
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });
    const renderFrame = (
      scheduler as unknown as {
        renderFrame: (
          deltaMs: number,
          viewport: Rect,
          resizePhase: "active" | "idle" | "settled",
        ) => "active" | "idle" | "settled";
      }
    ).renderFrame.bind(scheduler);

    renderFrame(16, viewport, "idle");
    renderFrame(16, viewport, "idle");
    renderFrame(16, viewport, "idle");

    expect(renderCalls.map((input) => input.presentationMode)).toEqual(["normal", "overview"]);
    expect(renderCalls.map((input) => input.scrollColumn)).toEqual([2, 0]);
    expect(renderCalls.map((input) => input.scrollRow)).toEqual([360, 0]);
  });

  test("keeps the final animated overview frame aligned with the settled overview frame", () => {
    const engine = {
      renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void) {
        push(
          input.presentationMode === "overview"
            ? renderItem(input.presentationMode, input.movementPhase, {
                height: 480,
                scale: 0.35,
                width: 640,
                x: 96,
                y: 48,
              })
            : renderItem(input.presentationMode, input.movementPhase, {
                height: 850,
                scale: 1,
                width: 1280,
                x: 0,
                y: 0,
              }),
        );
      },
    } as unknown as WorkspaceLikeLayoutEngine;
    const store = createZoomingStore([0.998, 1]);
    const presentation = fakePresentation();
    const scheduler = new FrameScheduler({
      engine,
      layoutStore: store,
      metrics: new WorkspaceMetricsCollector(),
      presentation,
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });

    scheduler.start();
    raf.flush(16);
    raf.flush(32);

    const calls = vi.mocked(presentation.apply).mock.calls;
    const animatedItem = calls[0]?.[0][0];
    const settledItem = calls[1]?.[0][0];
    if (!animatedItem || !settledItem) {
      throw new Error("missing scheduler presentation items");
    }
    expect(animatedItem.presentationMode).toBe("overview");
    expect(settledItem.presentationMode).toBe("overview");
    expectPaneGeometryClose(animatedItem, settledItem);

    scheduler.teardown();
  });

  test("keeps overview layout viewport stable across resize until overview exits", () => {
    const renderCalls: LayoutFrameInput[] = [];
    const engine = {
      renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void) {
        renderCalls.push(input);
        push(renderItem(input.presentationMode, input.movementPhase));
      },
    } as unknown as WorkspaceLikeLayoutEngine;
    const store = createStableStore("overview", 1, 3, 540);
    const scheduler = new FrameScheduler({
      engine,
      layoutStore: store,
      metrics: new WorkspaceMetricsCollector(),
      presentation: fakePresentation(),
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });
    const renderFrame = privateRenderFrame(scheduler);
    const resizedViewport = { ...viewport, height: 700, width: 1000 };

    renderFrame(16, viewport, "idle");
    renderFrame(16, resizedViewport, "active");

    expect(renderCalls.map((input) => input.viewport)).toEqual([viewport, viewport]);
    expect(renderCalls.map((input) => input.scrollColumn)).toEqual([0, 0]);
    expect(renderCalls.map((input) => input.scrollRow)).toEqual([0, 0]);
  });

  test("stops the normal workspace frame loop after an idle frame", () => {
    const store = createStableStore("normal", 0, 0, 0);
    const presentation = fakePresentation();
    const scheduler = new FrameScheduler({
      engine: fakeEngine(),
      layoutStore: store,
      metrics: new WorkspaceMetricsCollector(),
      presentation,
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });

    scheduler.start();
    raf.flush(16);

    expect(presentation.apply).toHaveBeenCalledOnce();
    expect(raf.pendingCount()).toBe(0);

    scheduler.teardown();
  });

  test("restarts the normal workspace frame loop after a layout store change", () => {
    const store = createStableStore("normal", 0, 0, 0);
    const presentation = fakePresentation();
    const scheduler = new FrameScheduler({
      engine: fakeEngine(),
      layoutStore: store,
      metrics: new WorkspaceMetricsCollector(),
      presentation,
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });

    scheduler.start();
    raf.flush(16);
    store.emitLayoutChange();
    raf.flush(32);

    expect(presentation.apply).toHaveBeenCalledTimes(2);
    expect(raf.pendingCount()).toBe(0);

    scheduler.teardown();
  });

  test("continues the normal workspace frame loop while layout movement is active", () => {
    const store = createMovingStore(["moving", "idle"]);
    const presentation = fakePresentation();
    const scheduler = new FrameScheduler({
      engine: fakeEngine(),
      layoutStore: store,
      metrics: new WorkspaceMetricsCollector(),
      presentation,
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });

    scheduler.start();
    raf.flush(16);
    expect(raf.pendingCount()).toBe(1);
    raf.flush(32);

    expect(presentation.apply).toHaveBeenCalledTimes(2);
    expect(raf.pendingCount()).toBe(0);

    scheduler.teardown();
  });

  test("treats active pane drop preview frames as movement", () => {
    const renderCalls: LayoutFrameInput[] = [];
    const engine = {
      renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void) {
        renderCalls.push(input);
        push(renderItem(input.presentationMode, input.movementPhase));
      },
    } as unknown as WorkspaceLikeLayoutEngine;
    const store = Object.assign(createStableStore("normal", 0, 0, 0), {
      hasPaneDropPreview() {
        return true;
      },
    }) as WorkspaceLayoutStore;
    const scheduler = new FrameScheduler({
      engine,
      layoutStore: store,
      metrics: new WorkspaceMetricsCollector(),
      presentation: fakePresentation(),
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });

    privateRenderFrame(scheduler)(16, viewport, "idle");

    expect(renderCalls.map((input) => input.movementPhase)).toEqual(["moving"]);
  });

  test("treats external drag movement override frames as movement", () => {
    const renderCalls: LayoutFrameInput[] = [];
    const engine = {
      renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void) {
        renderCalls.push(input);
        push(renderItem(input.presentationMode, input.movementPhase));
      },
    } as unknown as WorkspaceLikeLayoutEngine;
    const scheduler = new FrameScheduler({
      engine,
      layoutStore: createStableStore("normal", 0, 0, 0),
      metrics: new WorkspaceMetricsCollector(),
      movementOverride: () => true,
      presentation: fakePresentation(),
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });

    privateRenderFrame(scheduler)(16, viewport, "idle");

    expect(renderCalls.map((input) => input.movementPhase)).toEqual(["moving"]);
  });

  test("keeps the benchmark frame loop continuous", () => {
    const store = createStableStore("normal", 0, 0, 0);
    const presentation = fakePresentation();
    const scheduler = new FrameScheduler({
      continuous: true,
      engine: fakeEngine(),
      layoutStore: store,
      metrics: new WorkspaceMetricsCollector(),
      presentation,
      reportWriter: null,
      runtimePolicy: new PaneRuntimePolicy(),
      viewportProvider: () => viewport,
    });

    scheduler.start();
    raf.flush(16);

    expect(presentation.apply).toHaveBeenCalledOnce();
    expect(raf.pendingCount()).toBe(1);

    scheduler.teardown();
  });
});

const viewport: Rect = { height: 900, width: 1440, x: 0, y: 0 };
type TestWorkspaceLayoutStore = WorkspaceLayoutStore & { emitLayoutChange: () => void };

function createZoomingStore(
  progressByFrame: number[],
  scrollColumn = 0,
  scrollRow = 0,
): WorkspaceLayoutStore {
  let frameIndex = -1;
  return {
    advanceFrame() {
      frameIndex = Math.min(frameIndex + 1, progressByFrame.length - 1);
      return "moving";
    },
    ensureFocusedPaneVisible() {},
    getSnapshot(): WorkspaceLayoutSnapshot {
      return {
        focusedColumnIndex: 0,
        focusedPaneId: "pane-a",
        focusedRowIndex: 0,
        maximizedPaneId: null,
        overviewProgress: progressByFrame[Math.max(0, frameIndex)] ?? 0,
        presentationMode: "overview",
        revision: 1,
        scrollColumn,
        scrollRow,
        targetScrollColumn: 0,
        targetScrollRow: 0,
      };
    },
    hasPaneDropPreview() {
      return false;
    },
    moveFocus() {},
    snapScrollToTarget() {},
    subscribe() {
      return () => {};
    },
    visibleColumnCount() {
      return 1;
    },
  } as unknown as WorkspaceLayoutStore;
}

function createStableStore(
  presentationMode: WorkspaceLayoutSnapshot["presentationMode"],
  overviewProgress: number,
  scrollColumn = 0,
  scrollRow = 0,
): TestWorkspaceLayoutStore {
  const listeners = new Set<(snapshot: WorkspaceLayoutSnapshot) => void>();
  const store = {
    advanceFrame() {
      return "idle";
    },
    ensureFocusedPaneVisible() {},
    getSnapshot(): WorkspaceLayoutSnapshot {
      return {
        focusedColumnIndex: 0,
        focusedPaneId: "pane-a",
        focusedRowIndex: 0,
        maximizedPaneId: null,
        overviewProgress,
        presentationMode,
        revision: 1,
        scrollColumn,
        scrollRow,
        targetScrollColumn: 0,
        targetScrollRow: 0,
      };
    },
    hasPaneDropPreview() {
      return false;
    },
    moveFocus() {},
    emitLayoutChange() {
      const snapshot = this.getSnapshot();
      for (const listener of listeners) {
        listener(snapshot);
      }
    },
    snapScrollToTarget() {},
    subscribe(listener: (snapshot: WorkspaceLayoutSnapshot) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    visibleColumnCount() {
      return 1;
    },
  };
  return store as unknown as TestWorkspaceLayoutStore;
}

function createMovingStore(phases: Array<"idle" | "moving">): WorkspaceLayoutStore {
  const store = createStableStore("normal", 0, 0, 0);
  return Object.assign(store, {
    advanceFrame() {
      return phases.shift() ?? "idle";
    },
  }) as WorkspaceLayoutStore;
}

function privateRenderFrame(
  scheduler: FrameScheduler,
): (
  deltaMs: number,
  viewport: Rect,
  resizePhase: "active" | "idle" | "settled",
) => "active" | "idle" | "settled" {
  return (
    scheduler as unknown as {
      renderFrame: (
        deltaMs: number,
        viewport: Rect,
        resizePhase: "active" | "idle" | "settled",
      ) => "active" | "idle" | "settled";
    }
  ).renderFrame.bind(scheduler);
}

function fakePresentation(): PresentationEngine {
  return {
    apply: vi.fn(() => emptyPresentationWriteCounts()),
    teardown: vi.fn(),
    updateDebugOverlay: vi.fn(),
  } as unknown as PresentationEngine;
}

function fakeEngine(): WorkspaceLikeLayoutEngine {
  return {
    renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void) {
      push(renderItem(input.presentationMode, input.movementPhase));
    },
  } as unknown as WorkspaceLikeLayoutEngine;
}

function emptyPresentationWriteCounts(): PresentationWriteCounts {
  return {
    boxWrites: 0,
    browserViewportWrites: 0,
    canvasViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    gitGraphViewportWrites: 0,
    heavyViewportWrites: 0,
    nativeBoundsUpdates: 0,
    surfaceViewportWrites: 0,
    terminalViewportWrites: 0,
    transformWrites: 0,
  };
}

function renderItem(
  presentationMode: LayoutFrameInput["presentationMode"],
  movementPhase: LayoutFrameInput["movementPhase"],
  overrides: Partial<PaneRenderItem> = {},
): PaneRenderItem {
  return {
    focused: true,
    height: overrides.height ?? 100,
    maximized: false,
    moving: movementPhase === "moving",
    opacity: 1,
    paneId: "pane-a",
    presentationMode,
    resizing: false,
    runtimeState: "live",
    scale: overrides.scale ?? 1,
    surfaceId: "surface-a",
    surfaceKind: "fake-dom",
    visible: true,
    width: overrides.width ?? 100,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    z: 1,
  };
}

function expectPaneGeometryClose(left: PaneRenderItem, right: PaneRenderItem): void {
  expect(Math.abs(left.x - right.x)).toBeLessThan(2);
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  expect(Math.abs(left.width - right.width)).toBeLessThan(2);
  expect(Math.abs(left.height - right.height)).toBeLessThan(2);
  expect(Math.abs(left.scale - right.scale)).toBeLessThan(0.01);
}

interface InstalledRaf {
  flush: (timestamp: number) => void;
  pendingCount: () => number;
  restore: () => void;
}

function installRaf(): InstalledRaf {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrameId = 1;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
    const frameId = nextFrameId;
    nextFrameId += 1;
    callbacks.set(frameId, callback);
    return frameId;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((frameId: number): void => {
    callbacks.delete(frameId);
  }) as typeof cancelAnimationFrame;
  return {
    flush(timestamp: number) {
      const [frameId, callback] = callbacks.entries().next().value ?? [];
      if (typeof frameId !== "number" || !callback) {
        throw new Error("no animation frame is pending");
      }
      callbacks.delete(frameId);
      callback(timestamp);
    },
    pendingCount() {
      return callbacks.size;
    },
    restore() {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    },
  };
}
