import { describe, expect, test } from "vitest";

import type { NiriLikeLayoutEngine } from "./layout-engine";
import type { NiriLayoutSnapshot, NiriLayoutStore } from "./layout-store";
import { FrameScheduler } from "./frame-scheduler";
import { NiriMetricsCollector } from "./metrics";
import { PaneRuntimePolicy } from "./runtime-policy";
import type { LayoutFrameInput, PaneRenderItem, Rect } from "./types";
import type { PresentationEngine, PresentationWriteCounts } from "./presentation-engine";

describe("niri frame scheduler", () => {
  test("reuses normal and overview endpoint layouts while only overview progress changes", () => {
    const renderCalls: LayoutFrameInput[] = [];
    const engine = {
      renderFrame(input: LayoutFrameInput, push: (item: PaneRenderItem) => void) {
        renderCalls.push(input);
        push(renderItem(input.presentationMode, input.movementPhase));
      },
    } as unknown as NiriLikeLayoutEngine;
    const store = createZoomingStore([0.2, 0.4, 0.6]);
    const scheduler = new FrameScheduler({
      engine,
      layoutStore: store,
      metrics: new NiriMetricsCollector(),
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
  });
});

const viewport: Rect = { height: 900, width: 1440, x: 0, y: 0 };

function createZoomingStore(progressByFrame: number[]): NiriLayoutStore {
  let frameIndex = -1;
  return {
    advanceFrame() {
      frameIndex = Math.min(frameIndex + 1, progressByFrame.length - 1);
      return "moving";
    },
    ensureFocusedPaneVisible() {},
    getSnapshot(): NiriLayoutSnapshot {
      return {
        focusedColumnIndex: 0,
        focusedPaneId: "pane-a",
        focusedRowIndex: 0,
        maximizedPaneId: null,
        overviewProgress: progressByFrame[Math.max(0, frameIndex)] ?? 0,
        presentationMode: "overview",
        revision: 1,
        scrollColumn: 0,
        scrollRow: 0,
        targetScrollColumn: 0,
        targetScrollRow: 0,
      };
    },
    moveFocus() {},
    snapScrollToTarget() {},
    visibleColumnCount() {
      return 1;
    },
  } as unknown as NiriLayoutStore;
}

function fakePresentation(): PresentationEngine {
  return {
    apply: () => emptyPresentationWriteCounts(),
    teardown: () => {},
    updateDebugOverlay: () => {},
  } as unknown as PresentationEngine;
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
): PaneRenderItem {
  return {
    focused: true,
    height: 100,
    maximized: false,
    moving: movementPhase === "moving",
    opacity: 1,
    paneId: "pane-a",
    presentationMode,
    resizing: false,
    runtimeState: "live",
    scale: 1,
    surfaceId: "surface-a",
    surfaceKind: "fake-dom",
    visible: true,
    width: 100,
    x: 0,
    y: 0,
    z: 1,
  };
}
